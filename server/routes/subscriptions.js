import { Router } from 'express';
import pool from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  getValidAccessToken,
  fetchSubscriptions,
  syncSubscriptionsToDb,
} from '../services/youtube.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT channel_id, channel_name, channel_avatar_url, synced_at
       FROM subscriptions
       WHERE user_id = $1
       ORDER BY channel_name ASC`,
      [req.user.id]
    );

    res.json({
      subscriptions: result.rows.map((row) => ({
        channelId: row.channel_id,
        channelName: row.channel_name,
        channelAvatarUrl: row.channel_avatar_url,
        syncedAt: row.synced_at,
      })),
    });
  } catch (err) {
    console.error('Get subscriptions error:', err);
    res.status(500).json({ error: 'Failed to load subscriptions' });
  }
});

router.post('/sync', requireAuth, async (req, res) => {
  try {
    const accessToken = await getValidAccessToken(req.user.id);
    const subscriptions = await fetchSubscriptions(accessToken);
    await syncSubscriptionsToDb(req.user.id, subscriptions);

    const result = await pool.query(
      `SELECT channel_id, channel_name, channel_avatar_url, synced_at
       FROM subscriptions
       WHERE user_id = $1
       ORDER BY channel_name ASC`,
      [req.user.id]
    );

    res.json({
      subscriptions: result.rows.map((row) => ({
        channelId: row.channel_id,
        channelName: row.channel_name,
        channelAvatarUrl: row.channel_avatar_url,
        syncedAt: row.synced_at,
      })),
    });
  } catch (err) {
    console.error('Sync subscriptions error:', err);
    const message =
      err.status === 403 || err.status === 429
        ? 'YouTube is temporarily unavailable. Please try again in a few minutes.'
        : 'Failed to refresh subscriptions. Please try again.';
    res.status(err.status === 403 || err.status === 429 ? 503 : 500).json({ error: message });
  }
});

export default router;
