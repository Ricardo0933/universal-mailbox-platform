import { db, recordAudit } from '../db';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { getProvider, ProviderAdapter, TokenSet } from '../oauth';

export type AccountStatus =
  | 'pending_authorization'
  | 'authorization_successful'
  | 'connected'
  | 'synchronizing'
  | 'synchronization_error'
  | 'permission_revoked'
  | 'disconnected';

export interface AccountRow {
  id: number;
  provider: string;
  provider_key: string;
  provider_account_id: string | null;
  email_address: string;
  display_name: string | null;
  status: AccountStatus;
  status_detail: string | null;
  authorized_at: string | null;
  last_synced_at: string | null;
  connection_link_id: number | null;
  created_at: string;
  updated_at: string;
}

export function setStatus(accountId: number, status: AccountStatus, detail?: string | null): void {
  db.prepare(
    `UPDATE connected_accounts SET status = ?, status_detail = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(status, detail ?? null, accountId);
}

export function storeTokens(accountId: number, tokens: TokenSet): void {
  db.prepare(
    `INSERT INTO oauth_tokens (account_id, access_token_encrypted, refresh_token_encrypted, token_type, scope, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(account_id) DO UPDATE SET
       access_token_encrypted = excluded.access_token_encrypted,
       refresh_token_encrypted = COALESCE(excluded.refresh_token_encrypted, oauth_tokens.refresh_token_encrypted),
       token_type = excluded.token_type,
       scope = excluded.scope,
       expires_at = excluded.expires_at,
       updated_at = datetime('now')`,
  ).run(
    accountId,
    encryptSecret(tokens.accessToken),
    tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    tokens.tokenType ?? null,
    (tokens.grantedScopes ?? []).join(' ') || null,
    tokens.expiresAt ? tokens.expiresAt.toISOString() : null,
  );
}

/**
 * Records exactly which scopes the provider granted. A successful sign-in does
 * not imply mailbox access, so requested-but-not-granted scopes are stored with
 * granted = 0 and the dashboard refuses to read mail without the mail scope.
 */
export function recordGrantedPermissions(
  accountId: number,
  requested: string[],
  granted: string[] | null | undefined,
): void {
  const grantedSet = new Set((granted ?? []).map((s) => s.toLowerCase()));
  const insert = db.prepare(
    `INSERT INTO mailbox_permissions (account_id, scope, granted, granted_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id, scope) DO UPDATE SET
       granted = excluded.granted,
       granted_at = excluded.granted_at`,
  );
  const scopes = new Set([...requested, ...(granted ?? [])]);
  db.transaction(() => {
    for (const scope of scopes) {
      // When a provider does not report granted scopes, trust only what it returned.
      const isGranted = grantedSet.size > 0 ? grantedSet.has(scope.toLowerCase()) : false;
      insert.run(accountId, scope, isGranted ? 1 : 0, isGranted ? new Date().toISOString() : null);
    }
  })();
}

export function grantedScopes(accountId: number): string[] {
  return db
    .prepare('SELECT scope FROM mailbox_permissions WHERE account_id = ? AND granted = 1')
    .all(accountId)
    .map((r: any) => r.scope as string);
}

/** True when the owner granted a scope that actually permits reading messages. */
export function hasMailReadPermission(accountId: number): boolean {
  return grantedScopes(accountId).some(
    (s) => s.toLowerCase().includes('gmail.readonly') || s.toLowerCase().includes('mail.read'),
  );
}

export function getAccount(accountId: number): AccountRow | undefined {
  return db.prepare('SELECT * FROM connected_accounts WHERE id = ?').get(accountId) as
    | AccountRow
    | undefined;
}

async function validAccessToken(account: AccountRow): Promise<string> {
  const row = db.prepare('SELECT * FROM oauth_tokens WHERE account_id = ?').get(account.id) as any;
  if (!row) throw new Error('No stored authorization for this mailbox');

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
  const stillValid = !expiresAt || expiresAt - Date.now() > 60_000;
  if (stillValid) return decryptSecret(row.access_token_encrypted);

  const provider = getProvider(account.provider_key);
  if (!provider?.refresh || !row.refresh_token_encrypted) {
    setStatus(account.id, 'permission_revoked', 'Authorization expired and cannot be refreshed');
    throw new Error('Authorization expired; the account owner must reconnect');
  }
  const refreshed = await provider.refresh(decryptSecret(row.refresh_token_encrypted));
  storeTokens(account.id, refreshed);
  return refreshed.accessToken;
}

/** Pulls the latest messages for an account the owner has authorized for mail reading. */
export async function syncAccount(
  accountId: number,
  options: { limit?: number; actor?: string } = {},
): Promise<{ synced: number }> {
  const account = getAccount(accountId);
  if (!account) throw new Error('Mailbox not found');
  if (account.status === 'disconnected') throw new Error('Mailbox is disconnected');

  const provider = getProvider(account.provider_key);
  if (!provider?.listMessages) {
    throw new Error(`${account.provider} does not support reading messages`);
  }
  if (!hasMailReadPermission(accountId)) {
    throw new Error(
      'The account owner has not granted mailbox-reading permission for this mailbox',
    );
  }

  const logId = db
    .prepare(`INSERT INTO synchronization_logs (account_id, status) VALUES (?, 'running')`)
    .run(accountId).lastInsertRowid as number;

  setStatus(accountId, 'synchronizing');
  try {
    const token = await validAccessToken(account);
    const messages = await provider.listMessages(token, options.limit ?? 25);

    const insertMessage = db.prepare(
      `INSERT INTO messages (account_id, provider_message_id, thread_id, subject, from_name, from_address,
         to_addresses, cc_addresses, snippet, received_at, is_read, has_attachments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, provider_message_id) DO UPDATE SET
         subject = excluded.subject,
         snippet = excluded.snippet,
         is_read = excluded.is_read,
         has_attachments = excluded.has_attachments`,
    );
    const insertAttachment = db.prepare(
      `INSERT INTO attachments (message_id, provider_attachment_id, filename, mime_type, size_bytes)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const messageId = db.prepare(
      'SELECT id FROM messages WHERE account_id = ? AND provider_message_id = ?',
    );

    db.transaction(() => {
      for (const m of messages) {
        insertMessage.run(
          accountId,
          m.providerMessageId,
          m.threadId ?? null,
          m.subject ?? null,
          m.fromName ?? null,
          m.fromAddress ?? null,
          m.toAddresses ?? null,
          m.ccAddresses ?? null,
          m.snippet ?? null,
          m.receivedAt ?? null,
          m.isRead ? 1 : 0,
          m.hasAttachments ? 1 : 0,
        );
        const row = messageId.get(accountId, m.providerMessageId) as { id: number };
        db.prepare('DELETE FROM attachments WHERE message_id = ?').run(row.id);
        for (const a of m.attachments ?? []) {
          insertAttachment.run(
            row.id,
            a.providerAttachmentId ?? null,
            a.filename ?? null,
            a.mimeType ?? null,
            a.sizeBytes ?? null,
          );
        }
      }
    })();

    db.prepare(
      `UPDATE synchronization_logs SET finished_at = datetime('now'), status = 'success', messages_synced = ? WHERE id = ?`,
    ).run(messages.length, logId);
    db.prepare(`UPDATE connected_accounts SET last_synced_at = datetime('now') WHERE id = ?`).run(accountId);
    setStatus(accountId, 'connected');

    recordAudit({
      actor: options.actor ?? 'system',
      action: 'mailbox.sync',
      accountId,
      detail: `Synchronized ${messages.length} message(s)`,
    });
    return { synced: messages.length };
  } catch (err: any) {
    db.prepare(
      `UPDATE synchronization_logs SET finished_at = datetime('now'), status = 'error', error_message = ? WHERE id = ?`,
    ).run(String(err.message ?? err), logId);
    setStatus(accountId, 'synchronization_error', String(err.message ?? err));
    recordAudit({
      actor: options.actor ?? 'system',
      action: 'mailbox.sync_failed',
      accountId,
      detail: String(err.message ?? err),
    });
    throw err;
  }
}

/** Revokes the stored authorization at the provider, then locally. */
export async function revokeAccount(accountId: number, actor: string): Promise<void> {
  const account = getAccount(accountId);
  if (!account) throw new Error('Mailbox not found');
  const provider: ProviderAdapter | undefined = getProvider(account.provider_key);
  const row = db.prepare('SELECT * FROM oauth_tokens WHERE account_id = ?').get(accountId) as any;

  if (provider?.revoke && row) {
    try {
      const token = row.refresh_token_encrypted
        ? decryptSecret(row.refresh_token_encrypted)
        : decryptSecret(row.access_token_encrypted);
      await provider.revoke(token);
    } catch {
      // Provider-side revocation is best effort; local credentials are destroyed regardless.
    }
  }

  db.transaction(() => {
    db.prepare('DELETE FROM oauth_tokens WHERE account_id = ?').run(accountId);
    db.prepare(`UPDATE mailbox_permissions SET granted = 0, revoked_at = datetime('now') WHERE account_id = ?`).run(accountId);
    setStatus(accountId, 'permission_revoked', 'Authorization revoked');
  })();

  recordAudit({ actor, action: 'mailbox.revoke', accountId, detail: account.email_address });
}

/** Disconnects a mailbox: revokes authorization and removes cached message content. */
export async function disconnectAccount(accountId: number, actor: string): Promise<void> {
  const account = getAccount(accountId);
  if (!account) throw new Error('Mailbox not found');
  await revokeAccount(accountId, actor).catch(() => undefined);
  db.transaction(() => {
    db.prepare('DELETE FROM messages WHERE account_id = ?').run(accountId);
    setStatus(accountId, 'disconnected', 'Disconnected');
  })();
  recordAudit({ actor, action: 'mailbox.disconnect', accountId, detail: account.email_address });
}
