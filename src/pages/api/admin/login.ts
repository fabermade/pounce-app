/**
 * POST /api/admin/login — Authenticate user and create session.
 *
 * Validates email + password against users table,
 * creates a signed JWT session cookie.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth/users.js';
import { createSession, setSessionCookie } from '@/lib/auth/session.js';
import { checkLoginRateLimit, resetLoginRateLimit } from '@/lib/auth/rate-limit.js';

const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Rate limit by IP
  const ip = clientAddress ?? 'unknown';
  const rateLimitResponse = checkLoginRateLimit(ip);
  if (rateLimitResponse) return rateLimitResponse;

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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { email, password } = parsed.data;

  // Authenticate
  const user = await authenticateUser(email, password);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Invalid email or password' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Reset rate limit on successful login
  resetLoginRateLimit(ip);

  // Create session
  const token = await createSession({
    userId: user.id,
    email: user.email,
    role: user.role as 'owner' | 'admin' | 'viewer',
    name: user.name || undefined,
  });

  // Build response with session cookie
  const response = new Response(
    JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

  setSessionCookie(response, token);
  return response;
};