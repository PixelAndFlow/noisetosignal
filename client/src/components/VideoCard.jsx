import { Link } from 'react-router-dom';
import './VideoCard.css';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function VideoCard({ video, showDataSource }) {
  return (
    <Link to={`/watch/${video.video_id}`} className={`video-card ${video.watched ? 'watched' : ''}`}>
      <div className="video-thumb-wrap">
        {video.thumbnail_url
          ? <img
              src={video.thumbnail_url}
              alt={video.title}
              className="video-thumb"
              loading="lazy"
            />
          : <div className="video-thumb-placeholder" />
        }
        {video.watched && <div className="watched-badge">✓</div>}
        {video.duration && <div className="duration-badge">{video.duration}</div>}
      </div>

      <div className="video-meta">
        <div className="video-channel">
          {video.channel_avatar_url
            ? <img src={video.channel_avatar_url} alt={video.channel_name} className="channel-avatar" loading="lazy" />
            : <div className="channel-avatar-placeholder">{video.channel_name?.[0] || '?'}</div>
          }
          <span className="channel-name">{video.channel_name}</span>
        </div>
        <h3 className="video-title">{video.title}</h3>
        <div className="video-stats">
          {video.view_count_display && <span>{video.view_count_display} views</span>}
          {video.published_at && <span>{timeAgo(video.published_at)}</span>}
          {showDataSource && video.data_source && (
            <span className="data-source-tag">{video.data_source.toUpperCase()}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
