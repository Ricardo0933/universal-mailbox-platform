import { db } from './index';
import { config } from '../config';
import { hashPassword } from '../lib/crypto';

/** Creates the bootstrap dashboard administrator if no user exists yet. */
export function seedAdminUser(): void {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (row.n > 0) return;
  db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(
    config.adminEmail,
    hashPassword(config.adminPassword),
    'admin',
  );
  console.log(`[seed] created admin user ${config.adminEmail}`);
}
