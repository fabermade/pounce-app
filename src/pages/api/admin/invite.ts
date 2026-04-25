/**
 * POST /api/admin/invite — Invite a new user via email.
 *
 * Owner-only. Generates an invite token, stores hashed version.
 * MVP: returns the invite URL directly. Production: sends email.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db, passwordResets } from '@/lib/db/index.js';
import { getSessionFromRequest } from '@/lib/auth/session.js';
import { requireRole } from '@/lib/auth/roles.js';
import { getUserByEmail } from '@/lib/auth/users.js';

const INVITE_EXPIRY_HOURS = 72; // 3 days to accept invite

const inviteSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['admin', 'viewer']).default('viewer'),
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Only owners can invite
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

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { email, name, role } = parsed.data;

  // Check if user already exists
  const existing = await getUserByEmail(email);
  if (existing) {
    return new Response(JSON.stringify({ error: 'A user with this email already exists' }), {
      status: 409, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Generate invite token
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

  // Store invite as a password reset record with placeholder user ID
  // When user accepts the invite, they set their password via verify-reset
  // then the accept-invite endpoint creates the actual user record
  await db.insert(passwordResets).values({
    userId: '00000000-0000-0000-0000-000000000000', // placeholder — replaced on accept
    tokenHash,
    expiresAt,
  });

  // MVP: return invite URL
  return new Response(JSON.stringify({
    success: true,
    // MVP only — in production, send email:
    _debug_inviteUrl: `/admin/accept-invite?token=${rawToken}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&role=${role}`,
  }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};