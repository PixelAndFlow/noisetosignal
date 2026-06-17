const express = require('express');
const { fetchComments } = require('../lib/youtube');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/:videoId', requireAuth, async (req, res) => {
  try {
    const comments = await fetchComments(req.params.videoId);
    res.json({ comments });
  } catch {
    res.status(500).json({ error: 'Could not load comments.' });
  }
});

module.exports = router;
