import { ReactNode, useEffect, useState } from 'react';
import { ProviderCard } from '../api';

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending_authorization: { label: 'Pending Authorization', className: 'pill-pending' },
  authorization_successful: { label: 'Authorization Successful', className: 'pill-connected' },
  connected: { label: 'Connected', className: 'pill-connected' },
  synchronizing: { label: 'Synchronizing', className: 'pill-syncing' },
  synchronization_error: { label: 'Synchronization Error', className: 'pill-error' },
  permission_revoked: { label: 'Permission Revoked', className: 'pill-revoked' },
  disconnected: { label: 'Disconnected', className: 'pill-disconnected' },
};

export function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: 'pill-disconnected' };
  return (
    <span className={`pill ${meta.className}`}>
      <span className="pill-dot" />
      {meta.label}
    </span>
  );
}

const ICON_LABEL: Record<string, string> = {
  gmail: 'M',
  'google-workspace': 'W',
  outlook: 'O',
  'microsoft-365': '365',
  yahoo: 'Y!',
  icloud: '',
  business: 'B',
  'custom-domain': '@',
};

export function ProviderIcon({ provider, size = 42 }: { provider: ProviderCard; size?: number }) {
  return (
    <div
      className="provider-icon"
      style={{ background: provider.branding.accent, width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {ICON_LABEL[provider.branding.icon] ?? provider.displayName.slice(0, 1)}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading-block">
      <span className="spinner" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function Banner({ kind, children }: { kind: 'error' | 'success' | 'info' | 'warning'; children: ReactNode }) {
  return <div className={`banner banner-${kind}`}>{children}</div>;
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('ump-theme') as 'light' | 'dark') ?? 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ump-theme', theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="btn btn-outline btn-sm" onClick={toggle} type="button">
      {theme === 'light' ? 'Dark theme' : 'Light theme'}
    </button>
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Turns a raw OAuth scope into something a person can read. */
export function describeScope(scope: string): string {
  const map: Record<string, string> = {
    openid: 'Sign-in identity',
    email: 'Email address',
    profile: 'Basic profile',
    offline_access: 'Keep connection active',
    'User.Read': 'Basic profile',
    'Mail.Read': 'Read mail',
    'https://www.googleapis.com/auth/gmail.readonly': 'Read mail',
  };
  return map[scope] ?? scope;
}
