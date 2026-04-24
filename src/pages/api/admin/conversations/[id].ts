/**
 * GET /api/admin/conversations/[id] — Single conversation with messages.
 */

import type { APIRoute } from 'astro';
import { db, conversations, messages, leads } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Conversation ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));

    if (!conv) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const [lead] = await db
      .select({ name: leads.name, email: leads.email, company: leads.company, status: leads.status })
      .from(leads)
      .where(eq(leads.id, conv.leadId));

    const convMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);

    return new Response(JSON.stringify({
      conversation: {
        id: conv.id,
        lead: lead || { name: 'Unknown', email: '', company: '', status: 'unknown' },
        status: lead?.status || 'unknown',
        awaitingReply: conv.awaitingReply,
        humanTakeover: conv.humanTakeover,
        messages: convMessages,
        createdAt: conv.createdAt,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error fetching conversation:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch conversation' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};