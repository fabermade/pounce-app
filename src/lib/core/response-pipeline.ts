/**
 * Response Pipeline — The core Pounce engine.
 *
 * When an inbound lead arrives, this pipeline:
 * 1. Loads business config from DB
 * 2. Checks conversation state (AI cap, human takeover, opt-out)
 * 3. Builds system prompt from config
 * 4. Loads conversation history
 * 5. Calls LLM provider
 * 6. Scans response for escalation triggers
 * 7. Appends booking CTA if timing is right
 * 8. Sends response email
 * 9. Saves AI message, updates lead status, logs events
 * 10. Enforces daily send cap and trust & safety rules
 */

import { db, businessConfig, dailySendCounts } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import { getConversationContext, canAIRespond, addMessage } from './conversation.js';
import { transitionLeadStatus, logEvent } from './pipeline.js';
import { buildSystemPrompt, type FullBusinessConfig } from '../prompts/system.js';
import { shouldOfferBooking, type BookingConfig } from './booking.js';
import { createLLMProvider } from '../providers/llm/base.js';
import { createEmailProvider } from '../providers/email/base.js';

// ─── Constants ─────────────────────────────────────────────────────

const DEFAULT_DAILY_SEND_CAP = 100;
const MAX_AI_MESSAGES_PER_CONVERSATION = 10;

// ─── Types ─────────────────────────────────────────────────────────

export interface PipelineConfig {
  /** Business config loaded from DB */
  business: FullBusinessConfig;
  /** Resolved provider config (API keys already pulled from env) */
  llm: { provider: string; model?: string; apiKey: string; baseUrl?: string };
  email: { provider: string; apiKey: string; fromEmail: string };
  /** Daily send cap */
  dailySendCap: number;
  /** Unsubscribe URL base (e.g. https://pouncefirst.com/unsubscribe) */
  unsubscribeBase: string;
}

export interface PipelineResult {
  success: boolean;
  aiResponseSent: boolean;
  reason?: string;
  messageId?: string;
  escalated?: boolean;
  bookingOffered?: boolean;
}

// ─── Config Loader ─────────────────────────────────────────────────

/**
 * Load all business config from DB and resolve provider API keys.
 * The providers section in DB stores references like "env:OPENAI_API_KEY"
 * which we resolve to actual values at runtime.
 */
export async function loadPipelineConfig(): Promise<PipelineConfig> {
  const rows = await db.select().from(businessConfig);

  // Build config object from DB rows
  const configMap: Record<string, unknown> = {};
  for (const row of rows) {
    configMap[row.key] = row.value;
  }

  // Defaults for missing sections
  const business = (configMap.business ?? {
    name: '', tagline: '', website: '', description: '',
  }) as FullBusinessConfig['business'];

  const tone = (configMap.tone ?? {
    style: 'professional', instructions: '', dos: [], donts: [],
  }) as FullBusinessConfig['tone'];

  const knowledge = (configMap.knowledge ?? {
    links: [], texts: [],
  }) as FullBusinessConfig['knowledge'];

  const services = (configMap.services ?? []) as FullBusinessConfig['services'];
  const faq = (configMap.faq ?? []) as FullBusinessConfig['faq'];

  const escalation = (configMap.escalation ?? {
    triggerPhrases: [], notifyEmail: '', action: 'notify_human',
  }) as FullBusinessConfig['escalation'];

  const booking = (configMap.booking ?? {
    url: '', cta: '', timing: 'after_second_exchange',
  }) as FullBusinessConfig['booking'];

  const providers = (configMap.providers ?? {
    llm: 'openai', email: 'resend', inbox: '',
  }) as Record<string, unknown>;

  // Resolve provider choices and API keys from env
  // Config stores env key references like "env:OPENAI_API_KEY" — no hardcoded mapping.
  // Adding a new provider (Gemini, Mistral, Postmark, etc.) = config change only, zero code.
  const llmProvider = String(providers.llm ?? 'openai');
  const emailProvider = String(providers.email ?? 'resend');

  const llmApiKey = resolveEnvKey(String(providers.llmApiKey ?? ''));
  const emailApiKey = resolveEnvKey(String(providers.emailApiKey ?? ''));

  const fromEmail = String(providers.fromEmail ?? 'hello@pouncefirst.com');
  const unsubscribeBase = String(
    import.meta.env.APP_URL ?? process.env.APP_URL ?? 'https://pouncefirst.com'
  );

  return {
    business: { business, tone, knowledge, services, faq, escalation, booking },
    llm: {
      provider: llmProvider,
      model: String(providers.llmModel ?? ''),
      apiKey: llmApiKey,
      baseUrl: String(providers.llmBaseUrl ?? ''),
    },
    email: {
      provider: emailProvider,
      apiKey: emailApiKey,
      fromEmail,
    },
    dailySendCap: DEFAULT_DAILY_SEND_CAP,
    unsubscribeBase,
  };
}

// ─── Daily Send Cap ────────────────────────────────────────────────

/**
 * Check if the daily send cap has been reached.
 * Uses the daily_send_counts table to track sends per day.
 */
async function checkDailySendCap(todayStr: string, cap: number): Promise<boolean> {
  const [row] = await db
    .select()
    .from(dailySendCounts)
    .where(eq(dailySendCounts.date, todayStr))
    .limit(1);

  const currentCount = row?.sendCount ?? 0;
  return currentCount < cap;
}

/**
 * Increment the daily send count after a successful send.
 */
async function incrementDailySendCount(todayStr: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(dailySendCounts)
    .where(eq(dailySendCounts.date, todayStr))
    .limit(1);

  if (existing) {
    await db
      .update(dailySendCounts)
      .set({ sendCount: sql`${dailySendCounts.sendCount} + 1` })
      .where(eq(dailySendCounts.id, existing.id));
  } else {
    await db.insert(dailySendCounts).values({
      date: todayStr,
      sendCount: 1,
    });
  }
}

// ─── Escalation Scanner ────────────────────────────────────────────

/**
 * Scan an AI response for escalation trigger phrases.
 * Returns true if any trigger phrase is found (case-insensitive).
 */
function scanForEscalation(
  response: string,
  triggerPhrases: string[],
): boolean {
  if (triggerPhrases.length === 0) return false;

  const lowerResponse = response.toLowerCase();
  return triggerPhrases.some((phrase) =>
    lowerResponse.includes(phrase.toLowerCase()),
  );
}

// ─── Unsubscribe Link Builder ─────────────────────────────────────

/**
 * Build unsubscribe link HTML to append to every outbound email.
 * This is mandatory — no email goes out without it.
 */
function buildUnsubscribeHtml(leadEmail: string, baseUrl: string): string {
  const encodedEmail = encodeURIComponent(leadEmail);
  return `
    <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
      <p>You're receiving this because you contacted us. 
        <a href="${baseUrl}/api/unsubscribe?email=${encodedEmail}">Unsubscribe</a> 
        from automated messages.
      </p>
    </div>
  `;
}

// ─── Main Pipeline ─────────────────────────────────────────────────

/**
 * Run the full response pipeline for a conversation.
 *
 * This is the heart of Pounce — it takes an inbound lead's message
 * and produces an AI-generated email response.
 */
export async function runResponsePipeline(
  conversationId: string,
): Promise<PipelineResult> {
  // 1. Load pipeline config
  const config = await loadPipelineConfig();

  // 2. Get conversation context
  const context = await getConversationContext(conversationId);
  if (!context) {
    return { success: false, aiResponseSent: false, reason: 'Conversation not found' };
  }

  // 3. Guard checks — can AI respond?
  if (!canAIRespond(context)) {
    return {
      success: false,
      aiResponseSent: false,
      reason: context.humanTakeover
        ? 'Human has taken over this conversation'
        : context.leadStatus === 'opted_out'
          ? 'Lead has opted out'
          : `AI message cap reached (${MAX_AI_MESSAGES_PER_CONVERSATION})`,
    };
  }

  // 4. Check daily send cap
  const todayStr = new Date().toISOString().split('T')[0]!;
  const underCap = await checkDailySendCap(todayStr, config.dailySendCap);
  if (!underCap) {
    return {
      success: false,
      aiResponseSent: false,
      reason: `Daily send cap reached (${config.dailySendCap})`,
    };
  }

  // 5. Check LLM API key is available
  if (!config.llm.apiKey && config.llm.provider !== 'ollama') {
    return {
      success: false,
      aiResponseSent: false,
      reason: `LLM API key not configured for ${config.llm.provider}`,
    };
  }

  // 6. Check email API key is available
  if (!config.email.apiKey) {
    return {
      success: false,
      aiResponseSent: false,
      reason: `Email API key not configured for ${config.email.provider}`,
    };
  }

  // 7. Build system prompt
  const systemPrompt = buildSystemPrompt(config.business);

  // 8. Call LLM
  let aiResponse: string;
  try {
    const llm = await createLLMProvider(config.llm);
    aiResponse = await llm.chat({
      system: systemPrompt,
      messages: context.history,
      temperature: 0.7,
      maxTokens: 500,
    });
  } catch (err) {
    console.error('LLM call failed:', err);
    await logEvent(context.leadId, 'llm_error', {
      provider: config.llm.provider,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      aiResponseSent: false,
      reason: `LLM call failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }

  // 9. Scan for escalation triggers
  const escalated = scanForEscalation(
    aiResponse,
    config.business.escalation.triggerPhrases,
  );

  // 10. Check if booking should be offered
  const exchangeCount = context.history.filter((m) => m.role === 'user').length;
  const booking = shouldOfferBooking(
    config.business.booking as BookingConfig,
    exchangeCount,
  );

  let finalResponse = aiResponse;
  if (booking.shouldOffer && config.business.booking.url) {
    finalResponse += `\n\n${booking.ctaText}: ${booking.url}`;
  }

  // 11. Append unsubscribe link (mandatory on every email)
  const unsubscribeHtml = buildUnsubscribeHtml(
    context.leadEmail,
    config.unsubscribeBase,
  );

  // 12. Send email
  let emailMessageId: string | undefined;
  try {
    const email = await createEmailProvider(config.email);
    const result = await email.send({
      to: context.leadEmail,
      from: config.email.fromEmail,
      subject: `Re: Your inquiry to ${config.business.business.name || 'us'}`,
      html: `<div style="font-family: sans-serif; max-width: 600px;">${finalResponse.replace(/\n/g, '<br>')}</div>${unsubscribeHtml}`,
      replyTo: config.business.escalation.notifyEmail || undefined,
    });
    emailMessageId = result.messageId;
  } catch (err) {
    console.error('Email send failed:', err);
    await logEvent(context.leadId, 'email_error', {
      provider: config.email.provider,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      aiResponseSent: false,
      reason: `Email send failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }

  // 13. Save AI message to conversation
  await addMessage(conversationId, 'assistant', 'ai', finalResponse, {
    llmProvider: config.llm.provider,
    emailMessageId,
  });

  // 14. Update lead status
  const newStatus = escalated ? 'escalated' : 'contacted';
  try {
    await transitionLeadStatus(context.leadId, newStatus as 'escalated' | 'contacted', {
      reason: escalated ? 'escalation_triggered' : 'ai_responded',
      provider: config.llm.provider,
    });
  } catch (err) {
    // Status transition failed (e.g., already escalated) — log but don't fail the pipeline
    console.warn('Status transition failed (non-fatal):', err);
  }

  // 15. Log events
  await logEvent(context.leadId, 'ai_response_sent', {
    conversationId,
    llmProvider: config.llm.provider,
    emailProvider: config.email.provider,
    escalated,
    bookingOffered: booking.shouldOffer,
  });

  // 16. Increment daily send count
  await incrementDailySendCount(todayStr);

  // 17. If escalated, mark conversation for human takeover
  if (escalated) {
    const { conversations } = await import('../db/index.js');
    await db
      .update(conversations)
      .set({
        humanTakeover: true,
        awaitingReply: false,
      })
      .where(eq(conversations.id, conversationId));
  }

  return {
    success: true,
    aiResponseSent: true,
    messageId: emailMessageId,
    escalated,
    bookingOffered: booking.shouldOffer,
  };
}

// ─── Env Key Resolver ──────────────────────────────────────────────

/**
 * Resolve environment variable references.
 * Config values may store "env:KEY" — we resolve to the actual value.
 * Falls back to checking import.meta.env (Astro) then process.env (Node).
 */
function resolveEnvKey(keyOrRef: string): string {
  if (!keyOrRef) return '';

  if (keyOrRef.startsWith('env:')) {
    const envKey = keyOrRef.slice(4);
    return String(
      import.meta.env[envKey] ?? process.env[envKey] ?? '',
    );
  }

  // Direct value (unlikely in production but possible for testing)
  return keyOrRef;
}