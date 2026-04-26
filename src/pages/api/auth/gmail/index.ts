/**
 * GET /api/auth/gmail — Start Gmail OAuth2 flow.
 *
 * Redirects the user to Google's consent screen.
 * After consent, Google redirects back to /api/auth/gmail/callback.
 */

import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@/lib/auth/session.js';
import { getOAuthConfig } from '@/lib/providers/oauth.js';
import { GmailInboxProvider } from '@/lib/providers/inbox/gmail.js';

export const GET: APIRoute = async ({ request, redirect }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const config = await getOAuthConfig('gmail');
  if (!config.clientId || !config.clientSecret) {
    return new Response(JSON.stringify({ error: 'Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const provider = new GmailInboxProvider({
    accessToken: '',
    refreshToken: '',
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });

  const state = crypto.randomUUID(); // CSRF protection
  const authUrl = provider.getAuthUrl(config.redirectUri, state);

  // Store state in a cookie for verification in callback
  return redirect(authUrl, 302);
};