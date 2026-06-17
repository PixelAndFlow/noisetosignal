import { useEffect, useState } from 'react';
import { api } from './api';
import Login from './components/Login';
import MainApp from './components/MainApp';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('auth_error')) {
      setAuthError(params.get('auth_error'));
      window.history.replaceState({}, '', window.location.pathname);
    }

    api
      .getMe()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#a1a1aa' }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Login authError={authError} />;
  }

  return <MainApp user={user} onLogout={handleLogout} />;
}
