/**
 * GET /api/booking/config — Public booking configuration.
 *
 * Returns just the booking URL and provider type (no secrets).
 * Used by the public /book page to render the correct embed.
 */

import type { APIRoute } from 'astro';
import { db, businessConfig } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async () => {
  try {
    const [bookingConfig] = await db
      .select()
      .from(businessConfig)
      .where(eq(businessConfig.key, 'booking'))
      .limit(1);

    const booking = (bookingConfig?.value ?? {}) as Record<string, string>;

    // Also get business name for branding
    const [bizConfig] = await db
      .select()
      .from(businessConfig)
      .where(eq(businessConfig.key, 'business'))
      .limit(1);

    const business = (bizConfig?.value ?? {}) as Record<string, string>;

    // Only expose what the public page needs — no secrets
    return new Response(JSON.stringify({
      url: booking.url ?? '',
      provider: booking.provider ?? (booking.url?.includes('calendly') ? 'calendly' : 'calcom'),
      cta: booking.cta ?? 'Book a Call',
      businessName: business.name ?? '',
      businessTagline: business.tagline ?? '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error fetching booking config:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch booking config' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};