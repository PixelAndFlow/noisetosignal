# Architecture

How NoiseToSignal works under the hood: system layout, the two viewing
modes, data flow, database schema, and the key technical decisions
behind them.

## System overview

```
User browser
    |
    ├── Signal mode
    |       |
    |   React frontend (static files served by Express)
    |       | API calls to /api/*
    |   Node.js / Express backend (Render)
    |       |                    |
    |   Neon PostgreSQL    YouTube Data API v3
    |                      + YouTube RSS feeds
    |
    └── YouTube mode
            |
        iframe → youtube.com
        (no API calls, no quota, user's Google session)
```

Render serves both the React static build and the Express API from a
single service — no separate frontend hosting needed. Neon PostgreSQL
is serverless with a 1-2 second cold-start wake time, which is
acceptable at this project's current scale.

## Two viewing modes

**Signal mode** — all data flows through the NoiseToSignal backend.
React calls the Express API, which queries Postgres and fetches from
YouTube (RSS or the Data API) as needed. Feed results are filtered
server-side by the user's selected creators and chosen timeframe.

**YouTube mode** — zero backend involvement for content. The frontend
renders an iframe pointing at youtube.com; the user's existing Google
session (from OAuth login) authenticates them there automatically. No
API calls, no quota consumed. YouTube blocks third-party iframe
embedding of its own site via `X-Frame-Options`, so this mode detects
that block (a suspiciously-fast `onLoad` event, since Chrome doesn't
fire `onError` for this case) and falls back to an "Open YouTube"
button that opens the real site in a new tab.

The two modes exist side by side deliberately — Signal mode's
no-recommendations, creator-and-timeframe-only feed is the product;
YouTube mode is there so the difference is visible directly, not just
described.

## Video fetching: RSS-first, API as fallback

Every video that surfaces in a feed is sourced from YouTube's RSS feed
when possible — zero API quota cost. YouTube's RSS feed always caps at
each channel's 15 most recent uploads, though, so a request for a
longer timeframe (e.g. "last month") from a channel that uploads more
than 15 times in that window needs deeper history than RSS alone can
provide. In that case, the fetch falls back to the YouTube Data API,
paging through the channel's uploads playlist until it reaches the
requested cutoff. Channels whose RSS/cached history already covers the
request never touch the API at all, keeping quota usage low for the
common case.

Fetched videos are cached per-channel (`cached_videos`, keyed by
`channel_id`, shared across every user subscribed to that channel — one
fetch serves everyone, not one per user) with a tiered TTL: 10 minutes
for actively-viewed channels, 60 minutes for inactive ones.

## Subscription sync

`subscriptions.list` is paginated 50-at-a-time. A known YouTube Data
API limitation caps how many subscriptions a single access token can
paginate through — roughly 987, independent of sort order — for
accounts with very large subscription counts; this is a platform
ceiling, not something the pagination logic can work around. Live sync
progress is tracked server-side and exposed via a polling endpoint so
the client can show incremental progress instead of an indefinite
spinner.

## Key architecture decisions

- OAuth tokens are encrypted at rest (AES-256-GCM) and never sent to
  the browser — stored server-side only
- Sessions use a short-lived (15 min) JWT in an HttpOnly cookie, with
  a server-side refresh token in Postgres for full revocability
- Comment cache is shared per video across all users, not per-user —
  one API call serves every viewer of that video, not one per viewer
- `sync_log` and `error_log` are separate tables — successful/no-op
  syncs go to `sync_log`, system errors go to `error_log`
- The YouTube IFrame Player API (`enablejsapi=1`) drives playback so
  keyboard shortcuts and resume-from-last-position can call real
  player methods, rather than guessing at `postMessage` commands
  against a plain embed
- Creator groups (saved, named subsets of a user's creator selection)
  intersect against *current* subscriptions when applied, so a channel
  removed from a group after unsubscribing is silently skipped rather
  than producing a feed row with no channel name
- Multi-step writes that need to be atomic (e.g. redefining a creator
  group's full membership) run inside an explicit transaction, so a
  concurrent read can't land between a delete and its re-insert

## Database schema

12 tables: `users`, `user_settings`, `oauth_tokens`, `subscriptions`,
`creator_selections`, `creator_groups`, `creator_group_members`,
`cached_videos`, `cached_comments`, `watched_videos`, `events`,
`sync_log`, `error_log`. Full definitions in `server/db/schema.sql`.

## API routes

All routes are mounted under `/api/` in `server/index.js`:

| Prefix | Handles |
|---|---|
| `/api/auth` | Google OAuth login, session refresh, logout, account deletion |
| `/api/subscriptions` | Listing, syncing, and per-channel creator selections |
| `/api/creator-groups` | Saved creator groups — create, apply (replace/add), edit membership, delete |
| `/api/videos` | The Signal-mode feed, video detail, watched/progress tracking |
| `/api/comments` | Shared per-video comment cache, on-demand reply thread expansion |
| `/api/settings` | Per-user settings (theme, default timeframe, sync frequency, etc.) |
| `/api/events` | Lightweight first-party analytics event log |
| `/api/account` | Structured data export of everything scoped to the requesting user |

## Frontend structure

React, split into contexts (`AuthContext` for the JWT session,
`ThemeContext` for light/dark/system, `ModeContext` for Signal/YouTube
mode), pages (`HomePage`, `WatchPage`, `SettingsPage`), and components
(`CreatorPanel`, `CreatorGroups`, `VideoCard`, `NavBar`, `Sidebar`,
`TimeframeFilter`, `KeyboardShortcutsOverlay`). Built with Vite,
deployed as a static build served by the Express backend.
