/**
 * GET /api/auth/outlook/callback — Outlook OAuth2 callback.
 *
 * Microsoft redirects here after the user consents.
 * Exchange the auth code for tokens, store them, redirect to admin settings.
 */

import type { APIRoute } from 'astro';
import { db, businessConfig } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { OutlookInboxProvider } from '@/lib/providers/inbox/outlook.js';
import { storeOAuthTokens, getOAuthConfig } from '@/lib/providers/oauth.js';

export const GET: APIRoute = async ({ url, redirect }) => {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    console.error('[outlook-oauth] OAuth error:', error);
    return redirect('/admin/settings?inbox=error&provider=outlook', 302);
  }

  if (!code) {
    return redirect('/admin/settings?inbox=error&provider=outlook', 302);
  }

  try {
    const config = await getOAuthConfig('outlook');
    const provider = new OutlookInboxProvider({
      accessToken: '',
      refreshToken: '',
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    const tokens = await provider.exchangeCode(code, config.redirectUri);
    await storeOAuthTokens('outlook', tokens);

    // Set inbox provider to outlook
    const [configRow] = await db
      .select()
      .from(businessConfig)
      .where(eq(businessConfig.key, 'providers'))
      .limit(1);

    const providers = (configRow?.value ?? {}) as Record<string, unknown>;
    providers.inbox = 'outlook';

    if (configRow) {
      await db
        .update(businessConfig)
        .set({ value: providers, updatedAt: new Date() })
        .where(eq(businessConfig.key, 'providers'));
    } else {
      await db.insert(businessConfig).values({
        key: 'providers',
        value: providers,
      });
    }

    return redirect('/admin/settings?inbox=connected&provider=outlook', 302);
  } catch (err) {
    console.error('[outlook-oauth] Token exchange failed:', err);
    return redirect('/admin/settings?inbox=error&provider=outlook', 302);
  }
};