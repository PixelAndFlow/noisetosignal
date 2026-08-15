const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test'), override: true });

const nock = require('nock');
const db = require('../lib/db');
// afterEach/afterAll come from vitest's injected globals (test.globals: true
// in vitest.config.mjs) — requiring 'vitest' itself from CJS is not supported.

// Safety net: block any request that isn't explicitly mocked so a forgotten
// nock setup fails loudly instead of silently hitting the real YouTube API
// and burning quota. Local supertest traffic still needs to get through.
nock.disableNetConnect();
nock.enableNetConnect(/^(127\.0\.0\.1|localhost|\[::1\])/);

afterEach(() => {
  nock.cleanAll();
});

afterAll(async () => {
  await db.pool.end();
});
