import { SESSION_COOKIE, getSessionUser } from '../services/session.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];
  const user = await getSessionUser(token);

  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  req.user = user;
  next();
}

export async function optionalAuth(req, _res, next) {
  const token = req.cookies[SESSION_COOKIE];
  req.user = (await getSessionUser(token)) || null;
  next();
}
