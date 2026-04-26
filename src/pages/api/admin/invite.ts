/**
 * POST /api/admin/invite — Invite a new user via email.
 *
 * Owner-only. Generates an invite token, stores hashed version,
 * sends invitation email via configured email provider.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db, passwordResets, businessConfig } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { getSessionFromRequest } from '@/lib/auth/session.js';
import { requireRole } from '@/lib/auth/roles.js';
import { getUserByEmail } from '@/lib/auth/users.js';
import { createEmailProvider } from '@/lib/providers/email/base.js';
import { resolveEnvKey } from '@/lib/core/response-pipeline.js';

const INVITE_EXPIRY_HOURS = 72; // 3 days to accept invite

const inviteSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['admin', 'viewer']).default('viewer'),
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Only owners can invite
  const roleError = requireRole(session, 'owner');
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { email, name, role } = parsed.data;

  // Check if user already exists
  const existing = await getUserByEmail(email);
  if (existing) {
    return new Response(JSON.stringify({ error: 'A user with this email already exists' }), {
      status: 409, headers: { 'Content-Type': 'application/json' } ,
    });
  }

  // Generate invite token
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

  // Store invite as a password reset record with placeholder user ID
  await db.insert(passwordResets).values({
    userId: '00000000-0000-0000-0000-000000000000', // placeholder — replaced on accept
    tokenHash,
    expiresAt,
  });

  // Build invite URL
  const appUrl = String(import.meta.env.APP_URL ?? process.env.APP_URL ?? 'https://pouncefirst.com');
  const inviteUrl = `${appUrl}/admin/accept-invite?token=${rawToken}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&role=${role}`;

  // Send invitation email via configured email provider
  try {
    const [providerConfig] = await db
      .select()
      .from(businessConfig)
      .where(eq(businessConfig.key, 'providers'))
      .limit(1);

    const providers = (providerConfig?.value ?? {}) as Record<string, unknown>;
    const emailProvider = String(providers.email ?? 'resend');
    const emailApiKey = resolveEnvKey(String(providers.emailApiKey ?? ''));
    const fromEmail = String(providers.fromEmail ?? 'hello@pouncefirst.com');

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
        subject: `You've been invited to join ${businessName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a2e;">You've been invited to ${businessName}</h2>
            <p>Hi ${name},</p>
            <p>You've been invited to join the ${businessName} team on Pounce as a <strong>${role}</strong>.</p>
            <p style="margin: 24px 0;">
              <a href="${inviteUrl}"
                style="display: inline-block; background: #FF6B35; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Accept Invitation
              </a>
            </p>
            <p style="color: #6b7280; font-size: 14px;">
              This invitation expires in ${INVITE_EXPIRY_HOURS / 24} days. If you didn't expect this invitation, you can ignore this email.
            </p>
          </div>
        `,
        replyTo: fromEmail,
      });
    } else {
      // No email API key configured — log warning but still return invite URL
      console.warn('[invite] No email API key configured, invitation email not sent');
    }
  } catch (err) {
    // Email send failed — still return success, but log the error
    console.error('[invite] Failed to send invitation email:', err);
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Invitation sent',
    // Include URL for MVP/debugging — remove in production
    _debug_inviteUrl: inviteUrl,
  }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};