const request = require('supertest');
const app = require('../index');
const db = require('../lib/db');
const { resetDb, seedUser, seedOAuthToken } = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');
const nock = require('nock');

const SECRET_TOKEN = 'super-secret-access-token-do-not-leak-12345';

// Part 4, item 4 of testing-plan-claude-code.md: a sync failure must
// never log a full error object containing an Authorization header or
// access token. axios attaches the outgoing request's headers (including
// the real Authorization bearer token) to a thrown error's `.config`, so
// a naive `console.error(err)` or `JSON.stringify(err)` would leak it.
// server/routes/subscriptions.js's catch block only ever touches
// `err.message` / `err.response?.status`, never the full error object —
// this test proves that holds in a real failure, not just by reading it.
describe('error logging: no token/credential leakage on sync failure', () => {
  let user, cookie;

  // A single resetDb() for the whole file, then a fresh distinct user per
  // test (not truncated between tests) — syncLimiter rate-limits by
  // user.id, and resetDb()'s RESTART IDENTITY would otherwise hand every
  // test the same id=1, causing every test after the first to get 429'd
  // before it ever reaches the route's catch block under test.
  beforeAll(async () => {
    await resetDb();
  });

  beforeEach(async () => {
    user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedOAuthToken(user.id, { accessToken: SECRET_TOKEN });

    // Force a real failure: subscriptions.list returns 403, which is
    // exactly the shape (err.response.status + err.config.headers.Authorization
    // carrying the real bearer token) a leak would come from.
    nock('https://www.googleapis.com')
      .get('/youtube/v3/subscriptions')
      .query(true)
      .reply(403, { error: { message: 'insufficient_scope' } });
  });

  it('never includes the access token in the client-facing error response', async () => {
    const res = await request(app).post('/api/subscriptions/sync').set('Cookie', cookie);

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_TOKEN);
    expect(res.body).toEqual({ error: 'Sync failed. Please try again.' });
  });

  it('never logs the access token to the console', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await request(app).post('/api/subscriptions/sync').set('Cookie', cookie);

    const allLoggedText = errorSpy.mock.calls.map(args => args.map(String).join(' ')).join('\n');
    expect(allLoggedText).not.toContain(SECRET_TOKEN);

    errorSpy.mockRestore();
  });

  it('never writes the access token into sync_log or error_log', async () => {
    await request(app).post('/api/subscriptions/sync').set('Cookie', cookie);

    const syncLog = await db.query('SELECT * FROM sync_log WHERE user_id = $1', [user.id]);
    const errorLog = await db.query('SELECT * FROM error_log WHERE user_id = $1', [user.id]);

    expect(syncLog.rows.length).toBeGreaterThan(0);
    expect(errorLog.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(syncLog.rows)).not.toContain(SECRET_TOKEN);
    expect(JSON.stringify(errorLog.rows)).not.toContain(SECRET_TOKEN);
  });

  it('does record a real, useful failure record (sanity check the test itself is meaningful)', async () => {
    await request(app).post('/api/subscriptions/sync').set('Cookie', cookie);

    const syncLog = await db.query(
      `SELECT outcome, error_message FROM sync_log WHERE user_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
      [user.id]
    );
    expect(syncLog.rows[0].outcome).toBe('failure');
    expect(syncLog.rows[0].error_message).toBeTruthy();
  });
});
