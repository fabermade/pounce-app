/**
 * Booking Webhook Handler
 *
 * POST /api/webhook/booking — Receives booking events from Cal.com or Calendly.
 *
 * When a lead books a call, the booking provider sends a webhook.
 * We:
 *   1. Verify webhook signature (if secret configured)
 *   2. Parse the webhook payload with the configured booking provider
 *   3. Match to an existing lead by email
 *   4. Create or update lead with 'scheduled' status
 *   5. Add booking message to conversation (if one exists)
 *   6. Log the booking event
 */

import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { db, leads, conversations, messages, businessConfig } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { createBookingProvider } from '@/lib/providers/booking/index.js';
import { logEvent, transitionLeadStatus } from '@/lib/core/pipeline.js';
import { resolveEnvKey } from '@/lib/core/response-pipeline.js';

// ─── Signature Verification ──────────────────────────────────────

function verifyCalcomSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  // Cal.com uses HMAC-SHA256 with the webhook secret
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

function verifyCalendlySignature(
  signature: string,
  secret: string,
): boolean {
  // Calendly uses HMAC-SHA256 with the webhook signing key
  // Signature format: "t=timestamp,v1=signature"
  const parts = signature.split(',');
  const tPart = parts.find(p => p.startsWith('t='));
  const v1Part = parts.find(p => p.startsWith('v1='));
  if (!tPart || !v1Part) return false;

  const timestamp = tPart.slice(2);
  const signatureValue = v1Part.slice(3);

  // Reconstruct: timestamp.payload.secret
  const payload = `${timestamp}.${secret}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signatureValue),
    Buffer.from(expected),
  );
}

// ─── Handler ──────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request, url }) => {
  // 1. Determine booking provider
  const providerParam = url.searchParams.get('provider');
  const [providersConfig] = await db
    .select()
    .from(businessConfig)
    .where(eq(businessConfig.key, 'providers'))
    .limit(1);

  const providers = (providersConfig?.value ?? {}) as Record<string, unknown>;
  const providerName = providerParam ?? (providers.booking as string) ?? 'calcom';

  // 2. Verify webhook signature (if secret is configured)
  const webhookSecret = resolveEnvKey(String(providers.bookingWebhookSecret ?? ''));
  if (webhookSecret) {
    const rawBody = await request.text();
    const signature = request.headers.get('cal-signature') ?? request.headers.get('calendly-webhook-signature') ?? '';

    if (providerName === 'calcom' && signature) {
      if (!verifyCalcomSignature(rawBody, signature, webhookSecret)) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401, headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (providerName === 'calendly' && signature) {
      if (!verifyCalendlySignature(signature, webhookSecret)) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Re-parse the body since we consumed it for signature verification
    var body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    // No secret configured — skip verification
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 3. Parse the webhook payload
  let bookingProvider;
  try {
    bookingProvider = await createBookingProvider({ provider: providerName });
  } catch {
    return new Response(JSON.stringify({ error: `Unknown booking provider: ${providerName}` }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const bookingEvent = bookingProvider.parseWebhook(body);
  if (!bookingEvent) {
    // Not a relevant event type — acknowledge but don't process
    return new Response(JSON.stringify({ processed: false, reason: 'Event type not relevant' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Match to existing lead or create new
  const [existingLead] = await db
    .select()
    .from(leads)
    .where(eq(leads.email, bookingEvent.email))
    .limit(1);

  let leadId: string;
  let isNewLead = false;

  if (existingLead) {
    leadId = existingLead.id;
    // Update lead status to scheduled
    await db
      .update(leads)
      .set({ status: 'scheduled', updatedAt: new Date() })
      .where(eq(leads.id, leadId));
  } else {
    // Lead doesn't exist — create from booking
    const [newLead] = await db
      .insert(leads)
      .values({
        source: 'webhook',
        type: 'booking',
        name: bookingEvent.name ?? bookingEvent.email,
        email: bookingEvent.email,
        message: `Booked: ${bookingEvent.title ?? 'Call'}`,
        status: 'scheduled',
        metadata: {
          bookingId: bookingEvent.externalId,
          bookingProvider: providerName,
          startTime: bookingEvent.startTime,
          endTime: bookingEvent.endTime,
          timezone: bookingEvent.timezone,
        },
      })
      .returning();

    leadId = newLead!.id;
    isNewLead = true;
  }

  // 5. Log the booking event
  await logEvent(leadId, 'booking', {
    provider: providerName,
    externalId: bookingEvent.externalId,
    startTime: bookingEvent.startTime,
    endTime: bookingEvent.endTime,
    isNewLead,
  });

  // 6. Add booking message to conversation (if one exists for this lead)
  const [existingConv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.leadId, leadId))
    .limit(1);

  if (existingConv) {
    // Add system message about the booking
    await db.insert(messages).values({
      conversationId: existingConv.id,
      role: 'system',
      source: 'ai',
      content: `📅 Booking confirmed: ${bookingEvent.title ?? 'Call'} at ${new Date(bookingEvent.startTime).toLocaleString()}`,
      metadata: {
        type: 'booking',
        provider: providerName,
        externalId: bookingEvent.externalId,
        startTime: bookingEvent.startTime,
        endTime: bookingEvent.endTime,
        timezone: bookingEvent.timezone,
      },
    });

    // Update conversation timestamps
    await db
      .update(conversations)
      .set({
        lastOutboundAt: new Date(),
        awaitingReply: false,
      })
      .where(eq(conversations.id, existingConv.id));
  } else if (existingLead) {
    // Lead exists but no conversation — create one with the booking message
    const [newConv] = await db
      .insert(conversations)
      .values({
        leadId,
        inboxProvider: providerName,
        externalId: bookingEvent.externalId,
        awaitingReply: false,
      })
      .returning();

    await db.insert(messages).values({
      conversationId: newConv!.id,
      role: 'system',
      source: 'ai',
      content: `📅 Booking confirmed: ${bookingEvent.title ?? 'Call'} at ${new Date(bookingEvent.startTime).toLocaleString()}`,
      metadata: {
        type: 'booking',
        provider: providerName,
        externalId: bookingEvent.externalId,
        startTime: bookingEvent.startTime,
        endTime: bookingEvent.endTime,
        timezone: bookingEvent.timezone,
      },
    });
  }

  // 7. Transition lead status (emits event for analytics)
  if (isNewLead) {
    await transitionLeadStatus(leadId, 'scheduled', {
      source: 'booking_webhook',
      provider: providerName,
    });
  }

  return new Response(JSON.stringify({
    processed: true,
    leadId,
    status: 'scheduled',
    isNewLead,
  }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};