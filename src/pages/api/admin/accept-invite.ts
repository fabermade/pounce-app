/**
 * POST /api/admin/accept-invite — Accept a team invitation.
 *
 * Public endpoint (no auth required). The invite token serves as authentication.
 *
 * Flow:
 *   1. Owner creates invite via POST /api/admin/invite
 *   2. User receives invite URL with token, email, name, role
 *   3. User submits token + password to this endpoint
 *   4. We verify the token, create the user account, and auto-login
 *
 * The invite token is stored as SHA-256 hash in password_resets table
 * with a placeholder userId. On accept, we create the real user and
 * mark the token as used.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db, passwordResets, users } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/password.js';
import { createSession, setSessionCookie } from '@/lib/auth/session.js';
import { getUserByEmail } from '@/lib/auth/users.js';

const acceptInviteSchema = z.object({
  token: z.string().min(1, 'Invite token is required'),
  email: z.string().email('Valid email is required'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['admin', 'viewer']).default('viewer'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
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

  const parsed = acceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { token, email, name, role, password } = parsed.data;

  // 1. Check if user already exists
  const existing = await getUserByEmail(email);
  if (existing) {
    return new Response(JSON.stringify({ error: 'A user with this email already exists' }), {
      status: 409, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Verify invite token
  const tokenHash = hashToken(token);
  const [invite] = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, tokenHash))
    .limit(1);

  if (!invite) {
    return new Response(JSON.stringify({ error: 'Invalid invite token' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Check if token is already used
  if (invite.used) {
    return new Response(JSON.stringify({ error: 'This invite has already been used' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Check if token is expired
  if (invite.expiresAt < new Date()) {
    return new Response(JSON.stringify({ error: 'This invite has expired' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 5. Mark token as used (before creating user, to prevent double-use)
  await db
    .update(passwordResets)
    .set({ used: true })
    .where(eq(passwordResets.tokenHash, tokenHash));

  // 6. Create the user account
  const passwordHash = await hashPassword(password);
  const [newUser] = await db
    .insert(users)
    .values({
      email,
      name,
      role,
      passwordHash,
    })
    .returning();

  if (!newUser) {
    return new Response(JSON.stringify({ error: 'Failed to create user account' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 7. Auto-login — create session and set cookie
  const sessionToken = await createSession({
    userId: newUser.id,
    email: newUser.email,
    role: newUser.role,
  });

  const response = new Response(JSON.stringify({
    success: true,
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  setSessionCookie(response, sessionToken);
  return response;
};