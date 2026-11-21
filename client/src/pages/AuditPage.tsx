import { useEffect, useState } from 'react';
import { api } from '../api';
import { Banner, formatDate, Spinner } from '../components/ui';

export default function AuditPage() {
  const [logs, setLogs] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .auditLogs()
      .then((r) => setLogs(r.auditLogs))
      .catch((err) => setError(err.message ?? 'Could not load the audit log'));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit Log</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Authorizations, mailbox access, synchronizations and revocations.
          </p>
        </div>
      </div>

      {error ? <Banner kind="error">{error}</Banner> : null}

      <div className="card" style={{ padding: 0 }}>
        {logs === null && !error ? (
          <Spinner label="Loading audit log…" />
        ) : logs && logs.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="small">{formatDate(l.created_at)}</td>
                    <td className="small">{l.actor ?? '—'}</td>
                    <td className="small mono">{l.action}</td>
                    <td className="small">{l.target ?? (l.account_id ? `account ${l.account_id}` : '—')}</td>
                    <td className="small muted">{l.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No audit entries yet.</div>
        )}
      </div>
    </>
  );
}
