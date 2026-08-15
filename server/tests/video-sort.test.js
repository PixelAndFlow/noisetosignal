const request = require('supertest');
const app = require('../index');
const {
  resetDb, seedUser, seedSubscriptions, seedSelections, seedCachedVideo,
} = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');

const CHANNEL_A = 'UC_sort_test_a';
const CHANNEL_B = 'UC_sort_test_b';

describe('video feed: sort=popular', () => {
  let cookie;

  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedSubscriptions(user.id, [
      { channelId: CHANNEL_A, channelName: 'Sort Test A' },
      { channelId: CHANNEL_B, channelName: 'Sort Test B' },
    ]);
    await seedSelections(user.id, [CHANNEL_A, CHANNEL_B]);

    const now = Date.now();
    // Deliberately NOT in view-count order by recency, so a passing test
    // proves real re-sorting happened, not an accidental match with the
    // default newest-first order.
    await seedCachedVideo({
      channelId: CHANNEL_A, videoId: 'low_views', title: 'Low views',
      publishedAt: new Date(now - 1 * 60 * 1000), viewCount: 100,
    });
    await seedCachedVideo({
      channelId: CHANNEL_B, videoId: 'high_views', title: 'High views',
      publishedAt: new Date(now - 2 * 60 * 1000), viewCount: 10000,
    });
    await seedCachedVideo({
      channelId: CHANNEL_A, videoId: 'mid_views', title: 'Mid views',
      publishedAt: new Date(now - 3 * 60 * 1000), viewCount: 500,
    });
    // No viewCount passed -> NULL, per how RSS/API-fallback videos often
    // end up in production (server/lib/youtube.js). Must sort last, not
    // first, under `view_count DESC`.
    await seedCachedVideo({
      channelId: CHANNEL_A, videoId: 'null_views', title: 'Null views',
      publishedAt: new Date(now - 4 * 60 * 1000),
    });
  });

  it('orders by view_count descending, with NULL view counts sorted last', async () => {
    const res = await request(app)
      .get('/api/videos/feed')
      .query({ timeframe: 'last_hour', sort: 'popular' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const ids = res.body.videos.map(v => v.video_id);
    expect(ids).toEqual(['high_views', 'mid_views', 'low_views', 'null_views']);
  });

  it('still respects the channel selection filter under sort=popular (cross-contamination check)', async () => {
    const res = await request(app)
      .get('/api/videos/feed')
      .query({ timeframe: 'last_hour', sort: 'popular' })
      .set('Cookie', cookie);

    const channelIds = new Set(res.body.videos.map(v => v.channel_id));
    expect(channelIds).toEqual(new Set([CHANNEL_A, CHANNEL_B]));
  });

  it('defaults to newest-first when sort is omitted (unchanged existing behavior)', async () => {
    const res = await request(app)
      .get('/api/videos/feed')
      .query({ timeframe: 'last_hour' })
      .set('Cookie', cookie);

    const ids = res.body.videos.map(v => v.video_id);
    expect(ids).toEqual(['low_views', 'high_views', 'mid_views', 'null_views']);
  });
});
