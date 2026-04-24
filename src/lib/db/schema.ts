import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Leads ────────────────────────────────────────────────────────
// Pipeline statuses:
//   new             → Just arrived, no response sent yet
//   contacted       → AI sent initial response, waiting for reply
//   customer_waiting → Lead replied back, needs AI or human response
//   scheduled       → Meeting/call booked
//   closed_won      → Deal closed after meeting
//   closed_lost     → Lead went cold or declined
//   escalated       → Handed off to human (trigger phrases, edge cases)
//   opted_out       → Lead unsubscribed, no more messages

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  source: text('source', {
    enum: ['form', 'email', 'webhook', 'api'],
  }).notNull(),
  type: text('type', {
    enum: ['lead', 'reply', 'booking'],
  }).notNull(),
  name: text('name'),
  email: text('email').notNull(),
  company: text('company'),
  message: text('message'),
  status: text('status', {
    enum: [
      'new',
      'contacted',
      'customer_waiting',
      'scheduled',
      'closed_won',
      'closed_lost',
      'escalated',
      'opted_out',
    ],
  })
    .notNull()
    .default('new'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Conversations ────────────────────────────────────────────────
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  inboxProvider: text('inbox_provider'),
  externalId: text('external_id'),
  lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
  lastOutboundAt: timestamp('last_outbound_at', { withTimezone: true }),
  awaitingReply: boolean('awaiting_reply').notNull().default(false),
  // Track whether human has taken over this conversation
  humanTakeover: boolean('human_takeover').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Messages ──────────────────────────────────────────────────────
export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['system', 'assistant', 'user'] }).notNull(),
  source: text('source', { enum: ['ai', 'human', 'customer'] }).notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Business Config ──────────────────────────────────────────────
// Key-value store for all business configuration.
// Keys: business, tone, knowledge, services, faq, escalation, booking, providers, agent
// Values are JSONB — each key stores its config section as a JSON object.

export const businessConfig = pgTable('business_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown> | unknown[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Events ────────────────────────────────────────────────────────
// Tracks all status changes, email events, bookings, etc.
// event_type values: status_change, email_sent, email_received, booking,
//                    human_takeover, human_release, unsubscribed, escalated

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Daily Send Count ─────────────────────────────────────────────
// Track outbound sends per business per day for rate limiting.
// Enforced per tier: Starter 50/day, Business 500/day, Enterprise configurable.

export const dailySendCounts = pgTable('daily_send_counts', {
  id: uuid('id').defaultRandom().primaryKey(),
  date: text('date').notNull(), // YYYY-MM-DD format
  sendCount: integer('send_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ─────────────────────────────────────────────────────

export const leadsRelations = relations(leads, ({ many }) => ({
  conversations: many(conversations),
  events: many(events),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  lead: one(leads, {
    fields: [conversations.leadId],
    references: [leads.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  lead: one(leads, {
    fields: [events.leadId],
    references: [leads.id],
  }),
}));