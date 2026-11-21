import { Link, useSearchParams } from 'react-router-dom';
import { Banner, ThemeToggle } from '../components/ui';

/** Result screen the provider's callback redirects to. */
export default function ConnectedPage() {
  const [params] = useSearchParams();
  const status = params.get('status');
  const email = params.get('email');
  const provider = params.get('provider');
  const message = params.get('message');

  const success = status === 'success';
  const denied = status === 'denied';

  return (
    <div className="center-page">
      <div className="center-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <ThemeToggle />
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
              display: 'grid', placeItems: 'center', fontSize: 28,
              background: success ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: success ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {success ? '✓' : '!'}
          </div>

          <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>
            {success ? 'Connection Successful' : denied ? 'Authorization Cancelled' : 'Connection Failed'}
          </h1>

          {success ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                <strong>{email}</strong> was authorized and now appears in the dashboard.
              </p>
              <Banner kind="success">
                Only the permissions you granted on {provider ?? 'your provider'}'s consent screen are
                in effect. You can revoke them at any time from your provider's account settings.
              </Banner>
            </>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                {denied
                  ? 'No account was connected because the authorization was not granted.'
                  : 'The mailbox was not connected.'}
              </p>
              {message ? <Banner kind="error">{message}</Banner> : null}
            </>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <Link className="btn btn-outline" to="/connect">
              Connect another account
            </Link>
            <Link className="btn btn-primary" to="/dashboard">
              Open dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
