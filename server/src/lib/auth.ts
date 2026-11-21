import { NextFunction, Request, Response } from 'express';
import { db } from '../db';
import { randomToken, verifyPassword } from './crypto';

const SESSION_COOKIE = 'ump_session';
const SESSION_TTL_HOURS = 12;

export interface AuthedUser {
  id: number;
  email: string;
  role: 'admin' | 'viewer';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export function login(email: string, password: string): string | null {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user || !verifyPassword(password, user.password_hash)) return null;

  const sessionId = randomToken(32);
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    sessionId,
    user.id,
    expires,
  );
  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);
  return sessionId;
}

export function logout(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_HOURS * 3600_000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function currentUser(req: Request): AuthedUser | null {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.role, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(sessionId) as any;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  return { id: row.id, email: row.email, role: row.role };
}

export function sessionIdOf(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE];
}

/** Dashboard routes require an authenticated administrator. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Administrator role required' });
    return;
  }
  next();
}
