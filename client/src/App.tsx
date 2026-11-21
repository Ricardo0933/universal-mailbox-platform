import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import { Spinner, ThemeToggle, useTheme } from './components/ui';
import AuditPage from './pages/AuditPage';
import ConnectPage from './pages/ConnectPage';
import ConnectedPage from './pages/ConnectedPage';
import DashboardPage from './pages/DashboardPage';
import InboxPage from './pages/InboxPage';
import LinksPage from './pages/LinksPage';
import LoginPage from './pages/LoginPage';

interface User {
  id: number;
  email: string;
  role: string;
}

function AdminShell({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const navigate = useNavigate();

  async function signOut() {
    await api.logout().catch(() => undefined);
    onSignedOut();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">UM</span>
          <span>Mailbox Platform</span>
        </div>
        <nav className="nav">
          <NavLink to="/dashboard">Connected Mailboxes</NavLink>
          <NavLink to="/inbox">Unified Inbox</NavLink>
          <NavLink to="/links">Connection Links</NavLink>
          <NavLink to="/audit">Audit Log</NavLink>
          <NavLink to="/connect">Connection Page</NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="small muted">
            Signed in as<br />
            <strong>{user.email}</strong>
          </div>
          <ThemeToggle />
          <button className="btn btn-outline btn-sm" onClick={signOut} type="button">Sign out</button>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/links" element={<LinksPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useTheme();

  async function refreshUser() {
    try {
      const res = await api.me();
      setUser(res.user as User);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshUser();
  }, []);

  if (loading) {
    return (
      <div className="center-page">
        <Spinner label="Loading…" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Public: the connection page and its result screen never require a sign-in,
          since the mailbox owner authorizing an account is not a platform user. */}
      <Route path="/connect" element={<ConnectPage />} />
      <Route path="/connect/:token" element={<ConnectPage />} />
      <Route path="/connected" element={<ConnectedPage />} />
      <Route path="/login" element={<LoginPage onSignedIn={refreshUser} />} />
      <Route
        path="*"
        element={
          user ? (
            <AdminShell user={user} onSignedOut={() => setUser(null)} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
