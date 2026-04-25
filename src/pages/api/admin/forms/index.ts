/**
 * Form management API — list, create forms.
 *
 * GET  /api/admin/forms          — list all forms
 * POST /api/admin/forms          — create a new form
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, forms } from '@/lib/db/index.js';
import { getSessionFromRequest } from '@/lib/auth/session.js';
import { requireRole } from '@/lib/auth/roles.js';
import type { FormSchema } from '@/lib/db/index.js';

const formFieldSchema: z.ZodType<FormSchema> = z.object({
  name: z.string().min(1),
  type: z.enum(['text', 'email', 'textarea', 'tel', 'select', 'checkbox']),
  label: z.string().min(1),
  required: z.boolean().optional().default(false),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
});

const createFormSchema = z.object({
  name: z.string().min(1, 'Form name is required'),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  fields: z.array(formFieldSchema).min(1, 'At least one field is required'),
  submitMessage: z.string().optional(),
  redirectUrl: z.string().url().optional().or(z.literal('')),
  active: z.boolean().optional().default(true),
});

export const GET: APIRoute = async ({ request }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const allForms = await db.select().from(forms);
  return new Response(JSON.stringify({ forms: allForms }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Only admins and owners can create forms
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

  const parsed = createFormSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const [form] = await db
      .insert(forms)
      .values({
        name: parsed.data.name,
        slug: parsed.data.slug,
        fields: parsed.data.fields,
        submitMessage: parsed.data.submitMessage,
        redirectUrl: parsed.data.redirectUrl || null,
        active: parsed.data.active,
      })
      .returning();

    return new Response(JSON.stringify({ form }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    // Unique constraint violation on slug
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return new Response(JSON.stringify({ error: 'A form with this slug already exists' }), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }
};