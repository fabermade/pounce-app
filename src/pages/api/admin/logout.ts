/**
 * POST /api/admin/logout — Destroy session and clear cookie.
 */

import type { APIRoute } from 'astro';
import { clearSessionCookie } from '@/lib/auth/session.js';

export const POST: APIRoute = async () => {
  const response = new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

  response.headers.append('Set-Cookie', clearSessionCookie());
  return response;
};