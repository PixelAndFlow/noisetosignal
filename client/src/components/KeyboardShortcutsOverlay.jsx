import { useEffect } from 'react';
import './KeyboardShortcutsOverlay.css';

const SHORTCUTS = [
  { keys: ['Space', 'K'], action: 'Play / Pause' },
  { keys: ['←'], action: 'Seek back 10 seconds' },
  { keys: ['→'], action: 'Seek forward 10 seconds' },
  { keys: ['M'], action: 'Mute / Unmute' },
  { keys: ['F'], action: 'Fullscreen' },
  { keys: ['?'], action: 'Show shortcuts' },
];

export default function KeyboardShortcutsOverlay({ onClose }) {
  useEffect(() => {
    function handler(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-dialog" onClick={e => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="shortcuts-close" onClick={onClose}>✕</button>
        </div>
        <div className="shortcuts-list">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="shortcut-row">
              <div className="shortcut-keys">
                {s.keys.map(k => <kbd key={k}>{k}</kbd>)}
              </div>
              <span className="shortcut-action">{s.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
