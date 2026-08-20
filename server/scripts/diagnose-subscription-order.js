// One-off, read-only diagnostic: does varying the `order` parameter on
// subscriptions.list return different ~987-subscription windows that
// could be unioned to recover more of a large account's true subscription
// count via the API alone (no Google Takeout import needed)? See
// noisetosignal-docs/decisions/20260620-03-open-items-tracker.md Tier 2.
//
// The earlier "order doesn't matter" conclusion only ever compared the
// first/last 5 channel names per order value — it never checked whether
// the three order values return the SAME ~987 channels each time, or
// three DIFFERENT ~987-channel windows. This script checks the real
// answer: it fetches the full list for each order value and computes
// the union.
//
// Runs against your REAL .env (real Neon DB, real Google credentials) —
// NOT .env.test. Requires you to already be logged into the real app at
// least once, so a real oauth_tokens row exists for your account. Makes
// only GET requests (no writes to your subscriptions) — costs a small
// amount of real API quota (roughly 60 units total for a ~2,000-sub
// account across all 3 passes, out of a 10,000/day default quota).
//
// Usage (from server/): node scripts/diagnose-subscription-order.js you@example.com
const axios = require('axios');
const db = require('../lib/db');
const { getAccessToken } = require('../middleware/auth');

const YT_API = 'https://www.googleapis.com/youtube/v3';
const ORDERS = ['alphabetical', 'relevance', 'unspecified'];
const PAGE_LIMIT = 100;

async function fetchAllForOrder(accessToken, order) {
  const subs = [];
  let pageToken = null;
  let pageCount = 0;

  do {
    const params = { part: 'snippet', mine: true, maxResults: 50, order };
    if (pageToken) params.pageToken = pageToken;

    const res = await axios.get(`${YT_API}/subscriptions`, {
      params,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    for (const item of res.data.items || []) {
      subs.push({
        channel_id: item.snippet.resourceId.channelId,
        channel_name: item.snippet.title,
      });
    }

    pageToken = res.data.nextPageToken || null;
    pageCount++;
    if (pageCount % 5 === 0) console.log(`    ...page ${pageCount}, ${subs.length} so far`);
    if (pageCount >= PAGE_LIMIT) {
      console.log(`    hit ${PAGE_LIMIT}-page safety limit`);
      break;
    }
  } while (pageToken);

  return subs;
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/diagnose-subscription-order.js you@example.com');
    process.exit(1);
  }

  const userRes = await db.query('SELECT id, email FROM users WHERE email = $1', [email]);
  if (!userRes.rows[0]) {
    console.error(`No user found with email ${email} in this database.`);
    process.exit(1);
  }
  const userId = userRes.rows[0].id;
  console.log(`Found user id=${userId} (${email}). Getting a valid access token...`);
  const accessToken = await getAccessToken(userId);

  const resultsByOrder = {};
  for (const order of ORDERS) {
    console.log(`\nFetching with order=${order}...`);
    const subs = await fetchAllForOrder(accessToken, order);
    resultsByOrder[order] = subs;
    console.log(`  order=${order}: ${subs.length} subscriptions fetched`);
  }

  console.log('\n--- Summary ---');
  for (const order of ORDERS) {
    console.log(`order=${order}: ${resultsByOrder[order].length} subscriptions`);
  }

  const seen = new Set();
  for (const order of ORDERS) {
    const newOnes = resultsByOrder[order].filter(s => !seen.has(s.channel_id));
    console.log(`New distinct channels added by order=${order} (given orders processed before it): ${newOnes.length}`);
    resultsByOrder[order].forEach(s => seen.add(s.channel_id));
  }
  console.log(`\nUnion across all 3 orders: ${seen.size} distinct subscriptions`);
  console.log(`(For reference, compare this against your real Takeout-confirmed total.)`);

  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Diagnostic failed:', err.response?.data || err.message);
  await db.pool.end();
  process.exit(1);
});
