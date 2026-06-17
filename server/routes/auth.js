import { Router } from 'express';
import {
  getAuthUrl,
  exchangeCode,
  upsertUserAndTokens,
  fetchSubscriptions,
  syncSubscriptionsToDb,
} from '../services/youtube.js';
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  sessionCookieOptions,
} from '../services/session.js';
import { requireAuth } from '../middleware/auth.js';
import { isDevMode } from '../db/index.js';
import { MOCK_USER } from '../dev/mockData.js';

const router = Router();

router.get('/config', (_req, res) => {
  res.json({
    devMode: isDevMode,
    googleConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        !process.env.GOOGLE_CLIENT_ID.startsWith('your-')
    ),
  });
});

router.get('/dev-login', async (_req, res) => {
  if (!isDevMode) {
    return res.status(404).json({ error: 'Dev login is not enabled' });
  }

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  try {
    const user = await upsertUserAndTokens(MOCK_USER);
    const subscriptions = await fetchSubscriptions(MOCK_USER.accessToken);
    await syncSubscriptionsToDb(user.id, subscriptions);

    const { token, expiresAt } = await createSession(user.id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    res.redirect(clientUrl);
  } catch (err) {
    console.error('Dev login error:', err);
    res.redirect(`${clientUrl}?auth_error=dev_login_failed`);
  }
});

router.get('/google', (_req, res) => {
  const googleConfigured =
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    !process.env.GOOGLE_CLIENT_ID.startsWith('your-');

  if (isDevMode && !googleConfigured) {
    return res.redirect('/api/auth/dev-login');
  }
  res.redirect(getAuthUrl());
});

router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  if (error) {
    return res.redirect(`${clientUrl}?auth_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect(`${clientUrl}?auth_error=missing_code`);
  }

  try {
    const profile = await exchangeCode(code);
    const user = await upsertUserAndTokens(profile);

    const accessToken = profile.accessToken;
    const subscriptions = await fetchSubscriptions(accessToken);
    await syncSubscriptionsToDb(user.id, subscriptions);

    const { token, expiresAt } = await createSession(user.id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    res.redirect(clientUrl);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${clientUrl}?auth_error=auth_failed`);
  }
});

router.post('/logout', async (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  await deleteSession(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
