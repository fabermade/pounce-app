/**
 * Lead Parser — Normalize inbound payloads into standard lead format.
 * 
 * Accepts: form submissions, email replies, webhooks, API calls.
 * All normalized to a consistent shape for the pipeline.
 */

import { z } from 'zod';

// ─── Schemas ──────────────────────────────────────────────────────

export const inboundLeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  company: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
  source: z.enum(['form', 'email', 'webhook', 'api']).default('form'),
  conversationId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type InboundLead = z.infer<typeof inboundLeadSchema>;

// ─── Resend Webhook Schema ────────────────────────────────────────

export const resendWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.string(),
    from: z.string(),
    to: z.array(z.string()),
    subject: z.string().optional(),
    html: z.string().optional(),
    text: z.string().optional(),
    replyTo: z.string().optional(),
  }),
});

export type ResendWebhook = z.infer<typeof resendWebhookSchema>;

// ─── Normalized Lead ──────────────────────────────────────────────

export interface NormalizedLead {
  source: 'form' | 'email' | 'webhook' | 'api';
  type: 'lead' | 'reply';
  name: string;
  email: string;
  company: string | null;
  message: string;
  conversationId: string | null;
  metadata: Record<string, unknown>;
}

// ─── Parsers ──────────────────────────────────────────────────────

/** Parse a standard inbound lead submission */
export function parseInboundLead(raw: unknown): NormalizedLead {
  const parsed = inboundLeadSchema.parse(raw);
  return {
    source: parsed.source,
    type: parsed.conversationId ? 'reply' : 'lead',
    name: parsed.name,
    email: parsed.email,
    company: parsed.company ?? null,
    message: parsed.message,
    conversationId: parsed.conversationId ?? null,
    metadata: parsed.metadata ?? {},
  };
}

/** Parse a Resend email.received webhook into a normalized lead */
export function parseResendWebhook(raw: unknown): NormalizedLead {
  const parsed = resendWebhookSchema.parse(raw);
  const fromEmail = parsed.data.from;
  // Extract name from "Name <email>" format
  const nameMatch = fromEmail.match(/^(.+?)\s*<(.+?)>$/);
  const name = nameMatch?.[1]?.trim() ?? fromEmail;
  const email = nameMatch?.[2]?.trim() ?? fromEmail;

  return {
    source: 'email',
    type: 'reply', // Resend webhooks are replies from existing conversations
    name,
    email,
    company: null,
    message: parsed.data.text ?? parsed.data.html ?? '(no body)',
    conversationId: parsed.data.replyTo ?? null,
    metadata: {
      resendId: parsed.data.id,
      subject: parsed.data.subject,
      to: parsed.data.to,
    },
  };
}