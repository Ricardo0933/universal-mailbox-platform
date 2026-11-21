import { useCallback, useEffect, useState } from 'react';
import { Account, api, MessageSummary } from '../api';
import { Banner, formatDate, Spinner } from '../components/ui';

/**
 * Unified inbox. Only mailboxes whose owner granted a mail-read permission are
 * readable; every list and open is written to the audit log server-side.
 */
export default function InboxPage() {
  const [messages, setMessages] = useState<MessageSummary[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.messages({
        accountId: accountId ? Number(accountId) : undefined,
        q: query || undefined,
        unread: unreadOnly,
      });
      setMessages(res.messages);
      setNote(res.note ?? null);
    } catch (err: any) {
      setError(err.message ?? 'Could not load messages');
    }
  }, [accountId, query, unreadOnly]);

  useEffect(() => {
    api.accounts().then((r) => setAccounts(r.accounts.filter((a) => a.canReadMail))).catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function open(id: number) {
    setError(null);
    try {
      const res = await api.message(id);
      setSelected(res.message);
    } catch (err: any) {
      setError(err.message ?? 'Could not open this message');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Unified Inbox</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Messages from mailboxes whose owners granted read permission. Every access is audited.
          </p>
        </div>
        <button className="btn btn-outline" onClick={load} type="button">Refresh</button>
      </div>

      {error ? <Banner kind="error">{error}</Banner> : null}
      {note ? <Banner kind="info">{note}</Banner> : null}

      <div className="toolbar">
        <input
          className="input" placeholder="Search subject, sender or snippet"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
        <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">All mailboxes</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.emailAddress}</option>
          ))}
        </select>
        <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
      </div>

      <div className="inbox-layout">
        <div className="card" style={{ padding: 0 }}>
          {messages === null ? (
            <Spinner label="Loading messages…" />
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <p>No messages to show.</p>
              <p className="small">
                Connect a mailbox and grant read permission, then synchronize it.
              </p>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((m) => (
                <button
                  key={m.id} type="button"
                  className={`message-row${m.isRead ? '' : ' unread'}${selected?.id === m.id ? ' selected' : ''}`}
                  onClick={() => open(m.id)}
                >
                  <div className="message-top">
                    <strong>{m.fromName ?? m.fromAddress ?? 'Unknown sender'}</strong>
                    <span className="muted">{formatDate(m.receivedAt)}</span>
                  </div>
                  <div className="message-subject">{m.subject ?? '(no subject)'}</div>
                  <div className="message-snippet">{m.snippet ?? ''}</div>
                  <div className="muted small">
                    {m.mailbox}
                    {m.hasAttachments ? ' · has attachments' : ''}
                    {m.isRead ? '' : ' · unread'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          {!selected ? (
            <div className="empty-state">
              <p>Select a message to see its details.</p>
            </div>
          ) : (
            <>
              <h2 style={{ marginBottom: 12 }}>{selected.subject ?? '(no subject)'}</h2>
              <div className="detail-row">
                <span>Mailbox</span><span>{selected.mailbox}</span>
              </div>
              <div className="detail-row">
                <span>From</span>
                <span>
                  {selected.fromName ? `${selected.fromName} ` : ''}
                  {selected.fromAddress ? `<${selected.fromAddress}>` : '—'}
                </span>
              </div>
              <div className="detail-row"><span>To</span><span>{selected.toAddresses ?? '—'}</span></div>
              {selected.ccAddresses ? (
                <div className="detail-row"><span>Cc</span><span>{selected.ccAddresses}</span></div>
              ) : null}
              <div className="detail-row"><span>Received</span><span>{formatDate(selected.receivedAt)}</span></div>
              <div className="detail-row">
                <span>Status</span><span>{selected.isRead ? 'Read' : 'Unread'}</span>
              </div>
              {selected.attachments?.length ? (
                <div className="detail-row">
                  <span>Attachments</span>
                  <span>
                    {selected.attachments.map((a: any) => (
                      <div key={a.id}>
                        {a.filename ?? 'attachment'}{' '}
                        <span className="muted small">
                          {a.mime_type ?? ''}{a.size_bytes ? ` · ${Math.round(a.size_bytes / 1024)} KB` : ''}
                        </span>
                      </div>
                    ))}
                  </span>
                </div>
              ) : null}
              <div style={{ marginTop: 14 }}>
                <h3 style={{ marginBottom: 6 }}>Preview</h3>
                <p className="muted small" style={{ margin: 0, lineHeight: 1.6 }}>
                  {selected.snippet ?? 'No preview available.'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
