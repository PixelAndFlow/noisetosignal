const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment.' },
});

const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  keyGenerator: (req) => `sync:${req.user?.id || req.ip}`,
  message: { error: 'You\'re syncing too quickly. Please wait a moment.' },
  skip: (req) => !req.user,
});

module.exports = { apiLimiter, syncLimiter };
