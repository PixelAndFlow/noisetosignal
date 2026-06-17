import { OAuth2Client } from 'google-auth-library';
import pool, { isDevMode } from '../db/index.js';
import { getMockSubscriptions, getMockVideos } from '../dev/mockData.js';

const YOUTUBE_READONLY = 'https://www.googleapis.com/auth/youtube.readonly';
const SCOPES = [
  'openid',
  'email',
  'profile',
  YOUTUBE_READONLY,
];

function getOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function exchangeCode(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  return {
    googleId: payload.sub,
    email: payload.email,
    displayName: payload.name,
    avatarUrl: payload.picture,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

export async function upsertUserAndTokens(profile) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (google_id, email, display_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url
       RETURNING id, google_id, email, display_name, avatar_url`,
      [profile.googleId, profile.email, profile.displayName, profile.avatarUrl]
    );
    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
         expires_at = EXCLUDED.expires_at`,
      [user.id, profile.accessToken, profile.refreshToken, profile.expiresAt]
    );

    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getValidAccessToken(userId) {
  if (isDevMode) return 'mock-access-token';

  const result = await pool.query(
    'SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE user_id = $1',
    [userId]
  );
  const row = result.rows[0];
  if (!row) throw new Error('No OAuth tokens found for user');

  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() < Date.now() + 60_000;

  if (!needsRefresh) return row.access_token;
  if (!row.refresh_token) throw new Error('Access token expired and no refresh token available');

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: row.refresh_token });
  const { credentials } = await client.refreshAccessToken();

  const newExpiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : null;
  await pool.query(
    `UPDATE oauth_tokens SET access_token = $1, expires_at = $2 WHERE user_id = $3`,
    [credentials.access_token, newExpiresAt, userId]
  );

  return credentials.access_token;
}

async function youtubeFetch(path, accessToken, params = {}) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`YouTube API error: ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return res.json();
}

export async function fetchSubscriptions(_accessToken) {
  if (isDevMode) return getMockSubscriptions();

  const subscriptions = [];
  let pageToken;

  do {
    const data = await youtubeFetch('subscriptions', accessToken, {
      part: 'snippet',
      mine: 'true',
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });

    for (const item of data.items || []) {
      subscriptions.push({
        channelId: item.snippet.resourceId.channelId,
        channelName: item.snippet.title,
        channelAvatarUrl: item.snippet.thumbnails?.default?.url || null,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return subscriptions;
}

export async function syncSubscriptionsToDb(userId, subscriptions) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const sub of subscriptions) {
      await client.query(
        `INSERT INTO subscriptions (user_id, channel_id, channel_name, channel_avatar_url, synced_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, channel_id) DO UPDATE SET
           channel_name = EXCLUDED.channel_name,
           channel_avatar_url = EXCLUDED.channel_avatar_url,
           synced_at = NOW()`,
        [userId, sub.channelId, sub.channelName, sub.channelAvatarUrl]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function fetchVideosForChannels(accessToken, channelIds, days) {
  if (isDevMode) return getMockVideos(channelIds, days);

  const publishedAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const allVideos = [];

  const batchSize = 5;
  for (let i = 0; i < channelIds.length; i += batchSize) {
    const batch = channelIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (channelId) => {
        try {
          const data = await youtubeFetch('search', accessToken, {
            part: 'snippet',
            channelId,
            type: 'video',
            order: 'date',
            publishedAfter,
            maxResults: '50',
          });
          return (data.items || []).map((item) => ({
            videoId: item.id.videoId,
            title: item.snippet.title,
            channelId: item.snippet.channelId,
            channelName: item.snippet.channelTitle,
            thumbnailUrl:
              item.snippet.thumbnails?.medium?.url ||
              item.snippet.thumbnails?.default?.url ||
              null,
            publishedAt: item.snippet.publishedAt,
          }));
        } catch {
          return [];
        }
      })
    );
    allVideos.push(...results.flat());
  }

  allVideos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return allVideos.slice(0, 100);
}
