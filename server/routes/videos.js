import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getValidAccessToken, fetchVideosForChannels } from '../services/youtube.js';

const router = Router();

const VALID_DAYS = [1, 7, 30, 90];

router.get('/', requireAuth, async (req, res) => {
  const { channels, days } = req.query;

  if (!channels) {
    return res.status(400).json({ error: 'channels query parameter is required' });
  }

  const channelIds = channels.split(',').map((c) => c.trim()).filter(Boolean);
  if (channelIds.length === 0) {
    return res.json({ videos: [], total: 0 });
  }

  const parsedDays = parseInt(days, 10) || 7;
  if (!VALID_DAYS.includes(parsedDays)) {
    return res.status(400).json({ error: 'days must be one of: 1, 7, 30, 90' });
  }

  try {
    const accessToken = await getValidAccessToken(req.user.id);
    const videos = await fetchVideosForChannels(accessToken, channelIds, parsedDays);

    res.json({
      videos: videos.map((v) => ({
        ...v,
        youtubeUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
      })),
      total: videos.length,
      capped: true,
      maxResults: 100,
    });
  } catch (err) {
    console.error('Fetch videos error:', err);
    const message =
      err.status === 403 || err.status === 429
        ? 'YouTube is temporarily unavailable. Please try again in a few minutes.'
        : 'Failed to load videos. Please try again.';
    res.status(err.status === 403 || err.status === 429 ? 503 : 500).json({ error: message });
  }
});

export default router;
