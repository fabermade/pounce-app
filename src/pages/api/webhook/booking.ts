/**
 * Booking Webhook Handler
 *
 * POST /api/webhook/booking — Receives booking events from Cal.com or Calendly.
 *
 * When a lead books a call, the booking provider sends a webhook.
 * We:
 *   1. Parse the webhook payload with the configured booking provider
 *   2. Match to an existing lead by email
 *   3. Update lead status to 'scheduled'
 *   4. Log the booking event
 */

import type { APIRoute } from 'astro';
import { db, leads, businessConfig } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { createBookingProvider } from '@/lib/providers/booking/index.js';
import { logEvent } from '@/lib/core/pipeline.js';

export const POST: APIRoute = async ({ request, url }) => {
  // 1. Determine which booking provider from query param or config
  const providerParam = url.searchParams.get('provider');
  const [providersConfig] = await db
    .select()
    .from(businessConfig)
    .where(eq(businessConfig.key, 'providers'))
    .limit(1);

  const providers = (providersConfig?.value ?? {}) as Record<string, unknown>;
  const providerName = providerParam ?? (providers.booking as string) ?? 'calcom';

  // 2. Parse the webhook payload
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

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
    // Not a relevant event type (e.g., cancellation) — acknowledge but don't process
    return new Response(JSON.stringify({ processed: false, reason: 'Event type not relevant' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Match to existing lead
  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.email, bookingEvent.email))
    .limit(1);

  if (!lead) {
    // Lead doesn't exist — create one from the booking
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

    await logEvent(newLead!.id, 'booking', {
      provider: providerName,
      externalId: bookingEvent.externalId,
      startTime: bookingEvent.startTime,
      endTime: bookingEvent.endTime,
    });

    return new Response(JSON.stringify({
      processed: true,
      leadId: newLead!.id,
      status: 'scheduled',
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Update existing lead to 'scheduled'
  await db
    .update(leads)
    .set({
      status: 'scheduled',
      updatedAt: new Date(),
    })
    .where(eq(leads.id, lead.id));

  await logEvent(lead.id, 'booking', {
    provider: providerName,
    externalId: bookingEvent.externalId,
    startTime: bookingEvent.startTime,
    endTime: bookingEvent.endTime,
  });

  return new Response(JSON.stringify({
    processed: true,
    leadId: lead.id,
    status: 'scheduled',
  }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};