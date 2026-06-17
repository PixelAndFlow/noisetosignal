require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const path = require('path');
const { apiLimiter } = require('./middleware/rateLimiter');
const authRouter = require('./routes/auth');
const { router: subscriptionsRouter, syncSubscriptions } = require('./routes/subscriptions');
const videosRouter = require('./routes/videos');
const commentsRouter = require('./routes/comments');
const settingsRouter = require('./routes/settings');
const eventsRouter = require('./routes/events');
const { requireAuth } = require('./middleware/auth');
const db = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: isProd ? false : 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

app.use('/api', apiLimiter);
app.use('/api/auth', authRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/videos', videosRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/events', eventsRouter);

// Quota circuit breaker check
app.use('/api', async (req, res, next) => {
  // Placeholder for quota monitoring — logs accumulated daily units
  next();
});

// Auto-sync on login based on user settings
app.post('/api/auth/sync-check', requireAuth, async (req, res) => {
  const settings = await db.query(
    `SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = 'subscription_sync_frequency'`,
    [req.user.id]
  );
  const freq = settings.rows[0]?.setting_value || 'every_login';

  const lastSync = await db.query(
    `SELECT occurred_at FROM sync_log WHERE user_id = $1 AND outcome != 'failure' ORDER BY occurred_at DESC LIMIT 1`,
    [req.user.id]
  );
  const lastAt = lastSync.rows[0]?.occurred_at;
  const now = new Date();
  const minutesSince = lastAt ? (now - new Date(lastAt)) / 60000 : Infinity;

  let shouldSync = false;
  if (freq === 'every_login') shouldSync = minutesSince > 60;
  else if (freq === 'every_6_hours') shouldSync = minutesSince > 360;
  else if (freq === 'every_24_hours') shouldSync = minutesSince > 1440;

  if (shouldSync || minutesSince === Infinity) {
    try {
      const result = await syncSubscriptions(req.user.id);
      res.json({ synced: true, ...result });
    } catch {
      res.json({ synced: false, error: 'Sync failed silently' });
    }
  } else {
    res.json({ synced: false, minutes_since: minutesSince });
  }
});

if (isProd) {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`NoiseToSignal server running on port ${PORT}${isProd ? ' (production)' : ''}`);
});
