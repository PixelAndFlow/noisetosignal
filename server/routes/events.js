const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_EVENTS = new Set([
  'session_start', 'mode_switched', 'subscription_list_loaded', 'creator_selected',
  'creator_deselected', 'recency_filter_set', 'queue_generated', 'video_clicked',
  'load_more_clicked', 'manual_sync_triggered', 'data_source_indicator_toggled',
  'subscription_sync_completed', 'youtube_mode_iframe_blocked',
]);

router.post('/', requireAuth, async (req, res) => {
  const { events } = req.body;
  if (!Array.isArray(events)) return res.status(400).json({ error: 'events array required' });

  for (const event of events) {
    if (!ALLOWED_EVENTS.has(event.name)) continue;
    await db.query(
      'INSERT INTO events (user_id, event_name, occurred_at, properties) VALUES ($1, $2, $3, $4)',
      [req.user.id, event.name, event.occurred_at || new Date(), event.properties ? JSON.stringify(event.properties) : null]
    );
  }

  // Rolling 12-month retention
  await db.query(
    `DELETE FROM events WHERE user_id = $1 AND occurred_at < NOW() - INTERVAL '12 months'`,
    [req.user.id]
  );

  res.json({ ok: true });
});

module.exports = router;
