const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_KEYS = new Set([
  'default_viewing_mode',
  'data_source_indicator',
  'default_recency_window',
  'subscription_sync_frequency',
  'dark_mode',
]);

router.get('/', requireAuth, async (req, res) => {
  const result = await db.query(
    'SELECT setting_key, setting_value FROM user_settings WHERE user_id = $1',
    [req.user.id]
  );
  const settings = {};
  for (const row of result.rows) settings[row.setting_key] = row.setting_value;
  res.json(settings);
});

router.put('/:key', requireAuth, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (!ALLOWED_KEYS.has(key)) return res.status(400).json({ error: 'Unknown setting' });
  if (value === undefined || value === null) return res.status(400).json({ error: 'value required' });

  await db.query(
    `INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
    [req.user.id, key, String(value)]
  );
  res.json({ ok: true });
});

module.exports = router;
