const request = require('supertest');
const app = require('../index');
const db = require('../lib/db');
const {
  resetDb, seedUser, seedSubscriptions, seedCachedVideo,
} = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');

const CHANNEL_ID = 'UC_resume_test_channel';
const VIDEO_ID = 'resume_test_video';

// Resume playback (progress_seconds, reserved in the schema since Decision
// 028, built out here) — server side: GET /:videoId returns resume_seconds,
// PUT /:videoId/progress persists it.
describe('Resume playback: progress_seconds', () => {
  let user, cookie;

  beforeEach(async () => {
    await resetDb();
    user = await seedUser();
    cookie = sessionCookieFor(user.id);
    await seedSubscriptions(user.id, [{ channelId: CHANNEL_ID, channelName: 'Resume Test Channel' }]);
    await seedCachedVideo({
      channelId: CHANNEL_ID,
      videoId: VIDEO_ID,
      title: 'Resume Test Video',
      publishedAt: new Date(),
    });
  });

  it('GET /:videoId returns resume_seconds: 0 when nothing has been saved yet', async () => {
    const res = await request(app).get(`/api/videos/${VIDEO_ID}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.resume_seconds).toBe(0);
  });

  it('PUT /:videoId/progress saves progress, and GET reflects it back', async () => {
    const put = await request(app)
      .put(`/api/videos/${VIDEO_ID}/progress`)
      .set('Cookie', cookie)
      .send({ progress_seconds: 142 });
    expect(put.status).toBe(200);

    const get = await request(app).get(`/api/videos/${VIDEO_ID}`).set('Cookie', cookie);
    expect(get.body.resume_seconds).toBe(142);
  });

  it('PUT /:videoId/progress overwrites, not accumulates, on repeated calls', async () => {
    await request(app).put(`/api/videos/${VIDEO_ID}/progress`).set('Cookie', cookie).send({ progress_seconds: 30 });
    await request(app).put(`/api/videos/${VIDEO_ID}/progress`).set('Cookie', cookie).send({ progress_seconds: 90 });
    await request(app).put(`/api/videos/${VIDEO_ID}/progress`).set('Cookie', cookie).send({ progress_seconds: 45 });

    const rows = await db.query(
      'SELECT progress_seconds FROM watched_videos WHERE user_id = $1 AND video_id = $2',
      [user.id, VIDEO_ID]
    );
    expect(rows.rows.length).toBe(1); // one row, not one per call
    expect(rows.rows[0].progress_seconds).toBe(45); // latest value wins
  });

  it('PUT /:videoId/progress with 0 clears a previously saved position (finished video)', async () => {
    await request(app).put(`/api/videos/${VIDEO_ID}/progress`).set('Cookie', cookie).send({ progress_seconds: 200 });
    const clear = await request(app).put(`/api/videos/${VIDEO_ID}/progress`).set('Cookie', cookie).send({ progress_seconds: 0 });
    expect(clear.status).toBe(200);

    const get = await request(app).get(`/api/videos/${VIDEO_ID}`).set('Cookie', cookie);
    expect(get.body.resume_seconds).toBe(0);
  });

  it('rejects a negative or non-numeric progress_seconds', async () => {
    const negative = await request(app)
      .put(`/api/videos/${VIDEO_ID}/progress`).set('Cookie', cookie).send({ progress_seconds: -5 });
    expect(negative.status).toBe(400);

    const notANumber = await request(app)
      .put(`/api/videos/${VIDEO_ID}/progress`).set('Cookie', cookie).send({ progress_seconds: 'not-a-number' });
    expect(notANumber.status).toBe(400);
  });

  it('requires auth', async () => {
    const res = await request(app).put(`/api/videos/${VIDEO_ID}/progress`).send({ progress_seconds: 10 });
    expect(res.status).toBe(401);
  });

  it("one user's saved progress never leaks into another user's GET", async () => {
    const otherUser = await seedUser();
    const otherCookie = sessionCookieFor(otherUser.id);

    await request(app).put(`/api/videos/${VIDEO_ID}/progress`).set('Cookie', cookie).send({ progress_seconds: 250 });

    const otherGet = await request(app).get(`/api/videos/${VIDEO_ID}`).set('Cookie', otherCookie);
    expect(otherGet.body.resume_seconds).toBe(0);

    const mineGet = await request(app).get(`/api/videos/${VIDEO_ID}`).set('Cookie', cookie);
    expect(mineGet.body.resume_seconds).toBe(250);
  });

  it('a progress update for a not-yet-watched video creates exactly one row, respecting the 500-row cap', async () => {
    // Fill this user up to the cap with 500 other watched videos.
    const values = [];
    const params = [user.id];
    for (let i = 0; i < 500; i++) {
      params.push(`other_video_${i}`, new Date(Date.now() - (500 - i) * 1000));
      values.push(`($1, $${params.length - 1}, $${params.length})`);
    }
    await db.query(
      `INSERT INTO watched_videos (user_id, video_id, watched_at) VALUES ${values.join(', ')}`,
      params
    );

    const before = await db.query('SELECT COUNT(*) FROM watched_videos WHERE user_id = $1', [user.id]);
    expect(parseInt(before.rows[0].count)).toBe(500);

    // A progress save for a brand-new video (never POSTed to /watched
    // first) should evict the oldest row, same as the existing cap logic,
    // and result in exactly one new row for this video — not skip the cap
    // just because it arrived via /progress instead of /watched.
    const res = await request(app)
      .put(`/api/videos/${VIDEO_ID}/progress`).set('Cookie', cookie).send({ progress_seconds: 12 });
    expect(res.status).toBe(200);

    const after = await db.query('SELECT COUNT(*) FROM watched_videos WHERE user_id = $1', [user.id]);
    expect(parseInt(after.rows[0].count)).toBe(500); // capped, not 501

    const mine = await db.query(
      'SELECT progress_seconds FROM watched_videos WHERE user_id = $1 AND video_id = $2',
      [user.id, VIDEO_ID]
    );
    expect(mine.rows.length).toBe(1);
    expect(mine.rows[0].progress_seconds).toBe(12);
  });

  it('a progress update for an already-watched video does NOT evict anything, even at the cap', async () => {
    await request(app).put(`/api/videos/${VIDEO_ID}/progress`).set('Cookie', cookie).send({ progress_seconds: 5 });

    // Fill up to the cap with the resume-test video already counted in it.
    const values = [];
    const params = [user.id];
    for (let i = 0; i < 499; i++) {
      params.push(`other_video_${i}`, new Date(Date.now() - (499 - i) * 1000));
      values.push(`($1, $${params.length - 1}, $${params.length})`);
    }
    await db.query(
      `INSERT INTO watched_videos (user_id, video_id, watched_at) VALUES ${values.join(', ')}`,
      params
    );
    const before = await db.query('SELECT video_id FROM watched_videos WHERE user_id = $1 ORDER BY watched_at ASC', [user.id]);
    expect(before.rows.length).toBe(500);
    const oldestVideoId = before.rows[0].video_id;

    // This call only updates the existing resume-test row — it must not
    // trigger eviction of the oldest row, since no new row is being added.
    await request(app).put(`/api/videos/${VIDEO_ID}/progress`).set('Cookie', cookie).send({ progress_seconds: 77 });

    const after = await db.query('SELECT COUNT(*) FROM watched_videos WHERE user_id = $1', [user.id]);
    expect(parseInt(after.rows[0].count)).toBe(500); // unchanged
    const stillThere = await db.query(
      'SELECT 1 FROM watched_videos WHERE user_id = $1 AND video_id = $2',
      [user.id, oldestVideoId]
    );
    expect(stillThere.rows.length).toBe(1); // oldest row was NOT evicted
  });
});
