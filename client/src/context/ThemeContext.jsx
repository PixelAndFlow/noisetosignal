import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState('system');

  useEffect(() => {
    if (user?.settings?.dark_mode) setTheme(user.settings.dark_mode);
  }, [user]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
  }, [theme]);

  const setAndSave = async (value) => {
    setTheme(value);
    await fetch('/api/settings/dark_mode', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setAndSave }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
