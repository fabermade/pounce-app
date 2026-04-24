/**
 * GET /api/admin/leads/[id] — Single lead detail.
 * PATCH /api/admin/leads/[id] — Update lead (status, etc.)
 */

import type { APIRoute } from 'astro';
import { db, leads } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { isValidTransition, logEvent } from '@/lib/core/pipeline.js';
import { z } from 'zod';

/**
 * GET — Fetch single lead
 */
export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Lead ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, id));

    if (!lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ lead }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error fetching lead:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch lead' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * PATCH — Update lead (status transitions validated)
 */
const patchSchema = z.object({
  status: z.enum([
    'new', 'contacted', 'customer_waiting', 'scheduled',
    'closed_won', 'closed_lost', 'escalated', 'opted_out',
  ]).optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  company: z.string().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Lead ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [existing] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, id));

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate status transition if changing status
    if (parsed.data.status && parsed.data.status !== existing.status) {
      const validTransition = isValidTransition(
        existing.status as string,
        parsed.data.status,
      );
      if (!validTransition) {
        return new Response(JSON.stringify({
          error: `Cannot transition lead from "${existing.status}" to "${parsed.data.status}"`,
        }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const [updated] = await db
      .update(leads)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, id))
      .returning();

    // Log status change event
    if (parsed.data.status) {
      await logEvent(id, 'status_change', {
        from: existing.status,
        to: parsed.data.status,
      });
    }

    return new Response(JSON.stringify({ lead: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error updating lead:', err);
    return new Response(JSON.stringify({ error: 'Failed to update lead' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};