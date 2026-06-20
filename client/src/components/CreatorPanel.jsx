import { useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import './CreatorPanel.css';

export default function CreatorPanel({
  subscriptions, onToggle, onBulkToggle, onDeselctAll, onSync,
  lastSyncedAt, syncing, bulkProgress, confirmBulkActions,
}) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'selected'
  const [confirmDeselect, setConfirmDeselect] = useState(null);
  const [confirmBulk, setConfirmBulk] = useState(null);
  const [jumpIdx, setJumpIdx] = useState(0);
  const listRef = useRef(null);

  // Search filter — always applied first
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return subscriptions;
    const q = search.toLowerCase();
    return subscriptions.filter(s => s.channel_name.toLowerCase().includes(q));
  }, [subscriptions, search]);

  // View mode filter — applied on top of search
  const displayed = useMemo(() =>
    viewMode === 'selected' ? searchFiltered.filter(s => s.selected) : searchFiltered,
  [searchFiltered, viewMode]);

  const totalCount = subscriptions.length;
  const selectedCount = subscriptions.filter(s => s.selected).length;
  const allDisplayedSelected = displayed.length > 0 && displayed.every(s => s.selected);

  // Indices within `displayed` that are selected — used for jump navigation
  const selectedIndices = useMemo(() =>
    displayed.reduce((acc, s, i) => { if (s.selected) acc.push(i); return acc; }, []),
  [displayed]);

  function jumpDown() {
    if (!selectedIndices.length) return;
    const safeIdx = jumpIdx >= selectedIndices.length ? -1 : jumpIdx;
    const next = (safeIdx + 1) % selectedIndices.length;
    setJumpIdx(next);
    const items = listRef.current?.querySelectorAll('.creator-item');
    items?.[selectedIndices[next]]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function jumpUp() {
    if (!selectedIndices.length) return;
    const safeIdx = jumpIdx >= selectedIndices.length ? selectedIndices.length : jumpIdx;
    const prev = (safeIdx - 1 + selectedIndices.length) % selectedIndices.length;
    setJumpIdx(prev);
    const items = listRef.current?.querySelectorAll('.creator-item');
    items?.[selectedIndices[prev]]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

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
    const ids = displayed.map(s => s.channel_id);
    const selecting = !allDisplayedSelected;
    const inView = !!(search || viewMode === 'selected');
    // Deselect all with no search/filter — use nuclear clear so DB is fully wiped,
    // not just the channels the client happens to know about.
    if (!selecting && !inView) {
      if (confirmBulkActions) {
        setConfirmBulk({ ids, selected: false, inView: false, nuclear: true });
      } else {
        onDeselctAll();
      }
      return;
    }
    if (confirmBulkActions) {
      setConfirmBulk({ ids, selected: selecting, inView });
    } else {
      onBulkToggle(ids, selecting);
    }
  }

  function proceedBulk() {
    if (confirmBulk.nuclear) {
      onDeselctAll();
    } else {
      onBulkToggle(confirmBulk.ids, confirmBulk.selected);
    }
    setConfirmBulk(null);
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
        <span className="creator-panel-label">Creators</span>
        <button className="sync-btn" onClick={onSync} disabled={syncing} title="Sync subscriptions">
          {syncing ? <span className="spinner small" /> : '↻'}
        </button>
      </div>

      {/* Persistent count / live progress — FIX 1 + FIX 2 */}
      <div className="creator-stats">
        {bulkProgress ? (
          <span className="creator-progress">
            {bulkProgress.selected ? 'Selecting' : 'Deselecting'}{' '}
            <strong>{bulkProgress.done.toLocaleString()}</strong>
            {' / '}{bulkProgress.total.toLocaleString()}
          </span>
        ) : (
          <>
            <span className="creator-total">{totalCount.toLocaleString()} subscribed</span>
            {selectedCount > 0 && (
              <span className="creator-selected-badge">{selectedCount.toLocaleString()} selected</span>
            )}
          </>
        )}
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

      {/* All / Selected toggle + jump arrows — FIX 3 + FIX 4 */}
      <div className="creator-controls">
        <div className="view-toggle">
          <button
            className={`view-toggle-btn${viewMode === 'all' ? ' active' : ''}`}
            onClick={() => setViewMode('all')}
          >All</button>
          <button
            className={`view-toggle-btn${viewMode === 'selected' ? ' active' : ''}`}
            onClick={() => setViewMode('selected')}
          >Selected</button>
        </div>
        <div className="jump-arrows">
          <button
            className="jump-btn"
            onClick={jumpUp}
            disabled={!selectedIndices.length}
            title="Jump to previous selected creator"
          >↑</button>
          <button
            className="jump-btn"
            onClick={jumpDown}
            disabled={!selectedIndices.length}
            title="Jump to next selected creator"
          >↓</button>
        </div>
      </div>

      {displayed.length > 0 && (
        <div className="creator-bulk">
          <button className="bulk-btn" onClick={toggleAll} disabled={!!bulkProgress}>
            {bulkProgress
              ? <span className="spinner small" />
              : (allDisplayedSelected ? 'Deselect all' : 'Select all') + (search || viewMode === 'selected' ? ' in view' : '')}
          </button>
        </div>
      )}

      <div className="creator-list" ref={listRef}>
        {displayed.length === 0 ? (
          <div className="creator-empty">
            {viewMode === 'selected' ? 'No creators selected' : 'No creators found'}
          </div>
        ) : (
          displayed.map(sub => (
            <button
              key={sub.channel_id}
              className={`creator-item${sub.selected ? ' selected' : ''}`}
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

      {confirmBulk && createPortal(
        <div className="confirm-overlay" onClick={() => setConfirmBulk(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>
              {confirmBulk.nuclear
                ? <>Deselect all <strong>{totalCount.toLocaleString()}</strong> creator{totalCount !== 1 ? 's' : ''}? Their videos will be removed from your feed.</>
                : confirmBulk.selected
                  ? <>Select all <strong>{confirmBulk.ids.length.toLocaleString()}</strong> creator{confirmBulk.ids.length !== 1 ? 's' : ''}{confirmBulk.inView ? ' in view' : ''}?</>
                  : <>Deselect all <strong>{confirmBulk.ids.length.toLocaleString()}</strong> creator{confirmBulk.ids.length !== 1 ? 's' : ''}{confirmBulk.inView ? ' in view' : ''}? Their videos will be removed from your feed.</>}
            </p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmBulk(null)}>Cancel</button>
              <button
                className={`btn ${confirmBulk.selected ? 'btn-primary' : 'btn-danger'}`}
                onClick={proceedBulk}
              >
                {confirmBulk.selected ? 'Select all' : 'Deselect all'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
