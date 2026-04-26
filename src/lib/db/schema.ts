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

// ─── Types ──────────────────────────────────────────────────────────

export interface FormSchema {
  name: string;
  type: 'text' | 'email' | 'textarea' | 'tel' | 'select' | 'checkbox';
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[]; // for select fields
}

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

// ─── Users ────────────────────────────────────────────────────────
// Multi-user accounts for team collaboration.
// Phase 1 (single admin) uses business_config — Phase 2 migrates here.

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['owner', 'admin', 'viewer'] }).notNull().default('admin'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Password Resets ────────────────────────────────────────────────
// Token-based password reset flow. Tokens are SHA-256 hashed in DB.
// Raw token only sent once via email, never stored.

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Forms ────────────────────────────────────────────────────────
// Custom lead capture forms that can be embedded on external sites.
// Each form has a schema (fields config) and maps to the inbound API.

export const forms = pgTable('forms', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  fields: jsonb('fields').$type<FormSchema[]>().notNull(),
  submitMessage: text('submit_message').default('Thank you! We\'ll be in touch soon.'),
  redirectUrl: text('redirect_url'),
  active: boolean('active').notNull().default(true),
  views: integer('views').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Form Submissions ─────────────────────────────────────────────
// Stores the raw form data for each submission.

export const formSubmissions = pgTable('form_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  formId: uuid('form_id')
    .notNull()
    .references(() => forms.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  leadId: uuid('lead_id')
    .references(() => leads.id),
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

export const usersRelations = relations(users, ({ many }) => ({
  passwordResets: many(passwordResets),
}));

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, {
    fields: [passwordResets.userId],
    references: [users.id],
  }),
}));

export const formsRelations = relations(forms, ({ many }) => ({
  submissions: many(formSubmissions),
}));

export const formSubmissionsRelations = relations(formSubmissions, ({ one }) => ({
  form: one(forms, {
    fields: [formSubmissions.formId],
    references: [forms.id],
  }),
  lead: one(leads, {
    fields: [formSubmissions.leadId],
    references: [leads.id],
  }),
}));