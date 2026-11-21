import { useEffect, useState } from 'react';
import { api, ConnectionLink } from '../api';
import { Banner, formatDate, Spinner } from '../components/ui';

const DEFAULT_DISCLOSURE =
  'By connecting your mailbox you allow the administrators of this platform to read the messages in it. ' +
  'You will see the exact permissions on your provider\'s own consent screen, and you can disconnect or ' +
  'revoke this access at any time from your provider account settings.';

/**
 * Shareable connection links. The disclosure is mandatory and shown to the
 * mailbox owner before they authorize, so nobody connects a mailbox without
 * knowing who will be able to read it.
 */
export default function LinksPage() {
  const [links, setLinks] = useState<ConnectionLink[] | null>(null);
  const [label, setLabel] = useState('');
  const [disclosure, setDisclosure] = useState(DEFAULT_DISCLOSURE);
  const [expiresInHours, setExpiresInHours] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await api.links();
      setLinks(res.links);
    } catch (err: any) {
      setError(err.message ?? 'Could not load connection links');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.createLink({
        label: label || undefined,
        disclosure,
        expiresInHours: expiresInHours ? Number(expiresInHours) : undefined,
        maxUses: maxUses ? Number(maxUses) : undefined,
      });
      setNotice(`Link created: ${res.link.url}`);
      setLabel('');
      await load();
    } catch (err: any) {
      setError(err.message ?? 'Could not create the link');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: number) {
    if (!window.confirm('Revoke this link? It will stop accepting new connections.')) return;
    try {
      await api.revokeLink(id);
      await load();
    } catch (err: any) {
      setError(err.message ?? 'Could not revoke the link');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Shareable Connection Links</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Send a link to someone so they can authorize their own mailbox.
          </p>
        </div>
      </div>

      {error ? <Banner kind="error">{error}</Banner> : null}
      {notice ? <Banner kind="success">{notice}</Banner> : null}

      <Banner kind="warning">
        Anyone who opens the link sees the disclosure below before signing in. Keep it accurate —
        connecting a mailbox without the owner understanding who can read it is not permitted.
      </Banner>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 12 }}>Create a link</h2>
        <form onSubmit={create}>
          <div className="field">
            <label htmlFor="label">Label (internal only)</label>
            <input
              id="label" className="input" value={label} placeholder="e.g. Support team mailboxes"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="disclosure">Disclosure shown to the mailbox owner</label>
            <textarea
              id="disclosure" className="textarea" value={disclosure} required
              onChange={(e) => setDisclosure(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="expires">Expires in (hours, optional)</label>
              <input
                id="expires" className="input" type="number" min="1" value={expiresInHours}
                onChange={(e) => setExpiresInHours(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="maxuses">Max uses (optional)</label>
              <input
                id="maxuses" className="input" type="number" min="1" value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
              />
            </div>
          </div>
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? 'Creating…' : 'Create link'}
          </button>
        </form>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {links === null ? (
          <Spinner label="Loading links…" />
        ) : links.length === 0 ? (
          <div className="empty-state">No connection links yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Link</th><th>Label</th><th>Uses</th><th>Connected</th>
                  <th>Expires</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id}>
                    <td style={{ maxWidth: 320 }}>
                      <div className="copy-row">
                        <span className="mono">{l.url}</span>
                        <button
                          className="btn btn-sm btn-outline" type="button"
                          onClick={() => navigator.clipboard?.writeText(l.url)}
                        >
                          Copy
                        </button>
                      </div>
                    </td>
                    <td>{l.label ?? '—'}</td>
                    <td className="small">{l.useCount}{l.maxUses ? ` / ${l.maxUses}` : ''}</td>
                    <td className="small">{l.accountsConnected}</td>
                    <td className="small">{formatDate(l.expiresAt)}</td>
                    <td>
                      <span className={`pill ${l.revokedAt ? 'pill-revoked' : 'pill-connected'}`}>
                        <span className="pill-dot" />
                        {l.revokedAt ? 'Revoked' : 'Active'}
                      </span>
                    </td>
                    <td>
                      {!l.revokedAt ? (
                        <button className="btn btn-sm btn-danger" onClick={() => revoke(l.id)} type="button">
                          Revoke
                        </button>
                      ) : null}
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
