const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const db = require('../lib/db');
const { encrypt } = require('../lib/crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const CALLBACK_URL = process.env.NODE_ENV === 'production'
  ? `${process.env.CLIENT_URL}/api/auth/google/callback`
  : 'http://localhost:3001/api/auth/google/callback';

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/youtube.readonly'],
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const avatar = profile.photos?.[0]?.value;

      let result = await db.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
      let user;

      if (result.rows[0]) {
        user = result.rows[0];
        await db.query('UPDATE users SET last_login = NOW(), display_name = $1, avatar_url = $2 WHERE id = $3',
          [profile.displayName, avatar, user.id]);
      } else {
        const ins = await db.query(
          'INSERT INTO users (google_id, email, display_name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *',
          [profile.id, email, profile.displayName, avatar]
        );
        user = ins.rows[0];
        await db.query(
          `INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES
           ($1, 'default_viewing_mode', 'signal'),
           ($1, 'data_source_indicator', 'on'),
           ($1, 'default_recency_window', 'last_3_days'),
           ($1, 'subscription_sync_frequency', 'every_login'),
           ($1, 'dark_mode', 'system'),
           ($1, 'confirm_bulk_actions', 'on')`,
          [user.id]
        );
      }

      const expiresAt = new Date(Date.now() + 3600 * 1000);
      await db.query(
        `INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expires_at, scope)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           access_token = EXCLUDED.access_token,
           refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
           expires_at = EXCLUDED.expires_at,
           scope = EXCLUDED.scope`,
        [user.id, encrypt(accessToken), refreshToken ? encrypt(refreshToken) : null, expiresAt, 'youtube.readonly']
      );

      done(null, user);
    } catch (err) {
      done(err);
    }
  }
));

router.get('/google', passport.authenticate('google', {
  session: false,
  accessType: 'offline',
  prompt: 'consent',
}));

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/?error=auth_failed' }),
  (req, res) => {
    const token = jwt.sign({ userId: req.user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
    res.cookie('nts_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });

    const refreshToken = jwt.sign({ userId: req.user.id, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.cookie('nts_refresh', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const clientBase = process.env.NODE_ENV === 'production' ? '' : process.env.CLIENT_URL;
    res.redirect(`${clientBase}/`);
  }
);

router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.nts_refresh;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid token' });
    const token = jwt.sign({ userId: payload.userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
    res.cookie('nts_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: 'Refresh token expired' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const settings = await db.query('SELECT setting_key, setting_value FROM user_settings WHERE user_id = $1', [req.user.id]);
  const settingsMap = {};
  for (const row of settings.rows) settingsMap[row.setting_key] = row.setting_value;
  res.json({
    id: req.user.id,
    email: req.user.email,
    display_name: req.user.display_name,
    avatar_url: req.user.avatar_url,
    settings: settingsMap,
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie('nts_session');
  res.clearCookie('nts_refresh');
  res.json({ ok: true });
});

router.delete('/account', requireAuth, async (req, res) => {
  await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
  res.clearCookie('nts_session');
  res.clearCookie('nts_refresh');
  res.json({ ok: true });
});

router.post('/revoke', requireAuth, async (req, res) => {
  const axios = require('axios');
  try {
    const { decrypt } = require('../lib/crypto');
    const tokenRow = await db.query('SELECT access_token FROM oauth_tokens WHERE user_id = $1', [req.user.id]);
    if (tokenRow.rows[0]) {
      const token = decrypt(tokenRow.rows[0].access_token);
      await axios.post(`https://oauth2.googleapis.com/revoke?token=${token}`).catch(() => {});
    }
    await db.query('DELETE FROM oauth_tokens WHERE user_id = $1', [req.user.id]);
    res.clearCookie('nts_session');
    res.clearCookie('nts_refresh');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

module.exports = router;
