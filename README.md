# Universal Mailbox Connection Platform

Connect email accounts through one centralized, shareable connection page. Accounts
authorize through their provider's own OAuth 2.0 consent screen and, once authorized,
appear automatically in the admin dashboard.

## What it does

- **Universal connection page** (`/connect`) with provider cards for Gmail, Google
  Workspace, Outlook, Microsoft 365, Yahoo Mail, iCloud Mail, other business email
  and custom domain email.
- **Shareable connection links** (`/connect/:token`) you can send to someone so they
  authorize their own mailbox. Each link carries a disclosure, shown before sign-in,
  stating who will be able to read the mail.
- **Admin dashboard** listing every connected mailbox with its provider, connection
  status, authorization date, last synchronization and the permissions actually granted,
  plus search, provider/status filtering, sync, disconnect and revoke.
- **Unified inbox** across mailboxes whose owner granted a mail-read scope: sender and
  recipients, subject, received date, read/unread state, search and attachment metadata.
- **Audit log** of every authorization, mailbox listing, message open, sync and revocation.

## Security model

- Authorization only ever happens on the provider's official pages. The platform never
  renders, proxies or imitates a provider sign-in screen, and never asks for or stores
  a third-party email password.
- OAuth 2.0 Authorization Code with **PKCE** (S256) for Google and Microsoft.
- **CSRF protection** via single-use, expiring `state` values bound to the PKCE verifier.
- Access and refresh tokens are **encrypted at rest** with AES-256-GCM.
- A mailbox is marked `connected` only after the code exchange, state/PKCE validation and
  profile lookup all succeed — never before.
- **A successful sign-in does not grant mailbox reading.** Granted scopes are recorded
  per account, and the inbox refuses to read a mailbox that did not grant a mail scope.
- Least-privilege, read-only mail scopes (`gmail.readonly`, `Mail.Read`).
- Administrators can disconnect and revoke at any time; revocation is also attempted at
  the provider. Mailbox owners can revoke independently from their provider account.

## Connection states

`Pending Authorization` → `Authorization Successful` → `Connected` → `Synchronizing`,
plus `Synchronization Error`, `Permission Revoked` and `Disconnected`.

## Stack

React + TypeScript (Vite) · Node.js + Express + TypeScript · SQLite (better-sqlite3)
· Gmail API · Microsoft Graph · OAuth 2.0 / PKCE

## Project structure

```
server/            Express API, OAuth adapters, SQLite access
  src/config.ts      environment configuration and redirect URIs
  src/db/            connection, migrations, audit helper, seed
  src/oauth/         provider adapters (google, microsoft, pending)
  src/routes/        auth, connect (+OAuth callback), accounts, messages, links
  src/services/      token storage, permissions, synchronization, revocation
client/            React dashboard and connection page
  src/pages/         Connect, Connected, Login, Dashboard, Inbox, Links, Audit
```

## Installation

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```bash
# generate the two keys
openssl rand -hex 32   # ENCRYPTION_KEY
openssl rand -hex 32   # SESSION_SECRET
```

Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the dashboard administrator is created on first run.

### Provider credentials

**Google (Gmail and Google Workspace)** — in the
[Google Cloud Console](https://console.cloud.google.com/apis/credentials): enable the
Gmail API, configure the consent screen with scopes `openid`, `email`, `profile` and
`https://www.googleapis.com/auth/gmail.readonly`, then create a **Web application**
OAuth client with redirect URI:

```
http://localhost:4000/api/oauth/google/callback
```

Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

**Microsoft (Outlook and Microsoft 365)** — in the
[Azure portal](https://portal.azure.com) under Entra ID → App registrations, register an
app for *any organizational directory and personal Microsoft accounts*, add delegated
Microsoft Graph permissions `openid`, `email`, `profile`, `offline_access`, `User.Read`,
`Mail.Read`, and add the **Web** redirect URI:

```
http://localhost:4000/api/oauth/microsoft/callback
```

Set `MICROSOFT_OAUTH_CLIENT_ID` and `MICROSOFT_OAUTH_CLIENT_SECRET`.

A provider with no credentials configured shows as *Not yet available* on the connection
page instead of offering a flow that cannot complete.

## Running

```bash
npm run dev      # API on :4000, UI on :5173
```

- Connection page: http://localhost:5173/connect
- Dashboard: http://localhost:5173/dashboard (sign in with `ADMIN_EMAIL`)

Production:

```bash
npm run build
npm start        # serves the API and the built UI from PORT
```

Migrations run automatically at startup; `npm --workspace server run migrate` applies
them on their own.

## Provider support

| Provider | Authorization | Mail reading |
| --- | --- | --- |
| Gmail | OAuth 2.0 + PKCE | Gmail API, read-only |
| Google Workspace | OAuth 2.0 + PKCE | Gmail API, read-only |
| Outlook | OAuth 2.0 + PKCE | Microsoft Graph, read-only |
| Microsoft 365 | OAuth 2.0 + PKCE | Microsoft Graph, read-only |
| Yahoo Mail | Needs an approved Yahoo developer app | Pending that approval |
| iCloud Mail | No OAuth mail API; IMAP with an app-specific password | Pending IMAP support |
| Other business email | Provider-specific OAuth, or IMAP | Pending IMAP support |
| Custom domain email | IMAP/SMTP | Pending IMAP support |

Providers differ in the authorization and mailbox permissions they support, so each
capability is declared per adapter rather than assumed. Yahoo, iCloud and IMAP-based
options are deliberately surfaced as unavailable until their authorization method is
validated, rather than simulated.
