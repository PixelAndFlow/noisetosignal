import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: '⊞', end: true },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar({ onExpandChange }) {
  const [expanded, setExpanded] = useState(false);

  function toggle() {
    setExpanded(v => {
      onExpandChange?.(!v);
      return !v;
    });
  }

  return (
    <aside className={`sidebar ${expanded ? 'expanded' : ''}`}>
      <button className="sidebar-toggle" onClick={toggle} aria-label="Toggle sidebar">
        {expanded ? '←' : '☰'}
      </button>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            title={!expanded ? item.label : undefined}
          >
            <span className="sidebar-icon">{item.icon}</span>
            {expanded && <span className="sidebar-label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
