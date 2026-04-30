/**
 * POST /api/admin/setup — First-run setup wizard.
 *
 * Called once during initial configuration. Creates the .env file
 * and seeds the business_config table with initial values.
 *
 * Body:
 *   business: { name, tagline, website, description }
 *   tone: { style, instructions, greeting?, signoff? }
 *   providers: { llm, llmApiKey, email, emailApiKey, fromEmail }
 *   escalation: { notifyEmail }
 *   booking: { url, cta, timing }
 *
 * Returns the seeded config (same shape as GET /api/admin/config).
 */

import type { APIRoute } from 'astro';
import { db, businessConfig } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createUser } from '@/lib/auth/users.js';
import { createSession, setSessionCookie } from '@/lib/auth/session.js';

// ─── Zod Schema ──────────────────────────────────────────────────

const setupSchema = z.object({
  // Admin account (Step 1)
  admin: z.object({
    email: z.string().email('Valid admin email is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Admin name is required'),
  }),
  // Business info
  business: z.object({
    name: z.string().min(1, 'Business name is required'),
    tagline: z.string().optional().default(''),
    website: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    description: z.string().optional(),
  }),
  tone: z.object({
    style: z.enum(['professional', 'casual', 'friendly', 'formal', 'witty']).default('professional'),
    instructions: z.string().optional(),
    greeting: z.string().optional(),
    signoff: z.string().optional(),
  }).optional(),
  providers: z.object({
    llm: z.enum(['openai', 'anthropic', 'ollama']).default('openai'),
    llmApiKey: z.string().min(1, 'LLM API key is required'),
    llmModel: z.string().optional(),
    email: z.enum(['resend', 'sendgrid', 'mailgun']).default('resend'),
    emailApiKey: z.string().min(1, 'Email API key is required'),
    fromEmail: z.string().email('Must be a valid email').default('hello@yourdomain.com'),
  }),
  escalation: z.object({
    notifyEmail: z.string().email('Must be a valid email'),
  }).optional(),
  booking: z.object({
    url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    cta: z.string().optional(),
    timing: z.enum(['immediately', 'after_first_exchange', 'after_second_exchange', 'manual']).default('after_second_exchange'),
  }).optional(),
});

// ─── Handler ──────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  // Check if setup has already been completed
  const existing = await db
    .select()
    .from(businessConfig)
    .where(eq(businessConfig.key, 'business'));

  // If business config already exists and has a name, setup is done
  if (existing.length > 0) {
    const businessValue = existing[0]!.value as Record<string, unknown>;
    if (businessValue?.name) {
      return new Response(
        JSON.stringify({ error: 'Setup has already been completed. Use PATCH /api/admin/config to update settings.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const messages: string[] = [];
    for (const [field, errors] of Object.entries(fieldErrors)) {
      if (errors && errors.length > 0) {
        messages.push(`${field}: ${errors.join(', ')}`);
      }
    }
    return new Response(
      JSON.stringify({ error: messages.length > 0 ? messages.join('; ') : 'Validation failed' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const data = parsed.data;

  try {
    // Build the config sections to seed
    const configSections: Record<string, unknown> = {
      business: {
        name: data.business.name,
        tagline: data.business.tagline,
        website: data.business.website ?? '',
        description: data.business.description ?? '',
      },
      tone: {
        style: data.tone?.style ?? 'professional',
        instructions: data.tone?.instructions ?? '',
        dos: [],
        donts: [],
        greeting: data.tone?.greeting ?? '',
        signoff: data.tone?.signoff ?? '',
      },
      knowledge: { links: [], texts: [] },
      services: [],
      faq: [],
      escalation: {
        triggerPhrases: [],
        notifyEmail: data.escalation?.notifyEmail ?? '',
        action: 'notify_human',
      },
      booking: {
        url: data.booking?.url ?? '',
        cta: data.booking?.cta ?? 'Book a call',
        timing: data.booking?.timing ?? 'after_second_exchange',
      },
      providers: {
        llm: data.providers.llm,
        // Store the actual API key — resolveEnvKey handles env: prefixed values at runtime,
        // but for initial setup the user provides the raw key directly.
        llmApiKey: data.providers.llmApiKey,
        llmModel: data.providers.llmModel ?? '',
        email: data.providers.email,
        emailApiKey: data.providers.emailApiKey,
        fromEmail: data.providers.fromEmail,
        inbox: '',
      },
      agent: { enabled: false, webhookUrl: '' },
    };

    // Seed all config sections into DB
    for (const [key, value] of Object.entries(configSections)) {
      const typedValue = value as Record<string, unknown> | unknown[];
      await db
        .insert(businessConfig)
        .values({ key, value: typedValue })
        .onConflictDoUpdate({
          target: businessConfig.key,
          set: { value: typedValue, updatedAt: new Date() },
        });
    }

    // Mark setup as complete
    await db
      .insert(businessConfig)
      .values({ key: 'setup_complete', value: { completedAt: new Date().toISOString() } })
      .onConflictDoUpdate({
        target: businessConfig.key,
        set: { value: { completedAt: new Date().toISOString() }, updatedAt: new Date() },
      });

    // Create owner user account
    const adminUser = await createUser({
      email: data.admin.email,
      password: data.admin.password,
      name: data.admin.name,
      role: 'owner',
    });

    // Create session for auto-login
    const sessionToken = await createSession({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role as 'owner',
      name: adminUser.name || undefined,
    });

    const response = new Response(JSON.stringify({
      config: configSections,
      user: { id: adminUser.id, email: adminUser.email, name: adminUser.name, role: adminUser.role },
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

    setSessionCookie(response, sessionToken);
    return response;
  } catch (err) {
    console.error('Setup error:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to complete setup' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};