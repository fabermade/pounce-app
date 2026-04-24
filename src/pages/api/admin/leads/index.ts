/**
 * GET /api/admin/leads — List leads with filters.
 *
 * Query params:
 *   status  — filter by pipeline status
 *   source  — filter by source (form, email, webhook, api)
 *   search  — search name, email, company
 *   page    — page number (default 1)
 *   limit   — results per page (default 25, max 100)
 */

import type { APIRoute } from 'astro';
import { db, leads } from '@/lib/db/index.js';
import { eq, desc, count, sql } from 'drizzle-orm';
import { z } from 'zod';

const querySchema = z.object({
  status: z.enum([
    'new', 'contacted', 'customer_waiting', 'scheduled',
    'closed_won', 'closed_lost', 'escalated', 'opted_out',
  ]).optional(),
  source: z.enum(['form', 'email', 'webhook', 'api']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const GET: APIRoute = async ({ url }) => {
  const params = Object.fromEntries(url.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { status, source, search, page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  try {
    // Build where conditions
    const conditions = [];
    if (status) conditions.push(eq(leads.status, status));
    if (source) conditions.push(eq(leads.source, source));
    if (search) conditions.push(
      sql`(${leads.name} ILIKE ${`%${search}%`} OR ${leads.email} ILIKE ${`%${search}%`} OR ${leads.company} ILIKE ${`%${search}%`})`
    );

    const whereClause = conditions.length > 0
      ? sql.join(conditions, sql` AND `)
      : undefined;

    // Fetch leads
    const results = await db
      .select()
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const countResult = await db
      .select({ value: count() })
      .from(leads)
      .where(whereClause);

    const total = Number(countResult[0]?.value ?? 0);

    return new Response(JSON.stringify({
      leads: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error fetching leads:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch leads' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};