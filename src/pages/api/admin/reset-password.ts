/**
 * POST /api/admin/reset-password — Request a password reset.
 *
 * Generates a token, hashes it, stores in password_resets table.
 * MVP: returns the reset URL in the response (no email sending yet).
 * In production, this would email the reset link to the user.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db, passwordResets } from '@/lib/db/index.js';
import { getUserByEmail } from '@/lib/auth/users.js';

const RESET_TOKEN_EXPIRY_HOURS = 1;

const requestSchema = z.object({
  email: z.string().email('Valid email is required'),
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { email } = parsed.data;

  // Always return success to prevent email enumeration
  const user = await getUserByEmail(email);
  if (!user) {
    return new Response(JSON.stringify({ success: true, message: 'If an account exists with this email, a reset link will be sent.' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Generate token
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // Store hashed token
  await db.insert(passwordResets).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  // MVP: return the raw token in response (no email sending yet)
  // In production, send email with reset link: /admin/reset-password?token=...
  return new Response(JSON.stringify({
    success: true,
    message: 'If an account exists with this email, a reset link will be sent.',
    // MVP only — remove in production:
    _debug_resetUrl: `/admin/reset-password?token=${rawToken}`,
  }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};