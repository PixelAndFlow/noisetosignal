const jwt = require('jsonwebtoken');

// Mints the same JWT structure server/routes/auth.js issues after a real
// Google OAuth callback, so tests can hit authenticated endpoints without
// driving a real browser through Google's login screen.
function sessionCookieFor(userId) {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  return `nts_session=${token}`;
}

module.exports = { sessionCookieFor };
