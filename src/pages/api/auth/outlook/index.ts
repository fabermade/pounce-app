/**
 * GET /api/auth/outlook — Start Outlook/Microsoft Graph OAuth2 flow.
 *
 * Redirects the user to Microsoft's consent screen.
 * After consent, Microsoft redirects back to /api/auth/outlook/callback.
 */

import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@/lib/auth/session.js';
import { getOAuthConfig } from '@/lib/providers/oauth.js';
import { OutlookInboxProvider } from '@/lib/providers/inbox/outlook.js';

export const GET: APIRoute = async ({ request, redirect }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const config = await getOAuthConfig('outlook');
  if (!config.clientId || !config.clientSecret) {
    return new Response(JSON.stringify({ error: 'Outlook OAuth not configured. Set OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const provider = new OutlookInboxProvider({
    accessToken: '',
    refreshToken: '',
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });

  const state = crypto.randomUUID();
  const authUrl = provider.getAuthUrl(config.redirectUri, state);

  return redirect(authUrl, 302);
};