const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT g.id, g.name, g.created_at, COUNT(m.id)::int AS member_count
     FROM creator_groups g
     LEFT JOIN creator_group_members m ON m.group_id = g.id
     WHERE g.user_id = $1
     GROUP BY g.id
     ORDER BY g.name ASC`,
    [req.user.id]
  );
  res.json({ groups: result.rows });
});

router.post('/', requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim();
  const { channel_ids } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (name.length > 100) return res.status(400).json({ error: 'name too long' });
  if (!Array.isArray(channel_ids) || channel_ids.length === 0) {
    return res.status(400).json({ error: 'channel_ids array required' });
  }

  try {
    const g = await db.query(
      `INSERT INTO creator_groups (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at`,
      [req.user.id, name]
    );
    const groupId = g.rows[0].id;
    await db.query(
      `INSERT INTO creator_group_members (group_id, channel_id)
       SELECT $1, unnest($2::text[])
       ON CONFLICT DO NOTHING`,
      [groupId, channel_ids]
    );
    res.status(201).json({ ...g.rows[0], member_count: channel_ids.length });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A group with that name already exists' });
    }
    throw err;
  }
});

router.put('/:id/members', requireAuth, async (req, res) => {
  const { channel_ids } = req.body;
  if (!Array.isArray(channel_ids) || channel_ids.length === 0) {
    return res.status(400).json({ error: 'channel_ids array required' });
  }

  const group = await db.query(
    'SELECT id FROM creator_groups WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!group.rows[0]) return res.status(404).json({ error: 'Group not found' });

  // Same delete-then-insert shape as /apply's mode=replace, same reason for
  // withTransaction: without it, a concurrent GET / could see a group with
  // zero members between the DELETE and the INSERT.
  await db.withTransaction(async (client) => {
    await client.query('DELETE FROM creator_group_members WHERE group_id = $1', [req.params.id]);
    await client.query(
      `INSERT INTO creator_group_members (group_id, channel_id)
       SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
      [req.params.id, channel_ids]
    );
  });

  res.json({ ok: true, member_count: channel_ids.length });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const result = await db.query(
    'DELETE FROM creator_groups WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Group not found' });
  res.json({ ok: true });
});

router.post('/:id/apply', requireAuth, async (req, res) => {
  const { mode } = req.body;
  if (mode !== 'replace' && mode !== 'add') {
    return res.status(400).json({ error: 'mode must be "replace" or "add"' });
  }

  const group = await db.query(
    'SELECT id FROM creator_groups WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!group.rows[0]) return res.status(404).json({ error: 'Group not found' });

  const members = await db.query(
    'SELECT channel_id FROM creator_group_members WHERE group_id = $1',
    [req.params.id]
  );
  const groupChannelIds = members.rows.map(r => r.channel_id);

  // Intersect with the user's *current* subscriptions — a group can hold
  // channel_ids for channels the user has since unsubscribed from (we
  // don't proactively clean creator_group_members on sync, see
  // server/db/schema.sql comment-adjacent Decision doc). Applying a stale
  // channel_id straight into creator_selections would produce a feed row
  // GET /feed can't attach a channel_name to (it joins subscriptions, not
  // creator_group_members) — so filter here, not there.
  const live = groupChannelIds.length > 0
    ? await db.query(
        'SELECT channel_id FROM subscriptions WHERE user_id = $1 AND channel_id = ANY($2)',
        [req.user.id, groupChannelIds]
      )
    : { rows: [] };
  const applyIds = live.rows.map(r => r.channel_id);
  const skippedCount = groupChannelIds.length - applyIds.length;

  if (mode === 'replace') {
    await db.withTransaction(async (client) => {
      await client.query('DELETE FROM creator_selections WHERE user_id = $1', [req.user.id]);
      if (applyIds.length > 0) {
        await client.query(
          `INSERT INTO creator_selections (user_id, channel_id)
           SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
          [req.user.id, applyIds]
        );
      }
    });
  } else if (applyIds.length > 0) {
    await db.query(
      `INSERT INTO creator_selections (user_id, channel_id)
       SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
      [req.user.id, applyIds]
    );
  }

  res.json({ ok: true, mode, applied_count: applyIds.length, skipped_count: skippedCount });
});

module.exports = router;
