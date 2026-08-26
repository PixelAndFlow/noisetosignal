const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// "Export my data" — everything scoped to req.user.id, in a structured,
// machine-readable format (GDPR Article 20 territory, though not gated on
// EU-only per Decision-018-style "why wait" reasoning — this is generally
// good practice regardless of user location).
//
// Deliberately excluded:
// - oauth_tokens: security-sensitive, never leaves the server even to the
//   user it belongs to
// - error_log: system/operational diagnostics, not data the user provided
//   or generated through using the product
// - cached_videos / cached_comments: shared caches keyed by channel_id/
//   video_id, not per-user data at all
router.get('/export', requireAuth, async (req, res) => {
  const userId = req.user.id;

  const [profile, settings, subscriptions, selections, groups, groupMembers, watched, syncHistory, events] = await Promise.all([
    db.query('SELECT email, display_name, avatar_url, created_at, last_login FROM users WHERE id = $1', [userId]),
    db.query('SELECT setting_key, setting_value FROM user_settings WHERE user_id = $1', [userId]),
    db.query('SELECT channel_id, channel_name, channel_avatar_url, last_synced_at FROM subscriptions WHERE user_id = $1', [userId]),
    db.query('SELECT channel_id, selected_at FROM creator_selections WHERE user_id = $1', [userId]),
    db.query('SELECT id, name, created_at FROM creator_groups WHERE user_id = $1', [userId]),
    db.query(
      `SELECT cgm.group_id, cgm.channel_id, cgm.added_at
       FROM creator_group_members cgm
       JOIN creator_groups cg ON cg.id = cgm.group_id
       WHERE cg.user_id = $1`,
      [userId]
    ),
    db.query('SELECT video_id, watched_at, progress_seconds FROM watched_videos WHERE user_id = $1', [userId]),
    db.query(
      'SELECT sync_type, outcome, channels_added, channels_removed, occurred_at, error_message FROM sync_log WHERE user_id = $1',
      [userId]
    ),
    db.query('SELECT event_name, occurred_at, properties FROM events WHERE user_id = $1', [userId]),
  ]);

  const membersByGroup = {};
  for (const m of groupMembers.rows) {
    (membersByGroup[m.group_id] ||= []).push({ channel_id: m.channel_id, added_at: m.added_at });
  }

  const settingsObj = {};
  for (const s of settings.rows) settingsObj[s.setting_key] = s.setting_value;

  const exportData = {
    exported_at: new Date().toISOString(),
    profile: profile.rows[0] || null,
    settings: settingsObj,
    subscriptions: subscriptions.rows,
    creator_selections: selections.rows,
    creator_groups: groups.rows.map(g => ({
      name: g.name,
      created_at: g.created_at,
      members: membersByGroup[g.id] || [],
    })),
    watched_videos: watched.rows,
    sync_history: syncHistory.rows,
    events: events.rows,
  };

  res.setHeader('Content-Disposition', `attachment; filename="noisetosignal-export-${userId}-${Date.now()}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(exportData, null, 2));
});

module.exports = router;
