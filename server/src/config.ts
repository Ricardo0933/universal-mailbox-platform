import 'dotenv/config';
import path from 'node:path';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),

  /** Public base URL of this server. OAuth redirect URIs are derived from it. */
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
  /** Where the browser-facing UI lives (dev: Vite; prod: served by this server). */
  appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),

  databasePath: process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'data/mailbox.sqlite'),

  /** 32-byte key, hex or base64, used for AES-256-GCM encryption of tokens at rest. */
  encryptionKey: required('ENCRYPTION_KEY', process.env.NODE_ENV === 'production' ? undefined : 'dev-only-insecure-key-change-me-0001'),
  sessionSecret: required('SESSION_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-only-insecure-session-secret'),

  /** Admin bootstrap account for the dashboard. */
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@localhost',
  adminPassword: required('ADMIN_PASSWORD', process.env.NODE_ENV === 'production' ? undefined : 'change-me'),

  providers: {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    },
    microsoft: {
      clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? '',
      tenant: process.env.MICROSOFT_OAUTH_TENANT ?? 'common',
    },
  },
} as const;

/** Gmail/Workspace share Google's callback and Outlook/Microsoft 365 share Microsoft's. */
export function callbackFamily(providerKey: string): string {
  return providerKey.split('-')[0];
}

export function redirectUri(providerKey: string): string {
  return `${config.publicUrl}/api/oauth/${callbackFamily(providerKey)}/callback`;
}
