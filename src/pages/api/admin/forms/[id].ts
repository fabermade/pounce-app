/**
 * Form management API — single form operations.
 *
 * GET    /api/admin/forms/:id       — get form by ID
 * PATCH  /api/admin/forms/:id       — update form
 * DELETE /api/admin/forms/:id       — delete form
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, forms } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
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

const updateFormSchema = z.object({
  name: z.string().min(1).optional(),
  fields: z.array(formFieldSchema).min(1).optional(),
  submitMessage: z.string().optional(),
  redirectUrl: z.string().url().refine(url => url.startsWith('https://'), { message: 'Redirect URL must use https://' }).optional().or(z.literal('')).optional(),
  active: z.boolean().optional(),
});

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const formId = params.id;
  if (!formId) {
    return new Response(JSON.stringify({ error: 'Form ID is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const [form] = await db
    .select()
    .from(forms)
    .where(eq(forms.id, formId))
    .limit(1);

  if (!form) {
    return new Response(JSON.stringify({ error: 'Form not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ form }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const roleError = requireRole(session, 'admin');
  if (roleError) return roleError;

  const formId = params.id;
  if (!formId) {
    return new Response(JSON.stringify({ error: 'Form ID is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = updateFormSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.fields !== undefined) updates.fields = parsed.data.fields;
  if (parsed.data.submitMessage !== undefined) updates.submitMessage = parsed.data.submitMessage;
  if (parsed.data.redirectUrl !== undefined) updates.redirectUrl = parsed.data.redirectUrl || null;
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;

  const [updated] = await db
    .update(forms)
    .set(updates)
    .where(eq(forms.id, formId))
    .returning();

  if (!updated) {
    return new Response(JSON.stringify({ error: 'Form not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ form: updated }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const roleError = requireRole(session, 'admin');
  if (roleError) return roleError;

  const formId = params.id;
  if (!formId) {
    return new Response(JSON.stringify({ error: 'Form ID is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await db.delete(forms).where(eq(forms.id, formId));
  if ((result.rowCount ?? 0) === 0) {
    return new Response(JSON.stringify({ error: 'Form not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};