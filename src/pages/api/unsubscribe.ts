/**
 * GET /api/unsubscribe — Handle email unsubscribe requests.
 *
 * Query params:
 *   email — the email address to unsubscribe
 *
 * Sets the lead status to 'opted_out' and logs the event.
 * Returns a simple confirmation page (no login required — one-click unsubscribe).
 */

import type { APIRoute } from 'astro';
import { db, leads } from '../../lib/db/index.js';
import { eq } from 'drizzle-orm';
import { logEvent } from '../../lib/core/pipeline.js';

export const GET: APIRoute = async ({ url }) => {
  const email = url.searchParams.get('email');

  if (!email) {
    return new Response('Missing email parameter.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  try {
    // Find lead by email
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.email, email))
      .limit(1);

    if (!lead) {
      // Still return success — don't leak whether the email exists
      return new Response(UNSUBSCRIBE_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Already opted out — idempotent
    if (lead.status === 'opted_out') {
      return new Response(UNSUBSCRIBE_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Update status to opted_out
    await db
      .update(leads)
      .set({
        status: 'opted_out',
        updatedAt: new Date(),
      })
      .where(eq(leads.id, lead.id));

    // Log the event
    await logEvent(lead.id, 'opted_out', {
      source: 'unsubscribe_link',
    });

    return new Response(UNSUBSCRIBE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    // Still return success — don't leak errors
    return new Response(UNSUBSCRIBE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
};

const UNSUBSCRIBE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f9fafb; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #111827; font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #6b7280; font-size: 0.875rem; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✅</div>
    <h1>You've been unsubscribed</h1>
    <p>You won't receive any more automated messages from this business.</p>
    <p>If you change your mind, you can contact them directly.</p>
  </div>
</body>
</html>`;