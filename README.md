# NoiseToSignal

Filter your YouTube subscriptions by **creator + recency** — all signal, no algorithmic noise.

## Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database:** Neon PostgreSQL
- **Auth:** Google OAuth 2.0 (YouTube readonly scope)
- **API:** YouTube Data API v3

## Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) PostgreSQL database
- A [Google Cloud](https://console.cloud.google.com) OAuth 2.0 client with YouTube Data API v3 enabled

## Quick start (no accounts needed)

If you don't have Neon or Google OAuth yet, use **demo mode**:

```bash
npm install
npm install --prefix client
npm run setup    # creates .env + local SQLite database
npm run dev
```

Open http://localhost:5173 → click **"Try demo — no Google needed"**.

Demo mode includes 10 sample creators and mock videos so you can test the full UI locally.

---

## Full setup (real YouTube data)


   ```bash
   npm install
   npm install --prefix client
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and fill in values:

   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   |----------|-------------|
   | `DATABASE_URL` | Neon PostgreSQL connection string |
   | `GOOGLE_CLIENT_ID` | OAuth client ID |
   | `GOOGLE_CLIENT_SECRET` | OAuth client secret |
   | `GOOGLE_REDIRECT_URI` | `http://localhost:3001/api/auth/google/callback` (dev) |
   | `SESSION_SECRET` | Random 32+ character string |
   | `CLIENT_URL` | `http://localhost:5173` (dev) |

3. **Google Cloud OAuth setup**

   - Create OAuth 2.0 credentials (Web application)
   - Authorized redirect URI: `http://localhost:3001/api/auth/google/callback`
   - Enable **YouTube Data API v3**
   - Add scope: `https://www.googleapis.com/auth/youtube.readonly`
   - Add your Google account as a test user (while app is unverified)

4. **Run database migration**

   ```bash
   npm run db:migrate
   ```

5. **Start development**

   ```bash
   npm run dev
   ```

   - Frontend: http://localhost:5173
   - API: http://localhost:3001

## Production (Render)

1. Connect repo to Render (or use `render.yaml`)
2. Set environment variables (use production redirect URI: `https://your-app.onrender.com/api/auth/google/callback`)
3. Set `CLIENT_URL` to your Render URL
4. Run migration against Neon before first deploy: `npm run db:migrate`

Build command: `npm install && npm install --prefix client && npm run build`  
Start command: `npm start`

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/auth/google` | Start OAuth |
| GET | `/api/auth/google/callback` | Finish OAuth |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current user |
| GET | `/api/subscriptions` | Subscription list |
| POST | `/api/subscriptions/sync` | Refresh from YouTube |
| GET | `/api/videos?channels=&days=` | Filtered video grid |
| GET | `/api/health` | Health check |

## Core flow

1. Sign in with Google
2. Subscriptions import automatically on first login
3. Select creators (multi-select + search)
4. Choose recency: 24h · 7d · 30d · 90d
5. Click a video → opens on YouTube in a new tab

Results are capped at **100 videos**, sorted newest first.
