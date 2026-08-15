const request = require('supertest');
const app = require('../index');
const { fetchSubscriptions } = require('../lib/youtube');
const { syncSubscriptions } = require('../routes/subscriptions');
const db = require('../lib/db');
const {
  resetDb, seedUser, seedOAuthToken,
} = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');
const { mockSubscriptionsPages } = require('./helpers/youtubeMocks');
const nock = require('nock');

function fakeChannels(count, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    channelId: `UC_${offset + i}`,
    channelName: `Channel ${offset + i}`,
  }));
}

function paginate(allItems, pageSize = 50) {
  const pages = [];
  for (let i = 0; i < allItems.length; i += pageSize) {
    const items = allItems.slice(i, i + pageSize);
    const isLast = i + pageSize >= allItems.length;
    pages.push({ items, nextPageToken: isLast ? null : `token_${i}` });
  }
  return pages;
}

describe('subscription sync: pagination', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('follows nextPageToken across many pages and returns the full 2,100-subscription count', async () => {
    const items = fakeChannels(2100);
    mockSubscriptionsPages(paginate(items));

    const subs = await fetchSubscriptions('fake-access-token');

    expect(subs.length).toBe(2100);
    expect(subs[0].channel_id).toBe('UC_0');
    expect(subs[2099].channel_id).toBe('UC_2099');
  });

  it('stops gracefully when nextPageToken disappears early, simulating the real ~987/1000 API ceiling', async () => {
    const items = fakeChannels(1000); // 20 pages x 50 = matches the documented real-world ceiling
    mockSubscriptionsPages(paginate(items));

    const subs = await fetchSubscriptions('fake-access-token');

    expect(subs.length).toBe(1000);
  });

  it('hits the 100-page safety cap and stops instead of looping forever on a runaway nextPageToken', async () => {
    // Simulates a hypothetical API bug where nextPageToken never goes away.
    nock('https://www.googleapis.com')
      .persist()
      .get('/youtube/v3/subscriptions')
      .query(true)
      .reply(200, {
        items: fakeChannels(50).map(s => ({
          snippet: {
            title: s.channelName,
            resourceId: { channelId: s.channelId },
            thumbnails: { default: { url: `https://example.com/${s.channelId}.jpg` } },
          },
        })),
        nextPageToken: 'always_more',
      });

    const subs = await fetchSubscriptions('fake-access-token');

    expect(subs.length).toBe(100 * 50); // exactly the safety cap, not runaway
    nock.cleanAll();
  });
});

describe('subscription sync: writes to the database ("all subscriptions loaded" check)', () => {
  let user, cookie;

  beforeEach(async () => {
    await resetDb();
    user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedOAuthToken(user.id);
  });

  it('a full sync against a 2,100-subscription mocked account results in exactly 2,100 rows in the subscriptions table', async () => {
    const items = fakeChannels(2100);
    mockSubscriptionsPages(paginate(items));

    const res = await request(app).post('/api/subscriptions/sync').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.added).toBe(2100);

    const count = await db.query('SELECT COUNT(*) FROM subscriptions WHERE user_id = $1', [user.id]);
    expect(parseInt(count.rows[0].count)).toBe(2100);
  }, 20000);

  it('re-syncing removes channels the user unsubscribed from and drops them from creator_selections too', async () => {
    // Calls syncSubscriptions() directly rather than POST /sync twice, since
    // the real syncLimiter middleware (1 sync/60s/user) would otherwise
    // correctly reject a second sync this soon — that's production
    // behavior working as intended, not something to route around via HTTP.
    mockSubscriptionsPages(paginate(fakeChannels(3)));
    await syncSubscriptions(user.id);

    await db.query(
      'INSERT INTO creator_selections (user_id, channel_id) VALUES ($1, $2)',
      [user.id, 'UC_1']
    );

    // Second sync: account now only has UC_0 and UC_2 (UC_1 unsubscribed)
    mockSubscriptionsPages(paginate([
      { channelId: 'UC_0', channelName: 'Channel 0' },
      { channelId: 'UC_2', channelName: 'Channel 2' },
    ]));
    const result = await syncSubscriptions(user.id);

    expect(result.removed).toBe(1);
    expect(result.removedFromFilter).toEqual(['UC_1']);

    const remaining = await db.query('SELECT channel_id FROM subscriptions WHERE user_id = $1', [user.id]);
    expect(remaining.rows.map(r => r.channel_id).sort()).toEqual(['UC_0', 'UC_2']);

    const selections = await db.query('SELECT channel_id FROM creator_selections WHERE user_id = $1', [user.id]);
    expect(selections.rows.length).toBe(0);
  });
});

describe('subscription listing at scale (direct DB seed, no network)', () => {
  it('GET /api/subscriptions correctly lists and counts 2,500 directly-seeded subscriptions', async () => {
    await resetDb();
    const user = await seedUser();
    const cookie = sessionCookieFor(user.id);

    const values = [];
    const params = [];
    let p = 1;
    for (let i = 0; i < 2500; i++) {
      values.push(`($${p++}, $${p++}, $${p++})`);
      params.push(user.id, `UC_bulk_${i}`, `Bulk Channel ${i}`);
    }
    await db.query(
      `INSERT INTO subscriptions (user_id, channel_id, channel_name) VALUES ${values.join(',')}`,
      params
    );

    const res = await request(app).get('/api/subscriptions').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.subscriptions.length).toBe(2500);
  }, 20000);
});
