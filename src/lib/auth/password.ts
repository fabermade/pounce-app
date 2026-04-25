/**
 * Password utilities — bcrypt hashing and verification.
 * 
 * Uses Web Crypto API for constant-time comparison.
 * bcrypt handles both hashing and salt generation.
 */

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Hash a plaintext password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 * Constant-time comparison via bcrypt internally.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}