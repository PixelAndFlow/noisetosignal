# Automated test suite

Runs against a real local Postgres database with the real schema, and mocks
all outbound YouTube/Google network calls (via `nock`) so tests are
deterministic and never spend real API quota. Real Google OAuth login is
NOT exercised here — see "What this doesn't cover" below.

## One-time setup

1. Install Postgres locally (already done on Marc's machine via
   `brew install postgresql@18`; start it with `brew services start postgresql@18`).
2. Create the test database and load the schema:
   ```
   psql -d postgres -c "CREATE DATABASE noisetosignal_test;"
   psql -d noisetosignal_test -f db/schema.sql
   ```
3. `server/.env.test` is already checked in — it contains only fake/dummy
   values (test DB URL, dummy encryption key, dummy JWT secret), never real
   secrets, so no setup needed there.

## Running

```
npm test         # run once
npm run test:watch   # re-run on file changes
```

## How it works

- `vitest.config.mjs` loads `tests/setup.js` before every test file, which
  points `DATABASE_URL`/`JWT_SECRET`/`ENCRYPTION_KEY` at the test values in
  `.env.test` and blocks all outbound network calls except to the local test
  server (`nock.disableNetConnect()`), so a forgotten mock fails loudly
  instead of silently hitting the real YouTube API.
- `tests/helpers/db.js` — seed/reset helpers for the test database
  (`resetDb`, `seedUser`, `seedSubscriptions`, `seedCachedVideo`, etc).
- `tests/helpers/auth.js` — mints a valid session JWT for a seeded user so
  tests can hit authenticated endpoints without a real Google OAuth login.
- `tests/helpers/youtubeMocks.js` — `nock` fixtures for the RSS feed,
  `subscriptions.list` pagination, and the `playlistItems`/`channels` API
  fallback.
- Each test file gets `require('../index')` (the Express app, exported
  without binding a real port — see `index.js`) and drives it with
  `supertest`.

## What's covered

| File | Covers |
|---|---|
| `infra.test.js` | DB connects, schema tables exist, protected routes reject unauthenticated requests |
| `auth.test.js` | Session-cookie auth accepts a valid seeded user, rejects missing/invalid/stale tokens |
| `timeframe.test.js` | All 8 timeframe options (`last_hour` through `last_6_months`) return exactly the expected video set |
| `creator-filter.test.js` | Cross-contamination: single/multiple creators, select-all-then-narrow, rapid-toggle race condition, cross-user isolation |
| `subscription-sync.test.js` | `subscriptions.list` pagination (incl. a 2,100-subscription simulation and the real ~987/1000 ceiling), the 100-page safety cap, sync add/remove reconciliation, and a 2,500-row DB-scale listing check |
| `rss-depth-regression.test.js` | Reproduces Issue 002 (RSS's 15-video cap silently drops older videos from "last month"+ windows because the API fallback never triggers when RSS succeeds) |

## What this doesn't cover (stays manual)

- **Real Google OAuth login** — automated tests bypass this with a minted
  JWT. Real sign-in (including the "unverified app" warning) is still
  Section 1 of `testing-plan-manual.md` in the docs repo.
- **Real subscription counts from a real YouTube account** — the 2,100/2,500
  scale tests here use fake mocked/seeded data to prove the *code* handles
  scale correctly. Confirming what a *real* account with 2,000+
  subscriptions actually syncs to is a manual, on-demand check against the
  live app, not part of this automated suite (see
  `testing/known-issues-log.md` Issue 001 in the docs repo).
- **Frontend component/behavior tests** — those live in `client/tests/`
  (separate Vitest + Testing Library setup, added 2026-08-02), not here.
  Real-browser checks (actual YouTube iframe embedding, real OAuth
  redirect, keyboard shortcuts) still stay in `testing-plan-manual.md`.
- **CI** — this suite is not yet wired into a GitHub Actions workflow; it
  currently only runs when someone runs `npm test` by hand. See
  `testing/ci-strategy.md` in the docs repo.

## Browsing the app with fake seeded data (no real login)

The automated suites above never render anything in a real browser —
`supertest` calls the Express app in-process, and `client/tests/` runs in
`jsdom`, not an actual browser. To actually *see* the interface, with fake
data instead of your real YouTube account:

```
# Terminal 1 (from server/): reset the test DB and seed fake data
npm run seed:dev

# Terminal 2 (from server/): run the real server against the test DB
npm run dev:seeded

# Terminal 3 (from client/): run the normal client dev server
npm run dev
```

Then open `http://localhost:5173`, open the browser devtools console, and
paste the `document.cookie = "nts_session=...; path=/"; location.reload();`
line that `npm run seed:dev` prints. That logs you in as a fake "Dev
Preview" user — no Google OAuth needed — with 40 fake subscriptions (20
selected) and videos spread across every timeframe bucket, so switching
filters actually changes what's shown.

Re-run `npm run seed:dev` any time to reset and reseed (it truncates and
rebuilds the whole test DB, and prints a fresh cookie each time since the
token has a 24h expiry for convenience).

- `scripts/seed-dev-data.js` — reuses the exact same helpers
  `server/tests/` uses (`tests/helpers/db.js`, `tests/helpers/auth.js`),
  so the data shape is identical to what the automated tests exercise.
- `scripts/dev-seeded.js` — a thin wrapper that loads `.env.test` (so it
  points at the local test DB, not your real Neon DB) but forces
  `PORT=3001` since `client/vite.config.js`'s dev proxy is hardcoded to
  that port.
- This is completely separate from your normal `npm run dev` (real
  `.env`, real Neon DB, real Google login) — the two are never running
  against the same database, so there's no risk of this touching real
  user data.

## Adding a new test

Follow the existing pattern: `resetDb()` in `beforeEach`, seed only what
that test needs via the helpers, mock any YouTube network calls with
`youtubeMocks.js` (add a new helper there if the fixture shape doesn't
exist yet), then assert on the actual HTTP response and/or a direct DB
query — never on "should have worked."
