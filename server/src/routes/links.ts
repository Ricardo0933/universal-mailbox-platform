import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { db, recordAudit } from '../db';
import { randomToken } from '../lib/crypto';
import { requireAdmin, requireAuth } from '../lib/auth';

export const linksRouter = Router();
linksRouter.use(requireAuth);

const DEFAULT_DISCLOSURE =
  'By connecting your mailbox you allow the administrators of this platform to read the messages in it. ' +
  'You will see the exact permissions on your provider\'s own consent screen, and you can disconnect or ' +
  'revoke this access at any time from your provider account settings.';

const createSchema = z.object({
  label: z.string().max(200).optional(),
  disclosure: z.string().min(1).max(2000).optional(),
  maxUses: z.number().int().positive().optional(),
  expiresInHours: z.number().int().positive().max(24 * 365).optional(),
});

function publicLinkUrl(token: string): string {
  return `${config.appUrl}/connect/${token}`;
}

/**
 * Creates a shareable connection link. The disclosure text is stored with the
 * link and shown to the mailbox owner before authorization, so access is never
 * hidden from the person granting it.
 */
linksRouter.post('/', requireAdmin, (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid link options' });
    return;
  }
  const token = randomToken(24);
  const expiresAt = parsed.data.expiresInHours
    ? new Date(Date.now() + parsed.data.expiresInHours * 3600_000).toISOString()
    : null;

  const id = db
    .prepare(
      `INSERT INTO connection_links (token, label, created_by, disclosure, max_uses, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      token,
      parsed.data.label ?? null,
      req.user!.id,
      parsed.data.disclosure ?? DEFAULT_DISCLOSURE,
      parsed.data.maxUses ?? null,
      expiresAt,
    ).lastInsertRowid as number;

  recordAudit({
    actor: req.user!.email,
    actorUserId: req.user!.id,
    action: 'connection_link.created',
    target: token,
    detail: parsed.data.label ?? null,
    ip: req.ip,
  });

  res.status(201).json({ link: { id, token, url: publicLinkUrl(token), label: parsed.data.label ?? null } });
});

linksRouter.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT l.*, (SELECT COUNT(*) FROM connected_accounts a WHERE a.connection_link_id = l.id) AS accounts_connected
         FROM connection_links l ORDER BY l.created_at DESC`,
    )
    .all() as any[];

  res.json({
    links: rows.map((r) => ({
      id: r.id,
      token: r.token,
      url: publicLinkUrl(r.token),
      label: r.label,
      disclosure: r.disclosure,
      maxUses: r.max_uses,
      useCount: r.use_count,
      accountsConnected: r.accounts_connected,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      createdAt: r.created_at,
    })),
  });
});

linksRouter.post('/:id/revoke', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM connection_links WHERE id = ?').get(id) as any;
  if (!row) {
    res.status(404).json({ error: 'Connection link not found' });
    return;
  }
  db.prepare(`UPDATE connection_links SET revoked_at = datetime('now') WHERE id = ?`).run(id);
  recordAudit({
    actor: req.user!.email,
    actorUserId: req.user!.id,
    action: 'connection_link.revoked',
    target: row.token,
    ip: req.ip,
  });
  res.json({ ok: true });
});
