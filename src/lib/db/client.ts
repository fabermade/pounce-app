import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

// Lazy initialization — don't create the connection at module import time.
// Astro API routes call getDb() to get the connection, which reads
// DATABASE_URL from process.env at request time.

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL environment variable is not set. ' +
        'Copy .env.example to .env and fill in your connection string.',
      );
    }
    const sql = neon(databaseUrl);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

// Convenience export for use in API routes
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getDb() as Record<string, unknown>)[prop];
  },
});