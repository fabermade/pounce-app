/**
 * POST /api/inbound — Main lead intake endpoint.
 * 
 * Accepts: form submissions, email replies, webhooks, API calls.
 * Normalizes the payload, creates/updates lead, triggers LLM response pipeline.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, leads, conversations } from '../../lib/db/index.js';
import { eq } from 'drizzle-orm';
import {
  parseInboundLead,
  type NormalizedLead,
} from '../../lib/core/lead-parser.js';
import { addMessage } from '../../lib/core/conversation.js';
import { transitionLeadStatus, logEvent } from '../../lib/core/pipeline.js';

// ─── Zod Schema ──────────────────────────────────────────────────

const inboundSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  company: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
  source: z.enum(['form', 'email', 'webhook', 'api']).default('form'),
  conversationId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── Handler ──────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate input
  const parsed = inboundSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const normalized = parseInboundLead(parsed.data);

  try {
    const result = await processInboundLead(normalized);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error processing inbound lead:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

// ─── Lead Processing Pipeline ─────────────────────────────────────

async function processInboundLead(lead: NormalizedLead): Promise<{
  leadId: string;
  conversationId: string;
  status: string;
  aiResponseSent: boolean;
}> {
  // 1. Look up existing lead by email
  const existingLead = await db
    .select()
    .from(leads)
    .where(eq(leads.email, lead.email))
    .limit(1);

  let leadId: string;
  let conversationId: string;

  if (existingLead.length > 0) {
    // Existing lead — this is a reply
    leadId = existingLead[0]!.id;

    // Find or create conversation
    const existingConv = lead.conversationId
      ? await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, lead.conversationId!))
          .limit(1)
      : await db
          .select()
          .from(conversations)
          .where(eq(conversations.leadId, leadId))
          .limit(1);

    if (existingConv.length > 0) {
      conversationId = existingConv[0]!.id;
    } else {
      // Create new conversation for existing lead
      const [conv] = await db
        .insert(conversations)
        .values({
          leadId,
          inboxProvider: lead.source,
          externalId: (lead.metadata?.resendId as string) ?? null,
          awaitingReply: true,
        })
        .returning();
      conversationId = conv!.id;
    }

    // Add customer message
    await addMessage(conversationId, 'user', 'customer', lead.message, lead.metadata);

    // Transition status to customer_waiting
    if (existingLead[0]!.status !== 'opted_out') {
      await transitionLeadStatus(leadId, 'customer_waiting', {
        reason: 'lead_replied',
        source: lead.source,
      });
    }
  } else {
    // New lead — create everything
    const [newLead] = await db
      .insert(leads)
      .values({
        source: lead.source,
        type: lead.type,
        name: lead.name,
        email: lead.email,
        company: lead.company,
        message: lead.message,
        status: 'new',
        metadata: lead.metadata,
      })
      .returning();
    leadId = newLead!.id;

    // Create conversation
    const [conv] = await db
      .insert(conversations)
      .values({
        leadId,
        inboxProvider: lead.source,
        externalId: (lead.metadata?.resendId as string) ?? null,
        awaitingReply: true,
      })
      .returning();
    conversationId = conv!.id;

    // Add initial customer message
    await addMessage(conversationId, 'user', 'customer', lead.message, lead.metadata);

    // Log lead created event
    await logEvent(leadId, 'email_received', {
      source: lead.source,
      type: lead.type,
    });
  }

  // 2. Check if AI can respond
  //    For now, we'll return the lead/conversation info.
  //    The LLM response pipeline will be triggered asynchronously.
  //    This endpoint is responsible for intake only.
  const aiResponseSent = false; // Will be set by the async pipeline

  return {
    leadId,
    conversationId,
    status: existingLead.length > 0 ? 'customer_waiting' : 'new',
    aiResponseSent,
  };
}