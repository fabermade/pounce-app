/**
 * POST /api/admin/inbox/disconnect — Disconnect an inbox provider.
 *
 * Clears OAuth tokens and sets inbox provider to empty.
 * Owner-only.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/auth/session.js';
import { requireRole } from '@/lib/auth/roles.js';
import { disconnectOAuthProvider } from '@/lib/providers/oauth.js';

const disconnectSchema = z.object({
  provider: z.enum(['gmail', 'outlook']),
});

export const POST: APIRoute = async ({ request }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const roleError = requireRole(session, 'owner');
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = disconnectSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { provider } = parsed.data;

  try {
    await disconnectOAuthProvider(provider);
    return new Response(JSON.stringify({ success: true, disconnected: provider }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[inbox] Disconnect failed for ${provider}:`, err);
    return new Response(JSON.stringify({ error: 'Failed to disconnect provider' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};