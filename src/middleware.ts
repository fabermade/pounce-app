import { defineMiddleware } from 'astro:middleware';
import { verifySession, getSessionToken } from '@/lib/auth/session.js';
import type { SessionData } from '@/lib/auth/session.js';

// ─── Route Classification ──────────────────────────────────────────

const PUBLIC_PATHS = new Set([
  '/api/inbound',
  '/api/unsubscribe',
  '/book',
]);

const AUTH_PATHS = new Set([
  '/api/admin/login',
  '/admin/login',
  '/admin/reset-password',
  '/admin/accept-invite',
  '/api/admin/reset-password',
  '/api/admin/verify-reset',
]);

// Paths that start with these prefixes are public
const PUBLIC_PREFIXES = ['/api/webhook/'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return false;
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.has(pathname);
}

function isSetupPath(pathname: string): boolean {
  return pathname === '/admin/setup' || pathname === '/api/admin/setup' || pathname === '/api/admin/setup/status';
}

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
}

// ─── Middleware ─────────────────────────────────────────────────────

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = new URL(context.request.url);

  // Public paths — always allow
  if (isPublicPath(pathname)) {
    return next();
  }

  // Non-admin paths — always allow (landing page, etc.)
  if (!isAdminPath(pathname)) {
    return next();
  }

  // Setup paths — allow through (no auth needed for initial setup)
  if (isSetupPath(pathname)) {
    return next();
  }

  // Auth paths — allow through (login page, login endpoint)
  if (isAuthPath(pathname)) {
    return next();
  }

  // All other admin paths — require valid session
  const token = getSessionToken(context.request);
  if (!token) {
    return redirectToLogin(context.request);
  }

  const session = await verifySession(token);
  if (!session) {
    // Invalid or expired token — clear and redirect
    return redirectToLogin(context.request, true);
  }

  // Store session data on context for route handlers to use
  context.locals.session = session;

  return next();
});

// ─── Helpers ───────────────────────────────────────────────────────

function redirectToLogin(request: Request, clearCookie = false): Response {
  const url = new URL(request.url);

  // API requests get 401, page requests get redirected
  if (url.pathname.startsWith('/api/')) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (clearCookie) {
      headers['Set-Cookie'] = clearSessionCookieStr();
    }
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers,
    });
  }

  // Page request — redirect to login with return URL
  const loginUrl = new URL('/admin/login', url.origin);
  loginUrl.searchParams.set('redirect', url.pathname);

  const headers = new Headers({ Location: loginUrl.toString() });
  if (clearCookie) {
    headers.append('Set-Cookie', clearSessionCookieStr());
  }

  return new Response(null, { status: 302, headers });
}

/**
 * Build clear-cookie string without dynamic import.
 * Matches the format from session.ts clearSessionCookie().
 */
function clearSessionCookieStr(): string {
  const isProduction = import.meta.env.PROD ?? process.env.NODE_ENV === 'production';
  return `pounce_session=; HttpOnly; Secure=${isProduction}; SameSite=Strict; Path=/; Max-Age=0`;
}