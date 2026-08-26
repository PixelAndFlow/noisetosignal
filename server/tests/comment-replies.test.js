const request = require('supertest');
const app = require('../index');
const db = require('../lib/db');
const { resetDb, seedUser } = require('./helpers/db');
const { sessionCookieFor } = require('./helpers/auth');
const {
  mockCommentThreads, mockCommentReplies, mockCommentsDisabled,
} = require('./helpers/youtubeMocks');

const VIDEO_ID = 'comment_reply_test_video';
const COMMENT_ID = 'top_level_comment_1';

describe('Comment reply threads', () => {
  let cookie;

  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    cookie = sessionCookieFor(user.id);
  });

  afterEach(() => {
    require('nock').cleanAll();
  });

  it('GET /:videoId includes a reply preview and reply_count from the free commentThreads.list embed', async () => {
    mockCommentThreads(VIDEO_ID, [
      {
        id: COMMENT_ID,
        author: 'Alice',
        text: 'Great video!',
        totalReplyCount: 12,
        replyPreview: [
          { id: 'reply_1', author: 'Bob', text: 'Agreed!', publishedAt: '2026-08-01T00:00:00Z' },
        ],
      },
    ]);

    const res = await request(app).get(`/api/comments/${VIDEO_ID}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    const comment = res.body.comments[0];
    expect(comment.reply_count).toBe(12);
    expect(comment.replies).toHaveLength(1);
    expect(comment.replies[0]).toMatchObject({ id: 'reply_1', author: 'Bob', text: 'Agreed!' });
    expect(comment.replies_expanded).toBe(false);
  });

  it('GET /:videoId/:commentId/replies fetches the full list and persists it into the shared cache', async () => {
    mockCommentThreads(VIDEO_ID, [
      { id: COMMENT_ID, author: 'Alice', text: 'Great video!', totalReplyCount: 3, replyPreview: [
        { id: 'reply_1', author: 'Bob', text: 'First reply' },
      ] },
    ]);
    await request(app).get(`/api/comments/${VIDEO_ID}`).set('Cookie', cookie); // populate cache

    const fullReplies = [
      { id: 'reply_1', author: 'Bob', text: 'First reply' },
      { id: 'reply_2', author: 'Carol', text: 'Second reply' },
      { id: 'reply_3', author: 'Dave', text: 'Third reply' },
    ];
    mockCommentReplies(COMMENT_ID, fullReplies);

    const res = await request(app)
      .get(`/api/comments/${VIDEO_ID}/${COMMENT_ID}/replies`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.replies).toHaveLength(3);
    expect(res.body.replies.map(r => r.id)).toEqual(['reply_1', 'reply_2', 'reply_3']);

    // Persisted into the video's cached blob — a subsequent GET /:videoId
    // reflects the full list without hitting commentThreads.list again.
    const cached = await db.query('SELECT comments_json FROM cached_comments WHERE video_id = $1', [VIDEO_ID]);
    const persistedComment = cached.rows[0].comments_json.find(c => c.id === COMMENT_ID);
    expect(persistedComment.replies).toHaveLength(3);
    expect(persistedComment.replies_expanded).toBe(true);

    const secondGet = await request(app).get(`/api/comments/${VIDEO_ID}`).set('Cookie', cookie);
    const commentAgain = secondGet.body.comments.find(c => c.id === COMMENT_ID);
    expect(commentAgain.replies).toHaveLength(3);
    expect(commentAgain.replies_expanded).toBe(true);
  });

  it('404s for a comment id that does not exist in the cached video', async () => {
    mockCommentThreads(VIDEO_ID, [{ id: COMMENT_ID, author: 'Alice', text: 'Hi', totalReplyCount: 0 }]);
    await request(app).get(`/api/comments/${VIDEO_ID}`).set('Cookie', cookie);

    const res = await request(app)
      .get(`/api/comments/${VIDEO_ID}/does_not_exist/replies`)
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('404s when the video has no cached comments at all yet', async () => {
    const res = await request(app)
      .get(`/api/comments/never_loaded_video/${COMMENT_ID}/replies`)
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('requires auth on both routes', async () => {
    const list = await request(app).get(`/api/comments/${VIDEO_ID}`);
    expect(list.status).toBe(401);
    const replies = await request(app).get(`/api/comments/${VIDEO_ID}/${COMMENT_ID}/replies`);
    expect(replies.status).toBe(401);
  });

  it('comments-disabled videos still pass through unaffected', async () => {
    mockCommentsDisabled(VIDEO_ID);
    const res = await request(app).get(`/api/comments/${VIDEO_ID}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.comments).toEqual({ disabled: true });
  });
});
