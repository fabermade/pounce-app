/**
 * GET/POST /api/admin/logout — Destroy session and clear cookie.
 */

import type { APIRoute } from 'astro';
import { clearSessionCookie } from '@/lib/auth/session.js';

export const GET: APIRoute = async () => {
  return new Response(null, {
    status: 302,
    headers: {
      'Set-Cookie': clearSessionCookie(),
      'Location': '/admin/login',
    },
  });
};

export const POST: APIRoute = async () => {
  const response = new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

  response.headers.append('Set-Cookie', clearSessionCookie());
  return response;
};