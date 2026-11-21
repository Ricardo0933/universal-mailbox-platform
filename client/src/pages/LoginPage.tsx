import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Banner, ThemeToggle } from '../components/ui';

export default function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      onSignedIn();
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-page">
      <div className="center-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <ThemeToggle />
        </div>
        <form className="card" onSubmit={submit}>
          <div className="brand" style={{ marginBottom: 18 }}>
            <span className="brand-mark">UM</span>
            <span>Universal Mailbox Platform</span>
          </div>
          <h1 style={{ fontSize: '1.3rem', marginBottom: 6 }}>Administrator sign-in</h1>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 18 }}>
            Dashboard access is restricted to platform administrators.
          </p>

          {error ? <Banner kind="error">{error}</Banner> : null}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email" className="input" type="email" value={email} autoComplete="username"
              onChange={(e) => setEmail(e.target.value)} required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password" className="input" type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)} required
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
