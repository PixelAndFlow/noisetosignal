const express = require('express');
const db = require('../lib/db');
const { getVideosForChannels, fetchVideoDetails } = require('../lib/youtube');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const RECENCY_MAP = {
  last_hour: 60,
  last_8_hours: 8 * 60,
  last_24_hours: 24 * 60,
  last_3_days: 3 * 24 * 60,
  last_7_days: 7 * 24 * 60,
  last_month: 30 * 24 * 60,
  last_90_days: 90 * 24 * 60,
  last_6_months: 180 * 24 * 60,
};

router.get('/feed', requireAuth, async (req, res) => {
  const { timeframe = 'last_3_days', sort = 'newest', offset = 0 } = req.query;
  const offsetNum = parseInt(offset) || 0;

  const selections = await db.query(
    'SELECT channel_id FROM creator_selections WHERE user_id = $1',
    [req.user.id]
  );
  const channelIds = selections.rows.map(r => r.channel_id);

  if (channelIds.length === 0) {
    return res.json({ videos: [], total: 0, channel_count: 0 });
  }

  const minutes = RECENCY_MAP[timeframe] || RECENCY_MAP.last_3_days;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  await getVideosForChannels(channelIds, true);

  const watched = await db.query(
    'SELECT video_id FROM watched_videos WHERE user_id = $1',
    [req.user.id]
  );
  const watchedIds = new Set(watched.rows.map(r => r.video_id));

  const subs = await db.query(
    'SELECT channel_id, channel_name, channel_avatar_url FROM subscriptions WHERE user_id = $1 AND channel_id = ANY($2)',
    [req.user.id, channelIds]
  );
  const subMap = {};
  for (const s of subs.rows) subMap[s.channel_id] = s;

  const orderClause = sort === 'creator' ? 'channel_id ASC, published_at DESC' : 'published_at DESC';
  const videoRows = await db.query(
    `SELECT * FROM cached_videos
     WHERE channel_id = ANY($1) AND published_at >= $2
     ORDER BY ${orderClause}
     LIMIT 101 OFFSET $3`,
    [channelIds, cutoff, offsetNum]
  );

  const total = videoRows.rows.length;
  const videos = videoRows.rows.slice(0, 100).map(v => ({
    ...v,
    watched: watchedIds.has(v.video_id),
    channel_name: subMap[v.channel_id]?.channel_name,
    channel_avatar_url: subMap[v.channel_id]?.channel_avatar_url,
  }));

  res.json({ videos, total: offsetNum + total, has_more: total > 100, channel_count: channelIds.length });
});

router.get('/:videoId', requireAuth, async (req, res) => {
  const { videoId } = req.params;

  let video = null;
  const cached = await db.query(
    'SELECT * FROM cached_videos WHERE video_id = $1',
    [videoId]
  );
  if (cached.rows[0]) {
    video = cached.rows[0];
  } else {
    try {
      video = await fetchVideoDetails(videoId);
    } catch {
      return res.status(404).json({ error: 'Video not found' });
    }
  }

  if (!video) return res.status(404).json({ error: 'Video not found' });

  const subs = await db.query(
    'SELECT channel_id, channel_name, channel_avatar_url FROM subscriptions WHERE user_id = $1 AND channel_id = $2',
    [req.user.id, video.channel_id]
  );
  const isSubscribed = subs.rows.length > 0;

  const watched = await db.query(
    'SELECT video_id FROM watched_videos WHERE user_id = $1 AND video_id = $2',
    [req.user.id, videoId]
  );

  res.json({
    ...video,
    is_subscribed: isSubscribed,
    channel_name: subs.rows[0]?.channel_name || video.channel_name,
    channel_avatar_url: subs.rows[0]?.channel_avatar_url || video.channel_avatar_url,
    watched: watched.rows.length > 0,
  });
});

router.post('/:videoId/watched', requireAuth, async (req, res) => {
  const { videoId } = req.params;

  const count = await db.query('SELECT COUNT(*) FROM watched_videos WHERE user_id = $1', [req.user.id]);
  if (parseInt(count.rows[0].count) >= 500) {
    await db.query(
      'DELETE FROM watched_videos WHERE id = (SELECT id FROM watched_videos WHERE user_id = $1 ORDER BY watched_at ASC LIMIT 1)',
      [req.user.id]
    );
  }

  await db.query(
    `INSERT INTO watched_videos (user_id, video_id, watched_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, video_id) DO UPDATE SET watched_at = NOW()`,
    [req.user.id, videoId]
  );
  res.json({ ok: true });
});

module.exports = router;
