import { Router } from 'express';
import { z } from 'zod';
import { recordAudit } from '../db';
import {
  clearSessionCookie,
  currentUser,
  login,
  logout,
  requireAuth,
  sessionIdOf,
  setSessionCookie,
} from '../lib/auth';

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  const sessionId = login(parsed.data.email, parsed.data.password);
  if (!sessionId) {
    recordAudit({
      actor: parsed.data.email,
      action: 'auth.login_failed',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  setSessionCookie(res, sessionId);
  recordAudit({
    actor: parsed.data.email,
    action: 'auth.login',
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ user: currentUser(req) ?? { email: parsed.data.email } });
});

authRouter.post('/logout', (req, res) => {
  const sessionId = sessionIdOf(req);
  if (sessionId) logout(sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
