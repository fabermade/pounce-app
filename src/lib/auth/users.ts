/**
 * User Management Library
 *
 * CRUD operations for the users table, role checks,
 * and the migration path from Phase 1 (business_config admin) to Phase 2 (users table).
 */

import { db, users } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from './password.js';
import type { User } from '../db/index.js';

// ─── Types ──────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'admin' | 'viewer';

export interface CreateUserParams {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

export interface UpdateUserParams {
  name?: string;
  role?: UserRole;
  password?: string;
}

// ─── CRUD ──────────────────────────────────────────────────────────

/**
 * Create a new user. Hashes the password before storing.
 */
export async function createUser(params: CreateUserParams): Promise<User> {
  const passwordHash = await hashPassword(params.password);
  const [user] = await db
    .insert(users)
    .values({
      email: params.email,
      passwordHash,
      name: params.name,
      role: params.role ?? 'admin',
    })
    .returning();
  return user!;
}

/**
 * Get user by email.
 */
export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user;
}

/**
 * Get user by ID.
 */
export async function getUserById(id: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user;
}

/**
 * List all users.
 */
export async function listUsers(): Promise<User[]> {
  return db.select().from(users);
}

/**
 * Update a user. If password is provided, hashes it before storing.
 */
export async function updateUser(id: string, params: UpdateUserParams): Promise<User | undefined> {
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (params.name !== undefined) updates.name = params.name;
  if (params.role !== undefined) updates.role = params.role;
  if (params.password) {
    updates.passwordHash = await hashPassword(params.password);
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning();
  return updated;
}

/**
 * Delete a user by ID.
 */
export async function deleteUser(id: string): Promise<boolean> {
  const result = await db.delete(users).where(eq(users.id, id));
  return (result.rowCount ?? 0) > 0;
}

// ─── Auth Helpers ──────────────────────────────────────────────────

/**
 * Verify email + password credentials. Returns user if valid, null if not.
 */
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  // Update last login timestamp
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return user;
}

// ─── Role Checks ───────────────────────────────────────────────────

/**
 * Check if a user has at least the required role.
 * Hierarchy: owner > admin > viewer
 */
export function hasRole(user: User, requiredRole: UserRole): boolean {
  const hierarchy: Record<UserRole, number> = {
    owner: 3,
    admin: 2,
    viewer: 1,
  };
  return hierarchy[user.role] >= hierarchy[requiredRole];
}

/**
 * Check if a user is the only owner. Prevents demoting/deleting
 * the last owner (which would lock everyone out).
 */
export async function isLastOwner(userId: string): Promise<boolean> {
  const owners = await db
    .select()
    .from(users)
    .where(eq(users.role, 'owner'));
  return owners.length === 1 && owners[0]!.id === userId;
}

// ─── Migration from Phase 1 ────────────────────────────────────────

/**
 * Migrate the Phase 1 admin (stored in business_config) to the users table.
 * Called once during Phase 2 setup. No-op if users table already has records.
 */
export async function migratePhaseOneAdmin(email: string, passwordHash: string, name: string): Promise<User | null> {
  // Check if users already exist
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) return null;

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash, // Already hashed from business_config
      name,
      role: 'owner', // Phase 1 admin becomes owner
    })
    .returning();
  return user ?? null;
}