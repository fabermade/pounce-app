/**
 * Conversation Manager — Handle conversation state and message history.
 * 
 * Loads conversations, appends messages, tracks AI message counts,
 * enforces the 10-message cap per conversation.
 */

import { db, conversations, messages, leads } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import type { Message } from '../db/index.js';

// ─── Constants ─────────────────────────────────────────────────────

const MAX_AI_MESSAGES_PER_CONVERSATION = 10;

// ─── Types ────────────────────────────────────────────────────────

export interface ConversationContext {
  conversationId: string;
  leadId: string;
  leadName: string | null;
  leadEmail: string;
  leadStatus: string;
  humanTakeover: boolean;
  awaitingReply: boolean;
  messageCount: number;
  aiMessageCount: number;
  history: { role: 'user' | 'assistant'; content: string }[];
}

// ─── Operations ───────────────────────────────────────────────────

/** Load full conversation context for LLM prompt assembly */
export async function getConversationContext(
  conversationId: string,
): Promise<ConversationContext | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) return null;

  const lead = await db
    .select()
    .from(leads)
    .where(eq(leads.id, conversation.leadId))
    .limit(1);

  const leadData = lead[0];

  // Load last 20 messages for context (keep prompt manageable)
  const messageHistory = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  // Reverse to chronological order
  messageHistory.reverse();

  const aiMessages = messageHistory.filter((m) => m.source === 'ai');

  return {
    conversationId,
    leadId: conversation.leadId,
    leadName: leadData?.name ?? null,
    leadEmail: leadData?.email ?? '',
    leadStatus: leadData?.status ?? 'new',
    humanTakeover: conversation.humanTakeover,
    awaitingReply: conversation.awaitingReply,
    messageCount: messageHistory.length,
    aiMessageCount: aiMessages.length,
    history: messageHistory
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
  };
}

/** Check if AI can still respond to this conversation (10-message cap) */
export function canAIRespond(context: ConversationContext): boolean {
  if (context.humanTakeover) return false;
  if (context.leadStatus === 'opted_out') return false;
  return context.aiMessageCount < MAX_AI_MESSAGES_PER_CONVERSATION;
}

/** Add a message to a conversation and update timestamps */
export async function addMessage(
  conversationId: string,
  role: 'system' | 'assistant' | 'user',
  source: 'ai' | 'human' | 'customer',
  content: string,
  metadata?: Record<string, unknown>,
): Promise<Message> {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId,
      role,
      source,
      content,
      metadata,
    })
    .returning();

  // Update conversation timestamps
  const now = new Date();
  if (source === 'customer') {
    await db
      .update(conversations)
      .set({
        lastInboundAt: now,
        awaitingReply: true,
      })
      .where(eq(conversations.id, conversationId));
  } else {
    await db
      .update(conversations)
      .set({
        lastOutboundAt: now,
        awaitingReply: false,
      })
      .where(eq(conversations.id, conversationId));
  }

  return message!;
}