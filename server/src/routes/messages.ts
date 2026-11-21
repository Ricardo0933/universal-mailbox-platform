import { Router } from 'express';
import { db, recordAudit } from '../db';
import { requireAuth } from '../lib/auth';
import { hasMailReadPermission } from '../services/accounts';

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

/**
 * Unified inbox across every mailbox whose owner granted mail-read permission.
 * Mailboxes without that grant are excluded rather than shown empty.
 */
messagesRouter.get('/', (req, res) => {
  const { accountId, q, unread } = req.query as Record<string, string | undefined>;
  const limit = Math.min(Number(req.query.limit ?? 50), 200);

  const allowed = (db.prepare('SELECT id FROM connected_accounts').all() as any[])
    .map((r) => r.id as number)
    .filter((id) => hasMailReadPermission(id));

  if (allowed.length === 0) {
    res.json({ messages: [], note: 'No mailbox has granted message-reading permission yet.' });
    return;
  }

  const where: string[] = [`m.account_id IN (${allowed.map(() => '?').join(',')})`];
  const params: any[] = [...allowed];

  if (accountId) {
    where.push('m.account_id = ?');
    params.push(Number(accountId));
  }
  if (q) {
    where.push('(m.subject LIKE ? OR m.from_address LIKE ? OR m.snippet LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (unread === 'true') where.push('m.is_read = 0');

  const rows = db
    .prepare(
      `SELECT m.*, a.email_address AS mailbox, a.provider
         FROM messages m JOIN connected_accounts a ON a.id = m.account_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.received_at DESC
        LIMIT ?`,
    )
    .all(...params, limit) as any[];

  recordAudit({
    actor: req.user!.email,
    actorUserId: req.user!.id,
    action: 'mailbox.messages_listed',
    detail: `${rows.length} message(s)${accountId ? ` for account ${accountId}` : ' across unified inbox'}`,
    ip: req.ip,
  });

  res.json({
    messages: rows.map((m) => ({
      id: m.id,
      accountId: m.account_id,
      mailbox: m.mailbox,
      provider: m.provider,
      subject: m.subject,
      fromName: m.from_name,
      fromAddress: m.from_address,
      snippet: m.snippet,
      receivedAt: m.received_at,
      isRead: Boolean(m.is_read),
      hasAttachments: Boolean(m.has_attachments),
    })),
  });
});

messagesRouter.get('/:id', (req, res) => {
  const row = db
    .prepare(
      `SELECT m.*, a.email_address AS mailbox, a.provider
         FROM messages m JOIN connected_accounts a ON a.id = m.account_id
        WHERE m.id = ?`,
    )
    .get(Number(req.params.id)) as any;

  if (!row) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }
  if (!hasMailReadPermission(row.account_id)) {
    res.status(403).json({
      error: 'The owner of this mailbox has not granted message-reading permission.',
    });
    return;
  }

  const attachments = db
    .prepare('SELECT id, filename, mime_type, size_bytes FROM attachments WHERE message_id = ?')
    .all(row.id);

  recordAudit({
    actor: req.user!.email,
    actorUserId: req.user!.id,
    action: 'mailbox.message_read',
    accountId: row.account_id,
    target: String(row.id),
    detail: row.subject,
    ip: req.ip,
  });

  res.json({
    message: {
      id: row.id,
      accountId: row.account_id,
      mailbox: row.mailbox,
      provider: row.provider,
      subject: row.subject,
      fromName: row.from_name,
      fromAddress: row.from_address,
      toAddresses: row.to_addresses,
      ccAddresses: row.cc_addresses,
      snippet: row.snippet,
      receivedAt: row.received_at,
      isRead: Boolean(row.is_read),
      hasAttachments: Boolean(row.has_attachments),
      attachments,
    },
  });
});
