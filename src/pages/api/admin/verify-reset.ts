/**
 * POST /api/admin/verify-reset — Verify a password reset token and set new password.
 *
 * Validates the token hash, checks expiry, updates the user's password.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db, passwordResets } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { updateUser } from '@/lib/auth/users.js';

const verifySchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
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

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { token, newPassword } = parsed.data;
  const tokenHash = hashToken(token);

  // Look up reset record by token hash
  const [resetRecord] = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, tokenHash))
    .limit(1);

  if (!resetRecord) {
    return new Response(JSON.stringify({ error: 'Invalid or expired reset token' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check if already used
  if (resetRecord.used) {
    return new Response(JSON.stringify({ error: 'This reset token has already been used' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check expiry
  if (new Date() > resetRecord.expiresAt) {
    return new Response(JSON.stringify({ error: 'Reset token has expired' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Update password
  await updateUser(resetRecord.userId, { password: newPassword });

  // Mark token as used
  await db
    .update(passwordResets)
    .set({ used: true })
    .where(eq(passwordResets.id, resetRecord.id));

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};