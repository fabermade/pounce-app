/**
 * User management API — list, create, update, delete users.
 *
 * GET  /api/admin/users      — list all users
 * POST /api/admin/users      — create a new user (owner only)
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { listUsers, createUser } from '@/lib/auth/users.js';
import { getSessionFromRequest } from '@/lib/auth/session.js';
import { requireRole } from '@/lib/auth/roles.js';
import type { User } from '@/lib/db/index.js';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Any authenticated user can list users
  const allUsers = await listUsers();

  // Strip password hashes from response
  const safe = allUsers.map((u: User) => {
    const { passwordHash: _ph, ...rest } = u;
    return rest;
  });

  return new Response(JSON.stringify({ users: safe }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

const createUserSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['owner', 'admin', 'viewer']).default('admin'),
});

export const POST: APIRoute = async ({ request }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Only owners can create users
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

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const user = await createUser(parsed.data);
    // Strip password hash from response
    const { passwordHash: _ph, ...safe } = user;
    return new Response(JSON.stringify({ user: safe }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    // Unique constraint violation on email
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return new Response(JSON.stringify({ error: 'A user with this email already exists' }), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }
};