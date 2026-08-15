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

module.exports = {
  mockRSSFeed,
  mockRSSFeedFailure,
  mockSubscriptionsPages,
  mockUploadsPlaylist,
  mockPlaylistItems,
};
