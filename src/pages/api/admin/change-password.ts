/**
 * POST /api/admin/change-password — Change the current user's password.
 *
 * Requires current password verification. New password min 8 chars.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { verifyPassword } from '@/lib/auth/password.js';
import { getUserById, updateUser } from '@/lib/auth/users.js';
import { getSessionFromRequest } from '@/lib/auth/session.js';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const POST: APIRoute = async ({ request }) => {
  // Get session
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(
      JSON.stringify({ error: 'Authentication required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  // Verify current password
  const user = await getUserById(session.userId);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'User not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return new Response(
      JSON.stringify({ error: 'Current password is incorrect' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Update password
  await updateUser(session.userId, { password: newPassword });

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};