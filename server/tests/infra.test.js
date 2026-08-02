const request = require('supertest');
const db = require('../lib/db');
const app = require('../index');
const { resetDb } = require('./helpers/db');

describe('infra: database', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('connects to Postgres and can run a query', async () => {
    const result = await db.query('SELECT 1 AS ok');
    expect(result.rows[0].ok).toBe(1);
  });

  it('has the expected tables from schema.sql', async () => {
    const result = await db.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const tables = result.rows.map(r => r.table_name);
    for (const expected of [
      'users', 'user_settings', 'oauth_tokens', 'subscriptions',
      'creator_selections', 'cached_videos', 'cached_comments',
      'watched_videos', 'events', 'sync_log', 'error_log',
    ]) {
      expect(tables).toContain(expected);
    }
  });
});

describe('infra: server responds', () => {
  it('rejects unauthenticated requests to a protected route with 401, not a crash', async () => {
    const res = await request(app).get('/api/videos/feed');
    expect(res.status).toBe(401);
  });
});
