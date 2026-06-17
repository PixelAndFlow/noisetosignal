import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CreatorPanel from './CreatorPanel';
import RecencyPills from './RecencyPills';
import VideoGrid from './VideoGrid';
import './MainApp.css';

export default function MainApp({ user, onLogout }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [days, setDays] = useState(7);
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videoError, setVideoError] = useState(null);

  const loadSubscriptions = useCallback(async () => {
    setSubsLoading(true);
    try {
      const data = await api.getSubscriptions();
      setSubscriptions(data.subscriptions);
    } catch (err) {
      console.error(err);
    } finally {
      setSubsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  const handleRefresh = async () => {
    setSyncing(true);
    try {
      const data = await api.syncSubscriptions();
      setSubscriptions(data.subscriptions);
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggle = (channelId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  };

  const handleSelectAll = (filtered) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((s) => next.add(s.channelId));
      return next;
    });
  };

  const handleDeselectAll = (filtered) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((s) => next.delete(s.channelId));
      return next;
    });
  };

  useEffect(() => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      setVideos([]);
      setVideoError(null);
      return;
    }

    let cancelled = false;
    setVideosLoading(true);
    setVideoError(null);

    api
      .getVideos(ids, days)
      .then((data) => {
        if (!cancelled) setVideos(data.videos);
      })
      .catch((err) => {
        if (!cancelled) {
          setVideos([]);
          setVideoError(err.message || 'Failed to load videos');
        }
      })
      .finally(() => {
        if (!cancelled) setVideosLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIds, days]);

  return (
    <div className="main-app">
      <header className="app-header">
        <div className="header-brand">
          <span className="header-logo">▶</span>
          <span className="header-title">NoiseToSignal</span>
        </div>
        <div className="header-user">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="user-avatar" />
          )}
          <span className="user-name">{user.displayName || user.email}</span>
          <button type="button" className="btn-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <div className="app-body">
        <CreatorPanel
          subscriptions={subscriptions}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onRefresh={handleRefresh}
          loading={subsLoading}
          syncing={syncing}
        />

        <main className="main-content">
          <div className="content-toolbar">
            <RecencyPills value={days} onChange={setDays} />
          </div>
          <VideoGrid
            videos={videos}
            loading={videosLoading}
            error={videoError}
            selectedCount={selectedIds.size}
            days={days}
          />
        </main>
      </div>
    </div>
  );
}
