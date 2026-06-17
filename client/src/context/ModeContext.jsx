import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const ModeContext = createContext(null);

export function ModeProvider({ children }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState('signal');

  useEffect(() => {
    if (user?.settings?.default_viewing_mode) {
      setModeState(user.settings.default_viewing_mode);
    }
  }, [user]);

  const setMode = async (value) => {
    setModeState(value);
    if (user) {
      await fetch('/api/events', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [{ name: 'mode_switched', properties: { to: value } }] }),
      }).catch(() => {});
    }
  };

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export const useMode = () => useContext(ModeContext);
