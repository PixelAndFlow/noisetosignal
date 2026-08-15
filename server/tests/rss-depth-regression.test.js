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
// (server/lib/youtube.js) only calls the API fallback (fetchAPIVideos) when
// RSS returns null (a hard failure) — never when RSS succeeds but simply
// doesn't cover the requested timeframe's full depth. YouTube's real RSS
// feed always caps at the channel's 15 most recent videos, so any channel
// that uploads more than ~15 times within the selected window will be
// silently missing the older videos in that window, not because they aged
// out, but because they were never fetched at all.
describe('Issue 002 regression: RSS 15-video depth cap with no timeframe-aware API fallback', () => {
  let cookie;

  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedSubscriptions(user.id, [{ channelId: CHANNEL_ID, channelName: 'Daily Uploader' }]);
    await seedSelections(user.id, [CHANNEL_ID]);
  });

  it('requesting "last_month" only returns the 15 most-recent RSS videos, missing older ones the API would have had, and never falls back to the API', async () => {
    // Simulates a daily uploader: RSS (capped at 15) returns days 1-15 ago.
    const rssVideos = Array.from({ length: 15 }, (_, i) => ({
      videoId: `recent_day_${i + 1}`,
      title: `Day ${i + 1} upload`,
      publishedAt: daysAgoISO(i + 1),
    }));
    mockRSSFeed(CHANNEL_ID, rssVideos);

    // What the API fallback WOULD have returned if it had been used —
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

    // What's actually returned: only the 15 RSS videos.
    const returnedIds = res.body.videos.map(v => v.video_id).sort();
    expect(returnedIds).toEqual(rssVideos.map(v => v.videoId).sort());

    // The 10 older videos are within the "last_month" window but never
    // appear — because they were never fetched, not because they aged out.
    for (const v of olderVideos) {
      expect(returnedIds).not.toContain(v.videoId);
    }
    const cachedOlder = await db.query(
      'SELECT video_id FROM cached_videos WHERE video_id = ANY($1)',
      [olderVideos.map(v => v.videoId)]
    );
    expect(cachedOlder.rows.length).toBe(0); // never cached — proves they were never fetched

    // Confirms *why*: the API fallback was never even called, despite
    // "last_month" needing more history than RSS's 15-video cap provides.
    expect(apiMock.isDone()).toBe(false);
    expect(playlistMock.isDone()).toBe(false);
    require('nock').cleanAll();
  });
});
