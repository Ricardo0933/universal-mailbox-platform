import { config } from '../config';
import {
  AuthorizedProfile,
  NormalizedMessage,
  ProviderAdapter,
  ProviderNotConfiguredError,
  TokenSet,
} from './types';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

const SCOPES = ['openid', 'email', 'profile', 'offline_access', 'User.Read', 'Mail.Read'];

function authority(): string {
  return `https://login.microsoftonline.com/${config.providers.microsoft.tenant}`;
}

/**
 * Outlook.com and Microsoft 365 both authorize through the Microsoft identity
 * platform and read mail through Microsoft Graph, so one adapter serves both.
 */
function createMicrosoftAdapter(overrides: {
  key: string;
  displayName: string;
  branding: ProviderAdapter['branding'];
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
      'Read your Outlook mail and attachments (read-only; the platform can never send or delete mail)',
      'Keep the connection active until you disconnect or revoke it',
    ],

    buildAuthorizationUrl({ state, codeChallenge, redirectUri, loginHint }) {
      if (!config.providers.microsoft.clientId) throw new ProviderNotConfiguredError(overrides.key);
      const params = new URLSearchParams({
        client_id: config.providers.microsoft.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: SCOPES.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'consent',
      });
      if (loginHint) params.set('login_hint', loginHint);
      return `${authority()}/oauth2/v2.0/authorize?${params.toString()}`;
    },

    async exchangeCode({ code, codeVerifier, redirectUri }) {
      const { clientId, clientSecret } = config.providers.microsoft;
      if (!clientId) throw new ProviderNotConfiguredError(overrides.key);
      const body = new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        scope: SCOPES.join(' '),
      });
      if (clientSecret) body.set('client_secret', clientSecret);

      const res = await fetch(`${authority()}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json: any = await res.json();
      if (!res.ok) {
        throw new Error(
          `Microsoft token exchange failed: ${json.error_description ?? json.error ?? res.status}`,
        );
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
      const { clientId, clientSecret } = config.providers.microsoft;
      const body = new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: SCOPES.join(' '),
      });
      if (clientSecret) body.set('client_secret', clientSecret);
      const res = await fetch(`${authority()}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json: any = await res.json();
      if (!res.ok) throw new Error(`Microsoft token refresh failed: ${json.error ?? res.status}`);
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? refreshToken,
        tokenType: json.token_type ?? null,
        grantedScopes: typeof json.scope === 'string' ? json.scope.split(' ') : null,
        expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      } satisfies TokenSet;
    },

    async fetchProfile(accessToken) {
      const res = await fetch(`${GRAPH_API}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json: any = await res.json();
      if (!res.ok) throw new Error(`Microsoft profile lookup failed: ${json.error?.message ?? res.status}`);
      const email = json.mail ?? json.userPrincipalName;
      if (!email) throw new Error('Microsoft did not return an email address for this account');
      return {
        providerAccountId: json.id,
        emailAddress: email,
        displayName: json.displayName ?? null,
      } satisfies AuthorizedProfile;
    },

    async listMessages(accessToken, limit) {
      const url =
        `${GRAPH_API}/me/messages?$top=${encodeURIComponent(String(limit))}` +
        `&$select=id,conversationId,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime,isRead,hasAttachments` +
        `&$orderby=receivedDateTime desc`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const json: any = await res.json();
      if (!res.ok) throw new Error(`Graph mail list failed: ${json.error?.message ?? res.status}`);

      const messages: NormalizedMessage[] = [];
      for (const m of json.value ?? []) {
        let attachments: NormalizedMessage['attachments'] = [];
        if (m.hasAttachments) {
          const aRes = await fetch(
            `${GRAPH_API}/me/messages/${m.id}/attachments?$select=id,name,contentType,size`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (aRes.ok) {
            const aJson: any = await aRes.json();
            attachments = (aJson.value ?? []).map((a: any) => ({
              providerAttachmentId: a.id,
              filename: a.name ?? null,
              mimeType: a.contentType ?? null,
              sizeBytes: a.size ?? null,
            }));
          }
        }
        messages.push({
          providerMessageId: m.id,
          threadId: m.conversationId ?? null,
          subject: m.subject ?? null,
          fromName: m.from?.emailAddress?.name ?? null,
          fromAddress: m.from?.emailAddress?.address ?? null,
          toAddresses: (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(', ') || null,
          ccAddresses: (m.ccRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(', ') || null,
          snippet: m.bodyPreview ?? null,
          receivedAt: m.receivedDateTime ?? null,
          isRead: Boolean(m.isRead),
          hasAttachments: Boolean(m.hasAttachments),
          attachments,
        });
      }
      return messages;
    },
  };
}

export const outlookAdapter = createMicrosoftAdapter({
  key: 'microsoft',
  displayName: 'Outlook',
  branding: {
    icon: 'outlook',
    accent: '#0078D4',
    description: 'Personal Outlook.com, Hotmail and Live accounts',
  },
});

export const microsoft365Adapter = createMicrosoftAdapter({
  key: 'microsoft-365',
  displayName: 'Microsoft 365',
  branding: {
    icon: 'microsoft-365',
    accent: '#D83B01',
    description: 'Work or school accounts on Microsoft 365',
  },
});
