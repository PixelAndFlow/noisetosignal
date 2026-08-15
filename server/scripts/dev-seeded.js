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

// index.js only auto-listens when it's the directly-executed entry point
// (require.main === module) — that's false here since this script requires
// it as a dependency, so we have to start listening ourselves.
const app = require('../index');
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Seeded dev server (fake test data, no real OAuth) running on port ${PORT}`);
});
