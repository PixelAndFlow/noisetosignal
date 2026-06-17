import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useMode } from '../context/ModeContext';
import './NavBar.css';

export default function NavBar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { mode, setMode } = useMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim() && mode === 'signal') {
      navigate(`/?q=${encodeURIComponent(search.trim())}`);
    }
  }

  function cycleTheme() {
    const next = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
    setTheme(next);
  }

  const themeIcon = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '⚙️';

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link to="/" className="navbar-logo">
          <span className="logo-mark">NTS</span>
          <span className="logo-text">NoiseToSignal</span>
        </Link>
      </div>

      <div className="navbar-center">
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === 'signal' ? 'active' : ''}`}
            onClick={() => setMode('signal')}
          >
            Signal
          </button>
          <button
            className={`mode-btn ${mode === 'youtube' ? 'active' : ''}`}
            onClick={() => setMode('youtube')}
          >
            YouTube
          </button>
        </div>

        {mode === 'signal' ? (
          <form className="search-form" onSubmit={handleSearch}>
            <input
              className="search-input"
              type="search"
              placeholder="Search your subscriptions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </form>
        ) : (
          <span className="search-disabled">Search available in Signal mode</span>
        )}
      </div>

      <div className="navbar-right">
        <div className="tooltip-wrap">
          <button className="icon-btn" onClick={cycleTheme} aria-label="Toggle theme">
            {themeIcon}
          </button>
          <span className="tooltip">Theme: {theme}</span>
        </div>

        <div className="user-menu-wrap" ref={menuRef}>
          <button className="avatar-btn" onClick={() => setMenuOpen(v => !v)}>
            {user.avatar_url
              ? <img src={user.avatar_url} alt={user.display_name} className="avatar" />
              : <span className="avatar-fallback">{user.display_name?.[0] || '?'}</span>
            }
          </button>

          {menuOpen && (
            <div className="user-menu">
              <div className="user-menu-header">
                <span className="user-name">{user.display_name}</span>
                <span className="user-email">{user.email}</span>
              </div>
              <Link to="/settings" className="user-menu-item" onClick={() => setMenuOpen(false)}>
                Settings
              </Link>
              <button className="user-menu-item danger" onClick={logout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
