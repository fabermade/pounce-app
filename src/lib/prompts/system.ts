/**
 * System Prompt Builder — Assemble the LLM system prompt from business config.
 * 
 * This replaces SOUL.md and MEMORY.md with structured, editable configuration.
 * The prompt is assembled from: business identity, tone, knowledge, services,
 * FAQ, escalation rules, and booking CTA.
 */

// ─── Config Types ──────────────────────────────────────────────────

export interface BusinessConfig {
  name: string;
  tagline: string;
  website?: string;
  description?: string;
}

export interface ToneConfig {
  style: 'professional' | 'casual' | 'friendly' | 'formal' | 'witty';
  instructions?: string;
  greeting?: string;
  signoff?: string;
  do?: string[];
  dont?: string[];
}

export interface KnowledgeLink {
  url: string;
  label: string;
  description?: string;
}

export interface KnowledgeText {
  title: string;
  content: string;
}

export interface KnowledgeConfig {
  links?: KnowledgeLink[];
  texts?: KnowledgeText[];
}

export interface Service {
  name: string;
  description: string;
  price?: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface EscalationConfig {
  triggerPhrases: string[];
  action: 'notify_human';
  notifyEmail: string;
}

export interface BookingConfig {
  url: string;
  cta: string;
  timing: string;
}

export interface FullBusinessConfig {
  business: BusinessConfig;
  tone: ToneConfig;
  knowledge: KnowledgeConfig;
  services: Service[];
  faq: FAQ[];
  escalation: EscalationConfig;
  booking: BookingConfig;
}

// ─── Prompt Assembly ──────────────────────────────────────────────

/**
 * Build the system prompt from business configuration.
 * This is the "brain" of the AI — everything it knows about the business,
 * how it should behave, and what it should do.
 */
export function buildSystemPrompt(config: FullBusinessConfig): string {
  const sections: string[] = [];

  // ── Identity ──
  sections.push(`You are the AI assistant for ${config.business.name}. ${config.business.tagline}.`);
  if (config.business.description) {
    sections.push(`About: ${config.business.description}`);
  }

  // ── AI Disclosure (mandatory) ──
  sections.push(
    `IMPORTANT: You are an AI assistant, not a human. You MUST identify yourself as an AI assistant for ${config.business.name} in your first response to any new conversation. Never pretend to be a human.`,
  );

  // ── Tone ──
  const toneLines: string[] = [];
  toneLines.push(`Style: ${config.tone.style}`);
  if (config.tone.instructions) {
    toneLines.push(config.tone.instructions);
  }
  if (config.tone.do && config.tone.do.length > 0) {
    toneLines.push(`Always:\n${config.tone.do.map((d) => `- ${d}`).join('\n')}`);
  }
  if (config.tone.dont && config.tone.dont.length > 0) {
    toneLines.push(`Never:\n${config.tone.dont.map((d) => `- ${d}`).join('\n')}`);
  }
  if (config.tone.greeting) {
    toneLines.push(`Greeting: ${config.tone.greeting}`);
  }
  if (config.tone.signoff) {
    toneLines.push(`Signoff: ${config.tone.signoff}`);
  }
  sections.push(`## Your Tone\n${toneLines.join('\n')}`);

  // ── Knowledge ──
  if (config.knowledge.texts && config.knowledge.texts.length > 0) {
    const knowledgeText = config.knowledge.texts
      .map((t) => `### ${t.title}\n${t.content}`)
      .join('\n\n');
    sections.push(`## Knowledge\n${knowledgeText}`);
  }
  if (config.knowledge.links && config.knowledge.links.length > 0) {
    const linkText = config.knowledge.links
      .map((l) => `- [${l.label}](${l.url})${l.description ? ` — ${l.description}` : ''}`)
      .join('\n');
    sections.push(
      `## Reference Links\nVerify these are still current before citing:\n${linkText}`,
    );
  }

  // ── Services ──
  if (config.services && config.services.length > 0) {
    const serviceText = config.services
      .map((s) => `- **${s.name}**: ${s.description}${s.price ? ` (${s.price})` : ''}`)
      .join('\n');
    sections.push(`## Services\n${serviceText}`);
  }

  // ── FAQ ──
  if (config.faq && config.faq.length > 0) {
    const faqText = config.faq
      .map((f) => `**Q: ${f.question}**\nA: ${f.answer}`)
      .join('\n\n');
    sections.push(`## FAQ\n${faqText}`);
  }

  // ── Booking ──
  sections.push(
    `## Booking\nWhen a lead seems interested, offer to book a call:\n${config.booking.cta} — ${config.booking.url}\nTiming: ${config.booking.timing}`,
  );

  // ── Escalation ──
  sections.push(
    `## Escalation\nIf the customer mentions any of these topics, STOP and notify a human:\n${config.escalation.triggerPhrases.map((p) => `- "${p}"`).join('\n')}\nNotify: ${config.escalation.notifyEmail}`,
  );

  // ── Hard Rules ──
  sections.push(`## Rules
- Never make promises about pricing not listed above.
- Never share internal processes or competitor information.
- If you don't know the answer, say "I don't know" and offer to connect them with a human.
- Keep responses concise and actionable.
- Every email must include an unsubscribe link.`);

  return sections.join('\n\n');
}