import { Router } from 'express';
import { z } from 'zod';
import { callbackFamily, config, redirectUri } from '../config';
import { db, recordAudit } from '../db';
import { createPkcePair, randomToken } from '../lib/crypto';
import { describeProviders, getProvider, isProviderConfigured } from '../oauth';
import {
  recordGrantedPermissions,
  setStatus,
  storeTokens,
  syncAccount,
} from '../services/accounts';

export const connectRouter = Router();

const STATE_TTL_MINUTES = 10;

/** Provider cards for the connection page. */
connectRouter.get('/providers', (_req, res) => {
  res.json({ providers: describeProviders() });
});

/**
 * Resolves a shareable connection link and returns what the owner is consenting
 * to, so the disclosure can be shown before any authorization begins.
 */
connectRouter.get('/links/:token', (req, res) => {
  const link = db
    .prepare('SELECT * FROM connection_links WHERE token = ?')
    .get(req.params.token) as any;

  if (!link || link.revoked_at) {
    res.status(404).json({ error: 'This connection link is no longer valid.' });
    return;
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: 'This connection link has expired.' });
    return;
  }
  if (link.max_uses !== null && link.use_count >= link.max_uses) {
    res.status(410).json({ error: 'This connection link has already been used.' });
    return;
  }
  res.json({
    link: {
      token: link.token,
      label: link.label,
      disclosure: link.disclosure,
    },
    providers: describeProviders(),
  });
});

const startSchema = z.object({
  provider: z.string().min(1),
  linkToken: z.string().optional(),
  loginHint: z.string().email().optional(),
});

/**
 * Step 3 of the workflow: begin the provider's own OAuth authorization flow.
 * Returns the provider's official authorization URL; the platform never renders
 * or imitates a provider sign-in page.
 */
connectRouter.post('/start', (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'A provider is required' });
    return;
  }

  const provider = getProvider(parsed.data.provider);
  if (!provider) {
    res.status(404).json({ error: 'Unknown provider' });
    return;
  }
  if (!provider.implemented) {
    res.status(409).json({
      error: 'Provider not available',
      detail: (provider as any).unavailableReason ?? 'This provider is not yet supported.',
    });
    return;
  }
  if (!isProviderConfigured(provider)) {
    res.status(409).json({
      error: 'Provider not configured',
      detail: `${provider.displayName} has no OAuth client credentials configured on the server.`,
    });
    return;
  }

  let linkId: number | null = null;
  if (parsed.data.linkToken) {
    const link = db
      .prepare('SELECT * FROM connection_links WHERE token = ?')
      .get(parsed.data.linkToken) as any;
    if (!link || link.revoked_at) {
      res.status(404).json({ error: 'This connection link is no longer valid.' });
      return;
    }
    linkId = link.id;
  }

  const state = randomToken(32);
  const { verifier, challenge } = createPkcePair();
  const uri = redirectUri(provider.key);

  db.prepare(
    `INSERT INTO oauth_authorization_states
       (state, provider_key, code_verifier, redirect_uri, requested_scopes, connection_link_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    state,
    provider.key,
    verifier,
    uri,
    provider.scopes.join(' '),
    linkId,
    new Date(Date.now() + STATE_TTL_MINUTES * 60_000).toISOString(),
  );

  const authorizationUrl = provider.buildAuthorizationUrl({
    state,
    codeChallenge: challenge,
    redirectUri: uri,
    loginHint: parsed.data.loginHint,
  });

  recordAudit({
    actor: 'mailbox-owner',
    action: 'authorization.started',
    target: provider.key,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ authorizationUrl, provider: provider.key });
});

function resultRedirect(params: Record<string, string>): string {
  return `${config.appUrl}/connected?${new URLSearchParams(params).toString()}`;
}

/**
 * Step 6-11: handle the provider's callback. The mailbox is only ever marked
 * connected after the code exchange, state/PKCE validation and profile lookup
 * all succeed.
 */
connectRouter.get('/oauth/:providerKey/callback', async (req, res) => {
  const providerKey = req.params.providerKey;
  const { code, state, error, error_description: errorDescription } = req.query as Record<string, string>;

  if (error) {
    recordAudit({
      actor: 'mailbox-owner',
      action: 'authorization.denied',
      target: providerKey,
      detail: errorDescription ?? error,
      ip: req.ip,
    });
    res.redirect(resultRedirect({ status: 'denied', provider: providerKey, message: errorDescription ?? error }));
    return;
  }

  if (!code || !state) {
    res.redirect(resultRedirect({ status: 'error', provider: providerKey, message: 'Missing authorization code or state' }));
    return;
  }

  // CSRF protection: the state must exist, match this provider, be unused and unexpired.
  const stateRow = db
    .prepare('SELECT * FROM oauth_authorization_states WHERE state = ?')
    .get(state) as any;

  if (!stateRow || callbackFamily(stateRow.provider_key) !== providerKey || stateRow.consumed_at) {
    recordAudit({ actor: 'mailbox-owner', action: 'authorization.state_rejected', target: providerKey, ip: req.ip });
    res.redirect(resultRedirect({ status: 'error', provider: providerKey, message: 'Invalid or already-used authorization state' }));
    return;
  }
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    res.redirect(resultRedirect({ status: 'error', provider: providerKey, message: 'Authorization request expired; please try again' }));
    return;
  }
  db.prepare(`UPDATE oauth_authorization_states SET consumed_at = datetime('now') WHERE id = ?`).run(stateRow.id);

  const provider = getProvider(stateRow.provider_key);
  if (!provider) {
    res.redirect(resultRedirect({ status: 'error', provider: providerKey, message: 'Unknown provider' }));
    return;
  }

  try {
    const tokens = await provider.exchangeCode({
      code,
      codeVerifier: stateRow.code_verifier,
      redirectUri: stateRow.redirect_uri,
    });
    const profile = await provider.fetchProfile(tokens.accessToken);

    const requestedScopes: string[] = String(stateRow.requested_scopes).split(' ').filter(Boolean);

    const accountId = db.transaction(() => {
      db.prepare(
        `INSERT INTO connected_accounts
           (provider, provider_key, provider_account_id, email_address, display_name, status, authorized_at, connection_link_id, updated_at)
         VALUES (?, ?, ?, ?, ?, 'authorization_successful', datetime('now'), ?, datetime('now'))
         ON CONFLICT(provider_key, email_address) DO UPDATE SET
           provider_account_id = excluded.provider_account_id,
           display_name = excluded.display_name,
           status = 'authorization_successful',
           status_detail = NULL,
           authorized_at = datetime('now'),
           connection_link_id = COALESCE(excluded.connection_link_id, connected_accounts.connection_link_id),
           updated_at = datetime('now')`,
      ).run(
        provider.displayName,
        provider.key,
        profile.providerAccountId,
        profile.emailAddress,
        profile.displayName ?? null,
        stateRow.connection_link_id,
      );

      const row = db
        .prepare('SELECT id FROM connected_accounts WHERE provider_key = ? AND email_address = ?')
        .get(provider.key, profile.emailAddress) as { id: number };

      storeTokens(row.id, tokens);
      recordGrantedPermissions(row.id, requestedScopes, tokens.grantedScopes);

      if (stateRow.connection_link_id) {
        db.prepare('UPDATE connection_links SET use_count = use_count + 1 WHERE id = ?').run(
          stateRow.connection_link_id,
        );
      }
      return row.id;
    })();

    setStatus(accountId, 'connected');
    recordAudit({
      actor: profile.emailAddress,
      action: 'authorization.succeeded',
      accountId,
      target: provider.key,
      detail: `Granted: ${(tokens.grantedScopes ?? []).join(' ') || 'none reported'}`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Best-effort first synchronization; a failure here must not undo the connection.
    syncAccount(accountId, { actor: profile.emailAddress }).catch(() => undefined);

    res.redirect(
      resultRedirect({
        status: 'success',
        provider: provider.key,
        email: profile.emailAddress,
        account: String(accountId),
      }),
    );
  } catch (err: any) {
    recordAudit({
      actor: 'mailbox-owner',
      action: 'authorization.failed',
      target: providerKey,
      detail: String(err.message ?? err),
      ip: req.ip,
    });
    res.redirect(
      resultRedirect({ status: 'error', provider: providerKey, message: String(err.message ?? err) }),
    );
  }
});
