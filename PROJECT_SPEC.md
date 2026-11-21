# Build a Universal Mailbox Connection Platform

## Project Objective

Build a professional, fully functional Universal Mailbox Connection Platform that allows users to connect their own email accounts through one centralized connection page.

The platform must support multiple email providers and automatically register successfully authorized accounts in the application's dashboard.

## 1. Universal Connection Page

Create a professional landing page with the title:

**Connect Your Email Account**

Display provider selection cards for:

- Gmail
- Google Workspace
- Outlook
- Microsoft 365
- Yahoo Mail
- iCloud Mail
- Other Business Email
- Custom Domain Email

Each provider must have its official branding, icon and a clearly labeled Connect button.

## 2. Connection Workflow

Implement the following workflow:

1. User opens the application's unique connection URL.
2. User selects their email provider.
3. Application starts the provider's official OAuth authorization flow.
4. The provider displays its official authentication and consent screens.
5. User signs in and explicitly authorizes the requested permissions.
6. The application securely processes the OAuth callback.
7. Application validates the authorization response.
8. Application retrieves the authorized account's email address and profile.
9. Application registers the mailbox in the database.
10. Display a Connection Successful confirmation.
11. The authorized account automatically appears in the application dashboard.

Never simulate provider verification, impersonate official provider pages, or mark an account as connected before successful authorization.

## 3. Supported Provider Integrations

Implement independent provider adapters:

- Gmail API
- Google Workspace Gmail API
- Microsoft Graph API
- Yahoo Mail, subject to approved API access
- Apple Mail / iCloud, subject to supported authorization methods
- IMAP / SMTP for compatible business email providers

Use OAuth 2.0 Authorization Code with PKCE wherever supported.

Do not assume every provider supports identical authorization or mailbox permissions.

## 4. Admin Dashboard

Create a professional administration dashboard with:

### Connected Mailboxes

Display:
- Email address
- Provider
- Connection status
- Authorization date
- Last synchronization
- Granted permissions

### Mailbox Management

Allow authorized administrators to:
- View connected account metadata.
- Filter accounts by provider.
- Search connected accounts.
- Check connection status.
- Disconnect an account.
- Revoke authorization.
- Refresh account synchronization.

### Authorized Mailbox Access

Where the account owner has explicitly granted the appropriate permissions, implement:
- Unified Inbox
- Read incoming messages
- Message details
- Sender and recipient information
- Subject and received date
- Search messages
- Read/unread status
- Authorized attachment access

Only display message content when the relevant mailbox owner has explicitly granted the necessary permissions and understands who can access that content.

## 5. Database

Use SQLite or PostgreSQL.

Create tables:
- users
- connected_accounts
- oauth_tokens
- mailbox_permissions
- messages
- attachments
- synchronization_logs
- audit_logs

Encrypt refresh tokens and sensitive account information.

Never store third-party passwords.

## 6. Connection Status System

Implement real connection states:

- Pending Authorization
- Authorization Successful
- Connected
- Synchronizing
- Synchronization Error
- Permission Revoked
- Disconnected

Only show Connected after successful authorization and validation.

## 7. Security Requirements

- Official OAuth authorization pages only.
- Explicit and informed account-owner consent.
- Least-privilege permissions.
- Secure token encryption.
- CSRF protection using state validation.
- PKCE verification.
- Secure session management.
- Audit logs for mailbox access.
- User-accessible disconnect and revoke controls.
- No hidden mailbox connections.
- No password harvesting.
- No unauthorized email collection.

## 8. Design Requirements

Create a premium enterprise-style interface.

Use:
- Professional dashboard layout.
- Modern provider cards.
- Clean typography.
- Responsive connection page.
- Light and dark themes.
- Real-time connection status indicators.
- Search and filtering.
- Account statistics.
- Loading and error states.

## 9. Development Requirements

Build a complete working application, not a static mockup.

Recommended stack:
- Electron
- React
- TypeScript
- Node.js
- SQLite
- Gmail API
- Microsoft Graph
- OAuth 2.0 / PKCE

Provide:
- Complete source code.
- Organized project structure.
- Database migrations.
- Provider integration modules.
- Environment configuration example.
- Installation instructions.
- Windows installer.

Start by implementing Gmail and Microsoft integrations, then add other providers individually after validating their supported authorization methods.

**Important:** A successful sign-in alone does not grant mailbox-reading permissions. The application must request and verify the appropriate permissions before accessing messages.