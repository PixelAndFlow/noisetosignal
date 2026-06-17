import { useMemo, useState } from 'react';
import './CreatorPanel.css';

export default function CreatorPanel({
  subscriptions,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onRefresh,
  loading,
  syncing,
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subscriptions;
    return subscriptions.filter((s) => s.channelName.toLowerCase().includes(q));
  }, [subscriptions, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.has(s.channelId));

  if (loading) {
    return (
      <aside className="creator-panel">
        <div className="panel-loading">Loading subscriptions…</div>
      </aside>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <aside className="creator-panel">
        <div className="panel-empty">
          <p>You&apos;re not subscribed to any channels on YouTube yet.</p>
          <button type="button" className="btn-secondary" onClick={onRefresh} disabled={syncing}>
            {syncing ? 'Refreshing…' : 'Refresh subscriptions'}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="creator-panel">
      <div className="panel-header">
        <h2>Creators</h2>
        <span className="panel-count">{selectedIds.size} selected</span>
      </div>

      <input
        type="search"
        className="creator-search"
        placeholder="Search creators…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search creators"
      />

      <div className="panel-actions">
        <button
          type="button"
          className="btn-text"
          onClick={() => (allFilteredSelected ? onDeselectAll(filtered) : onSelectAll(filtered))}
          disabled={filtered.length === 0}
        >
          {allFilteredSelected ? 'Deselect all' : 'Select all'}
        </button>
        <button type="button" className="btn-text" onClick={onRefresh} disabled={syncing}>
          {syncing ? 'Refreshing…' : 'Refresh subscriptions'}
        </button>
      </div>

      <ul className="creator-list">
        {filtered.map((sub) => (
          <li key={sub.channelId}>
            <label className="creator-item">
              <input
                type="checkbox"
                checked={selectedIds.has(sub.channelId)}
                onChange={() => onToggle(sub.channelId)}
              />
              {sub.channelAvatarUrl ? (
                <img src={sub.channelAvatarUrl} alt="" className="creator-avatar" />
              ) : (
                <span className="creator-avatar placeholder" />
              )}
              <span className="creator-name">{sub.channelName}</span>
            </label>
          </li>
        ))}
        {filtered.length === 0 && search && (
          <li className="no-results">No creators match &ldquo;{search}&rdquo;</li>
        )}
      </ul>
    </aside>
  );
}
