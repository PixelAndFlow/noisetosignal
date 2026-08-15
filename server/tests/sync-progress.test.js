const request = require('supertest');
const nock = require('nock');
const app = require('../index');
const { resetDb, seedUser, seedOAuthToken } = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');

function fakeChannels(count, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    channelId: `UC_${offset + i}`,
    channelName: `Channel ${offset + i}`,
  }));
}

function mockSubscriptionsPagesWithDelay(pages, delayMs) {
  const scope = nock('https://www.googleapis.com');
  for (const page of pages) {
    scope
      .get('/youtube/v3/subscriptions')
      .query(true)
      .delay(delayMs)
      .reply(200, {
        items: page.items.map(s => ({
          snippet: {
            title: s.channelName,
            resourceId: { channelId: s.channelId },
            thumbnails: { default: { url: `https://example.com/${s.channelId}.jpg` } },
          },
        })),
        nextPageToken: page.nextPageToken || undefined,
      });
  }
  return scope;
}

// Real evidence for the sync progress counter: GET /sync/progress should
// reflect the running count of subscriptions fetched so far while a sync
// is still in flight, and clear back to null once it's done — proving the
// counter genuinely updates during the operation, not just at start/end.
describe('subscription sync: live progress counter', () => {
  let user, cookie;

  // A single resetDb() for the whole file, then a fresh distinct user per
  // test (not truncated between tests) — syncLimiter rate-limits by
  // user.id, and resetDb()'s RESTART IDENTITY would otherwise hand every
  // test the same id=1, 429-ing every sync after the first.
  beforeAll(async () => {
    await resetDb();
  });

  beforeEach(async () => {
    user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedOAuthToken(user.id);
  });

  it('reports increasing counts while a multi-page sync is in progress, then clears to null', async () => {
    const pages = [
      { items: fakeChannels(50, 0), nextPageToken: 'p2' },
      { items: fakeChannels(50, 50), nextPageToken: 'p3' },
      { items: fakeChannels(50, 100), nextPageToken: null },
    ];
    mockSubscriptionsPagesWithDelay(pages, 300);

    // Before the sync starts, progress should be null (no sync in flight).
    const before = await request(app).get('/api/subscriptions/sync/progress').set('Cookie', cookie);
    expect(before.body.current).toBeNull();

    // supertest/superagent requests are lazy — they don't actually dispatch
    // until awaited or .then()'d. Chain .then() immediately so the request
    // fires now, not whenever we finally await syncPromise below.
    const syncPromise = request(app).post('/api/subscriptions/sync').set('Cookie', cookie).then(res => res);

    const observed = [];
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 250));
      const res = await request(app).get('/api/subscriptions/sync/progress').set('Cookie', cookie);
      observed.push(res.body.current);
    }

    const syncRes = await syncPromise;
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.added).toBe(150);

    // We should have seen the count increase across at least two distinct
    // non-null values before the sync finished (proves it updates
    // incrementally, not just once at the very end).
    const nonNullObserved = observed.filter(v => v != null);
    const distinctValues = [...new Set(nonNullObserved)];
    expect(distinctValues.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...nonNullObserved)).toBeLessThanOrEqual(150);
    // Values should never decrease.
    for (let i = 1; i < nonNullObserved.length; i++) {
      expect(nonNullObserved[i]).toBeGreaterThanOrEqual(nonNullObserved[i - 1]);
    }

    // After the sync completes, progress must be cleared (not left at 150
    // forever, which would make the next sync's UI misleading).
    const after = await request(app).get('/api/subscriptions/sync/progress').set('Cookie', cookie);
    expect(after.body.current).toBeNull();
  }, 15000);

  it('clears progress even when the sync fails partway through', async () => {
    nock('https://www.googleapis.com')
      .get('/youtube/v3/subscriptions')
      .query(true)
      .delay(200)
      .reply(200, {
        items: fakeChannels(50, 0).map(s => ({
          snippet: {
            title: s.channelName,
            resourceId: { channelId: s.channelId },
            thumbnails: { default: { url: `https://example.com/${s.channelId}.jpg` } },
          },
        })),
        nextPageToken: 'p2',
      });
    nock('https://www.googleapis.com')
      .get('/youtube/v3/subscriptions')
      .query(true)
      .delay(200)
      .reply(403, { error: { message: 'insufficient_scope' } });

    const syncRes = await request(app).post('/api/subscriptions/sync').set('Cookie', cookie);
    expect(syncRes.status).toBe(500);

    const after = await request(app).get('/api/subscriptions/sync/progress').set('Cookie', cookie);
    expect(after.body.current).toBeNull();
  }, 15000);
});
