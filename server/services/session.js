import crypto from 'crypto';
import pool from '../db/index.js';

const SESSION_COOKIE = 'nts_session';
const SESSION_DAYS = 30;

export { SESSION_COOKIE };

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId) {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );

  return { token, expiresAt };
}

export async function getSessionUser(token) {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const result = await pool.query(
    `SELECT u.id, u.google_id, u.email, u.display_name, u.avatar_url
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash]
  );

  return result.rows[0] || null;
}

export async function deleteSession(token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export function sessionCookieOptions(expiresAt) {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    expires: expiresAt,
    path: '/',
  };
}
