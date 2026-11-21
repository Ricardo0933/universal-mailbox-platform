import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function runMigrations(): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : [];
  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r: any) => r.name as string),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    })();
    console.log(`[migrate] applied ${file}`);
  }
}

export function recordAudit(entry: {
  actor?: string | null;
  actorUserId?: number | null;
  action: string;
  accountId?: number | null;
  target?: string | null;
  detail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): void {
  db.prepare(
    `INSERT INTO audit_logs (actor, actor_user_id, action, account_id, target, detail, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.actor ?? null,
    entry.actorUserId ?? null,
    entry.action,
    entry.accountId ?? null,
    entry.target ?? null,
    entry.detail ?? null,
    entry.ip ?? null,
    entry.userAgent ?? null,
  );
}
