import { NavLink, Route, Routes } from 'react-router-dom';
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

export default function App() {
  return (
    <>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trees" element={<Trees />} />
          <Route path="/trees/:id" element={<TreeDetail />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/harvests" element={<Harvests />} />
          <Route path="/oil" element={<Oil />} />
          <Route path="/calendar" element={<CalendarPage />} />
        </Routes>
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
