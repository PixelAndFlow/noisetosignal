import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not authed
  const [syncStatus, setSyncStatus] = useState(null);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        return data;
      } else if (res.status === 401) {
        const refresh = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (refresh.ok) {
          const res2 = await fetch('/api/auth/me', { credentials: 'include' });
          if (res2.ok) {
            const data = await res2.json();
            setUser(data);
            return data;
          }
        }
        setUser(null);
      }
    } catch {
      setUser(null);
    }
    return null;
  }, []);

  useEffect(() => {
    fetchMe().then(async (u) => {
      if (u) {
        const syncRes = await fetch('/api/auth/sync-check', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => null);
        if (syncRes?.ok) {
          const data = await syncRes.json();
          if (data.synced) setSyncStatus(data);
        }
      }
    });

    // Refresh JWT before it expires (every 12 minutes)
    const interval = setInterval(async () => {
      await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    }, 12 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMe]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, logout, syncStatus, refetch: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
