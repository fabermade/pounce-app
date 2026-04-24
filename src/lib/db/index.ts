export { leads, conversations, messages, businessConfig, events, dailySendCounts } from './schema.js';
export { db } from './client.js';
export type { Database } from './client.js';

// ─── Type Helpers ──────────────────────────────────────────────────
// These infer types from the Drizzle schema — use them in API routes
// instead of repeating column definitions.

import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type Lead = InferSelectModel<typeof import('./schema.js').leads>;
export type NewLead = InferInsertModel<typeof import('./schema.js').leads>;

export type Conversation = InferSelectModel<typeof import('./schema.js').conversations>;
export type NewConversation = InferInsertModel<typeof import('./schema.js').conversations>;

export type Message = InferSelectModel<typeof import('./schema.js').messages>;
export type NewMessage = InferInsertModel<typeof import('./schema.js').messages>;

export type BusinessConfigEntry = InferSelectModel<typeof import('./schema.js').businessConfig>;
export type NewBusinessConfigEntry = InferInsertModel<typeof import('./schema.js').businessConfig>;

export type Event = InferSelectModel<typeof import('./schema.js').events>;
export type NewEvent = InferInsertModel<typeof import('./schema.js').events>;

export type DailySendCount = InferSelectModel<typeof import('./schema.js').dailySendCounts>;
export type NewDailySendCount = InferInsertModel<typeof import('./schema.js').dailySendCounts>;