import { useState } from 'react';
import { api, ProviderCard } from '../api';
import { Banner, ProviderIcon } from './ui';

/**
 * Provider selection cards. Choosing one starts the provider's own OAuth
 * authorization flow by navigating to the URL the server built; the platform
 * never renders a provider sign-in form itself.
 */
export function ProviderGrid({
  providers,
  linkToken,
}: {
  providers: ProviderCard[];
  linkToken?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect(provider: ProviderCard) {
    setError(null);
    setBusy(provider.key);
    try {
      const { authorizationUrl } = await api.startConnection(provider.key, linkToken);
      // Hand off to the provider's official consent screen.
      window.location.href = authorizationUrl;
    } catch (err: any) {
      setError(err.message ?? 'Could not start the authorization flow');
      setBusy(null);
    }
  }

  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <div className="provider-grid">
        {providers.map((p) => {
          const available = p.implemented && p.configured;
          const reason = !p.implemented
            ? p.unavailableReason
            : !p.configured
              ? `${p.displayName} has no OAuth credentials configured on this server yet.`
              : null;
          return (
            <div key={p.key} className={`provider-card${available ? '' : ' unavailable'}`}>
              <ProviderIcon provider={p} />
              <div>
                <div className="provider-name">{p.displayName}</div>
                <div className="muted small">{p.branding.description}</div>
              </div>
              <button
                className={`btn btn-block ${available ? 'btn-primary' : 'btn-outline'}`}
                disabled={!available || busy === p.key}
                onClick={() => connect(p)}
                type="button"
                title={reason ?? undefined}
              >
                {busy === p.key
                  ? 'Redirecting…'
                  : available
                    ? `Connect ${p.displayName}`
                    : 'Not yet available'}
              </button>
              {reason ? <div className="muted small">{reason}</div> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
