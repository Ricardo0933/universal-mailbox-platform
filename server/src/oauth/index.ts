import { config } from '../config';
import { googleGmailAdapter, googleWorkspaceAdapter } from './google';
import { microsoft365Adapter, outlookAdapter } from './microsoft';
import {
  businessEmailAdapter,
  customDomainAdapter,
  icloudAdapter,
  yahooAdapter,
} from './pending';
import { ProviderAdapter } from './types';

export const providers: ProviderAdapter[] = [
  googleGmailAdapter,
  googleWorkspaceAdapter,
  outlookAdapter,
  microsoft365Adapter,
  yahooAdapter,
  icloudAdapter,
  businessEmailAdapter,
  customDomainAdapter,
];

const byKey = new Map(providers.map((p) => [p.key, p]));

export function getProvider(key: string): ProviderAdapter | undefined {
  return byKey.get(key);
}

/** True when the provider has its OAuth client credentials present in the environment. */
export function isProviderConfigured(provider: ProviderAdapter): boolean {
  if (!provider.implemented) return false;
  if (provider.key.startsWith('google')) return Boolean(config.providers.google.clientId);
  if (provider.key.startsWith('microsoft')) return Boolean(config.providers.microsoft.clientId);
  return false;
}

export function describeProviders() {
  return providers.map((p) => ({
    key: p.key,
    displayName: p.displayName,
    branding: p.branding,
    implemented: p.implemented,
    configured: isProviderConfigured(p),
    supportsMailRead: p.supportsMailRead,
    permissionDisclosure: p.permissionDisclosure,
    scopes: p.scopes,
    unavailableReason: (p as ProviderAdapter & { unavailableReason?: string }).unavailableReason ?? null,
  }));
}

export * from './types';
