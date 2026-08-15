const request = require('supertest');
const app = require('../index');
const {
  resetDb, seedUser, seedSubscriptions, seedSelections, seedCachedVideo,
} = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');

const CHANNEL_ID = 'UC_timeframe_test_channel';

// Ages chosen so each video sits strictly between two RECENCY_MAP
// thresholds (see server/routes/videos.js) — no boundary-flakiness risk.
const VIDEOS = [
  { id: 'v1', ageMinutes: 30 },       // < 1 hour
  { id: 'v2', ageMinutes: 120 },      // < 8 hours, > 1 hour
  { id: 'v3', ageMinutes: 600 },      // < 24 hours, > 8 hours
  { id: 'v4', ageMinutes: 2000 },     // < 3 days, > 24 hours
  { id: 'v5', ageMinutes: 6000 },     // < 7 days, > 3 days
  { id: 'v6', ageMinutes: 20000 },    // < 1 month, > 7 days
  { id: 'v7', ageMinutes: 100000 },   // < 90 days, > 1 month
  { id: 'v8', ageMinutes: 200000 },   // < 6 months, > 90 days
  { id: 'v9', ageMinutes: 400000 },   // > 6 months — should never appear
];

// Expected visible video IDs per timeframe, most-recent-first order.
const EXPECTED = {
  last_hour: ['v1'],
  last_8_hours: ['v1', 'v2'],
  last_24_hours: ['v1', 'v2', 'v3'],
  last_3_days: ['v1', 'v2', 'v3', 'v4'],
  last_7_days: ['v1', 'v2', 'v3', 'v4', 'v5'],
  last_month: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'],
  last_90_days: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'],
  last_6_months: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'],
};

describe('timeframe filtering', () => {
  let cookie;

  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedSubscriptions(user.id, [{ channelId: CHANNEL_ID, channelName: 'Timeframe Test Channel' }]);
    await seedSelections(user.id, [CHANNEL_ID]);

    const now = Date.now();
    for (const v of VIDEOS) {
      await seedCachedVideo({
        channelId: CHANNEL_ID,
        videoId: v.id,
        title: v.id,
        publishedAt: new Date(now - v.ageMinutes * 60 * 1000),
      });
    }
  });

  for (const [timeframe, expectedIds] of Object.entries(EXPECTED)) {
    it(`"${timeframe}" returns exactly [${expectedIds.join(', ')}]`, async () => {
      const res = await request(app)
        .get('/api/videos/feed')
        .query({ timeframe })
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      const returnedIds = res.body.videos.map(v => v.video_id);
      expect(returnedIds.sort()).toEqual([...expectedIds].sort());
      expect(res.body.total).toBe(expectedIds.length);
    });
  }

  it('never returns the 6-months-plus video (v9) under any timeframe', async () => {
    for (const timeframe of Object.keys(EXPECTED)) {
      const res = await request(app)
        .get('/api/videos/feed')
        .query({ timeframe })
        .set('Cookie', cookie);
      const returnedIds = res.body.videos.map(v => v.video_id);
      expect(returnedIds).not.toContain('v9');
    }
  });

  it('defaults to last_3_days when no timeframe is specified', async () => {
    const res = await request(app).get('/api/videos/feed').set('Cookie', cookie);
    const returnedIds = res.body.videos.map(v => v.video_id).sort();
    expect(returnedIds).toEqual(EXPECTED.last_3_days.slice().sort());
  });
});
