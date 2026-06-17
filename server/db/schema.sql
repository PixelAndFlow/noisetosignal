-- NoiseToSignal database schema
-- Run against your Neon PostgreSQL database

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, setting_key)
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  channel_avatar_url TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS creator_selections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  selected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS cached_videos (
  id SERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  video_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,
  duration TEXT,
  view_count BIGINT,
  data_source TEXT CHECK (data_source IN ('rss', 'api')),
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cached_videos_channel ON cached_videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_cached_videos_published ON cached_videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_cached_videos_expires ON cached_videos(expires_at);

CREATE TABLE IF NOT EXISTS cached_comments (
  id SERIAL PRIMARY KEY,
  video_id TEXT UNIQUE NOT NULL,
  comments_json JSONB NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS watched_videos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  watched_at TIMESTAMPTZ DEFAULT NOW(),
  progress_seconds INTEGER DEFAULT 0,
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_watched_videos_user ON watched_videos(user_id, watched_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  properties JSONB
);

CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_occurred ON events(occurred_at DESC);

CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  outcome TEXT CHECK (outcome IN ('success', 'failure', 'no_changes')),
  channels_added INTEGER DEFAULT 0,
  channels_removed INTEGER DEFAULT 0,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS error_log (
  id SERIAL PRIMARY KEY,
  error_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  http_status INTEGER,
  endpoint TEXT,
  resolution_action TEXT
);
