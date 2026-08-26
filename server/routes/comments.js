const express = require('express');
const { fetchComments, expandCommentReplies } = require('../lib/youtube');
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

// Fetches the full reply list for one top-level comment. commentThreads.list
// (used by fetchComments above) only ever embeds a preview of ~5 replies —
// this is the "view all N replies" action, called on demand rather than for
// every comment on every video load.
router.get('/:videoId/:commentId/replies', requireAuth, async (req, res) => {
  try {
    const replies = await expandCommentReplies(req.params.videoId, req.params.commentId);
    if (replies === null) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    res.json({ replies });
  } catch {
    res.status(500).json({ error: 'Could not load replies.' });
  }
});

module.exports = router;
