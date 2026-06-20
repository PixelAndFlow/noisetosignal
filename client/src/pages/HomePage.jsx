import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMode } from '../context/ModeContext';
import { useAuth } from '../context/AuthContext';
import CreatorPanel from '../components/CreatorPanel';
import TimeframeFilter from '../components/TimeframeFilter';
import VideoCard from '../components/VideoCard';
import './HomePage.css';

const DEFAULT_TIMEFRAME = 'last_3_days';

export default function HomePage() {
  const { mode } = useMode();
  const { user } = useAuth();

  const [subscriptions, setSubscriptions] = useState([]);
  const [timeframe, setTimeframe] = useState(user?.settings?.default_recency_window || DEFAULT_TIMEFRAME);
  const [sort, setSort] = useState('newest');
  const [videos, setVideos] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncBanner, setSyncBanner] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [showDataSource, setShowDataSource] = useState(user?.settings?.data_source_indicator === 'on');

  const iframeRef = useRef(null);
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  useEffect(() => {
    if (user?.settings?.default_recency_window) setTimeframe(user.settings.default_recency_window);
    if (user?.settings?.data_source_indicator) setShowDataSource(user.settings.data_source_indicator === 'on');
  }, [user]);

  const loadSubscriptions = useCallback(async () => {
    const res = await fetch('/api/subscriptions', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    setSubscriptions(data.subscriptions);
    setLastSyncedAt(data.last_synced_at);
  }, []);

  useEffect(() => { loadSubscriptions(); }, [loadSubscriptions]);

  const loadVideos = useCallback(async (off = 0) => {
    const selectedIds = subscriptions.filter(s => s.selected).map(s => s.channel_id);
    if (selectedIds.length === 0) {
      setVideos([]);
      setTotal(0);
      setHasMore(false);
      return;
    }
    if (off === 0) setLoading(true);
    else setLoadingMore(true);

    const res = await fetch(`/api/videos/feed?timeframe=${timeframe}&sort=${sort}&offset=${off}`, {
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      if (off === 0) setVideos(data.videos);
      else setVideos(v => [...v, ...data.videos]);
      setTotal(data.total);
      setHasMore(data.has_more);
      setOffset(off + data.videos.length);

      // Log event
      if (off === 0) {
        fetch('/api/events', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: [{ name: 'queue_generated', properties: { timeframe, creator_count: selectedIds.length, video_count: data.total } }] }),
        }).catch(() => {});
      }
    }
    setLoading(false);
    setLoadingMore(false);
  }, [subscriptions, timeframe, sort]);

  useEffect(() => {
    if (mode === 'signal') loadVideos(0);
  }, [mode, loadVideos]);

  async function handleSync() {
    setSyncing(true);
    setSyncBanner(null);
    const res = await fetch('/api/subscriptions/sync', { method: 'POST', credentials: 'include' });
    setSyncing(false);
    if (res.ok) {
      const data = await res.json();
      await loadSubscriptions();
      if (data.outcome === 'no_changes') {
        setSyncBanner({ type: 'info', msg: 'Updated just now — No changes found' });
      } else {
        setSyncBanner({ type: 'info', msg: `Updated just now — ${data.added} channels added, ${data.removed} removed` });
      }
      setTimeout(() => setSyncBanner(null), 5000);
    } else {
      const err = await res.json();
      setSyncBanner({ type: 'error', msg: err.error || 'Sync failed. Please try again.' });
    }
  }

  async function handleToggle(channelId, selected) {
    const res = await fetch('/api/subscriptions/selections', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, selected }),
    });
    if (!res.ok) {
      await loadSubscriptions();
      return;
    }
    setSubscriptions(prev => prev.map(s => s.channel_id === channelId ? { ...s, selected } : s));
    fetch('/api/events', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ name: selected ? 'creator_selected' : 'creator_deselected', properties: { channel_id: channelId } }] }),
    }).catch(() => {});
  }

  async function handleDeselctAll() {
    setBulkProgress({ total: subscriptions.length, done: 0, selected: false });
    await fetch('/api/subscriptions/selections', { method: 'DELETE', credentials: 'include' });
    await loadSubscriptions();
    setBulkProgress(null);
  }

  async function handleBulkToggle(channelIds, selected) {
    const BATCH_SIZE = 100;
    setBulkProgress({ total: channelIds.length, done: 0, selected });
    for (let i = 0; i < channelIds.length; i += BATCH_SIZE) {
      const batch = channelIds.slice(i, i + BATCH_SIZE);
      await fetch('/api/subscriptions/selections/bulk', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_ids: batch, selected }),
      });
      const done = Math.min(i + BATCH_SIZE, channelIds.length);
      setBulkProgress({ total: channelIds.length, done, selected });
    }
    const channelSet = new Set(channelIds);
    setSubscriptions(prev => prev.map(s => channelSet.has(s.channel_id) ? { ...s, selected } : s));
    setBulkProgress(null);
  }

  function handleTimeframeChange(tf) {
    setTimeframe(tf);
    fetch('/api/settings/default_recency_window', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: tf }),
    }).catch(() => {});
    fetch('/api/events', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ name: 'recency_filter_set', properties: { timeframe: tf } }] }),
    }).catch(() => {});
  }

  const selectedCount = subscriptions.filter(s => s.selected).length;

  const displayedVideos = query
    ? videos.filter(v =>
        v.title.toLowerCase().includes(query.toLowerCase()) ||
        v.channel_name?.toLowerCase().includes(query.toLowerCase())
      )
    : videos;

  if (mode === 'youtube') {
    return (
      <div className="youtube-mode">
        {iframeBlocked ? (
          <div className="iframe-blocked">
            <p>YouTube can't be embedded here.</p>
            <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Open YouTube
            </a>
          </div>
        ) : (
          <>
            <iframe
              ref={iframeRef}
              src="https://www.youtube.com"
              title="YouTube"
              className="youtube-iframe"
              onError={() => setIframeBlocked(true)}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
            <div className="iframe-fallback-bar">
              <span>If YouTube isn't loading, </span>
              <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer">open it directly ↗</a>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="home-layout">
      <CreatorPanel
        subscriptions={subscriptions}
        onToggle={handleToggle}
        onBulkToggle={handleBulkToggle}
        onDeselctAll={handleDeselctAll}
        onSync={handleSync}
        lastSyncedAt={lastSyncedAt}
        syncing={syncing}
        bulkProgress={bulkProgress}
        confirmBulkActions={user?.settings?.confirm_bulk_actions !== 'off'}
      />

      <div className="home-main">
        {bulkProgress && (
          <div className="banner banner-info sync-banner">
            <span className="spinner small" style={{ marginRight: 8 }} />
            {`${bulkProgress.selected ? 'Selecting' : 'Deselecting'} creators… ${bulkProgress.done.toLocaleString()} / ${bulkProgress.total.toLocaleString()}`}
          </div>
        )}

        {syncBanner && (
          <div className={`banner banner-${syncBanner.type === 'error' ? 'error' : 'info'} sync-banner`}>
            {syncBanner.msg}
            <button className="banner-close" onClick={() => setSyncBanner(null)}>✕</button>
          </div>
        )}

        <TimeframeFilter value={timeframe} onChange={handleTimeframeChange} />

        <div className="feed-toolbar">
          <div className="feed-status">
            {selectedCount > 0 ? (
              <span className="status-pill">{selectedCount} creator{selectedCount !== 1 ? 's' : ''} · {TIMEFRAME_LABELS[timeframe]}</span>
            ) : (
              <span className="status-pill muted">No creators selected</span>
            )}
            {total > 0 && !loading && (
              <span className="video-count">Showing {displayedVideos.length} of {total} video{total !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="feed-controls">
            <select className="sort-select" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="creator">By creator</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="feed-loading"><div className="spinner" /></div>
        ) : selectedCount === 0 ? (
          <div className="empty-state">
            <h3>Select creators to get started</h3>
            <p>Choose channels from the panel on the left to build your signal feed.</p>
          </div>
        ) : displayedVideos.length === 0 ? (
          <div className="empty-state">
            <h3>No videos found</h3>
            <p>No videos from your selected creators in this time window. Try extending your timeframe.</p>
          </div>
        ) : (
          <>
            <div className="video-grid">
              {displayedVideos.map(v => (
                <VideoCard key={v.video_id} video={v} showDataSource={showDataSource} />
              ))}
            </div>

            {hasMore && (
              <div className="load-more-wrap">
                <p className="load-more-hint">
                  Showing {displayedVideos.length} of {total} videos across {selectedCount} creators
                </p>
                <button
                  className="btn btn-secondary"
                  onClick={() => { loadVideos(offset); }}
                  disabled={loadingMore}
                >
                  {loadingMore ? <span className="spinner small" /> : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const TIMEFRAME_LABELS = {
  last_hour: 'Last hour',
  last_8_hours: 'Last 8 hours',
  last_24_hours: 'Last 24 hours',
  last_3_days: 'Last 3 days',
  last_7_days: 'Last week',
  last_month: 'Last month',
  last_90_days: 'Last 3 months',
  last_6_months: 'Last 6 months',
};
