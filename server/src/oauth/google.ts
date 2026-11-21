import { config } from '../config';
import {
  AuthorizedProfile,
  NormalizedMessage,
  ProviderAdapter,
  ProviderNotConfiguredError,
  TokenSet,
} from './types';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
];

function headerValue(headers: any[], name: string): string | null {
  const found = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value ?? null;
}

function parseAddress(raw: string | null): { name: string | null; address: string | null } {
  if (!raw) return { name: null, address: null };
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].replace(/^"|"$/g, '') || null, address: match[2] };
  return { name: null, address: raw.trim() };
}

function collectAttachments(payload: any): NormalizedMessage['attachments'] {
  const out: NonNullable<NormalizedMessage['attachments']> = [];
  const walk = (part: any) => {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      out.push({
        providerAttachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? null,
        sizeBytes: part.body.size ?? null,
      });
    }
    (part.parts ?? []).forEach(walk);
  };
  walk(payload);
  return out;
}

/**
 * Gmail and Google Workspace both authorize through Google's OAuth 2.0 endpoints
 * and read mail through the Gmail API, so one adapter serves both; the two
 * connection cards differ only in the hint they pass to the consent screen.
 */
function createGoogleAdapter(overrides: {
  key: string;
  displayName: string;
  branding: ProviderAdapter['branding'];
  hd?: string;
}): ProviderAdapter {
  return {
    key: overrides.key,
    displayName: overrides.displayName,
    branding: overrides.branding,
    implemented: true,
    supportsPkce: true,
    supportsMailRead: true,
    scopes: SCOPES,
    permissionDisclosure: [
      'Confirm your email address and basic profile',
      'Read your Gmail messages and attachments (read-only; the platform can never send or delete mail)',
      'Keep the connection active until you disconnect or revoke it',
    ],

    buildAuthorizationUrl({ state, codeChallenge, redirectUri, loginHint }) {
      if (!config.providers.google.clientId) throw new ProviderNotConfiguredError(overrides.key);
      const params = new URLSearchParams({
        client_id: config.providers.google.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
      });
      if (loginHint) params.set('login_hint', loginHint);
      if (overrides.hd) params.set('hd', overrides.hd);
      return `${AUTH_ENDPOINT}?${params.toString()}`;
    },

    async exchangeCode({ code, codeVerifier, redirectUri }) {
      const { clientId, clientSecret } = config.providers.google;
      if (!clientId) throw new ProviderNotConfiguredError(overrides.key);
      const body = new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      });
      if (clientSecret) body.set('client_secret', clientSecret);

      const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json: any = await res.json();
      if (!res.ok) {
        throw new Error(`Google token exchange failed: ${json.error_description ?? json.error ?? res.status}`);
      }
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? null,
        tokenType: json.token_type ?? null,
        grantedScopes: typeof json.scope === 'string' ? json.scope.split(' ') : null,
        expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      } satisfies TokenSet;
    },

    async refresh(refreshToken) {
      const { clientId, clientSecret } = config.providers.google;
      const body = new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      if (clientSecret) body.set('client_secret', clientSecret);
      const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json: any = await res.json();
      if (!res.ok) throw new Error(`Google token refresh failed: ${json.error ?? res.status}`);
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? refreshToken,
        tokenType: json.token_type ?? null,
        grantedScopes: typeof json.scope === 'string' ? json.scope.split(' ') : null,
        expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      } satisfies TokenSet;
    },

    async fetchProfile(accessToken) {
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json: any = await res.json();
      if (!res.ok) throw new Error(`Google profile lookup failed: ${json.error ?? res.status}`);
      if (!json.email) throw new Error('Google did not return an email address for this account');
      return {
        providerAccountId: json.sub,
        emailAddress: json.email,
        displayName: json.name ?? null,
      } satisfies AuthorizedProfile;
    },

    async listMessages(accessToken, limit) {
      const listRes = await fetch(
        `${GMAIL_API}/users/me/messages?maxResults=${encodeURIComponent(String(limit))}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const listJson: any = await listRes.json();
      if (!listRes.ok) {
        throw new Error(`Gmail list failed: ${listJson.error?.message ?? listRes.status}`);
      }
      const ids: string[] = (listJson.messages ?? []).map((m: any) => m.id);

      const messages: NormalizedMessage[] = [];
      for (const id of ids) {
        const res = await fetch(`${GMAIL_API}/users/me/messages/${id}?format=full`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) continue;
        const m: any = await res.json();
        const headers = m.payload?.headers ?? [];
        const from = parseAddress(headerValue(headers, 'From'));
        const attachments = collectAttachments(m.payload);
        messages.push({
          providerMessageId: m.id,
          threadId: m.threadId ?? null,
          subject: headerValue(headers, 'Subject'),
          fromName: from.name,
          fromAddress: from.address,
          toAddresses: headerValue(headers, 'To'),
          ccAddresses: headerValue(headers, 'Cc'),
          snippet: m.snippet ?? null,
          receivedAt: m.internalDate
            ? new Date(Number(m.internalDate)).toISOString()
            : headerValue(headers, 'Date'),
          isRead: !(m.labelIds ?? []).includes('UNREAD'),
          hasAttachments: (attachments ?? []).length > 0,
          attachments,
        });
      }
      return messages;
    },

    async revoke(token) {
      await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: 'POST' });
    },
  };
}

export const googleGmailAdapter = createGoogleAdapter({
  key: 'google',
  displayName: 'Gmail',
  branding: {
    icon: 'gmail',
    accent: '#EA4335',
    description: 'Personal @gmail.com accounts',
  },
});

export const googleWorkspaceAdapter = createGoogleAdapter({
  key: 'google-workspace',
  displayName: 'Google Workspace',
  branding: {
    icon: 'google-workspace',
    accent: '#1A73E8',
    description: 'Company Gmail on your own domain',
  },
});
