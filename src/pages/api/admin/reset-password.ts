/**
 * POST /api/admin/reset-password — Request a password reset.
 *
 * Generates a token, hashes it, stores in password_resets table.
 * Sends reset email via configured email provider.
 * Always returns success to prevent email enumeration.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db, passwordResets, businessConfig } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { getUserByEmail } from '@/lib/auth/users.js';
import { createEmailProvider } from '@/lib/providers/email/base.js';
import { resolveEnvKey } from '@/lib/core/response-pipeline.js';

const RESET_TOKEN_EXPIRY_HOURS = 1;

const requestSchema = z.object({
  email: z.string().email('Valid email is required'),
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { email } = parsed.data;

  // Always return success to prevent email enumeration
  const user = await getUserByEmail(email);
  if (!user) {
    return new Response(JSON.stringify({
      success: true,
      message: 'If an account exists with this email, a reset link will be sent.',
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Generate token
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // Store hashed token
  await db.insert(passwordResets).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  // Build reset URL
  const appUrl = String(import.meta.env.APP_URL ?? process.env.APP_URL ?? '');
  const resetUrl = `${appUrl}/admin/reset-password?token=${rawToken}`;

  // Send reset email via configured email provider
  try {
    const [providerConfig] = await db
      .select()
      .from(businessConfig)
      .where(eq(businessConfig.key, 'providers'))
      .limit(1);

    const providers = (providerConfig?.value ?? {}) as Record<string, unknown>;
    const emailProvider = String(providers.email ?? 'resend');
    const emailApiKey = resolveEnvKey(String(providers.emailApiKey ?? ''));
    const fromEmail = String(providers.fromEmail ?? 'hello@yourdomain.com');

    if (emailApiKey) {
      const [bizConfig] = await db
        .select()
        .from(businessConfig)
        .where(eq(businessConfig.key, 'business'))
        .limit(1);

      const business = (bizConfig?.value ?? {}) as Record<string, string>;
      const businessName = business.name || 'Pounce';

      const emailSender = await createEmailProvider({
        provider: emailProvider,
        apiKey: emailApiKey,
        fromEmail,
      });

      await emailSender.send({
        to: email,
        from: fromEmail,
        subject: `Reset your ${businessName} password`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a2e;">Reset Your Password</h2>
            <p>Hi ${user.name},</p>
            <p>We received a request to reset your password for ${businessName}.</p>
            <p style="margin: 24px 0;">
              <a href="${resetUrl}"
                style="display: inline-block; background: #FF6B35; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Reset Password
              </a>
            </p>
            <p style="color: #6b7280; font-size: 14px;">
              This link expires in ${RESET_TOKEN_EXPIRY_HOURS} hour${RESET_TOKEN_EXPIRY_HOURS !== 1 ? 's' : ''}. If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
        replyTo: fromEmail,
      });
    } else {
      console.warn('[reset-password] No email API key configured, reset email not sent');
    }
  } catch (err) {
    console.error('[reset-password] Failed to send reset email:', err);
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'If an account exists with this email, a reset link will be sent.',
    // Include token for MVP/debugging — remove in production
    _debug_resetUrl: resetUrl,
  }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};