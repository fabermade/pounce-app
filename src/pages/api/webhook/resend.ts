/**
 * Resend Webhook Handler
 *
 * POST /api/webhook/resend — Receives inbound email events from Resend.
 *
 * Resend Inbound Routing sends a POST with the parsed email when someone
 * replies to a Pounce-sent email. We:
 *   1. Verify the webhook signature (if configured)
 *   2. Parse the inbound email (extract text, strip quotes/signatures)
 *   3. Find or create lead by sender email
 *   4. Find or create conversation (using threading headers)
 *   5. Append customer message
 *   6. Run the AI response pipeline
 *
 * Resend docs: https://resend.com/docs/inbound-webhooks
 */

import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { db, leads, conversations, businessConfig } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { addMessage, findOrCreateConversation } from '@/lib/core/conversation.js';
import { transitionLeadStatus, logEvent } from '@/lib/core/pipeline.js';
import { runResponsePipeline } from '@/lib/core/response-pipeline.js';
import { resolveEnvKey } from '@/lib/core/response-pipeline.js';
import { parseInboundEmail } from '@/lib/core/email-parser.js';

// ─── Webhook Signature Verification ──────────────────────────────

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

// ─── Handler ─────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  // 1. Get webhook secret from config
  const [providerConfig] = await db
    .select()
    .from(businessConfig)
    .where(eq(businessConfig.key, 'providers'))
    .limit(1);

  const providers = (providerConfig?.value ?? {}) as Record<string, unknown>;
  const webhookSecret = resolveEnvKey(String(providers.emailWebhookSecret ?? ''));
  const resendSignature = request.headers.get('resend-signature') ?? request.headers.get('svix-signature') ?? '';

  // 2. Read and verify payload
  const rawPayload = await request.text();

  if (webhookSecret && resendSignature) {
    if (!verifyWebhookSignature(rawPayload, resendSignature, webhookSecret)) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 3. Parse the raw payload
  let rawEmail: Record<string, unknown>;
  try {
    rawEmail = JSON.parse(rawPayload);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Normalize Resend's address objects to strings
  // Resend webhook sends from/to/reply_to as {address, name} objects or strings
  function extractAddress(addr: unknown): string {
    if (typeof addr === 'string') return addr;
    if (addr && typeof addr === 'object' && 'address' in (addr as object)) {
      return String((addr as { address: string }).address);
    }
    return '';
  }
  function extractAddresses(addrs: unknown): string[] {
    if (Array.isArray(addrs)) return addrs.map(extractAddress).filter(Boolean);
    if (typeof addrs === 'string') return [addrs];
    return [];
  }
  function formatFrom(addr: unknown): string {
    if (typeof addr === 'string') return addr;
    if (addr && typeof addr === 'object' && 'address' in (addr as object)) {
      const obj = addr as { address: string; name?: string };
      return obj.name ? `${obj.name} <${obj.address}>` : obj.address;
    }
    return String(addr ?? '');
  }

  const fromStr = formatFrom(rawEmail.from);
  const toStr = extractAddresses(rawEmail.to).join(', ');
  const replyToStr = extractAddresses(rawEmail.reply_to).join(', ') || undefined;

  const email = parseInboundEmail({
    from: fromStr,
    to: toStr,
    subject: String(rawEmail.subject ?? ''),
    text: String(rawEmail.text ?? ''),
    html: String(rawEmail.html ?? ''),
    replyTo: replyToStr,
    headers: rawEmail.headers as Record<string, string> | undefined,
  });

  // Validate required fields
  if (!email.from) {
    return new Response(JSON.stringify({ error: 'Missing sender email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 5. Find or create lead
  const senderEmail = (email.replyTo ?? email.from).toLowerCase();
  let leadId: string;
  let isNewLead = false;

  const [existingLead] = await db
    .select()
    .from(leads)
    .where(eq(leads.email, senderEmail))
    .limit(1);

  if (existingLead) {
    leadId = existingLead.id;

    // Check opt-out
    if (existingLead.status === 'opted_out') {
      return new Response(JSON.stringify({ matched: true, optOut: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    // New lead — create from inbound email
    const [newLead] = await db
      .insert(leads)
      .values({
        source: 'email',
        type: 'lead',
        name: email.fromName || email.from,
        email: senderEmail,
        message: email.text,
        status: 'new',
        metadata: {
          subject: email.subject,
          resendId: rawEmail.id,
          to: email.to,
        },
      })
      .returning();

    leadId = newLead!.id;
    isNewLead = true;

    await logEvent(leadId, 'lead_created', { source: 'resend_inbound', email: senderEmail });
  }

  // 6. Find or create conversation (using threading headers)
  const { conversationId, isNew: isNewConversation } = await findOrCreateConversation(
    leadId,
    'resend',
    String(rawEmail.id ?? crypto.randomUUID()),
    email.inReplyTo,
    email.references,
  );

  // 7. Add customer message
  await addMessage(conversationId, 'user', 'customer', email.text, {
    subject: email.subject,
    emailMessageId: email.messageId,
    inReplyTo: email.inReplyTo,
    resendId: rawEmail.id,
    source: 'resend_inbound',
  });

  // Update conversation timestamps
  await db
    .update(conversations)
    .set({
      lastInboundAt: new Date(),
      awaitingReply: true,
    })
    .where(eq(conversations.id, conversationId));

  // 8. Update lead status
  if (isNewLead) {
    await transitionLeadStatus(leadId, 'new', { source: 'resend_inbound' });
  } else {
    await transitionLeadStatus(leadId, 'customer_waiting', {
      reason: 'lead_replied',
      source: 'resend_inbound',
    });
  }

  await logEvent(leadId, 'email_received', {
    source: 'resend_inbound',
    conversationId,
    isNewConversation,
    inReplyTo: email.inReplyTo,
  });

  // 9. Run AI response pipeline
  const pipelineResult = await runResponsePipeline(conversationId);

  return new Response(JSON.stringify({
    success: true,
    leadId,
    conversationId,
    isNewLead,
    isNewConversation,
    aiResponseSent: pipelineResult.aiResponseSent,
    escalated: pipelineResult.escalated ?? false,
    reason: pipelineResult.reason,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};