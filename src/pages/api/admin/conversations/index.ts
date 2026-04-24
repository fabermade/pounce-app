/**
 * GET /api/admin/conversations — List conversations with messages.
 *
 * Query params:
 *   leadId    — filter by lead ID
 *   status    — filter by lead status (joins leads table)
 *   awaiting  — filter conversations awaiting reply (true/false)
 *   page      — page number (default 1)
 *   limit     — results per page (default 25, max 100)
 */

import type { APIRoute } from 'astro';
import { db, conversations, messages, leads } from '@/lib/db/index.js';
import { eq, desc, count, sql } from 'drizzle-orm';
import { z } from 'zod';

const querySchema = z.object({
  leadId: z.string().uuid().optional(),
  status: z.enum([
    'new', 'contacted', 'customer_waiting', 'scheduled',
    'closed_won', 'closed_lost', 'escalated', 'opted_out',
  ]).optional(),
  awaiting: z.enum(['true', 'false']).optional().transform(v =>
    v === 'true' ? true : v === 'false' ? false : undefined
  ),
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

  const { leadId, status, awaiting, page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  try {
    // Build where conditions for conversations
    const conditions = [];
    if (leadId) conditions.push(eq(conversations.leadId, leadId));
    if (awaiting !== undefined) conditions.push(eq(conversations.awaitingReply, awaiting));

    // If filtering by lead status, we need to join
    if (status) {
      conditions.push(eq(leads.status, status));
    }

    const whereClause = conditions.length > 0
      ? sql.join(conditions, sql` AND `)
      : undefined;

    // Fetch conversations (join leads if status filter)
    const convResults = status
      ? await db
          .select({
            id: conversations.id,
            leadId: conversations.leadId,
            inboxProvider: conversations.inboxProvider,
            awaitingReply: conversations.awaitingReply,
            humanTakeover: conversations.humanTakeover,
            lastInboundAt: conversations.lastInboundAt,
            lastOutboundAt: conversations.lastOutboundAt,
            createdAt: conversations.createdAt,
            leadName: leads.name,
            leadEmail: leads.email,
            leadCompany: leads.company,
            leadStatus: leads.status,
          })
          .from(conversations)
          .innerJoin(leads, eq(conversations.leadId, leads.id))
          .where(whereClause)
          .orderBy(desc(conversations.createdAt))
          .limit(limit)
          .offset(offset)
      : await db
          .select()
          .from(conversations)
          .where(whereClause)
          .orderBy(desc(conversations.createdAt))
          .limit(limit)
          .offset(offset);

    // For each conversation, fetch messages and lead info
    const conversationsWithMessages = await Promise.all(
      convResults.map(async (conv) => {
        const convMessages = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conv.id))
          .orderBy(messages.createdAt);

        // Get lead info if not already joined
        let leadInfo: { name: string | null; email: string; company: string | null; status: string };
        if (status && 'leadName' in conv) {
          leadInfo = {
            name: (conv as Record<string, unknown>).leadName as string | null,
            email: (conv as Record<string, unknown>).leadEmail as string,
            company: (conv as Record<string, unknown>).leadCompany as string | null,
            status: (conv as Record<string, unknown>).leadStatus as string,
          };
        } else {
          const [lead] = await db
            .select({ name: leads.name, email: leads.email, company: leads.company, status: leads.status })
            .from(leads)
            .where(eq(leads.id, conv.leadId));
          leadInfo = lead || { name: 'Unknown', email: '', company: '', status: 'new' };
        }

        return {
          id: conv.id,
          lead: leadInfo,
          status: leadInfo.status,
          awaitingReply: conv.awaitingReply,
          humanTakeover: conv.humanTakeover,
          messages: convMessages,
          createdAt: conv.createdAt,
        };
      }),
    );

    // Get total count for pagination
    const countResult = await db
      .select({ value: count() })
      .from(conversations);
    const total = Number(countResult[0]?.value ?? 0);

    return new Response(JSON.stringify({
      conversations: conversationsWithMessages,
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
    console.error('Error fetching conversations:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch conversations' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};