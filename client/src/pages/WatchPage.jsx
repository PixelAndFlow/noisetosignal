import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import KeyboardShortcutsOverlay from '../components/KeyboardShortcutsOverlay';
import './WatchPage.css';

export default function WatchPage() {
  const { videoId } = useParams();
  const [video, setVideo] = useState(null);
  const [comments, setComments] = useState(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const playerRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/videos/${videoId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setVideo(data);
        setLoading(false);
        if (data) {
          fetch(`/api/videos/${videoId}/watched`, { method: 'POST', credentials: 'include' }).catch(() => {});
        }
      })
      .catch(() => setLoading(false));
  }, [videoId]);

  const handleKeyboard = useCallback((e) => {
    if (!playerRef.current) return;
    const player = playerRef.current.contentWindow;
    if (e.key === '?' || e.key === '/') {
      e.preventDefault();
      setShowShortcuts(v => !v);
      return;
    }
    const postMsg = (cmd) => player.postMessage(JSON.stringify({ event: 'command', func: cmd, args: [] }), '*');
    if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      postMsg('togglePlay');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      player.postMessage(JSON.stringify({ event: 'command', func: 'seekBy', args: [-10] }), '*');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      player.postMessage(JSON.stringify({ event: 'command', func: 'seekBy', args: [10] }), '*');
    } else if (e.key === 'm' || e.key === 'M') {
      postMsg('toggleMute');
    } else if (e.key === 'f' || e.key === 'F') {
      postMsg('toggleFullscreen');
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
          <div className="player-wrap">
            <iframe
              ref={playerRef}
              src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1`}
              title={video.title}
              className="player-iframe"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>

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
