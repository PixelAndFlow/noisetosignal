const db = require('../../lib/db');
const { encrypt } = require('../../lib/crypto');

async function resetDb() {
  await db.query(`
    TRUNCATE TABLE
      error_log, sync_log, events, watched_videos, cached_comments,
      cached_videos, creator_selections, subscriptions, oauth_tokens,
      user_settings, users
    RESTART IDENTITY CASCADE
  `);
}

let counter = 0;
function unique(prefix) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

async function seedUser(overrides = {}) {
  const email = overrides.email || `${unique('user')}@example.com`;
  const googleId = overrides.googleId || unique('google');
  const result = await db.query(
    `INSERT INTO users (google_id, email, display_name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *`,
    [googleId, email, overrides.displayName || 'Test User', overrides.avatarUrl || null]
  );
  const user = result.rows[0];
  await db.query(
    `INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES
     ($1, 'default_viewing_mode', 'signal'),
     ($1, 'data_source_indicator', 'on'),
     ($1, 'default_recency_window', 'last_3_days'),
     ($1, 'subscription_sync_frequency', 'every_login'),
     ($1, 'dark_mode', 'system'),
     ($1, 'confirm_bulk_actions', 'on')`,
    [user.id]
  );
  return user;
}

async function seedOAuthToken(userId, overrides = {}) {
  await db.query(
    `INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expires_at, scope)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at,
       scope = EXCLUDED.scope`,
    [
      userId,
      encrypt(overrides.accessToken || 'fake-access-token'),
      encrypt(overrides.refreshToken || 'fake-refresh-token'),
      overrides.expiresAt || new Date(Date.now() + 3600 * 1000),
      'youtube.readonly',
    ]
  );
}

async function seedSubscriptions(userId, channels) {
  for (const c of channels) {
    await db.query(
      `INSERT INTO subscriptions (user_id, channel_id, channel_name, channel_avatar_url, last_synced_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, channel_id) DO NOTHING`,
      [userId, c.channelId, c.channelName || c.channelId, c.avatarUrl || null]
    );
  }
}

async function seedSelections(userId, channelIds) {
  for (const channelId of channelIds) {
    await db.query(
      `INSERT INTO creator_selections (user_id, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, channelId]
    );
  }
}

async function seedCachedVideo(video) {
  await db.query(
    `INSERT INTO cached_videos (channel_id, video_id, title, thumbnail_url, published_at, duration, view_count, data_source, cached_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
     ON CONFLICT (video_id) DO UPDATE SET
       title = EXCLUDED.title, published_at = EXCLUDED.published_at, expires_at = EXCLUDED.expires_at`,
    [
      video.channelId,
      video.videoId,
      video.title || video.videoId,
      video.thumbnailUrl || null,
      video.publishedAt,
      video.duration || null,
      video.viewCount || null,
      video.dataSource || 'rss',
      video.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
    ]
  );
}

module.exports = {
  resetDb,
  seedUser,
  seedOAuthToken,
  seedSubscriptions,
  seedSelections,
  seedCachedVideo,
};
