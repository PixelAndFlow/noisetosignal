# NoiseToSignal

A YouTube subscription filter app. Two modes: **Signal** (your subscriptions,
filtered by creator + timeframe, no algorithm) and **YouTube** (the normal
YouTube homepage in an iframe, side by side for comparison). Built on a
from-scratch ViewTube-style replica — React frontend, Node/Express backend,
PostgreSQL (Neon) for persistence, deployed to Render.

Team: Marc Delsoin (owner) and Mofazzal Hossain (collaborator).

## Docs repo

Full project docs — decisions, PRDs, testing plans, security, compliance,
context files — live in a **separate sibling repo**:
`../noisetosignal-docs/`. That repo is private and is the source of truth for
"why" a decision was made. This repo (`noisetosignal`) is code only.

Start here in the docs repo when picking work back up:
- `context-files/2026-07-29-full-build-audit.md` — latest full status audit
- `decisions/README.md` — the 45-decision unified log (architecture rationale)
- `testing/known-issues-log.md` — what's actually still broken
- `decisions/20260620-03-open-items-tracker.md` — the working checklist

## Evidence standard (read before claiming anything is fixed)

This project has a hard rule, stated repeatedly across the docs repo: **a fix
is not "done" until you can point to actual evidence** — a real log line, a
query result, a specific before/after list — not "it looks right" or a
description of expected output. Three bugs were reported fixed and were not,
on this exact codebase. Treat every "looks fixed" claim, including your own,
as unproven until it's been run and the output captured. See
`testing/definition-of-done.md` and `testing/testing-plan-manual.md` in the
docs repo for the full standard.

## Architecture quick reference

- `server/lib/youtube.js` — RSS-first video fetching (`fetchRSSVideos`,
  0 quota) with YouTube Data API v3 fallback (`fetchAPIVideos`). Subscription
  sync paginates `subscriptions.list` with `order: 'alphabetical'`.
- `server/routes/videos.js` — feed assembly; filters by `creator_selections`
  and timeframe. Has a `[FEED FILTER]` guard line that logs any video dropped
  for belonging to a non-selected channel.
- `server/middleware/auth.js` — JWT (15min access / 30d refresh), OAuth
  token refresh.
- `server/lib/crypto.js` — AES-256-GCM encryption for stored OAuth tokens.
- `client/src/context/` — Auth, Theme, Mode contexts.
- `client/src/components/CreatorPanel.jsx` — creator search/select, bulk
  actions, uses `createPortal` for confirmation modals (fixes iframe
  stacking-context issue).

`server/tests/` has an automated Vitest + supertest + nock suite (30 tests,
all passing as of 2026-08-02) covering DB connectivity, login (JWT-mint
bypass, not real OAuth), all 8 timeframe filters, creator-filter
cross-contamination, subscription sync/pagination (incl. a 2,100-sub
mocked simulation), and a regression test for the RSS-depth bug below. Run
with `npm test` from `server/` — see `server/tests/README.md` for setup
and what's intentionally still manual (real OAuth login, real-account
subscription counts, the client/frontend has no automated tests yet).
Still no CI — this suite isn't wired into any pipeline yet, and Render
auto-deploys on push to `main` with no gate.

## Known open bug (confirmed root cause, not yet fixed)

**Videos older than ~1 week can be missing from the feed.** Timeframe
filters beyond "last week" (last month / 3 months / 6 months) are unreliable.

Root cause, traced 2026-07-29: `getVideosForChannels` in
`server/lib/youtube.js` always calls `fetchRSSVideos` on a cache miss, and
YouTube's RSS feed only returns each channel's **15 most recent videos**.
There is no fallback to the YouTube Data API for deeper history when the
requested timeframe needs more than RSS provides. Any channel that uploads
more than ~15 times within the user's selected window will be missing older
videos from that window. This is `testing/known-issues-log.md` Issue 002 in
the docs repo — still open as of this writing.

## Deployment status (checked live, 2026-08-02)

**Live at https://noisetosignal.onrender.com/** — confirmed via `curl`
returning HTTP 200 with `<title>NoiseToSignal</title>`, matching this
repo's `client/index.html` on `main`. This is a new/different Render
service from the previously-documented `viewtube-63vi.onrender.com`
(that one was serving the stale pre-rebuild ViewTube app and is no
longer the canonical URL — don't use it in new docs or links). OAuth
and all required env vars (`DATABASE_URL`, `GOOGLE_CLIENT_ID/SECRET`,
`YOUTUBE_API_KEY`, `ENCRYPTION_KEY`, `JWT_SECRET`, `CLIENT_URL`) are
confirmed working against this URL. See `testing/known-issues-log.md`
Issue 003 (resolved) and Decision 043 in the docs repo.

Since Google OAuth app verification hasn't been submitted yet (deferred
until ~50 active users per Decision 018), every real login currently
shows Google's "unverified app" warning screen. Sign-in still completes
past it — this is cosmetic friction, not a bug. Low priority, tracked as
`testing/known-issues-log.md` Issue 004 / Tier 5 in
`decisions/20260620-03-open-items-tracker.md`.

## Known platform limitation (not fixable, needs UI language decision)

Subscription sync caps at ~987 channels for accounts with more subscriptions
than that (confirmed via raw per-page API logs: `nextPageToken` is genuinely
absent from YouTube's response at page 20, independent of the `order`
parameter — tested and gated behind `DEBUG_SUBSCRIPTIONS=true`). This is a
YouTube Data API ceiling, not a NoiseToSignal bug. The creator panel already
shows a live count derived from the actual synced list rather than a
hardcoded number, so the UI doesn't currently overclaim — worth a final check
against `decisions/20260620-03-open-items-tracker.md` Tier 2 before
considering it closed.
