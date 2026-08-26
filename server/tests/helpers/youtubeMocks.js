const nock = require('nock');

function xmlEntry({ videoId, title, publishedAt, views = 100 }) {
  return `
    <entry>
      <yt:videoId>${videoId}</yt:videoId>
      <title>${title}</title>
      <published>${publishedAt}</published>
      <media:group>
        <media:thumbnail url="https://example.com/${videoId}.jpg"/>
        <media:community>
          <media:statistics views="${views}"/>
        </media:community>
      </media:group>
    </entry>`;
}

// Simulates YouTube's real RSS feed, which by design only ever returns each
// channel's 15 most recent videos (see Issue 002) — callers decide how many
// `videos` to pass, so a test can reproduce that 15-item ceiling on purpose.
function mockRSSFeed(channelId, videos) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
${videos.map(xmlEntry).join('\n')}
</feed>`;
  return nock('https://www.youtube.com')
    .get(`/feeds/videos.xml?channel_id=${channelId}`)
    .reply(200, body, { 'Content-Type': 'application/xml' });
}

// fetchRSSVideos treats any thrown error (network failure, timeout, bad XML)
// as "no RSS available" and returns null, which is what triggers the API
// fallback path in getVideosForChannels.
function mockRSSFeedFailure(channelId) {
  return nock('https://www.youtube.com')
    .get(`/feeds/videos.xml?channel_id=${channelId}`)
    .replyWithError('simulated RSS failure');
}

// pages: [{ items: [{channelId, channelName, avatarUrl}], nextPageToken }]
// Interceptors are consumed in the order fetchSubscriptions calls them,
// since it awaits each page before requesting the next.
function mockSubscriptionsPages(pages) {
  const scope = nock('https://www.googleapis.com');
  for (const page of pages) {
    scope.get('/youtube/v3/subscriptions').query(true).reply(200, {
      items: page.items.map(s => ({
        snippet: {
          title: s.channelName,
          resourceId: { channelId: s.channelId },
          thumbnails: { default: { url: s.avatarUrl || `https://example.com/${s.channelId}.jpg` } },
        },
      })),
      nextPageToken: page.nextPageToken || undefined,
    });
  }
  return scope;
}

function mockUploadsPlaylist(channelId, playlistId) {
  return nock('https://www.googleapis.com')
    .get('/youtube/v3/channels')
    .query(true)
    .reply(200, { items: [{ contentDetails: { relatedPlaylists: { uploads: playlistId } } }] });
}

function mockPlaylistItems(playlistId, videos) {
  return nock('https://www.googleapis.com')
    .get('/youtube/v3/playlistItems')
    .query(true)
    .reply(200, {
      items: videos.map(v => ({
        snippet: {
          resourceId: { videoId: v.videoId },
          title: v.title,
          publishedAt: v.publishedAt,
          thumbnails: { high: { url: `https://example.com/${v.videoId}.jpg` } },
        },
      })),
      nextPageToken: null,
    });
}

// comments: [{ id, author, avatarUrl, text, likeCount, publishedAt, replyPreview: [{...}] }]
// replyPreview mirrors what commentThreads.list embeds for free (up to ~5
// replies) — separate from the full reply list fetched on demand via
// mockCommentReplies below.
function mockCommentThreads(videoId, comments) {
  return nock('https://www.googleapis.com')
    .get('/youtube/v3/commentThreads')
    .query(true)
    .reply(200, {
      items: comments.map(c => ({
        id: c.id,
        snippet: {
          totalReplyCount: c.totalReplyCount ?? (c.replyPreview?.length || 0),
          topLevelComment: {
            snippet: {
              authorDisplayName: c.author,
              authorProfileImageUrl: c.avatarUrl || `https://example.com/${c.author}.jpg`,
              textDisplay: c.text,
              likeCount: c.likeCount ?? 0,
              publishedAt: c.publishedAt,
            },
          },
        },
        replies: c.replyPreview ? { comments: c.replyPreview.map(replySnippet) } : undefined,
      })),
    });
}

function replySnippet(r) {
  return {
    id: r.id,
    snippet: {
      authorDisplayName: r.author,
      authorProfileImageUrl: r.avatarUrl || `https://example.com/${r.author}.jpg`,
      textDisplay: r.text,
      likeCount: r.likeCount ?? 0,
      publishedAt: r.publishedAt,
    },
  };
}

// Mocks GET /comments?parentId=commentId — the full-reply-list fetch used by
// expandCommentReplies, distinct from commentThreads.list's free preview.
function mockCommentReplies(commentId, replies) {
  return nock('https://www.googleapis.com')
    .get('/youtube/v3/comments')
    .query(q => q.parentId === commentId)
    .reply(200, { items: replies.map(replySnippet), nextPageToken: null });
}

function mockCommentsDisabled(videoId) {
  return nock('https://www.googleapis.com')
    .get('/youtube/v3/commentThreads')
    .query(true)
    .reply(403, { error: { errors: [{ reason: 'commentsDisabled' }] } });
}

module.exports = {
  mockRSSFeed,
  mockRSSFeedFailure,
  mockSubscriptionsPages,
  mockUploadsPlaylist,
  mockPlaylistItems,
  mockCommentThreads,
  mockCommentReplies,
  mockCommentsDisabled,
};
