const request = require('supertest');
const app = require('../index');
const { resetDb, seedUser } = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');

// Regression coverage for the "settings persistence is broken" bug:
// SettingsPage.jsx's confirm_bulk_actions toggle called PUT
// /api/settings/confirm_bulk_actions, but server/routes/settings.js's
// ALLOWED_KEYS allowlist didn't include that key — every write silently
// 400'd (fetch() with no .catch/status check, so the UI never surfaced
// the failure) and the value never actually persisted. Fixed by adding
// it to ALLOWED_KEYS.
const SETTINGS_ROUND_TRIP_CASES = [
  ['default_viewing_mode', 'youtube'],
  ['data_source_indicator', 'off'],
  ['default_recency_window', 'last_week'],
  ['subscription_sync_frequency', 'manual_only'],
  ['dark_mode', 'dark'],
  ['confirm_bulk_actions', 'off'],
  ['group_select_behavior', 'replace'],
];

describe('settings persistence', () => {
  let user, cookie;

  beforeEach(async () => {
    await resetDb();
    user = await seedUser();
    cookie = sessionCookieFor(user.id);
  });

  for (const [key, value] of SETTINGS_ROUND_TRIP_CASES) {
    it(`PUT /api/settings/${key} persists and is reflected by a subsequent GET /api/auth/me`, async () => {
      const putRes = await request(app)
        .put(`/api/settings/${key}`)
        .set('Cookie', cookie)
        .send({ value });
      expect(putRes.status).toBe(200);

      // A fresh request with the same cookie simulates what a full
      // browser reload does: no client-side state carried over, the
      // value has to actually be in the database to come back.
      const meRes = await request(app).get('/api/auth/me').set('Cookie', cookie);
      expect(meRes.status).toBe(200);
      expect(meRes.body.settings[key]).toBe(value);
    });
  }

  it('confirm_bulk_actions specifically round-trips (regression test for the persistence bug)', async () => {
    // Default from signup (server/routes/auth.js) is 'on'.
    const before = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(before.body.settings.confirm_bulk_actions).toBe('on');

    const putRes = await request(app)
      .put('/api/settings/confirm_bulk_actions')
      .set('Cookie', cookie)
      .send({ value: 'off' });
    expect(putRes.status).toBe(200);
    expect(putRes.body).toEqual({ ok: true });

    const after = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(after.body.settings.confirm_bulk_actions).toBe('off');
  });

  it('rejects an unknown setting key with 400, not a silent no-op', async () => {
    const res = await request(app)
      .put('/api/settings/not_a_real_setting')
      .set('Cookie', cookie)
      .send({ value: 'anything' });
    expect(res.status).toBe(400);
  });

  it('rejects a PUT with no value', async () => {
    const res = await request(app)
      .put('/api/settings/dark_mode')
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it('a repeated PUT to the same key overwrites rather than duplicating rows', async () => {
    await request(app).put('/api/settings/dark_mode').set('Cookie', cookie).send({ value: 'dark' });
    await request(app).put('/api/settings/dark_mode').set('Cookie', cookie).send({ value: 'light' });

    const db = require('../lib/db');
    const rows = await db.query(
      `SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = 'dark_mode'`,
      [user.id]
    );
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].setting_value).toBe('light');
  });
});
