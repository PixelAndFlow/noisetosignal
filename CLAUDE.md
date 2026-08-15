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
- `decisions/README.md` — the 52-decision unified log (architecture rationale)
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
  sync paginates `subscriptions.list` with `order: 'alphabetical'`. Tracks
  live per-user sync progress in an in-memory `Map` (`getSyncProgress`/
  `clearSyncProgress`) updated after each page — powers the live "Syncing…
  N found" counter (`GET /api/subscriptions/sync/progress`, polled by the
  client every 400ms while a sync is in flight). Single-process assumption;
  would need a shared store if ever run across multiple server instances.
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

`server/tests/` has an automated Vitest + supertest + nock suite (48 tests,
all passing as of 2026-08-03) covering DB connectivity, login (JWT-mint
bypass, not real OAuth), all 8 timeframe filters, creator-filter
cross-contamination, subscription sync/pagination (incl. a 2,100-sub
mocked simulation), the live sync progress counter (monotonic increase +
clear-on-completion, including on failure), settings persistence
(table-driven round-trip for every setting key), OAuth scope config,
sanitized error logging (no token leakage on sync failure), and a
regression test for the RSS-depth bug below. Run with `npm test` from
`server/`.

`client/tests/` has a separate Vitest + React Testing Library suite
(23 tests, all passing as of 2026-08-02) covering `TimeframeFilter`,
`CreatorPanel` (including a direct regression test for the historical
hardcoded-999 bug), and a real `vite build` sanity check confirming the
frontend actually builds. Run with `npm test` from `client/`. Most page
components (`HomePage`, `WatchPage`, `SettingsPage`) and other components
(`VideoCard`, `NavBar`, `Sidebar`) are not covered yet.

See `server/tests/README.md` and `client/tests/README.md` for what's
intentionally still manual (real OAuth login, real-account subscription
counts, real-browser behavior like the YouTube iframe). Still no CI —
neither suite is wired into any pipeline yet, and Render auto-deploys on
push to `main` with no gate.

There are two ways to run the server locally — `npm run dev` (real
`.env`, real Neon DB, real Google login) and `npm run dev:seeded` (real
`.env` swapped for `.env.test`, local test DB, fake seeded data, no
OAuth — see `server/tests/README.md` "Browsing the app with fake seeded
data"). **Both bind port 3001 and only one can run at a time** — the
client's dev proxy is hardcoded to `localhost:3001`, so whichever
backend you want has to be the one occupying that port; starting the
second while the first is up fails with `EADDRINUSE`. The client itself
is always `localhost:5173` regardless of which backend it's talking to.

## Recently added (2026-08-03)

**Live sync progress counter.** "Syncing..." previously just showed a
spinner with no indication of progress. `subscriptions.list` sync is one
long server-side request (unlike bulk creator select/deselect, which is
client-driven batching), so there was no existing channel to report
incremental progress — added a lightweight in-memory per-user tracker
(`server/lib/youtube.js`'s `getSyncProgress`/`clearSyncProgress`, updated
after each page in `fetchSubscriptions`) plus a polling endpoint
(`GET /api/subscriptions/sync/progress`) that `HomePage.jsx` and
`SettingsPage.jsx` poll every 400ms while a sync is in flight. UI now
shows "Syncing… N found" instead of just a spinner. Verified with a real
curl-driven sync against the seeded dev-preview environment (progress
went 50 → 150 → 250 → cleared to null on completion) and a dedicated
automated test (`server/tests/sync-progress.test.js`) using realistic
per-page delays to assert monotonic increase and correct clearing on
both success and failure paths.

## Recently fixed (2026-08-02)

**YouTube mode showed a broken iframe instead of the "Open YouTube"
fallback.** Root cause: `HomePage.jsx` relied on the iframe's `onError`
event to detect an X-Frame-Options block, but Chrome never fires
`onError` for that case — it fires `onLoad` instead, almost instantly
(~150ms measured), which the old code didn't handle at all. Fixed by
treating a suspiciously-fast `onLoad` (<1200ms, via
`MIN_REAL_IFRAME_LOAD_MS`) as a block signal, with a 3s timeout as a
backstop for the case where neither event fires. Verified live in a
real browser against the real youtube.com block, not mocked — see
`testing/known-issues-log.md` Issue 005 and Decision 046 in the docs
repo.

**"Confirm bulk actions" setting didn't survive a page reload.** Root
cause: `server/routes/settings.js`'s `ALLOWED_KEYS` allowlist was
missing `confirm_bulk_actions`, so every save attempt got a silent
`400 Unknown setting` — `SettingsPage.jsx`'s `saveSetting()` doesn't
check `res.ok`, so the checkbox's local state flipped instantly while
the actual DB write silently never happened. Fixed by adding the key to
the allowlist. Verified with before/after API output, a new 10-test
suite (`server/tests/settings.test.js`), and a live full-page-reload
test in a real browser. See `testing/known-issues-log.md` Issue 007 and
Decision 048.

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

**2026-08-02: escalated to scheduled-to-fix**, not just a passive product
decision — Marc wants an actual workaround, not only UI-language
mitigation. Research (Decision 045) recommends a **Google Takeout CSV
import** as a manual supplemental path (Takeout uses a different,
non-paginated export mechanism than `subscriptions.list`, so it isn't
known to hit the same ceiling).

**2026-08-02, same day: confirmed empirically (Decision 050).** Marc ran
a real Google Takeout export against his actual account and counted the
`subscriptions.csv` rows directly — **2,144 subscriptions**, no
truncation, well above the API's ~987 ceiling. The workaround is
validated with real evidence, not just theory. Marc wants to keep
looking for a credential-based (non-file-upload) alternative before
committing to that build, so it's parked as the confirmed-viable
**backup plan** rather than started.

Two credential-based alternatives were investigated 2026-08-02 and
Decision 051 covers both: (1) unioning `subscriptions.list` results
across different `order` values — a diagnostic script exists
(`server/scripts/diagnose-subscription-order.js`, not yet run) but this
was downgraded to "cheap to test, not trusted as a solution," since
there's no way to prove a union result is complete without an
independent ground truth to check against; (2) Google's Data
Portability API, which does cover YouTube subscriptions and would
inherit Takeout's completeness guarantee, but requires an annual
third-party security assessment (restricted OAuth scope) on top of the
standard verification already deferred to ~50 users — correctly
shelved as disproportionate for now, not rejected outright.
