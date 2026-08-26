import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import KeyboardShortcutsOverlay from '../components/KeyboardShortcutsOverlay';
import { loadYouTubeIframeAPI } from '../lib/youtubeIframeApi';
import './WatchPage.css';

// How often to persist playback position while a video is playing.
const PROGRESS_SAVE_INTERVAL_MS = 8000;
// Don't bother saving a resume point in the first few seconds — resuming
// "5 seconds in" isn't meaningfully different from starting over.
const MIN_RESUMABLE_SECONDS = 5;
// Once this close to the end, treat the video as finished rather than
// saving a resume point nobody would want (resuming at 99% just to rewatch
// the last few seconds).
const NEAR_END_FRACTION = 0.95;

function saveProgress(videoId, seconds) {
  fetch(`/api/videos/${videoId}/progress`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ progress_seconds: Math.max(0, Math.floor(seconds)) }),
  }).catch(() => {});
}

export default function WatchPage() {
  const { videoId } = useParams();
  const [video, setVideo] = useState(null);
  const [comments, setComments] = useState(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState(() => new Set());
  const [loadingReplies, setLoadingReplies] = useState(() => new Set());
  const [descExpanded, setDescExpanded] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const playerContainerRef = useRef(null);
  const playerRef = useRef(null); // holds the real YT.Player instance once ready
  const resumeSecondsRef = useRef(0);
  const saveIntervalRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/videos/${videoId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setVideo(data);
        setLoading(false);
        if (data) {
          resumeSecondsRef.current = data.resume_seconds || 0;
          fetch(`/api/videos/${videoId}/watched`, { method: 'POST', credentials: 'include' }).catch(() => {});
        }
      })
      .catch(() => setLoading(false));
  }, [videoId]);

  // Creates the real YT.Player once both the video's metadata (for the
  // resume position) and the IFrame API script are ready. Rebuilds when
  // videoId changes (navigating to a different video's watch page).
  useEffect(() => {
    if (!video || !playerContainerRef.current) return;
    let cancelled = false;

    // The YT IFrame API replaces whatever element it's given with its own
    // <iframe>, which React must never be the one rendering directly (it
    // would fight React for ownership of that DOM node). Instead give it an
    // imperatively-created placeholder inside a wrapper div that JSX renders
    // empty and never touches again.
    const placeholder = document.createElement('div');
    playerContainerRef.current.appendChild(placeholder);

    loadYouTubeIframeAPI().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(placeholder, {
        videoId,
        playerVars: { autoplay: 1, enablejsapi: 1 },
        events: {
          onReady: (e) => {
            const resume = resumeSecondsRef.current;
            if (resume > MIN_RESUMABLE_SECONDS) {
              e.target.seekTo(resume, true);
            }
          },
          onStateChange: (e) => {
            const YTState = window.YT.PlayerState;
            clearInterval(saveIntervalRef.current);

            if (e.data === YTState.PLAYING) {
              saveIntervalRef.current = setInterval(() => {
                const p = playerRef.current;
                if (!p) return;
                const current = p.getCurrentTime();
                const duration = p.getDuration();
                const nearEnd = duration > 0 && current >= duration * NEAR_END_FRACTION;
                saveProgress(videoId, nearEnd ? 0 : current);
              }, PROGRESS_SAVE_INTERVAL_MS);
            } else if (e.data === YTState.PAUSED) {
              const current = e.target.getCurrentTime();
              const duration = e.target.getDuration();
              const nearEnd = duration > 0 && current >= duration * NEAR_END_FRACTION;
              saveProgress(videoId, nearEnd ? 0 : current);
            } else if (e.data === YTState.ENDED) {
              saveProgress(videoId, 0);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearInterval(saveIntervalRef.current);
      // Best-effort save of wherever playback was when leaving the page —
      // not guaranteed to complete (a plain fetch during unmount can be cut
      // off), but better than losing progress made since the last interval
      // tick.
      const p = playerRef.current;
      if (p && typeof p.getCurrentTime === 'function') {
        try {
          const current = p.getCurrentTime();
          const duration = p.getDuration();
          const nearEnd = duration > 0 && current >= duration * NEAR_END_FRACTION;
          saveProgress(videoId, nearEnd ? 0 : current);
        } catch { /* player may already be torn down */ }
      }
      if (p && typeof p.destroy === 'function') {
        p.destroy(); // removes the iframe it created
      } else if (placeholder.isConnected) {
        // Never got as far as creating the player (e.g. unmounted while
        // loadYouTubeIframeAPI() was still pending) — remove the
        // placeholder ourselves so it doesn't leak across remounts.
        placeholder.remove();
      }
      playerRef.current = null;
    };
  }, [video, videoId]);

  const handleKeyboard = useCallback((e) => {
    const player = playerRef.current;
    if (e.key === '?' || e.key === '/') {
      e.preventDefault();
      setShowShortcuts(v => !v);
      return;
    }
    if (!player || typeof player.getPlayerState !== 'function') return;

    if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      const YTState = window.YT.PlayerState;
      if (player.getPlayerState() === YTState.PLAYING) player.pauseVideo();
      else player.playVideo();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      player.seekTo(player.getCurrentTime() + 10, true);
    } else if (e.key === 'm' || e.key === 'M') {
      if (player.isMuted()) player.unMute();
      else player.mute();
    } else if (e.key === 'f' || e.key === 'F') {
      // Target the player's actual live iframe (via the API, not our own
      // ref) — the wrapper div we render is an empty, YT-managed
      // placeholder holder, not the element that should go fullscreen.
      const iframe = typeof player.getIframe === 'function' ? player.getIframe() : null;
      if (document.fullscreenElement) document.exitFullscreen?.();
      else iframe?.requestFullscreen?.();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [handleKeyboard]);

  async function loadComments() {
    if (comments !== null) return;
    setCommentsLoading(true);
    const res = await fetch(`/api/comments/${videoId}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setComments(data.comments);
    }
    setCommentsLoading(false);
  }

  // commentThreads.list embeds a free preview of a comment's first ~5
  // replies (see server/lib/youtube.js); toggling open a thread only hits
  // the network if reply_count says there are more than that preview holds
  // and they haven't already been fetched (replies_expanded).
  async function toggleReplies(comment) {
    if (expandedReplies.has(comment.id)) {
      setExpandedReplies(prev => {
        const next = new Set(prev);
        next.delete(comment.id);
        return next;
      });
      return;
    }
    setExpandedReplies(prev => new Set(prev).add(comment.id));

    const needsFullFetch = !comment.replies_expanded && comment.reply_count > (comment.replies?.length || 0);
    if (!needsFullFetch) return;

    setLoadingReplies(prev => new Set(prev).add(comment.id));
    try {
      const res = await fetch(`/api/comments/${videoId}/${comment.id}/replies`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setComments(prev => prev.map(c => (
          c.id === comment.id ? { ...c, replies: data.replies, replies_expanded: true } : c
        )));
      }
    } finally {
      setLoadingReplies(prev => {
        const next = new Set(prev);
        next.delete(comment.id);
        return next;
      });
    }
  }

  function handleShare() {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    if (navigator.share) {
      navigator.share({ title: video?.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  if (loading) return <div className="watch-loading"><div className="spinner" /></div>;
  if (!video) return <div className="watch-error"><p>Video not found.</p><Link to="/">← Back</Link></div>;

  return (
    <div className="watch-page">
      {showShortcuts && <KeyboardShortcutsOverlay onClose={() => setShowShortcuts(false)} />}

      <div className="watch-layout">
        <div className="watch-main">
          {/* Left empty on purpose — the YT IFrame API owns everything
              inside this wrapper once the player effect runs. */}
          <div className="player-wrap" ref={playerContainerRef} />

          <div className="watch-info">
            <h1 className="watch-title">{video.title}</h1>

            <div className="watch-meta-row">
              <div className="watch-channel">
                {video.channel_avatar_url && (
                  <a href={`https://www.youtube.com/channel/${video.channel_id}`} target="_blank" rel="noopener noreferrer">
                    <img src={video.channel_avatar_url} alt={video.channel_name} className="watch-channel-avatar" />
                  </a>
                )}
                <div>
                  <a
                    href={`https://www.youtube.com/channel/${video.channel_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="watch-channel-name"
                  >
                    {video.channel_name}
                  </a>
                  <span className="watch-subscribed">
                    {video.is_subscribed ? '✓ Subscribed' : (
                      <a href={`https://www.youtube.com/channel/${video.channel_id}`} target="_blank" rel="noopener noreferrer">
                        Subscribe on YouTube ↗
                      </a>
                    )}
                  </span>
                </div>
              </div>

              <div className="watch-actions">
                {video.like_count_display && (
                  <div className="stat-pill">
                    <span>👍</span>
                    <span title={`${video.like_count?.toLocaleString()} likes`}>{video.like_count_display}</span>
                  </div>
                )}
                {video.view_count_display && (
                  <div className="stat-pill">
                    <span title={`${video.view_count?.toLocaleString()} views`}>{video.view_count_display} views</span>
                  </div>
                )}
                <div className="tooltip-wrap">
                  <button className="action-btn" onClick={handleShare}>{copied ? '✓ Copied' : '↗ Share'}</button>
                  {copied && <span className="tooltip">Link copied!</span>}
                </div>
                <div className="tooltip-wrap">
                  <button className="action-btn muted" disabled>+ Save</button>
                  <span className="tooltip">Coming soon</span>
                </div>
                <button className="action-btn icon" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts">?</button>
              </div>
            </div>

            {video.description && (
              <div className={`watch-desc ${descExpanded ? 'expanded' : ''}`}>
                <p>{descExpanded ? video.description : video.description.slice(0, 200)}{!descExpanded && video.description.length > 200 && '...'}</p>
                {video.description.length > 200 && (
                  <button className="desc-toggle" onClick={() => setDescExpanded(v => !v)}>
                    {descExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            )}

            <div className="comments-section">
              {comments === null ? (
                <button className="btn btn-secondary" onClick={loadComments} disabled={commentsLoading}>
                  {commentsLoading ? <span className="spinner small" /> : 'Show comments'}
                </button>
              ) : comments?.disabled ? (
                <p className="comments-disabled">Comments are disabled for this video.</p>
              ) : comments?.length === 0 ? (
                <p className="comments-disabled">No comments yet.</p>
              ) : (
                <div className="comments-list">
                  <h3 className="comments-heading">Comments</h3>
                  {comments.map(c => (
                    <div key={c.id} className="comment">
                      <img src={c.author_avatar} alt={c.author} className="comment-avatar" />
                      <div className="comment-body">
                        <div className="comment-author">{c.author}</div>
                        <div className="comment-text" dangerouslySetInnerHTML={{ __html: c.text }} />
                        <div className="comment-meta">
                          {c.like_count > 0 && <span>👍 {c.like_count}</span>}
                        </div>
                        {c.reply_count > 0 && (
                          <button className="comment-replies-toggle" onClick={() => toggleReplies(c)}>
                            {expandedReplies.has(c.id)
                              ? '▲ Hide replies'
                              : `▼ ${c.reply_count} ${c.reply_count === 1 ? 'reply' : 'replies'}`}
                          </button>
                        )}
                        {expandedReplies.has(c.id) && (
                          <div className="comment-replies">
                            {loadingReplies.has(c.id) ? (
                              <span className="spinner small" />
                            ) : (
                              (c.replies || []).map(r => (
                                <div key={r.id} className="comment reply">
                                  <img src={r.author_avatar} alt={r.author} className="comment-avatar small" />
                                  <div className="comment-body">
                                    <div className="comment-author">{r.author}</div>
                                    <div className="comment-text" dangerouslySetInnerHTML={{ __html: r.text }} />
                                    <div className="comment-meta">
                                      {r.like_count > 0 && <span>👍 {r.like_count}</span>}
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
