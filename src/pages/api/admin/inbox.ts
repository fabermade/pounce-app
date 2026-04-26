/**
 * Admin Inbox Configuration API
 *
 * GET  /api/admin/inbox — Get current inbox config + connection status
 * PATCH /api/admin/inbox — Update inbox config (client ID, secret, etc.)
 * POST /api/admin/inbox/disconnect — Disconnect inbox provider (clear tokens)
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, businessConfig } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { getSessionFromRequest } from '@/lib/auth/session.js';
import { requireRole } from '@/lib/auth/roles.js';
import { resolveEnvKey } from '@/lib/core/response-pipeline.js';
import { createInboxProvider } from '@/lib/providers/inbox/index.js';
import { getOAuthConfig } from '@/lib/providers/oauth.js';

// ─── GET: Inbox Status ──────────────────────────────────────────────

export const GET: APIRoute = async ({ request }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const roleError = requireRole(session, 'viewer');
  if (roleError) return roleError;

  const [configRow] = await db
    .select()
    .from(businessConfig)
    .where(eq(businessConfig.key, 'providers'))
    .limit(1);

  const providers = (configRow?.value ?? {}) as Record<string, unknown>;

  const inboxProvider = String(providers.inbox ?? '');

  // Build masked config
  const config: Record<string, unknown> = {
    inbox: inboxProvider,
  };

  // For each possible inbox provider, show masked or present status
  for (const provider of ['gmail', 'outlook']) {
    const clientId = resolveEnvKey(String(providers[`${provider}ClientId`] ?? ''));
    const hasToken = !!resolveEnvKey(String(providers[`${provider}AccessToken`] ?? ''));
    const hasRefreshToken = !!resolveEnvKey(String(providers[`${provider}RefreshToken`] ?? ''));

    config[provider] = {
      connected: inboxProvider === provider && hasToken,
      clientIdConfigured: !!clientId,
      clientId: clientId ? '••••••••' : '',
      clientSecretConfigured: !!resolveEnvKey(String(providers[`${provider}ClientSecret`] ?? '')),
      clientSecret: resolveEnvKey(String(providers[`${provider}ClientSecret`] ?? '')) ? '••••••••' : '',
      hasAccessToken: hasToken,
      hasRefreshToken,
      tokenExpiry: String(providers[`${provider}TokenExpiry`] ?? ''),
    };
  }

  // Check if current provider is actually authenticated
  let authenticated = false;
  if (inboxProvider) {
    try {
      const oauthConfig = await getOAuthConfig(inboxProvider);
      const provider = createInboxProvider({
        provider: inboxProvider,
        accessToken: oauthConfig.accessToken,
        refreshToken: oauthConfig.refreshToken,
        clientId: oauthConfig.clientId,
        clientSecret: oauthConfig.clientSecret,
      });
      if (provider) {
        authenticated = await provider.isAuthenticated();
      }
    } catch (err) {
      console.error(`[inbox] Auth check failed for ${inboxProvider}:`, err);
    }
  }

  return new Response(JSON.stringify({
    config,
    authenticated,
    activeProvider: inboxProvider || null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// ─── PATCH: Update Inbox Config ─────────────────────────────────────

const inboxConfigSchema = z.object({
  inbox: z.enum(['gmail', 'outlook', '']).optional(),
  gmailClientId: z.string().optional(),
  gmailClientSecret: z.string().optional(),
  outlookClientId: z.string().optional(),
  outlookClientSecret: z.string().optional(),
});

export const PATCH: APIRoute = async ({ request }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const roleError = requireRole(session, 'admin');
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = inboxConfigSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const updates = parsed.data;

  // Load current config
  const [configRow] = await db
    .select()
    .from(businessConfig)
    .where(eq(businessConfig.key, 'providers'))
    .limit(1);

  const providers = (configRow?.value ?? {}) as Record<string, unknown>;

  // Apply updates, preserving masked secrets
  if (updates.inbox !== undefined) {
    providers.inbox = updates.inbox;
  }

  // Map flat field names to provider-prefixed config keys
  const fieldMap: Record<string, string> = {
    gmailClientId: 'gmailClientId',
    gmailClientSecret: 'gmailClientSecret',
    outlookClientId: 'outlookClientId',
    outlookClientSecret: 'outlookClientSecret',
  };

  for (const [field, configKey] of Object.entries(fieldMap)) {
    const value = updates[field as keyof typeof updates];
    if (value !== undefined) {
      // Preserve existing value if masked or empty
      if (value === '' || value === '••••••••') {
        // Keep existing — don't overwrite
        if (!(configKey in providers)) {
          providers[configKey] = '';
        }
      } else {
        providers[configKey] = value;
      }
    }
  }

  // Save
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

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

