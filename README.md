# noisetosignal

**Cycle 1: NoiseToSignal**
Team Members: Marc Delsoin and Mofazzal Hossain

(THIS README IS A WORK IN PROCESS)

NoiseToSignal wasn't built as a YouTube tool for its own sake — it was built to understand what it takes to ship something real, from a blank repository to a live, working product that solves an actual problem: YouTube's algorithmic feed optimizes for platform engagement, not the viewer's.

The foundation is a YouTube replica built from scratch: homepage feed, video search, player, navigation, a bookmark system. Not a tutorial clone — a deliberate re-engineering of a familiar product to understand how it actually works under the hood. React on the frontend, Node.js and Express on the backend, PostgreSQL for persistence, deployed to Render with a CI/CD pipeline tied to GitHub.

On top of that replica sits the feature YouTube itself won't build: a creator and timeframe filter. NoiseToSignal flips the algorithmic model — you choose exactly which creators appear in your feed, and exactly how recent the content needs to be. No recommendations, no trending, no noise. Pure signal.

The build required integrating Google OAuth, the YouTube Data API v3, and a zero-quota RSS-first fetching strategy so the app could stay responsive without burning through API rate limits. Every video that surfaces in a user's feed is sourced from RSS when possible — the API only steps in when RSS isn't sufficient, which keeps the daily quota well within the 10,000-unit free tier even at scale.

The most technically demanding part of this build had nothing to do with features — it came from testing against real data. Against an account with a very large subscription count, the app capped out at 987 channels synced and refused to go further. Three separate fix attempts, each based on assumptions about where the ceiling was, all failed.

The investigation that actually worked was methodical: per-iteration logging directly inside the API pagination loop, capturing every single page request in sequence, reading the raw output line by line. The evidence was unambiguous — the YouTube API itself was stopping at page 20 and not returning a continuation token, regardless of what the code did. The 987 ceiling wasn't a bug. It was YouTube's API silently capping how many subscriptions a single access token can paginate through, and no amount of code change on the application side could fix what the platform isn't providing.

That finding — and the discipline of not accepting "it looks fixed" as evidence — shaped this project's approach to debugging, testing, and the gap between what an external API promises and what it actually delivers in production.

NoiseToSignal is live. It imports real YouTube subscriptions, lets you filter by creator and timeframe, surfaces videos via RSS, and plays them through YouTube's IFrame Player API with full keyboard shortcut support. The architecture was designed from the start to scale: a shared video cache keyed by channel rather than by user, a PostgreSQL analytics event log, tiered subscription sync that respects rate limits, and a settings system that persists across every device you sign in from.

This cycle wasn't just about shipping a feature — it was a disciplined approach to the entire software development lifecycle: requirements, architecture decisions, deployment, real-world data testing, and honest documentation of what worked and what didn't.

## Installation

### Prerequisites

- Node.js and npm
- A PostgreSQL database — either a free [Neon](https://neon.tech) instance
  (for real use, Option A below) or a local Postgres install (for the
  seeded demo mode, Option B below)

### Clone and install dependencies

```
git clone https://github.com/PixelAndFlow/noisetosignal.git
cd noisetosignal
cd server && npm install
cd ../client && npm install
```

### Option A — Real mode (your own YouTube account)

Requires a Neon PostgreSQL connection string, a Google OAuth client
ID/secret with the YouTube Data API v3 enabled, and a YouTube Data API key.

1. Copy `server/.env.example` to `server/.env` and fill in:
   - `DATABASE_URL` — your Neon connection string
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from Google Cloud
     Console
   - `YOUTUBE_API_KEY` — from Google Cloud Console
   - `ENCRYPTION_KEY` — generate with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `JWT_SECRET` — generate with
     `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
2. Load the schema into your database:
   ```
   psql <your DATABASE_URL> -f server/db/schema.sql
   ```
3. Start the backend (from `server/`): `npm run dev` — binds
   `localhost:3001`
4. Start the frontend (from `client/`): `npm run dev` — binds
   `localhost:5173`
5. Open `http://localhost:5173` and sign in with Google.

### Option B — Seeded demo mode (no Google account needed)

Runs the app against fake local data instead of a real YouTube account —
useful for browsing the UI without setting up OAuth credentials.

1. Install PostgreSQL locally, e.g.:
   ```
   brew install postgresql@18
   brew services start postgresql@18
   ```
2. Create the test database and load the schema:
   ```
   psql -d postgres -c "CREATE DATABASE noisetosignal_test;"
   psql -d noisetosignal_test -f server/db/schema.sql
   ```
   `server/.env.test` is already checked in with fake/dummy config — no
   setup needed there.
3. In three separate terminals:
   ```
   # Terminal 1 (from server/): reset the test DB and seed fake data
   npm run seed:dev

   # Terminal 2 (from server/): run the backend against the seeded test DB
   npm run dev:seeded

   # Terminal 3 (from client/): run the frontend
   npm run dev
   ```
4. Open `http://localhost:5173`, open the browser devtools console, and
   paste the `document.cookie = "nts_session=...; path=/"; location.reload();`
   line that `npm run seed:dev` printed — that logs you in as a fake dev
   user.

### Note

Both run modes bind the backend to port 3001, and the client's dev proxy
is hardcoded to `localhost:3001` — only one backend can run at a time.
Starting the second while the first is still up fails with `EADDRINUSE`.

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for what's shipped, in progress, and planned.
