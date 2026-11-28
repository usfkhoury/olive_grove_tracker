import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { OFFLINE_EVENT } from './api.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import LoginModal from './components/LoginModal.jsx';
import Activities from './pages/Activities.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Harvests from './pages/Harvests.jsx';
import Oil from './pages/Oil.jsx';
import TreeDetail from './pages/TreeDetail.jsx';
import Trees from './pages/Trees.jsx';

const NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/trees', icon: '🌳', label: 'Trees' },
  { to: '/harvests', icon: '🫒', label: 'Harvest' },
  { to: '/oil', icon: '🛢️', label: 'Oil' },
  { to: '/calendar', icon: '📅', label: 'Calendar' },
];

// Theme-color the browser chrome should match each theme's top bar / background.
const THEME_COLOR = { light: '#ffffff', dark: '#20231a' };

// Where the top-bar back arrow points: the owner's landing page outside this app
// (e.g. the apex domain when the tracker is hosted on a subdomain). Baked in at
// build time; left unset in public forks / local dev, where we fall back to the
// app's own root so the arrow still does something sensible.
const HOME_URL = import.meta.env.VITE_HOME_URL || '/';

function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [showLogin, setShowLogin] = useState(false);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const on = (e) => setOffline(e.detail);
    window.addEventListener(OFFLINE_EVENT, on);
    // Offline reading at the grove (public/sw.js). Production builds only.
    // With signal, ask it to save every page's data in the background (at
    // most every 10 min), so pages never opened still work offline.
    const warm = () => {
      const last = Number(localStorage.getItem('oliveWarmAt') || 0);
      if (!navigator.onLine || Date.now() - last < 10 * 60 * 1000) return;
      navigator.serviceWorker.ready.then((reg) => {
        reg.active?.postMessage('warm');
        localStorage.setItem('oliveWarmAt', String(Date.now()));
      });
    };
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js');
      warm();
      window.addEventListener('online', warm);
    }
    return () => { window.removeEventListener(OFFLINE_EVENT, on); window.removeEventListener('online', warm); };
  }, []);
  const { isOwner, expired, logout } = useAuth();
  const location = useLocation();

  return (
    <>
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a className="back-home" href={HOME_URL} title="Back to home" aria-label="Back to home">
            ←
          </a>
          <span className="brand">🫒 Olive Grove</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isOwner ? (
            <button
              className="secondary small"
              onClick={logout}
              title="Log out"
              style={{ fontSize: '0.8rem' }}
            >
              🔓 Logout
            </button>
          ) : (
            <button
              className="secondary small"
              onClick={() => setShowLogin(true)}
              title="Owner login"
              style={{ fontSize: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              🔒
            </button>
          )}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>
      {(showLogin || expired) && (
        <LoginModal
          message={expired ? 'Your sign-in expired. Sign in again, then tap Save — what you typed is still there.' : ''}
          onClose={(ok) => { setShowLogin(false); if (!ok && expired) logout(); }}
        />
      )}
      <main>
        {offline && (
          <p className="offline-banner">📵 No signal: showing data from your last visit. Changes won't save until you're back online.</p>
        )}
        {/* Key by path so an error on one screen clears when you navigate away. */}
        <ErrorBoundary key={location.pathname}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/trees" element={<Trees />} />
            <Route path="/trees/:id" element={<TreeDetail />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/harvests" element={<Harvests />} />
            <Route path="/oil" element={<Oil />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/season" element={<Navigate to="/trees?view=sheet" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <nav className="bottom">
        {NAV.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <span className="icon">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
