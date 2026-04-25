/**
 * Role-based access control for API routes.
 *
 * Usage in API route handlers:
 *   const roleError = requireRole(session, 'owner');
 *   if (roleError) return roleError;
 */

import type { SessionData } from './session.js';
import type { UserRole } from './users.js';

// ─── Role Hierarchy ────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 3,
  admin: 2,
  viewer: 1,
};

/**
 * Check if a session has at least the required role.
 * Returns true if authorized, false if not.
 */
export function checkRole(session: SessionData, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[session.role] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Require a minimum role. Returns an error response if not authorized.
 * Use in API route handlers:
 *
 *   const roleError = requireRole(session, 'owner');
 *   if (roleError) return roleError;
 */
export function requireRole(session: SessionData, minimumRole: UserRole): Response | null {
  if (!checkRole(session, minimumRole)) {
    return new Response(
      JSON.stringify({ error: `Requires ${minimumRole} role or above` }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return null;
}

/**
 * Require that the session user matches the target user ID (or is an owner).
 * Used for operations where users can only modify their own data unless they're owner+.
 */
export function requireOwnerOrSelf(session: SessionData, targetUserId: string): Response | null {
  if (session.role === 'owner' || session.userId === targetUserId) {
    return null;
  }
  return new Response(
    JSON.stringify({ error: 'You can only modify your own account' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  );
}