/**
 * POST /api/admin/conversations/[id]/reply — Send a human reply in a conversation.
 *
 * Body: { content: string }
 *
 * Marks conversation as human-takeover, creates a message,
 * and updates lead status to reflect human involvement.
 */

import type { APIRoute } from 'astro';
import { db, conversations, messages, leads } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logEvent } from '@/lib/core/pipeline.js';

const replySchema = z.object({
  content: z.string().min(1).max(10000),
});

export const POST: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Conversation ID required' }), {
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

  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Verify conversation exists
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

    // Create human reply message
    const [msg] = await db
      .insert(messages)
      .values({
        conversationId: id,
        role: 'assistant',
        source: 'human',
        content: parsed.data.content,
      })
      .returning();

    // Mark conversation as human takeover and no longer awaiting reply
    await db
      .update(conversations)
      .set({
        humanTakeover: true,
        awaitingReply: false,
        lastOutboundAt: new Date(),
      })
      .where(eq(conversations.id, id));

    // Update lead status to escalated (human took over)
    await db
      .update(leads)
      .set({
        status: 'escalated',
        updatedAt: new Date(),
      })
      .where(eq(leads.id, conv.leadId));

    // Log the human takeover event
    await logEvent(conv.leadId, 'human_takeover', {
      conversationId: id,
      content: parsed.data.content,
    });

    return new Response(JSON.stringify({ message: msg }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error sending reply:', err);
    return new Response(JSON.stringify({ error: 'Failed to send reply' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};