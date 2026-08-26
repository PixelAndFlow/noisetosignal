const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const db = require('./db');

const YT_API = 'https://www.googleapis.com/youtube/v3';
const RSS_BASE = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const ACTIVE_TTL_MINUTES = 10;
const INACTIVE_TTL_MINUTES = 60;

// YouTube's RSS feed always caps at each channel's 15 most recent uploads —
// not configurable, not paginated. A channel that uploads more than ~15
// times within a requested timeframe needs the API instead (see Issue 002
// in noisetosignal-docs/testing/known-issues-log.md).
const RSS_ENTRY_CAP = 15;
// Safety cap on how many pages of playlistItems (50/page) a single deep
// fetch will page through, mirroring the pattern already used for
// subscription pagination (SUBSCRIPTION_PAGE_LIMIT below). 10 pages = up to
// 500 videos per channel, comfortably more than any real channel uploads
// within the app's deepest timeframe filter (6 months).
const API_DEEP_FETCH_PAGE_CAP = 10;

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// In-memory, per-user count of subscriptions fetched so far during an
// in-progress sync — lets the client poll for live progress without
// turning the single-request sync flow into a streaming/websocket one.
// Single-process assumption (matches this app's current Render deploy);
// would need a shared store if ever run across multiple instances.
const syncProgressByUser = new Map();

function getSyncProgress(userId) {
  return syncProgressByUser.has(userId) ? syncProgressByUser.get(userId) : null;
}

function clearSyncProgress(userId) {
  syncProgressByUser.delete(userId);
}

function parseDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = parseInt(m[1] || 0);
  const min = parseInt(m[2] || 0);
  const s = parseInt(m[3] || 0);
  const total = h * 3600 + min * 60 + s;
  if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${min}:${String(s).padStart(2, '0')}`;
}

function formatViewCount(n) {
  if (!n) return null;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

async function fetchRSSVideos(channelId) {
  try {
    const res = await axios.get(`${RSS_BASE}${channelId}`, { timeout: 5000 });
    const parsed = xmlParser.parse(res.data);
    const entries = parsed?.feed?.entry;
    if (!entries) return [];
    const list = Array.isArray(entries) ? entries : [entries];
    return list.map(e => ({
      video_id: e['yt:videoId'],
      title: e.title,
      thumbnail_url: e['media:group']?.['media:thumbnail']?.['@_url'] || null,
      published_at: e.published,
      duration: null,
      view_count: parseInt(e['media:group']?.['media:community']?.['media:statistics']?.['@_views'] || 0) || null,
      data_source: 'rss',
    }));
  } catch {
    return null;
  }
}

// Pages through a channel's uploads playlist. When `cutoff` is given, stops
// once a page's oldest item reaches back past it (the uploads playlist is
// newest-first, so once we're past the cutoff there's nothing more the
// caller needs) — otherwise pages until the API itself runs out
// (`nextPageToken` absent) or the safety cap is hit.
async function fetchAPIVideos(channelId, uploadsPlaylistId, cutoff = null) {
  const items = [];
  let pageToken = null;
  let pageCount = 0;
  do {
    const params = {
      part: 'snippet',
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      key: process.env.YOUTUBE_API_KEY,
    };
    if (pageToken) params.pageToken = pageToken;
    const res = await axios.get(`${YT_API}/playlistItems`, { params });
    for (const item of res.data.items || []) {
      items.push({
        video_id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        thumbnail_url: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        published_at: item.snippet.publishedAt,
        duration: null,
        view_count: null,
        data_source: 'api',
      });
    }
    pageToken = res.data.nextPageToken || null;
    pageCount++;

    const oldestSoFar = items[items.length - 1]?.published_at;
    if (cutoff && oldestSoFar && new Date(oldestSoFar) <= cutoff) break;

    if (pageCount >= API_DEEP_FETCH_PAGE_CAP) {
      console.error(`fetchAPIVideos: hit ${API_DEEP_FETCH_PAGE_CAP}-page safety cap for channel ${channelId} (${items.length} videos fetched) without reaching the requested cutoff.`);
      break;
    }
  } while (pageToken);
  return items;
}

async function getUploadsPlaylistId(channelId) {
  const res = await axios.get(`${YT_API}/channels`, {
    params: { part: 'contentDetails', id: channelId, key: process.env.YOUTUBE_API_KEY },
  });
  return res.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
}

async function enrichWithDurationAndViews(videoIds) {
  const chunks = [];
  for (let i = 0; i < videoIds.length; i += 50) chunks.push(videoIds.slice(i, i + 50));
  const result = {};
  for (const chunk of chunks) {
    const res = await axios.get(`${YT_API}/videos`, {
      params: { part: 'contentDetails,statistics', id: chunk.join(','), key: process.env.YOUTUBE_API_KEY },
    });
    for (const item of res.data.items || []) {
      result[item.id] = {
        duration: parseDuration(item.contentDetails?.duration),
        view_count: parseInt(item.statistics?.viewCount || 0),
      };
    }
  }
  return result;
}

// A channel's cache is only "fresh" (safe to skip refetching) if it's both
// unexpired AND deep enough to answer the requested cutoff. Row count alone
// tells us when a channel's *entire* history is already cached — if RSS (or
// a prior API fetch) returned fewer than RSS_ENTRY_CAP videos, there is
// nothing older to find, regardless of how far back `cutoff` reaches. Only
// once a channel has at least RSS_ENTRY_CAP cached rows does the oldest
// cached video's date actually need to be compared against the cutoff. This
// is the fix for Issue 002 ("videos older than ~1 week can be missing from
// the feed") — the old code treated any unexpired cache as fresh regardless
// of whether it covered the requested timeframe.
function channelCoversCutoff(coverageRow, cutoff) {
  if (!coverageRow) return false;
  const rowCount = parseInt(coverageRow.row_count, 10);
  if (rowCount < RSS_ENTRY_CAP) return true;
  if (!cutoff) return true;
  return new Date(coverageRow.oldest) <= cutoff;
}

async function getVideosForChannels(channelIds, isActive = false, cutoff = null) {
  const ttlMinutes = isActive ? ACTIVE_TTL_MINUTES : INACTIVE_TTL_MINUTES;
  const now = new Date();

  const coverageResult = await db.query(
    `SELECT channel_id, COUNT(*) AS row_count, MIN(published_at) AS oldest
     FROM cached_videos
     WHERE channel_id = ANY($1) AND expires_at > NOW()
     GROUP BY channel_id`,
    [channelIds]
  );
  const coverageByChannel = new Map(coverageResult.rows.map(r => [r.channel_id, r]));

  const freshChannelIds = channelIds.filter(id => channelCoversCutoff(coverageByChannel.get(id), cutoff));
  const freshChannelSet = new Set(freshChannelIds);
  const stale = channelIds.filter(id => !freshChannelSet.has(id));

  // Top-200 unexpired videos per fresh channel — only feeds this function's
  // own return value (routes/videos.js queries cached_videos directly for
  // the actual feed response), so this is a generous convenience cap, not
  // the depth guarantee itself.
  const freshRows = freshChannelIds.length === 0 ? { rows: [] } : await db.query(
    `SELECT * FROM (
       SELECT *, row_number() OVER (PARTITION BY channel_id ORDER BY published_at DESC) AS rn
       FROM cached_videos
       WHERE channel_id = ANY($1) AND expires_at > NOW()
     ) ranked WHERE rn <= 200`,
    [freshChannelIds]
  );
  const fresh = freshRows.rows.map(({ rn: _, ...row }) => row);

  const CHANNEL_BATCH_SIZE = 20;
  for (let i = 0; i < stale.length; i += CHANNEL_BATCH_SIZE) {
    const batch = stale.slice(i, i + CHANNEL_BATCH_SIZE);
    await Promise.all(batch.map(async (channelId) => {
      let videos = await fetchRSSVideos(channelId);
      let source = 'rss';

      // RSS is capped at RSS_ENTRY_CAP regardless of what's asked for. If it
      // hit that cap and its oldest entry still doesn't reach back to the
      // requested cutoff, RSS alone can't answer this request — the API can
      // page deeper. (If RSS failed outright, videos is null here too, so
      // the same fallback covers both cases.)
      const rssHitCapWithoutReachingCutoff = cutoff && Array.isArray(videos) && videos.length >= RSS_ENTRY_CAP
        && !videos.some(v => v.published_at && new Date(v.published_at) <= cutoff);

      if (videos === null || rssHitCapWithoutReachingCutoff) {
        try {
          const playlistId = await getUploadsPlaylistId(channelId);
          if (playlistId) {
            const apiVideos = await fetchAPIVideos(channelId, playlistId, cutoff);
            videos = apiVideos;
            source = 'api';
          } else if (videos === null) {
            videos = [];
          }
          // else: playlist lookup failed but RSS already gave us its
          // (shallower) list — keep it rather than discarding real data.
        } catch {
          if (videos === null) videos = [];
          // else: keep whatever RSS returned — partial depth beats none.
        }
      }

      if (videos.length > 0) {
        const needsEnrichment = videos.filter(v => !v.duration || !v.view_count);
        if (needsEnrichment.length > 0 && source === 'rss') {
          try {
            const enriched = await enrichWithDurationAndViews(needsEnrichment.map(v => v.video_id));
            videos = videos.map(v => ({
              ...v,
              duration: enriched[v.video_id]?.duration || v.duration,
              view_count: enriched[v.video_id]?.view_count || v.view_count,
            }));
          } catch { /* enrichment optional */ }
        }

        const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

        for (const v of videos) {
          await db.query(
            `INSERT INTO cached_videos (channel_id, video_id, title, thumbnail_url, published_at, duration, view_count, data_source, cached_at, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
             ON CONFLICT (video_id) DO UPDATE SET
               title = EXCLUDED.title, thumbnail_url = EXCLUDED.thumbnail_url,
               view_count = EXCLUDED.view_count, cached_at = NOW(), expires_at = EXCLUDED.expires_at`,
            [channelId, v.video_id, v.title, v.thumbnail_url, v.published_at, v.duration, v.view_count, v.data_source, expiresAt]
          );
        }

        const rows = await db.query(
          `SELECT * FROM cached_videos WHERE channel_id = $1 AND expires_at > NOW() ORDER BY published_at DESC LIMIT 200`,
          [channelId]
        );
        fresh.push(...rows.rows);
      }
    }));
  }

  const requestedSet = new Set(channelIds);
  return fresh
    .filter(v => requestedSet.has(v.channel_id))
    .map(v => ({
      ...v,
      view_count_display: formatViewCount(v.view_count),
    }));
}

const SUBSCRIPTION_PAGE_LIMIT = 100; // safety cap: 100 pages × 50 = 5,000 results

async function fetchSubscriptions(accessToken, userId) {
  const subs = [];
  let pageToken = null;
  let pageCount = 0;

  do {
    const params = { part: 'snippet', mine: true, maxResults: 50, order: 'alphabetical' };
    if (pageToken) params.pageToken = pageToken;

    const res = await axios.get(`${YT_API}/subscriptions`, {
      params,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    for (const item of res.data.items || []) {
      subs.push({
        channel_id: item.snippet.resourceId.channelId,
        channel_name: item.snippet.title,
        channel_avatar_url: item.snippet.thumbnails?.default?.url,
      });
    }

    pageToken = res.data.nextPageToken || null;
    pageCount++;

    if (userId != null) syncProgressByUser.set(userId, subs.length);

    console.log(`[subs page ${pageCount}] ${(res.data.items || []).length} items | nextPageToken: ${res.data.nextPageToken || 'NONE'}`);

    if (pageCount >= SUBSCRIPTION_PAGE_LIMIT) {
      console.error(`fetchSubscriptions: hit ${SUBSCRIPTION_PAGE_LIMIT}-page safety limit (${subs.length} subs fetched). There may be more subscriptions the API is not returning.`);
      break;
    }
  } while (pageToken);

  console.log(`fetchSubscriptions: fetched ${subs.length} subscriptions across ${pageCount} page(s)`);

  // Diagnostic only — gated behind DEBUG_SUBSCRIPTIONS so this doesn't run
  // unconditionally in production. Set DEBUG_SUBSCRIPTIONS=true locally
  // while investigating ordering/pagination issues (see
  // noisetosignal-docs/testing/known-issues-log.md).
  if (process.env.DEBUG_SUBSCRIPTIONS === 'true') {
    const first5 = subs.slice(0, 5).map(s => s.channel_name);
    const last5 = subs.slice(-5).map(s => s.channel_name);
    console.log(`  [DEBUG_SUBSCRIPTIONS] order=alphabetical | first 5: ${first5.join(' | ')}`);
    console.log(`  [DEBUG_SUBSCRIPTIONS] order=alphabetical | last 5:  ${last5.join(' | ')}`);
  }

  return subs;
}

async function fetchVideoDetails(videoId) {
  const res = await axios.get(`${YT_API}/videos`, {
    params: { part: 'snippet,contentDetails,statistics', id: videoId, key: process.env.YOUTUBE_API_KEY },
  });
  const item = res.data.items?.[0];
  if (!item) return null;
  return {
    video_id: videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    channel_id: item.snippet.channelId,
    channel_name: item.snippet.channelTitle,
    thumbnail_url: item.snippet.thumbnails?.high?.url,
    published_at: item.snippet.publishedAt,
    duration: parseDuration(item.contentDetails?.duration),
    view_count: parseInt(item.statistics?.viewCount || 0),
    like_count: parseInt(item.statistics?.likeCount || 0),
    view_count_display: formatViewCount(parseInt(item.statistics?.viewCount || 0)),
    like_count_display: formatViewCount(parseInt(item.statistics?.likeCount || 0)),
    data_source: 'api',
  };
}

function mapReply(item) {
  return {
    id: item.id,
    author: item.snippet.authorDisplayName,
    author_avatar: item.snippet.authorProfileImageUrl,
    text: item.snippet.textDisplay,
    like_count: item.snippet.likeCount,
    published_at: item.snippet.publishedAt,
  };
}

const REPLY_PAGE_LIMIT = 5; // safety cap: 5 pages x 100 = up to 500 replies/thread

// Full reply list for one comment thread, paginated — commentThreads.list
// only ever embeds a preview (its first ~5 replies), used by fetchComments
// below; this is the "view all N replies" path, called on demand via
// expandCommentReplies rather than for every comment on every video load.
async function fetchAllReplies(commentId) {
  const replies = [];
  let pageToken = null;
  let pageCount = 0;
  do {
    const params = { part: 'snippet', parentId: commentId, maxResults: 100, key: process.env.YOUTUBE_API_KEY };
    if (pageToken) params.pageToken = pageToken;
    const res = await axios.get(`${YT_API}/comments`, { params });
    replies.push(...(res.data.items || []).map(mapReply));
    pageToken = res.data.nextPageToken || null;
    pageCount++;
  } while (pageToken && pageCount < REPLY_PAGE_LIMIT);
  return replies;
}

// Fetches the full reply list for one comment and patches it into that
// video's already-cached comment blob (same shared, per-video cache
// fetchComments already maintains — Decision 038), rather than a separate
// cache keyed by comment id. Once one user expands a thread, every other
// user loading the same video's comments gets the full list for free until
// the cache expires, same sharing behavior as top-level comments already
// have.
async function expandCommentReplies(videoId, commentId) {
  const cached = await db.query(
    `SELECT comments_json, expires_at FROM cached_comments WHERE video_id = $1`,
    [videoId]
  );
  if (cached.rows.length === 0) return null;

  const comments = cached.rows[0].comments_json;
  const target = comments.find(c => c.id === commentId);
  if (!target) return null;

  const replies = await fetchAllReplies(commentId);
  target.replies = replies;
  target.replies_expanded = true;

  await db.query(
    `UPDATE cached_comments SET comments_json = $1 WHERE video_id = $2`,
    [JSON.stringify(comments), videoId]
  );
  return replies;
}

async function fetchComments(videoId) {
  const cached = await db.query(
    `SELECT comments_json FROM cached_comments WHERE video_id = $1 AND expires_at > NOW()`,
    [videoId]
  );
  if (cached.rows.length > 0) return cached.rows[0].comments_json;

  try {
    const res = await axios.get(`${YT_API}/commentThreads`, {
      params: { part: 'snippet,replies', videoId, maxResults: 20, order: 'relevance', key: process.env.YOUTUBE_API_KEY },
    });
    const comments = (res.data.items || []).map(item => ({
      id: item.id,
      author: item.snippet.topLevelComment.snippet.authorDisplayName,
      author_avatar: item.snippet.topLevelComment.snippet.authorProfileImageUrl,
      text: item.snippet.topLevelComment.snippet.textDisplay,
      like_count: item.snippet.topLevelComment.snippet.likeCount,
      published_at: item.snippet.topLevelComment.snippet.publishedAt,
      // commentThreads.list embeds up to ~5 replies for free (no extra
      // quota) — good enough as a preview; totalReplyCount tells the client
      // whether there are more to fetch via expandCommentReplies.
      reply_count: item.snippet.totalReplyCount || 0,
      replies: (item.replies?.comments || []).map(mapReply),
      replies_expanded: false,
    }));

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.query(
      `INSERT INTO cached_comments (video_id, comments_json, cached_at, expires_at)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (video_id) DO UPDATE SET comments_json = EXCLUDED.comments_json, cached_at = NOW(), expires_at = EXCLUDED.expires_at`,
      [videoId, JSON.stringify(comments), expiresAt]
    );
    return comments;
  } catch (err) {
    if (err.response?.data?.error?.errors?.[0]?.reason === 'commentsDisabled') {
      return { disabled: true };
    }
    throw err;
  }
}

module.exports = {
  getVideosForChannels, fetchSubscriptions, fetchVideoDetails, fetchComments, expandCommentReplies, formatViewCount,
  getSyncProgress, clearSyncProgress,
};
