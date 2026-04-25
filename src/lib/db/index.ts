export { getDb, type Database } from './client.js';

// Re-export all schema tables for convenience
export {
  leads,
  conversations,
  messages,
  businessConfig,
  events,
  dailySendCounts,
  users,
  passwordResets,
  leadsRelations,
  conversationsRelations,
  messagesRelations,
  eventsRelations,
  usersRelations,
  passwordResetsRelations,
} from './schema.js';

// Inferred row types — use these for type annotations
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type * as Schema from './schema.js';

export type Lead = InferSelectModel<typeof Schema.leads>;
export type NewLead = InferInsertModel<typeof Schema.leads>;
export type Conversation = InferSelectModel<typeof Schema.conversations>;
export type Message = InferSelectModel<typeof Schema.messages>;
export type NewMessage = InferInsertModel<typeof Schema.messages>;
export type Event = InferSelectModel<typeof Schema.events>;
export type BusinessConfigRow = InferSelectModel<typeof Schema.businessConfig>;
export type User = InferSelectModel<typeof Schema.users>;
export type NewUser = InferInsertModel<typeof Schema.users>;
export type PasswordReset = InferSelectModel<typeof Schema.passwordResets>;
export type NewPasswordReset = InferInsertModel<typeof Schema.passwordResets>;

// Lazy db accessor — call getDb() in API routes to get the connection.
// This avoids connecting at module import time (before env vars are loaded).
import { getDb } from './client.js';
import type { Database } from './client.js';

// Export as a lazy getter — behaves like a regular drizzle instance.
// The actual Neon connection is created on first property access.
let _dbInstance: Database | null = null;

function getDbInstance(): Database {
  if (!_dbInstance) {
    _dbInstance = getDb();
  }
  return _dbInstance;
}

export const db = new Proxy({} as Database, {
  get(_target, prop: string | symbol) {
    return Reflect.get(getDbInstance(), prop);
  },
});