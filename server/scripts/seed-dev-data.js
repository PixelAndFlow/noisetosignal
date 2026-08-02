// One-off dev utility (not part of the automated suite) that fills the
// local noisetosignal_test Postgres DB with fake creators/videos, reusing
// the exact same helpers server/tests/ uses, so you can browse the real
// app UI without a real Google account or real YouTube API calls.
//
// Usage: npm run seed:dev   (from server/)
// Then:  npm run dev:seeded (from server/, in another terminal)
//        npm run dev        (from client/, in another terminal)
// See server/tests/README.md, "Browsing the app with fake seeded data".
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test'), override: true });

const {
  resetDb, seedUser, seedSubscriptions, seedSelections, seedCachedVideo,
} = require('../tests/helpers/db');
const { sessionCookieFor } = require('../tests/helpers/auth');
const db = require('../lib/db');
const jwt = require('jsonwebtoken');

const TOPICS = [
  'Tech', 'Cooking', 'Gaming', 'Travel', 'Fitness', 'Music', 'Science',
  'History', 'Comedy', 'DIY', 'Finance', 'Art', 'Photography', 'Fashion',
  'Sports', 'Movies', 'Books', 'Nature', 'Cars', 'Coding',
];
const SUFFIXES = ['Daily', 'Weekly', 'Corner', 'Hub', 'Lab', 'Studio', 'Report', 'Show', 'Talks', 'Central'];

function channelName(i) {
  const topic = TOPICS[i % TOPICS.length];
  const suffix = SUFFIXES[Math.floor(i / TOPICS.length) % SUFFIXES.length];
  return `${topic} ${suffix}`;
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log('Resetting local test DB...');
  await resetDb();

  console.log('Seeding a fake logged-in user...');
  const user = await seedUser({
    email: 'dev-preview@example.com',
    displayName: 'Dev Preview',
  });

  const TOTAL_CHANNELS = 40;
  const channels = Array.from({ length: TOTAL_CHANNELS }, (_, i) => ({
    channelId: `UC_dev_${i}`,
    channelName: channelName(i),
  }));

  console.log(`Seeding ${TOTAL_CHANNELS} fake subscriptions...`);
  await seedSubscriptions(user.id, channels);

  // Select roughly half so the feed actually has content out of the box.
  const selected = channels.filter((_, i) => i % 2 === 0);
  await seedSelections(user.id, selected.map(c => c.channelId));

  console.log(`Seeding videos for ${selected.length} selected channels across every timeframe bucket...`);
  let videoCount = 0;
  for (const c of selected) {
    // One recent video (shows up in every timeframe) + one older video
    // (only shows up once you widen the timeframe filter) per channel —
    // makes switching TimeframeFilter options visibly change the grid.
    await seedCachedVideo({
      channelId: c.channelId,
      videoId: `${c.channelId}_recent`,
      title: `${c.channelName} — new upload`,
      publishedAt: daysAgo(0.1 + Math.random() * 2), // 2.4h - ~2 days ago
    });
    await seedCachedVideo({
      channelId: c.channelId,
      videoId: `${c.channelId}_older`,
      title: `${c.channelName} — from a few weeks back`,
      publishedAt: daysAgo(10 + Math.random() * 60), // 10-70 days ago
    });
    videoCount += 2;
  }

  // One prolific channel with a full day's worth of uploads, to see what a
  // busy creator's video grid actually looks like.
  const prolific = selected[0];
  for (let i = 0; i < 12; i++) {
    await seedCachedVideo({
      channelId: prolific.channelId,
      videoId: `${prolific.channelId}_prolific_${i}`,
      title: `${prolific.channelName} — Episode ${i + 1}`,
      publishedAt: daysAgo(Math.random() * 3),
    });
    videoCount++;
  }

  console.log(`Seeded ${videoCount} videos total.`);

  // 24h token purely for dev-browsing convenience — real logins mint a
  // 15-minute token; there's no reason to fight token expiry while you're
  // just looking at the UI.
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });

  console.log('\n--- Ready ---');
  console.log(`Fake user: ${user.display_name} (${user.email}), id=${user.id}`);
  console.log(`${TOTAL_CHANNELS} subscriptions seeded, ${selected.length} selected, ${videoCount} videos.`);
  console.log('\n1. In another terminal: npm run dev:seeded   (from server/)');
  console.log('2. In another terminal: npm run dev            (from client/)');
  console.log('3. Open http://localhost:5173 in your browser.');
  console.log('4. Open the browser devtools console on that page and paste:\n');
  console.log(`   document.cookie = "nts_session=${token}; path=/"; location.reload();`);
  console.log('\nThat logs you in as the fake Dev Preview user, no Google OAuth needed.');
  console.log('Re-run this script any time to reset and reseed.\n');

  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await db.pool.end();
  process.exit(1);
});
