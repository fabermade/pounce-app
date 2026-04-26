/**
 * POST /api/f/:slug — Public form submission endpoint.
 *
 * No auth required — this is the endpoint that embedded forms POST to.
 * Validates form data against the form's field schema,
 * creates a lead via the inbound API, and stores the submission.
 *
 * Spam protection:
 * - Honeypot field: if `pounce_hp` is filled, silently "succeed" (it's a bot)
 * - Rate limiting: max 5 submissions per IP per form per minute
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, forms, formSubmissions } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { addMessage } from '@/lib/core/conversation.js';
import { runResponsePipeline } from '@/lib/core/response-pipeline.js';
import { logEvent } from '@/lib/core/pipeline.js';

// ─── Rate Limiting ─────────────────────────────────────────────────
// In-memory rate limit: max 5 submissions per IP per form per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60_000; // 1 minute

function checkRateLimit(ip: string, formSlug: string): boolean {
  const key = `${ip}:${formSlug}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60_000);

export const POST: APIRoute = async ({ request, params, clientAddress }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: 'Form slug is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Rate limiting
  const ip = clientAddress ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!checkRateLimit(ip, slug)) {
    return new Response(JSON.stringify({ error: 'Too many submissions. Please wait a minute and try again.' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1. Look up form by slug
  const [form] = await db
    .select()
    .from(forms)
    .where(eq(forms.slug, slug))
    .limit(1);

  if (!form || !form.active) {
    return new Response(JSON.stringify({ error: 'Form not found or inactive' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Parse form data
  let body: unknown;
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    // URL-encoded form data
    try {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid form data' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const data = body as Record<string, unknown>;

  // 2.5 Honeypot check — if pounce_hp is filled, it's a bot
  // Silently "succeed" so bots don't know they were caught
  if (data.pounce_hp && String(data.pounce_hp).trim()) {
    return new Response(JSON.stringify({
      success: true,
      message: form.submitMessage ?? 'Thank you! We\'ll be in touch soon.',
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  // Remove honeypot from data so it's not stored
  delete data.pounce_hp;

  // 3. Validate required fields
  const fieldSchema = form.fields as Array<{ name: string; type: string; label: string; required?: boolean }>;
  const errors: Record<string, string> = {};

  for (const field of fieldSchema) {
    const value = data[field.name];
    if (field.required && (!value || String(value).trim() === '')) {
      errors[field.name] = `${field.label} is required`;
    }
    // Email format validation
    if (field.type === 'email' && value && !z.string().email().safeParse(value).success) {
      errors[field.name] = 'Valid email is required';
    }
  }

  if (Object.keys(errors).length > 0) {
    return new Response(JSON.stringify({ error: 'Validation failed', details: errors }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Extract key fields for lead creation
  const emailField = fieldSchema.find((f) => f.type === 'email');
  const nameField = fieldSchema.find((f) => f.type === 'text' && (f.name === 'name' || f.name.includes('name')));
  const messageField = fieldSchema.find((f) => f.type === 'textarea');

  const email = emailField ? String(data[emailField.name] ?? '') : '';
  const name = nameField ? String(data[nameField.name] ?? '') : email;
  const message = messageField ? String(data[messageField.name] ?? '') : Object.entries(data)
    .filter(([key]) => !['email', 'name'].includes(key))
    .map(([key, val]) => `${key}: ${val}`)
    .join('\n');

  if (!email) {
    return new Response(JSON.stringify({ error: 'Email field is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 5. Create lead via inbound pipeline
  try {
    // Import the lead processing logic
    const { db: dbClient, leads, conversations } = await import('@/lib/db/index.js');
    const { eq: eqOp } = await import('drizzle-orm');

    // Check for existing lead
    const [existingLead] = await dbClient
      .select()
      .from(leads)
      .where(eqOp(leads.email, email))
      .limit(1);

    let leadId: string;
    let conversationId: string;

    if (existingLead) {
      leadId = existingLead.id;
      const [existingConv] = await dbClient
        .select()
        .from(conversations)
        .where(eqOp(conversations.leadId, leadId))
        .limit(1);

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        const [conv] = await dbClient
          .insert(conversations)
          .values({ leadId, inboxProvider: 'form', awaitingReply: true })
          .returning();
        conversationId = conv!.id;
      }

      await addMessage(conversationId, 'user', 'customer', message || 'Form submission', { formSlug: slug });
    } else {
      const [newLead] = await dbClient
        .insert(leads)
        .values({
          source: 'form',
          type: 'lead',
          name,
          email,
          message: message || 'Form submission',
          status: 'new',
          metadata: { formSlug: slug, formName: form.name, formData: data },
        })
        .returning();
      leadId = newLead!.id;

      const [conv] = await dbClient
        .insert(conversations)
        .values({ leadId, inboxProvider: 'form', awaitingReply: true })
        .returning();
      conversationId = conv!.id;

      await addMessage(conversationId, 'user', 'customer', message || 'Form submission', { formSlug: slug });
      await logEvent(leadId, 'email_received', { source: 'form', formSlug: slug });
    }

    // 6. Store form submission
    await db.insert(formSubmissions).values({
      formId: form.id,
      data,
      leadId,
    });

    // 7. Run AI response pipeline
    const pipelineResult = await runResponsePipeline(conversationId);

    // 8. Return success (with redirect if configured)
    const responseData = {
      success: true,
      message: form.submitMessage ?? 'Thank you! We\'ll be in touch soon.',
      redirectUrl: form.redirectUrl ?? undefined,
      leadId,
      aiResponseSent: pipelineResult.aiResponseSent,
    };

    return new Response(JSON.stringify(responseData), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Form submission error:', err);
    return new Response(JSON.stringify({ error: 'Failed to process submission' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};