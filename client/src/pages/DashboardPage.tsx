import { useCallback, useEffect, useState } from 'react';
import { Account, api, ProviderCard, Stats } from '../api';
import { Banner, describeScope, formatDate, Spinner, StatusPill } from '../components/ui';

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [providers, setProviders] = useState<ProviderCard[]>([]);
  const [providerFilter, setProviderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        api.accounts({ provider: providerFilter, status: statusFilter, q: query }),
        api.stats(),
      ]);
      setAccounts(a.accounts);
      setStats(s);
    } catch (err: any) {
      setError(err.message ?? 'Could not load mailboxes');
    }
  }, [providerFilter, statusFilter, query]);

  useEffect(() => {
    api.providers().then((r) => setProviders(r.providers)).catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live-ish status indicators without a websocket: poll while the page is open.
  useEffect(() => {
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  async function act(
    id: number,
    action: 'sync' | 'revoke' | 'disconnect',
    confirmText?: string,
  ) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      if (action === 'sync') {
        const r = await api.sync(id);
        setNotice(`Synchronized ${r.synced} message(s).`);
      } else if (action === 'revoke') {
        await api.revoke(id);
        setNotice('Authorization revoked.');
      } else {
        await api.disconnect(id);
        setNotice('Mailbox disconnected and cached messages removed.');
      }
      await load();
    } catch (err: any) {
      setError(err.message ?? 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Connected Mailboxes</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Every mailbox whose owner completed the provider's authorization flow.
          </p>
        </div>
        <button className="btn btn-outline" onClick={load} type="button">Refresh</button>
      </div>

      {error ? <Banner kind="error">{error}</Banner> : null}
      {notice ? <Banner kind="success">{notice}</Banner> : null}

      <div className="stat-grid">
        <div className="card">
          <div className="stat-label">Total accounts</div>
          <div className="stat-value">{stats?.totalAccounts ?? '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Connected</div>
          <div className="stat-value">{stats?.connectedAccounts ?? '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Messages synced</div>
          <div className="stat-value">{stats?.totalMessages ?? '—'}</div>
        </div>
        <div className="card">
          <div className="stat-label">Unread</div>
          <div className="stat-value">{stats?.unreadMessages ?? '—'}</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input" placeholder="Search email or name" value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="select" value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
          <option value="">All providers</option>
          {providers.map((p) => (
            <option key={p.key} value={p.key}>{p.displayName}</option>
          ))}
        </select>
        <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="connected">Connected</option>
          <option value="pending_authorization">Pending Authorization</option>
          <option value="synchronizing">Synchronizing</option>
          <option value="synchronization_error">Synchronization Error</option>
          <option value="permission_revoked">Permission Revoked</option>
          <option value="disconnected">Disconnected</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {accounts === null ? (
          <Spinner label="Loading mailboxes…" />
        ) : accounts.length === 0 ? (
          <div className="empty-state">
            <p style={{ marginBottom: 6 }}>No mailboxes are connected yet.</p>
            <p className="small">
              Share a connection link, or open the connection page, to authorize the first account.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email address</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Authorized</th>
                  <th>Last sync</th>
                  <th>Permissions</th>
                  <th>Messages</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 560 }}>{a.emailAddress}</div>
                      {a.displayName ? <div className="muted small">{a.displayName}</div> : null}
                    </td>
                    <td>{a.provider}</td>
                    <td>
                      <StatusPill status={a.status} />
                      {a.statusDetail ? <div className="muted small">{a.statusDetail}</div> : null}
                    </td>
                    <td className="small">{formatDate(a.authorizedAt)}</td>
                    <td className="small">{formatDate(a.lastSyncedAt)}</td>
                    <td className="small">
                      {a.grantedScopes.length === 0 ? (
                        <span className="muted">None reported</span>
                      ) : (
                        [...new Set(a.grantedScopes.map(describeScope))].join(', ')
                      )}
                      {!a.canReadMail ? (
                        <div className="muted small">No mail-read permission</div>
                      ) : null}
                    </td>
                    <td className="small">
                      {a.messageCount}
                      {a.unreadCount ? <span className="muted"> ({a.unreadCount} unread)</span> : null}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-sm btn-outline" disabled={busyId === a.id || !a.canReadMail}
                          onClick={() => act(a.id, 'sync')} type="button"
                          title={a.canReadMail ? 'Refresh synchronization' : 'Owner has not granted mail-read permission'}
                        >
                          Sync
                        </button>
                        <button
                          className="btn btn-sm btn-outline" disabled={busyId === a.id}
                          onClick={() => act(a.id, 'revoke', `Revoke authorization for ${a.emailAddress}?`)}
                          type="button"
                        >
                          Revoke
                        </button>
                        <button
                          className="btn btn-sm btn-danger" disabled={busyId === a.id}
                          onClick={() =>
                            act(a.id, 'disconnect', `Disconnect ${a.emailAddress} and delete its cached messages?`)
                          }
                          type="button"
                        >
                          Disconnect
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
