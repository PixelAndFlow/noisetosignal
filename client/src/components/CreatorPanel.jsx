import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './CreatorPanel.css';

export default function CreatorPanel({ subscriptions, onToggle, onBulkToggle, onSync, lastSyncedAt, syncing, bulkProgress }) {
  const [search, setSearch] = useState('');
  const [confirmDeselect, setConfirmDeselect] = useState(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return subscriptions;
    const q = search.toLowerCase();
    return subscriptions.filter(s => s.channel_name.toLowerCase().includes(q));
  }, [subscriptions, search]);

  const selectedCount = subscriptions.filter(s => s.selected).length;
  const filteredSelectedCount = filtered.filter(s => s.selected).length;
  const allFilteredSelected = filtered.length > 0 && filteredSelectedCount === filtered.length;

  function handleToggle(sub) {
    if (sub.selected) {
      setConfirmDeselect(sub);
    } else {
      onToggle(sub.channel_id, true);
    }
  }

  function confirmDeselection() {
    onToggle(confirmDeselect.channel_id, false);
    setConfirmDeselect(null);
  }

  function toggleAll() {
    const ids = filtered.map(s => s.channel_id);
    onBulkToggle(ids, !allFilteredSelected);
  }

  const syncLabel = useCallback(() => {
    if (!lastSyncedAt) return 'Never synced';
    const diff = Date.now() - new Date(lastSyncedAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Updated just now';
    if (mins < 60) return `Updated ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Updated ${hrs}h ago`;
    return `Updated ${Math.floor(hrs / 24)}d ago`;
  }, [lastSyncedAt]);

  return (
    <div className="creator-panel">
      <div className="creator-panel-header">
        <div className="creator-panel-title">
          <span>Creators</span>
          <span className="creator-count">{selectedCount} selected</span>
        </div>
        <button
          className="sync-btn"
          onClick={onSync}
          disabled={syncing}
          title="Sync subscriptions"
        >
          {syncing ? <span className="spinner small" /> : '↻'}
        </button>
      </div>

      <div className="last-synced" onClick={onSync} title="Tap to sync">
        {syncing ? 'Syncing...' : syncLabel()}
      </div>

      <div className="creator-search-wrap">
        <input
          className="creator-search"
          type="search"
          placeholder="Search creators..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length > 0 && (
        <div className="creator-bulk">
          <button className="bulk-btn" onClick={toggleAll} disabled={!!bulkProgress}>
            {bulkProgress
              ? <span className="spinner small" />
              : (allFilteredSelected ? 'Deselect all' : 'Select all') + (search ? ' in results' : '')}
          </button>
        </div>
      )}

      <div className="creator-list">
        {filtered.length === 0 ? (
          <div className="creator-empty">No creators found</div>
        ) : (
          filtered.map(sub => (
            <button
              key={sub.channel_id}
              className={`creator-item ${sub.selected ? 'selected' : ''}`}
              onClick={() => handleToggle(sub)}
            >
              {sub.channel_avatar_url
                ? <img src={sub.channel_avatar_url} alt={sub.channel_name} className="creator-avatar" loading="lazy" />
                : <div className="creator-avatar-placeholder">{sub.channel_name[0]}</div>
              }
              <span className="creator-name">{sub.channel_name}</span>
              {sub.selected && <span className="creator-check">✓</span>}
            </button>
          ))
        )}
      </div>

      {confirmDeselect && createPortal(
        <div className="confirm-overlay" onClick={() => setConfirmDeselect(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>Deselecting <strong>{confirmDeselect.channel_name}</strong> will remove all of their videos from results. They'll need to be re-added to appear again.</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDeselect(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeselection}>Deselect</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
