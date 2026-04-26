/**
 * GET /api/auth/gmail/callback — Gmail OAuth2 callback.
 *
 * Google redirects here after the user consents.
 * Exchange the auth code for tokens, store them, redirect to admin settings.
 */

import type { APIRoute } from 'astro';
import { db, businessConfig } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { GmailInboxProvider } from '@/lib/providers/inbox/gmail.js';
import { storeOAuthTokens } from '@/lib/providers/oauth.js';
import { getOAuthConfig } from '@/lib/providers/oauth.js';

export const GET: APIRoute = async ({ url, redirect }) => {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    console.error('[gmail-oauth] OAuth error:', error);
    return redirect('/admin/settings?inbox=error&provider=gmail', 302);
  }

  if (!code) {
    return redirect('/admin/settings?inbox=error&provider=gmail', 302);
  }

  try {
    const config = await getOAuthConfig('gmail');
    const provider = new GmailInboxProvider({
      accessToken: '',
      refreshToken: '',
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    const tokens = await provider.exchangeCode(code, config.redirectUri);
    await storeOAuthTokens('gmail', tokens);

    // Set inbox provider to gmail
    const [configRow] = await db
      .select()
      .from(businessConfig)
      .where(eq(businessConfig.key, 'providers'))
      .limit(1);

    const providers = (configRow?.value ?? {}) as Record<string, unknown>;
    providers.inbox = 'gmail';

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

    return redirect('/admin/settings?inbox=connected&provider=gmail', 302);
  } catch (err) {
    console.error('[gmail-oauth] Token exchange failed:', err);
    return redirect('/admin/settings?inbox=error&provider=gmail', 302);
  }
};