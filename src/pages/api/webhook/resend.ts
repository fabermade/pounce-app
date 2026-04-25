/**
 * Resend Webhook Handler
 *
 * POST /api/webhook/resend — Receives inbound email events from Resend.
 *
 * Resend Inbound Routing sends a POST with the parsed email when someone
 * replies to a Pounce-sent email. We:
 *   1. Verify the webhook signature
 *   2. Parse the inbound email (from, to, subject, body)
 *   3. Match to an existing lead + conversation
 *   4. Add the customer's reply as a message
 *   5. Run the AI response pipeline
 *
 * Resend docs: https://resend.com/docs/inbound-webhooks
 */

import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { db, leads, conversations, businessConfig } from '@/lib/db/index.js';
import { eq, desc } from 'drizzle-orm';
import { addMessage } from '@/lib/core/conversation.js';
import { transitionLeadStatus, logEvent } from '@/lib/core/pipeline.js';
import { runResponsePipeline } from '@/lib/core/response-pipeline.js';
import { resolveEnvKey } from '@/lib/core/response-pipeline.js';

// ─── Webhook Signature Verification ──────────────────────────────

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  // Resend uses HMAC-SHA256 for webhook signatures
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

// ─── Resend Inbound Email Schema ─────────────────────────────────

interface ResendInboundEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string[];
  headers: Record<string, string>;
}

// ─── Lead Matching ───────────────────────────────────────────────

/**
 * Match an inbound email to an existing lead.
 * Strategy: Look up by sender email address.
 * Returns the lead ID and most recent conversation ID, or null.
 */
async function matchToLead(senderEmail: string): Promise<{
  leadId: string;
  conversationId: string;
} | null> {
  // Find lead by email
  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.email, senderEmail.toLowerCase()))
    .limit(1);

  if (!lead) return null;

  // Find most recent conversation for this lead
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.leadId, lead.id))
    .orderBy(desc(conversations.createdAt))
    .limit(1);

  if (!conv) return null;

  return { leadId: lead.id, conversationId: conv.id };
}

// ─── Extract Reply Content ───────────────────────────────────────

/**
 * Extract the actual reply text from an email, stripping quoted text.
 * Uses the plain text version if available, falls back to HTML.
 * Strips common reply separator patterns.
 */
function extractReplyContent(text: string, html: string): string {
  const plainText = text?.trim() || stripHtml(html);

  if (!plainText) return '(no content)';

  // Strip common reply quote patterns
  const lines = plainText.split('\n');
  const replyLines: string[] = [];

  for (const line of lines) {
    // Stop at common quote indicators
    if (
      line.startsWith('On ') && line.includes(' wrote:') ||
      line.startsWith('>') ||
      line.startsWith('-----Original Message-----') ||
      line.startsWith('-----Reply Message-----') ||
      line.startsWith('From: ') && line.includes('@') ||
      line.match(/^-{3,}$/) // horizontal rule separators
    ) {
      break;
    }
    replyLines.push(line);
  }

  const reply = replyLines.join('\n').trim();
  return reply || plainText;
}

/**
 * Basic HTML → plain text stripping.
 * For production, consider using a proper HTML-to-text library.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
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
  const webhookSecret = resolveEnvKey(providers.emailWebhookSecret as string);
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

  // 3. Parse the inbound email
  let email: ResendInboundEmail;
  try {
    email = JSON.parse(rawPayload);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Validate required fields
  if (!email.from || !email.to || !email.html) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const senderEmail = (email.reply_to?.[0] ?? email.from).toLowerCase();
  const replyContent = extractReplyContent(email.text ?? '', email.html);

  // 5. Match to existing lead + conversation
  const match = await matchToLead(senderEmail);

  if (!match) {
    // No existing lead — this is a cold inbound email, not a reply.
    // Treat it as a new lead via the inbound API.
    // For now, log it and return 200 (Resend expects 200 or it retries).
    console.log(`[resend-webhook] No matching lead for ${senderEmail}, treating as new inbound`);

    // Create as new lead
    const [newLead] = await db
      .insert(leads)
      .values({
        source: 'email',
        type: 'lead',
        name: email.from.includes('<') ? email.from.split('<')[0]?.trim() : email.from,
        email: senderEmail,
        message: replyContent,
        status: 'new',
        metadata: {
          subject: email.subject,
          resendId: email.id,
          to: email.to,
        },
      })
      .returning();

    const [conv] = await db
      .insert(conversations)
      .values({
        leadId: newLead!.id,
        inboxProvider: 'resend',
        externalId: email.id,
        awaitingReply: true,
      })
      .returning();

    await addMessage(conv!.id, 'user', 'customer', replyContent, {
      subject: email.subject,
      resendId: email.id,
    });

    await logEvent(newLead!.id, 'email_received', { source: 'resend_inbound' });

    // Run response pipeline for new lead
    const pipelineResult = await runResponsePipeline(conv!.id);

    return new Response(JSON.stringify({
      matched: false,
      leadId: newLead!.id,
      conversationId: conv!.id,
      aiResponseSent: pipelineResult.aiResponseSent,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 6. Existing lead — add reply and trigger pipeline
  const { leadId, conversationId } = match;

  // Check if lead has opted out
  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);

  if (lead?.status === 'opted_out') {
    return new Response(JSON.stringify({ matched: true, optOut: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Add customer reply message
  await addMessage(conversationId, 'user', 'customer', replyContent, {
    subject: email.subject,
    resendId: email.id,
  });

  // Update conversation timestamps
  await db
    .update(conversations)
    .set({
      lastInboundAt: new Date(),
      awaitingReply: true,
    })
    .where(eq(conversations.id, conversationId));

  // Transition status
  await transitionLeadStatus(leadId, 'customer_waiting', {
    reason: 'lead_replied',
    source: 'resend_inbound',
  });

  await logEvent(leadId, 'email_received', {
    source: 'resend_reply',
    conversationId,
  });

  // 7. Run AI response pipeline
  const pipelineResult = await runResponsePipeline(conversationId);

  return new Response(JSON.stringify({
    matched: true,
    leadId,
    conversationId,
    aiResponseSent: pipelineResult.aiResponseSent,
    escalated: pipelineResult.escalated ?? false,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};