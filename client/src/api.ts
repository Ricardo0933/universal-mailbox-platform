export interface ProviderCard {
  key: string;
  displayName: string;
  branding: { icon: string; accent: string; description: string };
  implemented: boolean;
  configured: boolean;
  supportsMailRead: boolean;
  permissionDisclosure: string[];
  scopes: string[];
  unavailableReason: string | null;
}

export interface Account {
  id: number;
  provider: string;
  providerKey: string;
  emailAddress: string;
  displayName: string | null;
  status: string;
  statusDetail: string | null;
  authorizedAt: string | null;
  lastSyncedAt: string | null;
  messageCount: number;
  unreadCount: number;
  grantedScopes: string[];
  canReadMail: boolean;
}

export interface Stats {
  totalAccounts: number;
  connectedAccounts: number;
  totalMessages: number;
  unreadMessages: number;
  byProvider: Array<{ provider: string; providerKey: string; count: number }>;
}

export interface MessageSummary {
  id: number;
  accountId: number;
  mailbox: string;
  provider: string;
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  snippet: string | null;
  receivedAt: string | null;
  isRead: boolean;
  hasAttachments: boolean;
}

export interface ConnectionLink {
  id: number;
  token: string;
  url: string;
  label: string | null;
  disclosure: string;
  maxUses: number | null;
  useCount: number;
  accountsConnected: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body.detail ?? body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  me: () => request<{ user: { id: number; email: string; role: string } }>('/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: unknown }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  providers: () => request<{ providers: ProviderCard[] }>('/connect/providers'),
  link: (token: string) =>
    request<{ link: { token: string; label: string | null; disclosure: string }; providers: ProviderCard[] }>(
      `/connect/links/${token}`,
    ),
  startConnection: (provider: string, linkToken?: string) =>
    request<{ authorizationUrl: string }>('/connect/start', {
      method: 'POST',
      body: JSON.stringify({ provider, linkToken }),
    }),

  accounts: (params: { provider?: string; status?: string; q?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return request<{ accounts: Account[] }>(`/accounts?${qs}`);
  },
  stats: () => request<Stats>('/accounts/stats'),
  account: (id: number) =>
    request<{ account: Account; permissions: any[]; synchronizationLogs: any[] }>(`/accounts/${id}`),
  sync: (id: number) => request<{ ok: boolean; synced: number }>(`/accounts/${id}/sync`, { method: 'POST' }),
  revoke: (id: number) => request<{ ok: boolean }>(`/accounts/${id}/revoke`, { method: 'POST' }),
  disconnect: (id: number) => request<{ ok: boolean }>(`/accounts/${id}`, { method: 'DELETE' }),
  auditLogs: () => request<{ auditLogs: any[] }>('/accounts/audit/all'),

  messages: (params: { accountId?: number; q?: string; unread?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.accountId) qs.set('accountId', String(params.accountId));
    if (params.q) qs.set('q', params.q);
    if (params.unread) qs.set('unread', 'true');
    return request<{ messages: MessageSummary[]; note?: string }>(`/messages?${qs}`);
  },
  message: (id: number) => request<{ message: any }>(`/messages/${id}`),

  links: () => request<{ links: ConnectionLink[] }>('/links'),
  createLink: (body: { label?: string; disclosure?: string; maxUses?: number; expiresInHours?: number }) =>
    request<{ link: ConnectionLink }>('/links', { method: 'POST', body: JSON.stringify(body) }),
  revokeLink: (id: number) => request<{ ok: boolean }>(`/links/${id}/revoke`, { method: 'POST' }),
};
