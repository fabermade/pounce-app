/**
 * Booking Provider Interface
 *
 * All booking integrations (Cal.com, Calendly, etc.) implement this interface.
 * The admin configures which provider in business config.
 */

export interface BookingEvent {
  /** External event ID from the booking provider */
  externalId: string;
  /** Email of the person who booked */
  email: string;
  /** Name of the person who booked */
  name?: string;
  /** Title/description of the event */
  title?: string;
  /** Start time (ISO 8601) */
  startTime: string;
  /** End time (ISO 8601) */
  endTime: string;
  /** Timezone of the booking */
  timezone?: string;
  /** Raw payload from the provider for debugging */
  raw?: unknown;
}

export interface BookingProvider {
  /** Unique identifier for this provider */
  readonly name: string;

  /**
   * Parse a webhook payload into a normalized BookingEvent.
   * Returns null if the event type isn't relevant (e.g., cancellation).
   */
  parseWebhook(payload: unknown): BookingEvent | null;
}

/**
 * Factory: create a booking provider from config.
 */
export async function createBookingProvider(config: {
  provider: string;
}): Promise<BookingProvider> {
  switch (config.provider) {
    case 'calcom': {
      const { CalComProvider } = await import('./calcom.js');
      return new CalComProvider();
    }
    case 'calendly': {
      const { CalendlyProvider } = await import('./calendly.js');
      return new CalendlyProvider();
    }
    default:
      throw new Error(`Unknown booking provider: ${config.provider}`);
  }
}