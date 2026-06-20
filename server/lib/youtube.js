const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const db = require('./db');

const YT_API = 'https://www.googleapis.com/youtube/v3';
const RSS_BASE = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const ACTIVE_TTL_MINUTES = 10;
const INACTIVE_TTL_MINUTES = 60;

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

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

async function fetchAPIVideos(channelId, uploadsPlaylistId) {
  const items = [];
  let pageToken = null;
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
  } while (pageToken && items.length < 50);
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

async function getVideosForChannels(channelIds, isActive = false) {
  const ttlMinutes = isActive ? ACTIVE_TTL_MINUTES : INACTIVE_TTL_MINUTES;
  const now = new Date();

  // Single query: top-50 unexpired videos for every channel in one round-trip
  const cachedResult = await db.query(
    `SELECT * FROM (
       SELECT *, row_number() OVER (PARTITION BY channel_id ORDER BY published_at DESC) AS rn
       FROM cached_videos
       WHERE channel_id = ANY($1) AND expires_at > NOW()
     ) ranked WHERE rn <= 50`,
    [channelIds]
  );
  const freshChannelSet = new Set(cachedResult.rows.map(r => r.channel_id));
  const fresh = cachedResult.rows.map(({ rn: _, ...row }) => row);
  const stale = channelIds.filter(id => !freshChannelSet.has(id));

  const CHANNEL_BATCH_SIZE = 20;
  for (let i = 0; i < stale.length; i += CHANNEL_BATCH_SIZE) {
    const batch = stale.slice(i, i + CHANNEL_BATCH_SIZE);
    await Promise.all(batch.map(async (channelId) => {
      let videos = await fetchRSSVideos(channelId);
      let source = 'rss';

      if (!videos) {
        try {
          const playlistId = await getUploadsPlaylistId(channelId);
          if (playlistId) {
            videos = await fetchAPIVideos(channelId, playlistId);
            source = 'api';
          } else {
            videos = [];
          }
        } catch {
          videos = [];
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
          `SELECT * FROM cached_videos WHERE channel_id = $1 AND expires_at > NOW() ORDER BY published_at DESC LIMIT 50`,
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

async function fetchSubscriptions(accessToken) {
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

    console.log(`[subs page ${pageCount}] ${(res.data.items || []).length} items | nextPageToken: ${res.data.nextPageToken || 'NONE'}`);

    if (pageCount >= SUBSCRIPTION_PAGE_LIMIT) {
      console.error(`fetchSubscriptions: hit ${SUBSCRIPTION_PAGE_LIMIT}-page safety limit (${subs.length} subs fetched). There may be more subscriptions the API is not returning.`);
      break;
    }
  } while (pageToken);

  console.log(`fetchSubscriptions: fetched ${subs.length} subscriptions across ${pageCount} page(s)`);
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

async function fetchComments(videoId) {
  const cached = await db.query(
    `SELECT comments_json FROM cached_comments WHERE video_id = $1 AND expires_at > NOW()`,
    [videoId]
  );
  if (cached.rows.length > 0) return cached.rows[0].comments_json;

  try {
    const res = await axios.get(`${YT_API}/commentThreads`, {
      params: { part: 'snippet', videoId, maxResults: 20, order: 'relevance', key: process.env.YOUTUBE_API_KEY },
    });
    const comments = (res.data.items || []).map(item => ({
      id: item.id,
      author: item.snippet.topLevelComment.snippet.authorDisplayName,
      author_avatar: item.snippet.topLevelComment.snippet.authorProfileImageUrl,
      text: item.snippet.topLevelComment.snippet.textDisplay,
      like_count: item.snippet.topLevelComment.snippet.likeCount,
      published_at: item.snippet.topLevelComment.snippet.publishedAt,
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

module.exports = { getVideosForChannels, fetchSubscriptions, fetchVideoDetails, fetchComments, formatViewCount };
