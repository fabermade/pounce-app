/**
 * OAuth Token Management — Store, refresh, and validate OAuth tokens.
 *
 * Tokens are stored in the `business_config` table under the `providers` key.
 * Access tokens expire (typically in 1 hour), so we auto-refresh them.
 * Refresh tokens are long-lived but can be revoked by the user.
 *
 * Config key structure:
 * {
 *   "providers": {
 *     ...
 *     "inbox": "gmail",
 *     "gmailAccessToken": "env:GMAIL_ACCESS_TOKEN",
 *     "gmailRefreshToken": "env:GMAIL_REFRESH_TOKEN",
 *     "gmailTokenExpiry": "2026-04-26T12:00:00Z",
 *     "gmailClientId": "env:GMAIL_CLIENT_ID",
 *     "gmailClientSecret": "env:GMAIL_CLIENT_SECRET"
 *   }
 * }
 */

import { db, businessConfig } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { resolveEnvKey } from '../core/response-pipeline.js';
import type { OAuthTokens } from '../providers/inbox/base.js';

// ─── Token Storage ─────────────────────────────────────────────────

/**
 * Store OAuth tokens for a provider in business_config.
 * Updates the providers JSONB field with new token values.
 */
export async function storeOAuthTokens(
  provider: string,
  tokens: OAuthTokens,
): Promise<void> {
  const [configRow] = await db
    .select()
    .from(businessConfig)
    .where(eq(businessConfig.key, 'providers'))
    .limit(1);

  const providers = (configRow?.value ?? {}) as Record<string, unknown>;

  providers[`${provider}AccessToken`] = tokens.accessToken;
  providers[`${provider}RefreshToken`] = tokens.refreshToken;
  providers[`${provider}TokenExpiry`] = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

  if (tokens.tokenType) providers[`${provider}TokenType`] = tokens.tokenType;
  if (tokens.scope) providers[`${provider}Scope`] = tokens.scope;

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
}

/**
 * Get a valid (non-expired) access token for a provider.
 * If the token is expired, automatically refreshes it using the refresh token.
 * Returns null if no valid token can be obtained.
 */
export async function getValidToken(provider: string): Promise<string | null> {
  const [configRow] = await db
    .select()
    .from(businessConfig)
    .where(eq(businessConfig.key, 'providers'))
    .limit(1);

  const providers = (configRow?.value ?? {}) as Record<string, unknown>;

  const accessToken = resolveEnvKey(String(providers[`${provider}AccessToken`] ?? ''));
  const refreshToken = resolveEnvKey(String(providers[`${provider}RefreshToken`] ?? ''));
  const tokenExpiry = String(providers[`${provider}TokenExpiry`] ?? '');

  if (!accessToken) return null;

  // Check if token is still valid (with 5-minute buffer)
  if (tokenExpiry) {
    const expiryDate = new Date(tokenExpiry);
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    if (expiryDate.getTime() - bufferMs > Date.now()) {
      return accessToken;
    }
  }

  // Token expired — try to refresh
  if (!refreshToken) {
    console.warn(`[oauth] ${provider} access token expired and no refresh token available`);
    return null;
  }

  try {
    const newTokens = await refreshOAuthToken(provider, refreshToken);
    await storeOAuthTokens(provider, newTokens);
    return newTokens.accessToken;
  } catch (err) {
    console.error(`[oauth] Failed to refresh ${provider} token:`, err);
    return null;
  }
}

/**
 * Get OAuth config for a provider (client ID, client secret, etc.)
 * Resolves env:KEY references to actual values.
 */
export async function getOAuthConfig(provider: string): Promise<{
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string;
  redirectUri: string;
}> {
  const [configRow] = await db
    .select()
    .from(businessConfig)
    .where(eq(businessConfig.key, 'providers'))
    .limit(1);

  const providers = (configRow?.value ?? {}) as Record<string, unknown>;

  return {
    clientId: resolveEnvKey(String(providers[`${provider}ClientId`] ?? '')),
    clientSecret: resolveEnvKey(String(providers[`${provider}ClientSecret`] ?? '')),
    accessToken: resolveEnvKey(String(providers[`${provider}AccessToken`] ?? '')),
    refreshToken: resolveEnvKey(String(providers[`${provider}RefreshToken`] ?? '')),
    tokenExpiry: String(providers[`${provider}TokenExpiry`] ?? ''),
    redirectUri: resolveEnvKey(String(providers[`${provider}RedirectUri`] ?? `${String(import.meta.env.APP_URL ?? process.env.APP_URL ?? '')}/api/auth/${provider}/callback`)),
  };
}

// ─── Token Refresh ──────────────────────────────────────────────────

/**
 * Refresh an OAuth token using the provider's token endpoint.
 * Supports Gmail (Google) and Outlook (Microsoft Graph).
 */
async function refreshOAuthToken(
  provider: string,
  refreshToken: string,
): Promise<OAuthTokens> {
  const config = await getOAuthConfig(provider);

  let tokenUrl: string;
  let body: Record<string, string>;

  if (provider === 'gmail') {
    tokenUrl = 'https://oauth2.googleapis.com/token';
    body = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    };
  } else if (provider === 'outlook') {
    tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    body = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      redirect_uri: config.redirectUri,
    };
  } else {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OAuth token refresh failed for ${provider}: ${response.status} ${errorBody}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken, // Google doesn't always return a new refresh token
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

/**
 * Disconnect an OAuth provider by clearing its tokens from config.
 */
export async function disconnectOAuthProvider(provider: string): Promise<void> {
  const [configRow] = await db
    .select()
    .from(businessConfig)
    .where(eq(businessConfig.key, 'providers'))
    .limit(1);

  const providers = (configRow?.value ?? {}) as Record<string, unknown>;

  // Clear tokens but keep client ID/secret
  delete providers[`${provider}AccessToken`];
  delete providers[`${provider}RefreshToken`];
  delete providers[`${provider}TokenExpiry`];
  delete providers[`${provider}TokenType`];
  delete providers[`${provider}Scope`];
  providers.inbox = '';

  if (configRow) {
    await db
      .update(businessConfig)
      .set({ value: providers, updatedAt: new Date() })
      .where(eq(businessConfig.key, 'providers'));
  }
}