import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    // Astro dev server uses import.meta.env; production uses process.env
    const databaseUrl = import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL;
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