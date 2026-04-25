/**
 * Cal.com Booking Provider
 *
 * Parses webhook payloads from Cal.com booking events.
 * Cal.com docs: https://cal.com/docs/developer-platform/webhooks
 */

import type { BookingProvider, BookingEvent } from './base.js';

interface CalComWebhookPayload {
  triggerEvent?: string;
  payload?: {
    uid?: string;
    title?: string;
    startTime?: string;
    endTime?: string;
    responses?: {
      name?: { value: string };
      email?: { value: string };
    };
    user?: {
      email?: string;
      name?: string;
    };
    attendees?: Array<{
      email?: string;
      name?: string;
      timeZone?: string;
    }>;
  };
}

export class CalComProvider implements BookingProvider {
  readonly name = 'calcom';

  parseWebhook(payload: unknown): BookingEvent | null {
    const data = payload as CalComWebhookPayload;

    // Only handle booking created events
    if (data.triggerEvent && data.triggerEvent !== 'BOOKING_CREATED') {
      return null;
    }

    const p = data.payload;
    if (!p?.uid) return null;

    // Get attendee info — Cal.com puts it in attendees array
    const attendee = p.attendees?.[0];
    const name = p.responses?.name?.value ?? attendee?.name ?? p.user?.name;
    const email = p.responses?.email?.value ?? attendee?.email ?? p.user?.email;
    const timezone = attendee?.timeZone;

    if (!email) return null;

    return {
      externalId: p.uid,
      email: email.toLowerCase(),
      name,
      title: p.title,
      startTime: p.startTime ?? '',
      endTime: p.endTime ?? '',
      timezone,
      raw: payload,
    };
  }
}