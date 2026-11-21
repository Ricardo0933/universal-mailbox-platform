import { runMigrations } from './index';
import { seedAdminUser } from './seed';

runMigrations();
seedAdminUser();
console.log('[migrate] done');
