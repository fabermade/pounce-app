/**
 * Session management — HMAC-SHA256 signed cookies.
 *
 * Sessions store: { userId, role, email }
 * Cookie is signed with SESSION_SECRET to prevent tampering.
 * 24-hour expiry.
 */

import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from './users.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface SessionData {
  userId: string;
  email: string;
  role: UserRole;
  name?: string;
}

export interface SessionResult {
  data: SessionData;
  expiresAt: Date;
}

// ─── Config ─────────────────────────────────────────────────────────

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const COOKIE_NAME = 'pounce_session';

let _cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (_cachedSecret) return _cachedSecret;

  const secret = import.meta.env.SESSION_SECRET ?? process.env.SESSION_SECRET ?? '';
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is not set');
  }
  _cachedSecret = new TextEncoder().encode(secret);
  return _cachedSecret;
}

// ─── Session CRUD ──────────────────────────────────────────────────

/**
 * Create a signed JWT session token.
 */
export async function createSession(data: SessionData): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const secret = getSecret();

  const token = await new SignJWT({ ...data })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);

  return token;
}

/**
 * Verify a session token. Returns session data or null if invalid/expired.
 */
export async function verifySession(token: string): Promise<SessionData | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret);

    // Validate required fields
    if (!payload.userId || !payload.email || !payload.role) {
      return null;
    }

    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as UserRole,
      name: (payload.name as string) || undefined,
    };
  } catch {
    // Token invalid, expired, or tampered
    return null;
  }
}

// ─── Cookie Helpers ───────────────────────────────────────────────

/**
 * Set session cookie on a Response.
 */
export function setSessionCookie(response: Response, token: string): void {
  const isProduction = import.meta.env.PROD ?? process.env.NODE_ENV === 'production';
  const maxAge = SESSION_DURATION_MS / 1000;

  response.headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Secure=${isProduction}; SameSite=Strict; Path=/; Max-Age=${maxAge}`,
  );
}

/**
 * Build a Clear-Cookie header value to destroy the session.
 */
export function clearSessionCookie(): string {
  const isProduction = import.meta.env.PROD ?? process.env.NODE_ENV === 'production';
  return `${COOKIE_NAME}=; HttpOnly; Secure=${isProduction}; SameSite=Strict; Path=/; Max-Age=0`;
}

/**
 * Extract session token from request cookies.
 */
export function getSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1]! : null;
}

/**
 * Full session verification from a request object.
 * Returns session data or null.
 */
export async function getSessionFromRequest(request: Request): Promise<SessionData | null> {
  const token = getSessionToken(request);
  if (!token) return null;
  return verifySession(token);
}