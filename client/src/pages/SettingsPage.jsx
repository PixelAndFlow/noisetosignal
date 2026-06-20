import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import './SettingsPage.css';

const SYNC_FREQ_OPTIONS = [
  { value: 'every_login', label: 'Every login (recommended)' },
  { value: 'every_6_hours', label: 'Every 6 hours' },
  { value: 'every_24_hours', label: 'Every 24 hours' },
  { value: 'manual_only', label: 'Manual only' },
];

const RECENCY_OPTIONS = [
  { value: 'last_hour', label: 'Last hour' },
  { value: 'last_8_hours', label: 'Last 8 hours' },
  { value: 'last_24_hours', label: 'Last 24 hours' },
  { value: 'last_3_days', label: 'Last 3 days' },
  { value: 'last_7_days', label: 'Last week' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_90_days', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
];

export default function SettingsPage() {
  const { user, logout, refetch } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const s = user?.settings || {};
  const [syncFreq, setSyncFreq] = useState(s.subscription_sync_frequency || 'every_login');
  const [defaultRecency, setDefaultRecency] = useState(s.default_recency_window || 'last_3_days');
  const [defaultMode, setDefaultMode] = useState(s.default_viewing_mode || 'signal');
  const [dataSource, setDataSource] = useState(s.data_source_indicator !== 'off');
  const [confirmBulk, setConfirmBulk] = useState(s.confirm_bulk_actions !== 'off');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  async function saveSetting(key, value) {
    await fetch(`/api/settings/${key}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    const res = await fetch('/api/subscriptions/sync', { method: 'POST', credentials: 'include' });
    setSyncing(false);
    if (res.ok) {
      const data = await res.json();
      setSyncMsg(data.outcome === 'no_changes' ? 'No changes found.' : `${data.added} added, ${data.removed} removed.`);
    } else {
      setSyncMsg('Sync failed. Please try again.');
    }
    setTimeout(() => setSyncMsg(null), 5000);
  }

  async function handleRevoke() {
    await fetch('/api/auth/revoke', { method: 'POST', credentials: 'include' });
    navigate('/');
    window.location.reload();
  }

  async function handleDeleteAccount() {
    await fetch('/api/auth/account', { method: 'DELETE', credentials: 'include' });
    navigate('/');
    window.location.reload();
  }

  return (
    <div className="settings-page">
      <h1 className="settings-heading">Settings</h1>

      <section className="settings-section">
        <h2>Subscriptions</h2>

        <div className="setting-row">
          <div className="setting-label">
            <span>Sync frequency</span>
            <span className="setting-desc">How often to check for new subscriptions</span>
          </div>
          <select
            className="setting-select"
            value={syncFreq}
            onChange={e => { setSyncFreq(e.target.value); saveSetting('subscription_sync_frequency', e.target.value); }}
          >
            {SYNC_FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>Manual sync</span>
            <span className="setting-desc">Fetch latest subscription list from YouTube now</span>
          </div>
          <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? <span className="spinner small" /> : 'Sync now'}
          </button>
        </div>
        {syncMsg && <p className="sync-msg">{syncMsg}</p>}

        <div className="setting-row">
          <div className="setting-label">
            <span>Confirm bulk actions</span>
            <span className="setting-desc">Ask before selecting or deselecting all creators</span>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={confirmBulk}
              onChange={e => { setConfirmBulk(e.target.checked); saveSetting('confirm_bulk_actions', e.target.checked ? 'on' : 'off'); }}
            />
            <span className="toggle-track" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2>Feed defaults</h2>

        <div className="setting-row">
          <div className="setting-label">
            <span>Default mode</span>
            <span className="setting-desc">Which mode opens on login</span>
          </div>
          <select
            className="setting-select"
            value={defaultMode}
            onChange={e => { setDefaultMode(e.target.value); saveSetting('default_viewing_mode', e.target.value); }}
          >
            <option value="signal">Signal mode</option>
            <option value="youtube">YouTube mode</option>
          </select>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>Default timeframe</span>
            <span className="setting-desc">Pre-selected recency window</span>
          </div>
          <select
            className="setting-select"
            value={defaultRecency}
            onChange={e => { setDefaultRecency(e.target.value); saveSetting('default_recency_window', e.target.value); }}
          >
            {RECENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>Show data source</span>
            <span className="setting-desc">Display RSS or API label on video cards</span>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={dataSource}
              onChange={e => { setDataSource(e.target.checked); saveSetting('data_source_indicator', e.target.checked ? 'on' : 'off'); }}
            />
            <span className="toggle-track" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="setting-row">
          <div className="setting-label">
            <span>Theme</span>
            <span className="setting-desc">Override your system preference</span>
          </div>
          <div className="theme-btns">
            {['system', 'light', 'dark'].map(t => (
              <button
                key={t}
                className={`theme-btn ${theme === t ? 'active' : ''}`}
                onClick={() => setTheme(t)}
              >
                {t === 'system' ? '⚙ System' : t === 'light' ? '☀ Light' : '🌙 Dark'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-section danger-zone">
        <h2>Account</h2>

        <div className="setting-row">
          <div className="setting-label">
            <span>Disconnect YouTube</span>
            <span className="setting-desc">Revoke NoiseToSignal's access to your YouTube data</span>
          </div>
          {confirmRevoke ? (
            <div className="confirm-inline">
              <span>Are you sure?</span>
              <button className="btn btn-danger btn-sm" onClick={handleRevoke}>Disconnect</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmRevoke(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-secondary" onClick={() => setConfirmRevoke(true)}>Disconnect</button>
          )}
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>Delete my account</span>
            <span className="setting-desc">All your data will be deleted within 30 days</span>
          </div>
          {confirmDelete ? (
            <div className="confirm-inline">
              <span>This can't be undone.</span>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteAccount}>Delete</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Delete account</button>
          )}
        </div>
      </section>
    </div>
  );
}
