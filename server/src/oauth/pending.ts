import { ProviderAdapter, ProviderNotImplementedError } from './types';

/**
 * Providers whose authorization method still has to be validated or approved
 * before they can be enabled. They appear on the connection page as
 * "Not yet available" rather than pretending to offer a working flow — an
 * account must never be shown as connected without a real authorization.
 */
function createUnavailableAdapter(input: {
  key: string;
  displayName: string;
  branding: ProviderAdapter['branding'];
  reason: string;
  supportsPkce?: boolean;
  supportsMailRead?: boolean;
  scopes?: string[];
  permissionDisclosure?: string[];
}): ProviderAdapter {
  const fail = (): never => {
    throw new ProviderNotImplementedError(input.key, input.reason);
  };
  return {
    key: input.key,
    displayName: input.displayName,
    branding: input.branding,
    implemented: false,
    supportsPkce: input.supportsPkce ?? false,
    supportsMailRead: input.supportsMailRead ?? false,
    scopes: input.scopes ?? [],
    permissionDisclosure: input.permissionDisclosure ?? [],
    unavailableReason: input.reason,
    buildAuthorizationUrl: fail,
    exchangeCode: fail as never,
    fetchProfile: fail as never,
  } as ProviderAdapter & { unavailableReason: string };
}

export const yahooAdapter = createUnavailableAdapter({
  key: 'yahoo',
  displayName: 'Yahoo Mail',
  branding: { icon: 'yahoo', accent: '#6001D2', description: 'Yahoo and AOL Mail accounts' },
  supportsPkce: true,
  supportsMailRead: true,
  reason:
    'Yahoo Mail requires an approved Yahoo developer application before its OAuth and mailbox scopes can be used. Add approved Yahoo credentials to enable this provider.',
});

export const icloudAdapter = createUnavailableAdapter({
  key: 'icloud',
  displayName: 'iCloud Mail',
  branding: { icon: 'icloud', accent: '#007AFF', description: 'Apple iCloud and me.com mail' },
  reason:
    'Apple does not offer an OAuth mailbox-reading API for iCloud Mail. iCloud can only be connected over IMAP using an Apple app-specific password, which the account owner generates and can revoke at any time. Use the IMAP option once IMAP credentials handling is enabled.',
});

export const businessEmailAdapter = createUnavailableAdapter({
  key: 'business-email',
  displayName: 'Other Business Email',
  branding: { icon: 'business', accent: '#0F766E', description: 'Hosted business mail providers' },
  reason:
    'Business mail providers vary in the authorization they support. Connect these over IMAP/SMTP, or add the provider\'s own OAuth application if it offers one.',
});

export const customDomainAdapter = createUnavailableAdapter({
  key: 'custom-domain',
  displayName: 'Custom Domain Email',
  branding: { icon: 'custom-domain', accent: '#475569', description: 'Your own mail server over IMAP' },
  reason:
    'Custom domain mailboxes connect over IMAP/SMTP. Enable the IMAP adapter and provide the host, port and the account owner\'s app-specific credentials to use this option.',
});
