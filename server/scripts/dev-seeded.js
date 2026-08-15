// Runs the real Express server against the local noisetosignal_test
// Postgres DB instead of the real Neon DB in server/.env — so you can
// browse the actual app UI against fake seeded data (see seed-dev-data.js)
// without touching your real subscriptions or spending YouTube API quota.
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.test'), override: true });

// .env.test uses PORT=3999 for test isolation, but client/vite.config.js's
// dev proxy is hardcoded to localhost:3001 — force it back so the client
// dev server can actually reach this.
process.env.PORT = '3001';
process.env.NODE_ENV = 'development';

// Mock the real YouTube subscriptions.list call so "Sync now" works end to
// end against the fake dev-preview user (see seed-dev-data.js's
// seedOAuthToken call) without a real Google account or real API quota.
// Paginated with a realistic per-page delay so the live progress counter
// (client/src/components/CreatorPanel.jsx) actually has something to show
// while syncing, instead of resolving instantly. .persist() so repeated
// "Sync now" clicks keep working, not just the first one.
const nock = require('nock');
const LIVE_SYNC_TOTAL = 300;
const LIVE_SYNC_PAGE_SIZE = 50;
const LIVE_SYNC_PAGE_DELAY_MS = 500;

for (let offset = 0; offset < LIVE_SYNC_TOTAL; offset += LIVE_SYNC_PAGE_SIZE) {
  const isLast = offset + LIVE_SYNC_PAGE_SIZE >= LIVE_SYNC_TOTAL;
  const items = Array.from({ length: LIVE_SYNC_PAGE_SIZE }, (_, i) => {
    const n = offset + i;
    return {
      snippet: {
        title: `Live Sync Channel ${n}`,
        resourceId: { channelId: `UC_live_${n}` },
        thumbnails: { default: { url: `https://example.com/UC_live_${n}.jpg` } },
      },
    };
  });
  nock('https://www.googleapis.com')
    .persist()
    .get('/youtube/v3/subscriptions')
    .query(q => q.pageToken === (offset === 0 ? undefined : `page_${offset}`))
    .delay(LIVE_SYNC_PAGE_DELAY_MS)
    .reply(200, { items, nextPageToken: isLast ? undefined : `page_${offset + LIVE_SYNC_PAGE_SIZE}` });
}

// index.js only auto-listens when it's the directly-executed entry point
// (require.main === module) — that's false here since this script requires
// it as a dependency, so we have to start listening ourselves.
const app = require('../index');
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Seeded dev server (fake test data, no real OAuth) running on port ${PORT}`);
});
