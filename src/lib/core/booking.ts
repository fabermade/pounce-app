/**
 * Booking — Booking link generation and CTA logic.
 * 
 * Determines when to offer a booking CTA based on conversation
 * stage and business config.
 */

export interface BookingConfig {
  url: string;
  cta: string;
  timing: 'immediately' | 'after_first_exchange' | 'after_second_exchange' | 'manual';
}

export interface BookingResult {
  shouldOffer: boolean;
  url: string;
  ctaText: string;
}

/**
 * Determine whether to offer a booking CTA at this point in the conversation.
 * 
 * timing rules:
 * - immediately: always offer on first response
 * - after_first_exchange: offer after lead has replied once
 * - after_second_exchange: offer after lead has replied twice
 * - manual: never auto-offer (human decides)
 */
export function shouldOfferBooking(
  config: BookingConfig,
  exchangeCount: number, // number of lead replies so far
): BookingResult {
  let shouldOffer = false;

  switch (config.timing) {
    case 'immediately':
      shouldOffer = true;
      break;
    case 'after_first_exchange':
      shouldOffer = exchangeCount >= 1;
      break;
    case 'after_second_exchange':
      shouldOffer = exchangeCount >= 2;
      break;
    case 'manual':
      shouldOffer = false;
      break;
  }

  return {
    shouldOffer,
    url: config.url,
    ctaText: config.cta,
  };
}