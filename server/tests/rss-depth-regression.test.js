const request = require('supertest');
const app = require('../index');
const db = require('../lib/db');
const {
  resetDb, seedUser, seedSubscriptions, seedSelections,
} = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');
const { mockRSSFeed, mockUploadsPlaylist, mockPlaylistItems } = require('./helpers/youtubeMocks');

const CHANNEL_ID = 'UC_daily_uploader';

function daysAgoISO(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// Regression test for known-issues-log.md Issue 002: "videos older than
// ~1 week can be missing from the feed." Root cause: getVideosForChannels
// (server/lib/youtube.js) only called the API fallback (fetchAPIVideos) when
// RSS returned null (a hard failure) — never when RSS succeeded but simply
// didn't cover the requested timeframe's full depth. YouTube's real RSS
// feed always caps at the channel's 15 most recent videos, so any channel
// that uploads more than ~15 times within the selected window was silently
// missing the older videos in that window, not because they aged out, but
// because they were never fetched at all.
//
// Fixed by: getVideosForChannels now takes the request's cutoff date and
// treats a channel's cache as "fresh" only if it's both unexpired AND deep
// enough to reach that cutoff (or has fewer than RSS_ENTRY_CAP rows, which
// means RSS/API already returned the channel's *entire* history). When RSS
// hits its cap without reaching the cutoff, fetchAPIVideos pages through
// the channel's uploads playlist instead, stopping once it passes the
// cutoff or hits its own safety cap.
describe('Issue 002 regression: RSS 15-video depth cap with timeframe-aware API fallback', () => {
  let cookie;

  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedSubscriptions(user.id, [{ channelId: CHANNEL_ID, channelName: 'Daily Uploader' }]);
    await seedSelections(user.id, [CHANNEL_ID]);
  });

  afterEach(() => {
    require('nock').cleanAll();
  });

  it('requesting "last_month" falls back to the API and returns videos older than RSS\'s 15-video cap', async () => {
    // Simulates a daily uploader: RSS (capped at 15) returns days 1-15 ago.
    const rssVideos = Array.from({ length: 15 }, (_, i) => ({
      videoId: `recent_day_${i + 1}`,
      title: `Day ${i + 1} upload`,
      publishedAt: daysAgoISO(i + 1),
    }));
    mockRSSFeed(CHANNEL_ID, rssVideos);

    // 10 additional older videos (days 16-25) that fall inside "last_month"
    // (30 days) but that RSS never surfaces because it only ever returns 15.
    const uploadsPlaylistId = 'UUplaylist_daily';
    const apiMock = mockUploadsPlaylist(CHANNEL_ID, uploadsPlaylistId);
    const olderVideos = Array.from({ length: 10 }, (_, i) => ({
      videoId: `older_day_${i + 16}`,
      title: `Day ${i + 16} upload`,
      publishedAt: daysAgoISO(i + 16),
    }));
    const playlistMock = mockPlaylistItems(uploadsPlaylistId, [...rssVideos, ...olderVideos]);

    const res = await request(app)
      .get('/api/videos/feed')
      .query({ timeframe: 'last_month' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);

    // Now all 25 videos are returned — RSS's 15 plus the 10 older ones the
    // API fallback fetched.
    const returnedIds = res.body.videos.map(v => v.video_id).sort();
    const expectedIds = [...rssVideos, ...olderVideos].map(v => v.videoId).sort();
    expect(returnedIds).toEqual(expectedIds);

    const cachedOlder = await db.query(
      'SELECT video_id FROM cached_videos WHERE video_id = ANY($1)',
      [olderVideos.map(v => v.videoId)]
    );
    expect(cachedOlder.rows.length).toBe(10); // now actually cached

    // Confirms *why* it worked: the API fallback was actually called this
    // time, because RSS hit its cap without reaching the "last_month" cutoff.
    expect(apiMock.isDone()).toBe(true);
    expect(playlistMock.isDone()).toBe(true);
  });

  it('requesting "last_7_days" does not call the API when RSS already covers the window (no wasted quota)', async () => {
    // Same daily uploader, but the requested window (7 days) is well within
    // what RSS's 15 most-recent videos already cover — no need to page the
    // API deeper.
    const rssVideos = Array.from({ length: 15 }, (_, i) => ({
      videoId: `recent_day_${i + 1}`,
      title: `Day ${i + 1} upload`,
      publishedAt: daysAgoISO(i + 1),
    }));
    mockRSSFeed(CHANNEL_ID, rssVideos);

    const uploadsPlaylistId = 'UUplaylist_daily';
    const apiMock = mockUploadsPlaylist(CHANNEL_ID, uploadsPlaylistId);
    const playlistMock = mockPlaylistItems(uploadsPlaylistId, rssVideos);

    const res = await request(app)
      .get('/api/videos/feed')
      .query({ timeframe: 'last_7_days' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const returnedIds = res.body.videos.map(v => v.video_id).sort();
    // day 7 sits right at the cutoff boundary and is timing-sensitive (same
    // reasoning as timeframe.test.js's own boundary-avoidance comment), so
    // only assert on days 1-6, safely inside the 7-day window.
    expect(returnedIds).toEqual(rssVideos.slice(0, 6).map(v => v.videoId).sort());

    // The API was never touched — RSS's own 15 days already reach back
    // past the 7-day cutoff, so there was nothing deeper to fetch.
    expect(apiMock.isDone()).toBe(false);
    expect(playlistMock.isDone()).toBe(false);
  });

  it('a channel with fewer than 15 uploads ever is treated as fully covered, regardless of cutoff', async () => {
    // Only 5 videos exist for this channel, all recent — RSS returns all of
    // them (well under its 15-item cap), which means that IS the channel's
    // entire history. Even "last_6_months" shouldn't trigger an API call.
    const rssVideos = Array.from({ length: 5 }, (_, i) => ({
      videoId: `only_video_${i + 1}`,
      title: `Video ${i + 1}`,
      publishedAt: daysAgoISO(i + 1),
    }));
    mockRSSFeed(CHANNEL_ID, rssVideos);

    const uploadsPlaylistId = 'UUplaylist_daily';
    const apiMock = mockUploadsPlaylist(CHANNEL_ID, uploadsPlaylistId);
    const playlistMock = mockPlaylistItems(uploadsPlaylistId, rssVideos);

    const res = await request(app)
      .get('/api/videos/feed')
      .query({ timeframe: 'last_6_months' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.videos.length).toBe(5);
    expect(apiMock.isDone()).toBe(false);
    expect(playlistMock.isDone()).toBe(false);
  });
});
