import './VideoGrid.css';

function formatDate(iso) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function VideoGrid({ videos, loading, error, selectedCount, days }) {
  const dayLabel = days === 1 ? '24 hours' : `${days} days`;

  if (loading) {
    return (
      <div className="video-area">
        <div className="video-status">Loading videos…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="video-area">
        <div className="video-error" role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (selectedCount === 0) {
    return (
      <div className="video-area">
        <div className="video-empty">
          <p>Select one or more creators to see their recent uploads.</p>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="video-area">
        <div className="video-empty">
          <p>
            No videos match your filters. Try widening your recency window or adding creators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="video-area">
      <div className="video-meta">
        {selectedCount} creator{selectedCount !== 1 ? 's' : ''} · Last {dayLabel}
        {videos.length >= 100 && (
          <span className="video-cap"> · Showing newest 100 videos</span>
        )}
      </div>

      <div className="video-grid">
        {videos.map((video) => (
          <a
            key={video.videoId}
            href={video.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="video-card"
          >
            <div className="video-thumb-wrap">
              {video.thumbnailUrl ? (
                <img src={video.thumbnailUrl} alt="" className="video-thumb" loading="lazy" />
              ) : (
                <div className="video-thumb placeholder" />
              )}
            </div>
            <div className="video-info">
              <h3 className="video-title">{video.title}</h3>
              <p className="video-channel">{video.channelName}</p>
              <p className="video-date">{formatDate(video.publishedAt)}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
