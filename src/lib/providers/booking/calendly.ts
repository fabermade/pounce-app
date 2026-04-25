/**
 * Calendly Booking Provider
 *
 * Parses webhook payloads from Calendly booking events.
 * Calendly docs: https://developer.calendly.com/docs/webhooks
 */

import type { BookingProvider, BookingEvent } from './base.js';

interface CalendlyWebhookPayload {
  event?: string;
  payload?: {
    event?: string;
    data?: {
      uri?: string;
      name?: string;
      event_memberships?: Array<{
        user?: {
          email?: string;
          name?: string;
        };
      }>;
      start_time?: string;
      end_time?: string;
      event_type?: {
        name?: string;
      };
      invitees?: Array<{
        email?: string;
        name?: string;
        timezone?: string;
      }>;
    };
  };
}

export class CalendlyProvider implements BookingProvider {
  readonly name = 'calendly';

  parseWebhook(payload: unknown): BookingEvent | null {
    const data = payload as CalendlyWebhookPayload;

    // Only handle invitee created events
    const eventType = data.event ?? data.payload?.event;
    if (eventType && !eventType.includes('invitee.created')) {
      return null;
    }

    const d = data.payload?.data;
    if (!d?.uri) return null;

    const invitee = d.invitees?.[0];
    const email = invitee?.email;
    if (!email) return null;

    return {
      externalId: d.uri.split('/').pop() ?? '',
      email: email.toLowerCase(),
      name: invitee?.name,
      title: d.event_type?.name,
      startTime: d.start_time ?? '',
      endTime: d.end_time ?? '',
      timezone: invitee?.timezone,
      raw: payload,
    };
  }
}