import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
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
  { to: '/activities', icon: '📝', label: 'Log' },
  { to: '/harvests', icon: '🫒', label: 'Harvest' },
  { to: '/oil', icon: '🛢️', label: 'Oil' },
  { to: '/calendar', icon: '📅', label: 'Calendar' },
];

// Theme-color the browser chrome should match each theme's top bar / background.
const THEME_COLOR = { light: '#ffffff', dark: '#20231a' };

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
  const location = useLocation();

  return (
    <>
      <header className="topbar">
        <span className="brand">🫒 Olive Grove</span>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>
      <main>
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
