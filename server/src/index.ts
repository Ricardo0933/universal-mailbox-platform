import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config';
import { runMigrations } from './db';
import { seedAdminUser } from './db/seed';
import { accountsRouter } from './routes/accounts';
import { authRouter } from './routes/auth';
import { connectRouter } from './routes/connect';
import { linksRouter } from './routes/links';
import { messagesRouter } from './routes/messages';

runMigrations();
seedAdminUser();

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: config.appUrl, credentials: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: config.env });
});

app.use('/api/auth', rateLimit({ windowMs: 60_000, limit: 20 }), authRouter);
app.use('/api/connect', rateLimit({ windowMs: 60_000, limit: 60 }), connectRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/links', linksRouter);

// The OAuth callback lives at /api/oauth/:provider/callback, matching the
// redirect URI registered with each provider.
app.use('/api', connectRouter);

// In production the built client is served by this same server.
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api\/).*/, (_req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => (err ? next() : undefined));
});

app.listen(config.port, () => {
  console.log(`[server] listening on ${config.publicUrl} (port ${config.port})`);
  console.log(`[server] app URL ${config.appUrl}`);
});
