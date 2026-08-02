const request = require('supertest');
const app = require('../index');
const {
  resetDb, seedUser, seedSubscriptions, seedSelections, seedCachedVideo,
} = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');

const CHANNELS = ['UC_a', 'UC_b', 'UC_c', 'UC_d', 'UC_e'];

async function seedFiveChannelsWithVideos(userId) {
  await seedSubscriptions(userId, CHANNELS.map(id => ({ channelId: id, channelName: id })));
  for (const channelId of CHANNELS) {
    await seedCachedVideo({
      channelId,
      videoId: `${channelId}_video`,
      title: `${channelId} video`,
      publishedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago — inside every timeframe used here
    });
  }
}

async function getFeedVideoChannels(cookie) {
  const res = await request(app).get('/api/videos/feed').set('Cookie', cookie);
  expect(res.status).toBe(200);
  return res.body.videos.map(v => v.channel_id);
}

describe('creator filter: cross-contamination', () => {
  let user, cookie;

  beforeEach(async () => {
    await resetDb();
    user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedFiveChannelsWithVideos(user.id);
  });

  it('single creator selected returns only that creator, zero others', async () => {
    await seedSelections(user.id, ['UC_a']);
    const channels = await getFeedVideoChannels(cookie);
    expect(channels).toEqual(['UC_a']);
  });

  it('3-5 creators selected returns exactly that set, nothing else', async () => {
    await seedSelections(user.id, ['UC_a', 'UC_c', 'UC_e']);
    const channels = await getFeedVideoChannels(cookie);
    expect(channels.sort()).toEqual(['UC_a', 'UC_c', 'UC_e']);
  });

  it('select-all then narrow down: only the narrowed set appears', async () => {
    await seedSelections(user.id, CHANNELS); // "Select all"
    let channels = await getFeedVideoChannels(cookie);
    expect(channels.sort()).toEqual([...CHANNELS].sort());

    // Narrow down to 2
    await request(app)
      .delete('/api/subscriptions/selections')
      .set('Cookie', cookie);
    await request(app)
      .put('/api/subscriptions/selections/bulk')
      .set('Cookie', cookie)
      .send({ channel_ids: ['UC_b', 'UC_d'], selected: true });

    channels = await getFeedVideoChannels(cookie);
    expect(channels.sort()).toEqual(['UC_b', 'UC_d']);
  });

  it('switching timeframe leaves the creator selection untouched', async () => {
    await seedSelections(user.id, ['UC_a', 'UC_b']);
    const before = await request(app)
      .get('/api/videos/feed')
      .query({ timeframe: 'last_3_days' })
      .set('Cookie', cookie);
    const after = await request(app)
      .get('/api/videos/feed')
      .query({ timeframe: 'last_7_days' })
      .set('Cookie', cookie);

    expect(before.body.channel_count).toBe(2);
    expect(after.body.channel_count).toBe(2);
    expect(after.body.videos.map(v => v.channel_id).sort()).toEqual(['UC_a', 'UC_b']);
  });

  it('rapid toggle on/off settles to a single consistent final state, no duplicate rows', async () => {
    // Fire opposing writes concurrently to simulate a fast double-click.
    await Promise.all([
      request(app).put('/api/subscriptions/selections').set('Cookie', cookie).send({ channel_id: 'UC_a', selected: true }),
      request(app).put('/api/subscriptions/selections').set('Cookie', cookie).send({ channel_id: 'UC_a', selected: false }),
    ]);

    const db = require('../lib/db');
    const rows = await db.query(
      'SELECT * FROM creator_selections WHERE user_id = $1 AND channel_id = $2',
      [user.id, 'UC_a']
    );
    // Whichever write landed last, there must be at most one row — never a
    // duplicate/corrupted state — and the feed must match the DB exactly.
    expect(rows.rows.length).toBeLessThanOrEqual(1);

    const channels = await getFeedVideoChannels(cookie);
    if (rows.rows.length === 1) {
      expect(channels).toEqual(['UC_a']);
    } else {
      expect(channels).toEqual([]);
    }
  });

  it('cross-user isolation: user B never sees user A\'s selected videos', async () => {
    await seedSelections(user.id, ['UC_a']);

    const userB = await seedUser();
    const cookieB = sessionCookieFor(userB.id);
    await seedSubscriptions(userB.id, [{ channelId: 'UC_b', channelName: 'UC_b' }]);
    await seedSelections(userB.id, ['UC_b']);

    const channelsA = await getFeedVideoChannels(cookie);
    const channelsB = await getFeedVideoChannels(cookieB);

    expect(channelsA).toEqual(['UC_a']);
    expect(channelsB).toEqual(['UC_b']);
  });
});
