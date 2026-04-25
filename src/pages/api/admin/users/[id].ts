/**
 * User management API — single user operations.
 *
 * GET    /api/admin/users/:id  — get user by ID
 * PATCH  /api/admin/users/:id  — update user (name, role, password)
 * DELETE /api/admin/users/:id  — delete user (owner only, can't delete last owner)
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getUserById, updateUser, deleteUser, isLastOwner } from '@/lib/auth/users.js';
import { getSessionFromRequest } from '@/lib/auth/session.js';
import { requireRole, requireOwnerOrSelf } from '@/lib/auth/roles.js';
import type { User } from '@/lib/db/index.js';

function stripPasswordHash(user: User) {
  const { passwordHash: _ph, ...rest } = user;
  return rest;
}

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = params.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'User ID is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = await getUserById(userId);
  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ user: stripPasswordHash(user) }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['owner', 'admin', 'viewer']).optional(),
  password: z.string().min(8).optional(),
});

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = params.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'User ID is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Must be owner or modifying own account
  const selfError = requireOwnerOrSelf(session, userId);
  if (selfError) return selfError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Non-owners can only change their own name and password, not role
  if (parsed.data.role && session.role !== 'owner') {
    return new Response(JSON.stringify({ error: 'Only owners can change user roles' }), {
      status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const updated = await updateUser(userId, parsed.data);
  if (!updated) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ user: stripPasswordHash(updated) }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Only owners can delete users
  const roleError = requireRole(session, 'owner');
  if (roleError) return roleError;

  const userId = params.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'User ID is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Can't delete yourself
  if (session.userId === userId) {
    return new Response(JSON.stringify({ error: 'You cannot delete your own account' }), {
      status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Can't delete the last owner
  if (await isLastOwner(userId)) {
    return new Response(JSON.stringify({ error: 'Cannot delete the last owner' }), {
      status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const deleted = await deleteUser(userId);
  if (!deleted) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};