/** A normalized profile for the mailbox that was actually authorized. */
export interface AuthorizedProfile {
  providerAccountId: string;
  emailAddress: string;
  displayName?: string | null;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  /** Scopes the provider actually granted, when it reports them. */
  grantedScopes?: string[] | null;
  expiresAt?: Date | null;
}

export interface NormalizedMessage {
  providerMessageId: string;
  threadId?: string | null;
  subject?: string | null;
  fromName?: string | null;
  fromAddress?: string | null;
  toAddresses?: string | null;
  ccAddresses?: string | null;
  snippet?: string | null;
  receivedAt?: string | null;
  isRead: boolean;
  hasAttachments: boolean;
  attachments?: Array<{
    providerAttachmentId?: string | null;
    filename?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
  }>;
}

/**
 * One mail provider integration. Providers differ in which authorization methods
 * and mailbox permissions they support, so each capability is declared explicitly
 * rather than assumed.
 */
export interface ProviderAdapter {
  key: string;
  displayName: string;
  /** Marketing/branding metadata for the connection page cards. */
  branding: { icon: string; accent: string; description: string };
  /** False when the provider has no OAuth integration wired up yet. */
  readonly implemented: boolean;
  /** True when the provider supports OAuth 2.0 Authorization Code + PKCE. */
  readonly supportsPkce: boolean;
  /** Scopes requested for sign-in and (where supported) mailbox reading. */
  readonly scopes: string[];
  /** Human-readable description of each permission, shown on the consent screen. */
  readonly permissionDisclosure: string[];
  /** True when this adapter can read messages once the owner grants mail scopes. */
  readonly supportsMailRead: boolean;

  buildAuthorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
    loginHint?: string;
  }): string;

  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<TokenSet>;

  refresh?(refreshToken: string): Promise<TokenSet>;

  fetchProfile(accessToken: string): Promise<AuthorizedProfile>;

  listMessages?(accessToken: string, limit: number): Promise<NormalizedMessage[]>;

  /** Best-effort revocation at the provider. */
  revoke?(token: string): Promise<void>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(providerKey: string) {
    super(
      `Provider "${providerKey}" is not configured. Set its OAuth client ID and secret in the environment.`,
    );
    this.name = 'ProviderNotConfiguredError';
  }
}

export class ProviderNotImplementedError extends Error {
  constructor(providerKey: string, detail: string) {
    super(detail);
    this.name = 'ProviderNotImplementedError';
    this.providerKey = providerKey;
  }
  providerKey: string;
}
