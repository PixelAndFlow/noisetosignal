const express = require('express');
const db = require('../lib/db');
const { fetchSubscriptions } = require('../lib/youtube');
const { requireAuth, getAccessToken } = require('../middleware/auth');
const { syncLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

async function syncSubscriptions(userId) {
  const accessToken = await getAccessToken(userId);
  const remoteSubs = await fetchSubscriptions(accessToken);

  const existing = await db.query('SELECT channel_id FROM subscriptions WHERE user_id = $1', [userId]);
  const existingIds = new Set(existing.rows.map(r => r.channel_id));
  const remoteIds = new Set(remoteSubs.map(s => s.channel_id));

  let added = 0;
  let removed = 0;
  const removedFromFilter = [];

  for (const sub of remoteSubs) {
    if (!existingIds.has(sub.channel_id)) {
      await db.query(
        `INSERT INTO subscriptions (user_id, channel_id, channel_name, channel_avatar_url, last_synced_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, channel_id) DO UPDATE SET channel_name = EXCLUDED.channel_name, channel_avatar_url = EXCLUDED.channel_avatar_url, last_synced_at = NOW()`,
        [userId, sub.channel_id, sub.channel_name, sub.channel_avatar_url]
      );
      added++;
    } else {
      await db.query(
        'UPDATE subscriptions SET last_synced_at = NOW() WHERE user_id = $1 AND channel_id = $2',
        [userId, sub.channel_id]
      );
    }
  }

  for (const id of existingIds) {
    if (!remoteIds.has(id)) {
      const inFilter = await db.query(
        'SELECT channel_id FROM creator_selections WHERE user_id = $1 AND channel_id = $2',
        [userId, id]
      );
      if (inFilter.rows.length > 0) {
        const sub = existing.rows.find(r => r.channel_id === id);
        removedFromFilter.push(sub?.channel_id);
        await db.query('DELETE FROM creator_selections WHERE user_id = $1 AND channel_id = $2', [userId, id]);
      }
      await db.query('DELETE FROM subscriptions WHERE user_id = $1 AND channel_id = $2', [userId, id]);
      removed++;
    }
  }

  const outcome = added === 0 && removed === 0 ? 'no_changes' : 'success';
  await db.query(
    `INSERT INTO sync_log (user_id, sync_type, outcome, channels_added, channels_removed)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, 'auto', outcome, added, removed]
  );

  return { added, removed, removedFromFilter, outcome };
}

router.get('/', requireAuth, async (req, res) => {
  const subs = await db.query(
    'SELECT channel_id, channel_name, channel_avatar_url, last_synced_at FROM subscriptions WHERE user_id = $1 ORDER BY channel_name ASC',
    [req.user.id]
  );
  const selections = await db.query(
    'SELECT channel_id FROM creator_selections WHERE user_id = $1',
    [req.user.id]
  );
  const selectedIds = new Set(selections.rows.map(r => r.channel_id));
  const lastSync = subs.rows[0]?.last_synced_at || null;

  res.json({
    subscriptions: subs.rows.map(s => ({ ...s, selected: selectedIds.has(s.channel_id) })),
    last_synced_at: lastSync,
  });
});

router.post('/sync', requireAuth, syncLimiter, async (req, res) => {
  try {
    const result = await syncSubscriptions(req.user.id);
    res.json(result);
  } catch (err) {
    console.error('SYNC ERROR:', err);
    // await db.query(
    //   `INSERT INTO sync_log (user_id, sync_type, outcome, error_message) VALUES ($1, 'manual', 'failure', $2)`,
    //   [req.user.id, err.message]
    // );
    // await db.query(
    //   `INSERT INTO error_log (error_type, user_id, endpoint, resolution_action) VALUES ('sync_failure', $1, '/api/subscriptions/sync', 'logged')`,
    //   [req.user.id]
    // );
    res.status(500).json({ error: 'Sync failed. Please try again.' });
  }
});

router.get('/sync/status', requireAuth, async (req, res) => {
  const last = await db.query(
    `SELECT occurred_at FROM sync_log WHERE user_id = $1 AND outcome != 'failure' ORDER BY occurred_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json({ last_synced_at: last.rows[0]?.occurred_at || null });
});

router.put('/selections', requireAuth, async (req, res) => {
  const { channel_id, selected } = req.body;
  if (!channel_id) return res.status(400).json({ error: 'channel_id required' });

  if (selected) {
    await db.query(
      'INSERT INTO creator_selections (user_id, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, channel_id]
    );
  } else {
    await db.query(
      'DELETE FROM creator_selections WHERE user_id = $1 AND channel_id = $2',
      [req.user.id, channel_id]
    );
  }
  res.json({ ok: true });
});

router.put('/selections/bulk', requireAuth, async (req, res) => {
  const { channel_ids, selected } = req.body;
  if (!Array.isArray(channel_ids)) return res.status(400).json({ error: 'channel_ids array required' });

  if (selected) {
    for (const id of channel_ids) {
      await db.query(
        'INSERT INTO creator_selections (user_id, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.user.id, id]
      );
    }
  } else {
    await db.query(
      'DELETE FROM creator_selections WHERE user_id = $1 AND channel_id = ANY($2)',
      [req.user.id, channel_ids]
    );
  }
  res.json({ ok: true });
});

module.exports = { router, syncSubscriptions };
