const request = require('supertest');
const app = require('../index');
const db = require('../lib/db');
const {
  resetDb, seedUser, seedSubscriptions, seedSelections,
} = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');

describe('creator groups: create, list, delete', () => {
  let user, cookie;

  beforeEach(async () => {
    await resetDb();
    user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedSubscriptions(user.id, [
      { channelId: 'UC_a', channelName: 'A' },
      { channelId: 'UC_b', channelName: 'B' },
      { channelId: 'UC_c', channelName: 'C' },
    ]);
  });

  it('creates a group and lists it with the correct member_count', async () => {
    const createRes = await request(app)
      .post('/api/creator-groups')
      .set('Cookie', cookie)
      .send({ name: 'Tech News', channel_ids: ['UC_a', 'UC_b'] });
    expect(createRes.status).toBe(201);
    expect(createRes.body.name).toBe('Tech News');
    expect(createRes.body.member_count).toBe(2);

    const listRes = await request(app).get('/api/creator-groups').set('Cookie', cookie);
    expect(listRes.status).toBe(200);
    expect(listRes.body.groups).toHaveLength(1);
    expect(listRes.body.groups[0]).toMatchObject({ name: 'Tech News', member_count: 2 });
  });

  it('rejects a duplicate group name for the same user with 409, original untouched', async () => {
    await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'News', channel_ids: ['UC_a'] });

    const dupRes = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'News', channel_ids: ['UC_b', 'UC_c'] });
    expect(dupRes.status).toBe(409);

    const listRes = await request(app).get('/api/creator-groups').set('Cookie', cookie);
    expect(listRes.body.groups).toHaveLength(1);
    expect(listRes.body.groups[0].member_count).toBe(1); // still the original, not overwritten
  });

  it('rejects an empty name with 400', async () => {
    const res = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: '   ', channel_ids: ['UC_a'] });
    expect(res.status).toBe(400);
  });

  it('rejects an empty channel_ids array with 400', async () => {
    const res = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'Empty Group', channel_ids: [] });
    expect(res.status).toBe(400);
  });

  it('allows the same group name for different users (per-user uniqueness, not global)', async () => {
    await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'News', channel_ids: ['UC_a'] });

    const userB = await seedUser();
    const cookieB = sessionCookieFor(userB.id);
    const res = await request(app).post('/api/creator-groups').set('Cookie', cookieB)
      .send({ name: 'News', channel_ids: ['UC_b'] });
    expect(res.status).toBe(201);
  });

  it('a non-owner deleting a group gets 404 and the group survives', async () => {
    const created = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'News', channel_ids: ['UC_a'] });
    const groupId = created.body.id;

    const userB = await seedUser();
    const cookieB = sessionCookieFor(userB.id);
    const delRes = await request(app).delete(`/api/creator-groups/${groupId}`).set('Cookie', cookieB);
    expect(delRes.status).toBe(404);

    const listRes = await request(app).get('/api/creator-groups').set('Cookie', cookie);
    expect(listRes.body.groups).toHaveLength(1);
  });

  it('deleting a group cascades and removes its membership rows', async () => {
    const created = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'News', channel_ids: ['UC_a', 'UC_b'] });
    const groupId = created.body.id;

    const delRes = await request(app).delete(`/api/creator-groups/${groupId}`).set('Cookie', cookie);
    expect(delRes.status).toBe(200);

    const members = await db.query('SELECT * FROM creator_group_members WHERE group_id = $1', [groupId]);
    expect(members.rows.length).toBe(0);
  });
});

describe('creator groups: apply (replace/add)', () => {
  let user, cookie;

  beforeEach(async () => {
    await resetDb();
    user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedSubscriptions(user.id, [
      { channelId: 'UC_a', channelName: 'A' },
      { channelId: 'UC_b', channelName: 'B' },
      { channelId: 'UC_c', channelName: 'C' },
      { channelId: 'UC_d', channelName: 'D' },
    ]);
  });

  it('mode=replace fully replaces the existing selection, not a union', async () => {
    await seedSelections(user.id, ['UC_a', 'UC_b']);
    const group = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'CD Group', channel_ids: ['UC_c', 'UC_d'] });

    const applyRes = await request(app)
      .post(`/api/creator-groups/${group.body.id}/apply`)
      .set('Cookie', cookie)
      .send({ mode: 'replace' });
    expect(applyRes.status).toBe(200);
    expect(applyRes.body).toMatchObject({ mode: 'replace', applied_count: 2, skipped_count: 0 });

    const selections = await db.query('SELECT channel_id FROM creator_selections WHERE user_id = $1', [user.id]);
    expect(selections.rows.map(r => r.channel_id).sort()).toEqual(['UC_c', 'UC_d']);
  });

  it('mode=add unions with the existing selection, no error on overlap', async () => {
    await seedSelections(user.id, ['UC_a', 'UC_b']);
    const group = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'BC Group', channel_ids: ['UC_b', 'UC_c'] }); // UC_b overlaps

    const applyRes = await request(app)
      .post(`/api/creator-groups/${group.body.id}/apply`)
      .set('Cookie', cookie)
      .send({ mode: 'add' });
    expect(applyRes.status).toBe(200);
    expect(applyRes.body.applied_count).toBe(2);

    const selections = await db.query('SELECT channel_id FROM creator_selections WHERE user_id = $1', [user.id]);
    expect(selections.rows.map(r => r.channel_id).sort()).toEqual(['UC_a', 'UC_b', 'UC_c']);
  });

  it('skips channel_ids the user is no longer subscribed to, and reports skipped_count', async () => {
    const group = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'Stale Group', channel_ids: ['UC_a', 'UC_b'] });

    // Simulate what syncSubscriptions does when a channel is unsubscribed —
    // the group's membership row for UC_b is deliberately left behind
    // (not cleaned up), so /apply must filter it out itself.
    await db.query('DELETE FROM subscriptions WHERE user_id = $1 AND channel_id = $2', [user.id, 'UC_b']);

    const applyRes = await request(app)
      .post(`/api/creator-groups/${group.body.id}/apply`)
      .set('Cookie', cookie)
      .send({ mode: 'add' });
    expect(applyRes.status).toBe(200);
    expect(applyRes.body).toMatchObject({ applied_count: 1, skipped_count: 1 });

    const selections = await db.query('SELECT channel_id FROM creator_selections WHERE user_id = $1', [user.id]);
    expect(selections.rows.map(r => r.channel_id)).toEqual(['UC_a']);
  });

  it('rejects an invalid mode with 400', async () => {
    const group = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'G', channel_ids: ['UC_a'] });
    const res = await request(app)
      .post(`/api/creator-groups/${group.body.id}/apply`)
      .set('Cookie', cookie)
      .send({ mode: 'delete' });
    expect(res.status).toBe(400);
  });

  it('applying another user\'s group returns 404 and makes no changes', async () => {
    const group = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'G', channel_ids: ['UC_a'] });

    const userB = await seedUser();
    const cookieB = sessionCookieFor(userB.id);
    const res = await request(app)
      .post(`/api/creator-groups/${group.body.id}/apply`)
      .set('Cookie', cookieB)
      .send({ mode: 'add' });
    expect(res.status).toBe(404);

    const selectionsB = await db.query('SELECT channel_id FROM creator_selections WHERE user_id = $1', [userB.id]);
    expect(selectionsB.rows.length).toBe(0);
  });
});

describe('creator groups: update membership (PUT /:id/members)', () => {
  let user, cookie;

  beforeEach(async () => {
    await resetDb();
    user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedSubscriptions(user.id, [
      { channelId: 'UC_a', channelName: 'A' },
      { channelId: 'UC_b', channelName: 'B' },
      { channelId: 'UC_c', channelName: 'C' },
    ]);
  });

  it('replaces the membership list, not a union, and the new member_count is reflected in GET /', async () => {
    const created = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'News', channel_ids: ['UC_a'] });
    const groupId = created.body.id;

    const putRes = await request(app)
      .put(`/api/creator-groups/${groupId}/members`)
      .set('Cookie', cookie)
      .send({ channel_ids: ['UC_b', 'UC_c'] });
    expect(putRes.status).toBe(200);
    expect(putRes.body.member_count).toBe(2);

    const members = await db.query('SELECT channel_id FROM creator_group_members WHERE group_id = $1', [groupId]);
    expect(members.rows.map(r => r.channel_id).sort()).toEqual(['UC_b', 'UC_c']);

    const listRes = await request(app).get('/api/creator-groups').set('Cookie', cookie);
    expect(listRes.body.groups[0].member_count).toBe(2);
  });

  it('rejects an empty channel_ids array with 400, group untouched', async () => {
    const created = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'News', channel_ids: ['UC_a'] });
    const groupId = created.body.id;

    const res = await request(app)
      .put(`/api/creator-groups/${groupId}/members`)
      .set('Cookie', cookie)
      .send({ channel_ids: [] });
    expect(res.status).toBe(400);

    const members = await db.query('SELECT channel_id FROM creator_group_members WHERE group_id = $1', [groupId]);
    expect(members.rows.map(r => r.channel_id)).toEqual(['UC_a']);
  });

  it('a non-owner updating a group gets 404 and the group survives untouched', async () => {
    const created = await request(app).post('/api/creator-groups').set('Cookie', cookie)
      .send({ name: 'News', channel_ids: ['UC_a'] });
    const groupId = created.body.id;

    const userB = await seedUser();
    const cookieB = sessionCookieFor(userB.id);
    const res = await request(app)
      .put(`/api/creator-groups/${groupId}/members`)
      .set('Cookie', cookieB)
      .send({ channel_ids: ['UC_b'] });
    expect(res.status).toBe(404);

    const members = await db.query('SELECT channel_id FROM creator_group_members WHERE group_id = $1', [groupId]);
    expect(members.rows.map(r => r.channel_id)).toEqual(['UC_a']);
  });
});

describe('db.withTransaction: atomicity', () => {
  let user;

  beforeEach(async () => {
    await resetDb();
    user = await seedUser();
    await seedSubscriptions(user.id, [{ channelId: 'UC_x', channelName: 'X' }]);
    await seedSelections(user.id, ['UC_x']);
  });

  it('rolls back all writes if the callback throws partway through', async () => {
    await expect(
      db.withTransaction(async (client) => {
        await client.query('DELETE FROM creator_selections WHERE user_id = $1', [user.id]);
        throw new Error('simulated failure after delete, before insert');
      })
    ).rejects.toThrow('simulated failure');

    // Proves the DELETE was rolled back, not left partially applied — this
    // is the exact failure mode /apply's mode=replace would hit without
    // withTransaction wrapping it.
    const remaining = await db.query('SELECT channel_id FROM creator_selections WHERE user_id = $1', [user.id]);
    expect(remaining.rows.map(r => r.channel_id)).toEqual(['UC_x']);
  });

  it('commits all writes when the callback succeeds', async () => {
    await db.withTransaction(async (client) => {
      await client.query('DELETE FROM creator_selections WHERE user_id = $1', [user.id]);
      await client.query(
        `INSERT INTO creator_selections (user_id, channel_id) VALUES ($1, 'UC_new')`,
        [user.id]
      );
    });

    const rows = await db.query('SELECT channel_id FROM creator_selections WHERE user_id = $1', [user.id]);
    expect(rows.rows.map(r => r.channel_id)).toEqual(['UC_new']);
  });
});
