const request = require('supertest');
const app = require('../index');
const db = require('../lib/db');
const {
  resetDb, seedUser, seedOAuthToken, seedSubscriptions, seedSelections,
} = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');

// Data portability / "export my data" — GDPR-style export scoped to the
// requesting user, structured JSON, excluding anything security-sensitive
// (oauth_tokens) or not meaningfully the user's own data (error_log).
describe('GET /api/account/export', () => {
  let user, cookie;

  beforeEach(async () => {
    await resetDb();
    user = await seedUser({ email: 'export-test@example.com', displayName: 'Export Test User' });
    cookie = sessionCookieFor(user.id);
  });

  it('requires auth', async () => {
    const res = await request(app).get('/api/account/export');
    expect(res.status).toBe(401);
  });

  it('includes the exporting user\'s profile', async () => {
    const res = await request(app).get('/api/account/export').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.profile.email).toBe('export-test@example.com');
    expect(res.body.profile.display_name).toBe('Export Test User');
  });

  it('includes settings as a flat key/value object', async () => {
    const res = await request(app).get('/api/account/export').set('Cookie', cookie);
    expect(res.body.settings.dark_mode).toBe('system');
    expect(res.body.settings.confirm_bulk_actions).toBe('on');
  });

  it('includes subscriptions and creator selections', async () => {
    await seedSubscriptions(user.id, [
      { channelId: 'UC_export_1', channelName: 'Export Channel One' },
      { channelId: 'UC_export_2', channelName: 'Export Channel Two' },
    ]);
    await seedSelections(user.id, ['UC_export_1']);

    const res = await request(app).get('/api/account/export').set('Cookie', cookie);
    expect(res.body.subscriptions).toHaveLength(2);
    expect(res.body.subscriptions.map(s => s.channel_id).sort()).toEqual(['UC_export_1', 'UC_export_2']);
    expect(res.body.creator_selections).toEqual([{ channel_id: 'UC_export_1', selected_at: expect.any(String) }]);
  });

  it('includes creator groups with their members nested', async () => {
    const group = await db.query(
      `INSERT INTO creator_groups (user_id, name) VALUES ($1, $2) RETURNING id`,
      [user.id, 'My Favorites']
    );
    await db.query(
      `INSERT INTO creator_group_members (group_id, channel_id) VALUES ($1, $2), ($1, $3)`,
      [group.rows[0].id, 'UC_fav_1', 'UC_fav_2']
    );

    const res = await request(app).get('/api/account/export').set('Cookie', cookie);
    expect(res.body.creator_groups).toHaveLength(1);
    expect(res.body.creator_groups[0].name).toBe('My Favorites');
    expect(res.body.creator_groups[0].members.map(m => m.channel_id).sort()).toEqual(['UC_fav_1', 'UC_fav_2']);
  });

  it('includes watched videos with progress', async () => {
    await db.query(
      `INSERT INTO watched_videos (user_id, video_id, progress_seconds) VALUES ($1, $2, $3)`,
      [user.id, 'export_video_1', 120]
    );

    const res = await request(app).get('/api/account/export').set('Cookie', cookie);
    expect(res.body.watched_videos).toEqual([
      expect.objectContaining({ video_id: 'export_video_1', progress_seconds: 120 }),
    ]);
  });

  it('includes sync history and analytics events', async () => {
    await db.query(
      `INSERT INTO sync_log (user_id, sync_type, outcome, channels_added) VALUES ($1, 'manual', 'success', 5)`,
      [user.id]
    );
    await db.query(
      `INSERT INTO events (user_id, event_name, properties) VALUES ($1, 'recency_filter_set', $2)`,
      [user.id, JSON.stringify({ timeframe: 'last_month' })]
    );

    const res = await request(app).get('/api/account/export').set('Cookie', cookie);
    expect(res.body.sync_history).toEqual([
      expect.objectContaining({ sync_type: 'manual', outcome: 'success', channels_added: 5 }),
    ]);
    expect(res.body.events).toEqual([
      expect.objectContaining({ event_name: 'recency_filter_set', properties: { timeframe: 'last_month' } }),
    ]);
  });

  it('never includes OAuth tokens or any other security-sensitive field', async () => {
    await seedOAuthToken(user.id, { accessToken: 'super-secret-access-token', refreshToken: 'super-secret-refresh-token' });

    const res = await request(app).get('/api/account/export').set('Cookie', cookie);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('super-secret-access-token');
    expect(raw).not.toContain('super-secret-refresh-token');
    expect(res.body.oauth_tokens).toBeUndefined();
  });

  it('does not include error_log entries (operational, not user data)', async () => {
    await db.query(
      `INSERT INTO error_log (error_type, user_id, http_status, endpoint) VALUES ('sync_failure', $1, 500, '/api/subscriptions/sync')`,
      [user.id]
    );

    const res = await request(app).get('/api/account/export').set('Cookie', cookie);
    expect(res.body.error_log).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('sync_failure');
  });

  it("never includes another user's data", async () => {
    const otherUser = await seedUser({ email: 'other-user@example.com' });
    await seedSubscriptions(otherUser.id, [{ channelId: 'UC_other_user_only', channelName: 'Other User Channel' }]);
    await db.query(
      `INSERT INTO watched_videos (user_id, video_id) VALUES ($1, $2)`,
      [otherUser.id, 'other_user_video']
    );

    const res = await request(app).get('/api/account/export').set('Cookie', cookie);
    expect(res.body.profile.email).toBe('export-test@example.com');
    expect(JSON.stringify(res.body)).not.toContain('UC_other_user_only');
    expect(JSON.stringify(res.body)).not.toContain('other_user_video');
    expect(JSON.stringify(res.body)).not.toContain('other-user@example.com');
  });

  it('sets a download-friendly Content-Disposition header', async () => {
    const res = await request(app).get('/api/account/export').set('Cookie', cookie);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="noisetosignal-export-/);
  });
});
