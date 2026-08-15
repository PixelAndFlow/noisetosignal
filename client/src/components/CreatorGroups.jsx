import { useState } from 'react';
import { createPortal } from 'react-dom';
import './CreatorGroups.css';

export default function CreatorGroups({
  groups, selectedChannelIds, groupSelectBehavior,
  onSaveGroup, onDeleteGroup, onApplyGroup, onSetGroupSelectBehavior, onUpdateGroup,
}) {
  const [adding, setAdding] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null);
  const [confirmUpdateGroup, setConfirmUpdateGroup] = useState(null);
  const [pendingApply, setPendingApply] = useState(null);
  const [rememberChoice, setRememberChoice] = useState(false);

  async function handleSave() {
    const name = newGroupName.trim();
    if (!name) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveGroup(name, selectedChannelIds);
      setNewGroupName('');
      setAdding(false);
    } catch (err) {
      setSaveError(err?.message || 'Could not save group. Try a different name.');
    } finally {
      setSaving(false);
    }
  }

  function handleGroupClick(group) {
    if (groupSelectBehavior === 'replace' || groupSelectBehavior === 'add') {
      onApplyGroup(group.id, groupSelectBehavior);
    } else {
      setPendingApply(group);
    }
  }

  function resolveApply(mode) {
    onApplyGroup(pendingApply.id, mode);
    if (rememberChoice) onSetGroupSelectBehavior(mode);
    setPendingApply(null);
    setRememberChoice(false);
  }

  function confirmDelete() {
    onDeleteGroup(confirmDeleteGroup.id);
    setConfirmDeleteGroup(null);
  }

  function confirmUpdate() {
    onUpdateGroup(confirmUpdateGroup.id, selectedChannelIds);
    setConfirmUpdateGroup(null);
  }

  return (
    <div className="creator-groups">
      <div className="creator-groups-header">
        <span className="creator-groups-label">Groups</span>
        <button
          className="creator-groups-add-btn"
          onClick={() => setAdding(v => !v)}
          disabled={selectedChannelIds.length === 0 && !adding}
          title={selectedChannelIds.length === 0 ? 'Select creators first' : 'Save current selection as a group'}
        >
          + Save selection
        </button>
      </div>

      {adding && (
        <div className="creator-groups-new">
          <input
            className="creator-groups-name-input"
            type="text"
            placeholder="Group name (e.g. Tech News)"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setAdding(false); }}
            autoFocus
          />
          <div className="creator-groups-new-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setSaveError(null); }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !newGroupName.trim()}>
              {saving ? <span className="spinner small" /> : 'Save'}
            </button>
          </div>
          {saveError && <p className="creator-groups-error">{saveError}</p>}
        </div>
      )}

      {groups.length > 0 && (
        <div className="creator-groups-list">
          {groups.map(group => (
            <div key={group.id} className="creator-groups-item">
              <button className="creator-groups-apply-btn" onClick={() => handleGroupClick(group)}>
                <span className="creator-groups-name">{group.name}</span>
                <span className="creator-groups-count">{group.member_count.toLocaleString()}</span>
              </button>
              <button
                className="creator-groups-update-btn"
                onClick={() => setConfirmUpdateGroup(group)}
                disabled={selectedChannelIds.length === 0}
                aria-label={`Update group ${group.name} to current selection`}
                title={selectedChannelIds.length === 0 ? 'Select creators first' : 'Update to current selection'}
              >
                ⟳
              </button>
              <button
                className="creator-groups-delete-btn"
                onClick={() => setConfirmDeleteGroup(group)}
                aria-label={`Delete group ${group.name}`}
                title="Delete group"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingApply && createPortal(
        <div className="confirm-overlay" onClick={() => setPendingApply(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>Apply <strong>{pendingApply.name}</strong> to your creator selection?</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => resolveApply('add')}>Add to current selection</button>
              <button className="btn btn-primary" onClick={() => resolveApply('replace')}>Replace current selection</button>
            </div>
            <label className="creator-groups-remember">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={e => setRememberChoice(e.target.checked)}
              />
              Remember my choice (change anytime in Settings)
            </label>
          </div>
        </div>,
        document.body
      )}

      {confirmUpdateGroup && createPortal(
        <div className="confirm-overlay" onClick={() => setConfirmUpdateGroup(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>
              Update <strong>{confirmUpdateGroup.name}</strong> to your current{' '}
              {selectedChannelIds.length} selected creator{selectedChannelIds.length !== 1 ? 's' : ''}?
              This replaces its saved list.
            </p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmUpdateGroup(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmUpdate}>Update</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmDeleteGroup && createPortal(
        <div className="confirm-overlay" onClick={() => setConfirmDeleteGroup(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>Delete the group <strong>{confirmDeleteGroup.name}</strong>? This only deletes the saved group, not your creator subscriptions.</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDeleteGroup(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
