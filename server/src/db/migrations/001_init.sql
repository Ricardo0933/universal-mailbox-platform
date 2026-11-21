-- Universal Mailbox Connection Platform :: initial schema

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT
);

-- A shareable connection link that a mailbox owner opens to authorize their own account.
CREATE TABLE IF NOT EXISTS connection_links (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  token           TEXT NOT NULL UNIQUE,
  label           TEXT,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- Who will be able to read mail authorized through this link; shown to the owner before consent.
  disclosure      TEXT NOT NULL,
  max_uses        INTEGER,
  use_count       INTEGER NOT NULL DEFAULT 0,
  expires_at      TEXT,
  revoked_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS connected_accounts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  provider           TEXT NOT NULL,
  provider_key       TEXT NOT NULL,
  provider_account_id TEXT,
  email_address      TEXT NOT NULL,
  display_name       TEXT,
  status             TEXT NOT NULL DEFAULT 'pending_authorization' CHECK (status IN (
                       'pending_authorization','authorization_successful','connected',
                       'synchronizing','synchronization_error','permission_revoked','disconnected')),
  status_detail      TEXT,
  authorized_at      TEXT,
  last_synced_at     TEXT,
  connection_link_id INTEGER REFERENCES connection_links(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider_key, email_address)
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id             INTEGER NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  -- Encrypted at rest with AES-256-GCM. Third-party passwords are never stored.
  access_token_encrypted  TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_type             TEXT,
  scope                  TEXT,
  expires_at             TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id)
);

CREATE TABLE IF NOT EXISTS mailbox_permissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   INTEGER NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL,
  -- Whether this scope was actually granted by the provider, not merely requested.
  granted      INTEGER NOT NULL DEFAULT 0,
  granted_at   TEXT,
  revoked_at   TEXT,
  UNIQUE (account_id, scope)
);

-- In-flight authorization attempts: CSRF state + PKCE verifier, single use.
CREATE TABLE IF NOT EXISTS oauth_authorization_states (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  state               TEXT NOT NULL UNIQUE,
  provider_key        TEXT NOT NULL,
  code_verifier       TEXT NOT NULL,
  redirect_uri        TEXT NOT NULL,
  requested_scopes    TEXT NOT NULL,
  connection_link_id  INTEGER REFERENCES connection_links(id) ON DELETE SET NULL,
  consumed_at         TEXT,
  expires_at          TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id        INTEGER NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  provider_message_id TEXT NOT NULL,
  thread_id         TEXT,
  subject           TEXT,
  from_name         TEXT,
  from_address      TEXT,
  to_addresses      TEXT,
  cc_addresses      TEXT,
  snippet           TEXT,
  body_preview      TEXT,
  received_at       TEXT,
  is_read           INTEGER NOT NULL DEFAULT 0,
  has_attachments   INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_account_received ON messages(account_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_subject ON messages(subject);

CREATE TABLE IF NOT EXISTS attachments (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id           INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  provider_attachment_id TEXT,
  filename             TEXT,
  mime_type            TEXT,
  size_bytes           INTEGER,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS synchronization_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id      INTEGER NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at     TEXT,
  status          TEXT NOT NULL,
  messages_synced INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor        TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  account_id   INTEGER REFERENCES connected_accounts(id) ON DELETE SET NULL,
  target       TEXT,
  detail       TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
