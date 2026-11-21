import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ProviderCard } from '../api';
import { ProviderGrid } from '../components/ProviderGrid';
import { Banner, Spinner, ThemeToggle } from '../components/ui';

const GENERIC_DISCLOSURE =
  'You will be taken to your email provider\'s own sign-in and consent screen. ' +
  'This platform never sees your password. You choose which permissions to grant, ' +
  'and you can revoke them at any time from your provider account settings.';

/**
 * The universal connection page. Served both at /connect and at /connect/:token
 * for a shared link; a shared link also shows who will be able to read the mail.
 */
export default function ConnectPage() {
  const { token } = useParams<{ token?: string }>();
  const [providers, setProviders] = useState<ProviderCard[] | null>(null);
  const [disclosure, setDisclosure] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (token) {
          const res = await api.link(token);
          setProviders(res.providers);
          setDisclosure(res.link.disclosure);
          setLabel(res.link.label);
        } else {
          const res = await api.providers();
          setProviders(res.providers);
        }
      } catch (err: any) {
        setError(err.message ?? 'Could not load this connection page');
      }
    })();
  }, [token]);

  return (
    <div className="center-page">
      <div className="connect-page">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <ThemeToggle />
        </div>

        <div className="connect-head">
          <h1>Connect Your Email Account</h1>
          <p className="muted">
            {label
              ? label
              : 'Choose your email provider to authorize access through its official sign-in.'}
          </p>
        </div>

        {error ? <Banner kind="error">{error}</Banner> : null}

        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 8 }}>Before you continue</h3>
          <div className="disclosure">
            {disclosure ?? GENERIC_DISCLOSURE}
            <ul>
              <li>You sign in on your provider's official page, never on this site.</li>
              <li>This platform never asks for or stores your email password.</li>
              <li>Your account is only registered after you explicitly authorize it.</li>
              <li>You can disconnect or revoke access whenever you want.</li>
            </ul>
          </div>
        </div>

        {providers === null && !error ? (
          <Spinner label="Loading providers…" />
        ) : providers ? (
          <ProviderGrid providers={providers} linkToken={token} />
        ) : null}
      </div>
    </div>
  );
}
