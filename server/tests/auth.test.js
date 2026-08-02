const request = require('supertest');
const app = require('../index');
const { resetDb, seedUser } = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');

describe('auth: login bypass', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('lets a seeded user hit a protected endpoint with a minted session cookie', async () => {
    const user = await seedUser({ email: 'login-test@example.com', displayName: 'Login Test' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', sessionCookieFor(user.id));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.email).toBe('login-test@example.com');
    expect(res.body.settings.default_recency_window).toBe('last_3_days');
  });

  it('rejects a request with no session cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a session cookie for a user that no longer exists', async () => {
    const user = await seedUser();
    const cookie = sessionCookieFor(user.id);
    await resetDb(); // deletes the user out from under the token

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('rejects a session cookie signed with the wrong secret', async () => {
    const jwt = require('jsonwebtoken');
    const user = await seedUser();
    const badToken = jwt.sign({ userId: user.id }, 'wrong-secret', { expiresIn: '15m' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `nts_session=${badToken}`);

    expect(res.status).toBe(401);
  });
});
