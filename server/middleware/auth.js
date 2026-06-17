const jwt = require('jsonwebtoken');
const db = require('../lib/db');
const { decrypt } = require('../lib/crypto');

async function requireAuth(req, res, next) {
  const token = req.cookies?.nts_session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.query('SELECT * FROM users WHERE id = $1', [payload.userId]);
    if (!user.rows[0]) return res.status(401).json({ error: 'User not found' });
    req.user = user.rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

async function getAccessToken(userId) {
  const result = await db.query(
    'SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE user_id = $1',
    [userId]
  );
  if (!result.rows[0]) throw new Error('No OAuth token found');
  const row = result.rows[0];
  const accessToken = decrypt(row.access_token);

  if (new Date(row.expires_at) > new Date(Date.now() + 60_000)) {
    return accessToken;
  }

  // Refresh token
  const axios = require('axios');
  const refreshToken = decrypt(row.refresh_token);
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const { encrypt } = require('../lib/crypto');
  const newExpiry = new Date(Date.now() + res.data.expires_in * 1000);
  await db.query(
    'UPDATE oauth_tokens SET access_token = $1, expires_at = $2 WHERE user_id = $3',
    [encrypt(res.data.access_token), newExpiry, userId]
  );
  return res.data.access_token;
}

module.exports = { requireAuth, getAccessToken };
