import { Router } from 'express';
import { db, recordAudit } from '../db';
import { requireAdmin, requireAuth } from '../lib/auth';
import {
  disconnectAccount,
  grantedScopes,
  hasMailReadPermission,
  revokeAccount,
  syncAccount,
} from '../services/accounts';

export const accountsRouter = Router();
accountsRouter.use(requireAuth);

/** Connected mailboxes, with provider filtering and search. */
accountsRouter.get('/', (req, res) => {
  const { provider, status, q } = req.query as Record<string, string | undefined>;

  const where: string[] = [];
  const params: any[] = [];
  if (provider) {
    where.push('a.provider_key = ?');
    params.push(provider);
  }
  if (status) {
    where.push('a.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(a.email_address LIKE ? OR a.display_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const rows = db
    .prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM messages m WHERE m.account_id = a.id) AS message_count,
              (SELECT COUNT(*) FROM messages m WHERE m.account_id = a.id AND m.is_read = 0) AS unread_count
         FROM connected_accounts a
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY a.updated_at DESC`,
    )
    .all(...params) as any[];

  res.json({
    accounts: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      providerKey: r.provider_key,
      emailAddress: r.email_address,
      displayName: r.display_name,
      status: r.status,
      statusDetail: r.status_detail,
      authorizedAt: r.authorized_at,
      lastSyncedAt: r.last_synced_at,
      messageCount: r.message_count,
      unreadCount: r.unread_count,
      grantedScopes: grantedScopes(r.id),
      canReadMail: hasMailReadPermission(r.id),
    })),
  });
});

/** Aggregate statistics for the dashboard header. */
accountsRouter.get('/stats', (_req, res) => {
  const total = (db.prepare('SELECT COUNT(*) AS n FROM connected_accounts').get() as any).n;
  const connected = (
    db.prepare(`SELECT COUNT(*) AS n FROM connected_accounts WHERE status = 'connected'`).get() as any
  ).n;
  const messages = (db.prepare('SELECT COUNT(*) AS n FROM messages').get() as any).n;
  const unread = (db.prepare('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0').get() as any).n;
  const byProvider = db
    .prepare('SELECT provider, provider_key, COUNT(*) AS n FROM connected_accounts GROUP BY provider_key')
    .all() as any[];

  res.json({
    totalAccounts: total,
    connectedAccounts: connected,
    totalMessages: messages,
    unreadMessages: unread,
    byProvider: byProvider.map((r) => ({ provider: r.provider, providerKey: r.provider_key, count: r.n })),
  });
});

accountsRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const account = db.prepare('SELECT * FROM connected_accounts WHERE id = ?').get(id) as any;
  if (!account) {
    res.status(404).json({ error: 'Mailbox not found' });
    return;
  }
  const syncs = db
    .prepare('SELECT * FROM synchronization_logs WHERE account_id = ? ORDER BY started_at DESC LIMIT 10')
    .all(id);
  const permissions = db.prepare('SELECT scope, granted, granted_at, revoked_at FROM mailbox_permissions WHERE account_id = ?').all(id);

  res.json({
    account: {
      id: account.id,
      provider: account.provider,
      providerKey: account.provider_key,
      emailAddress: account.email_address,
      displayName: account.display_name,
      status: account.status,
      statusDetail: account.status_detail,
      authorizedAt: account.authorized_at,
      lastSyncedAt: account.last_synced_at,
      canReadMail: hasMailReadPermission(id),
    },
    permissions,
    synchronizationLogs: syncs,
  });
});

accountsRouter.post('/:id/sync', async (req, res) => {
  try {
    const result = await syncAccount(Number(req.params.id), { actor: req.user!.email });
    res.json({ ok: true, synced: result.synced });
  } catch (err: any) {
    res.status(400).json({ error: String(err.message ?? err) });
  }
});

accountsRouter.post('/:id/revoke', requireAdmin, async (req, res) => {
  try {
    await revokeAccount(Number(req.params.id), req.user!.email);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: String(err.message ?? err) });
  }
});

accountsRouter.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await disconnectAccount(Number(req.params.id), req.user!.email);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: String(err.message ?? err) });
  }
});

/** Audit trail of mailbox access and management actions. */
accountsRouter.get('/audit/all', requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const rows = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit);
  res.json({ auditLogs: rows });
});
