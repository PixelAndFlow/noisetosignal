import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ModeProvider } from './context/ModeContext';
import NavBar from './components/NavBar';
import Sidebar from './components/Sidebar';
import LandingPage from './pages/LandingPage';
import HomePage from './pages/HomePage';
import WatchPage from './pages/WatchPage';
import SettingsPage from './pages/SettingsPage';
import PrivacyPage from './pages/PrivacyPage';
import './App.css';

function AppRoutes() {
  const { user } = useAuth();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  if (user === undefined) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    );
  }

  return (
    <ThemeProvider>
      <ModeProvider>
        <NavBar />
        <div className="app-body">
          <Sidebar onExpandChange={setSidebarExpanded} />
          <div className={`app-content ${sidebarExpanded ? 'sidebar-expanded' : ''}`}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/watch/:videoId" element={<WatchPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </ModeProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
