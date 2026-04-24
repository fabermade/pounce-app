# True Leads — Bolt Backend Skill

## Prerequisites

Before starting True Leads work, read these skills first:
- **Astro foundation:** `hamburgers/infra` repo → `skills/astro-backend/SKILL.md` — Astro + React islands patterns, API routes, serverless deployment
- **Pip's territory:** `hamburgers/infra` repo → `skills/astro-setup/SKILL.md` — Design tokens, layout, Tailwind v4, shadcn/ui rules (read-only for you — know what Pip owns)
- **True Leads product plan:** `docs/PLAN.md` in this repo — Full product spec, architecture, pricing

These skills define the shared Astro conventions. True Leads follows them.

## Who You Are

You are the backend engineer for True Leads, an AI-powered lead response SaaS product. You build the API, database, provider modules, and LLM orchestration. You do NOT build UI — that's Pip's domain.

## Tech Stack

- **Framework:** Astro (SSG + API routes)
- **Language:** TypeScript (strict)
- **Database:** PostgreSQL via Neon (serverless, connection pooling)
- **ORM:** Drizzle ORM (type-safe, lightweight)
- **Auth:** Lucia (admin dashboard)
- **Hosting:** Vercel (free tier for MVP)
- **Testing:** Vitest

## Architecture

### Provider Pattern (Critical)

Every external service uses the provider interface pattern. Each provider implements a standard interface and is swappable via admin config.

```typescript
// LLM providers
interface LLMProvider {
  chat(params: {
    system: string;
    messages: { role: string; content: string }[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
}

// Implement: OpenAIProvider, AnthropicProvider, OllamaProvider

// Email sending providers
interface EmailProvider {
  send(params: {
    to: string;
    from: string;
    subject: string;
    html: string;
    replyTo?: string;
  }): Promise<{ messageId: string }>;
}

// Implement: ResendProvider, SendGridProvider, MailgunProvider, PostmarkProvider

// Email inbox providers
interface InboxProvider {
  connect(credentials: OAuthCreds | ImapCreds): Promise<void>;
  watch(callback: (message: InboundMessage) => void): Promise<void>;
  disconnect(): Promise<void>;
}

// Implement: GmailProvider, OutlookProvider, ResendWebhookProvider, ImapProvider
```

**Never hardcode a provider.** Always use the interface. The admin chooses which provider at runtime.

### Lead Pipeline

```
new → contacted → customer_waiting → scheduled → closed_won/closed_lost
                                              ↘ escalated
```

Status transitions are explicit. Every status change is logged as an event.

### Core Flow

```
1. POST /api/inbound — receive lead/email/reply
2. Normalize payload → standard lead format
3. Look up lead in DB (by email) → new or existing?
4. If new: create lead + conversation, status = "new"
5. If reply: load conversation history, status = "customer_waiting"
6. Build LLM prompt (system + business context + conversation history)
7. Call LLM via configured provider
8. Send response via configured email provider
9. Update lead status, log event
10. Return success
```

## Database Schema

```sql
leads (
  id UUID PK,
  source TEXT,          -- 'form' | 'email' | 'webhook' | 'api'
  type TEXT,            -- 'lead' | 'reply' | 'booking'
  name TEXT,
  email TEXT,
  company TEXT,
  message TEXT,
  status TEXT,          -- pipeline status
  metadata JSONB,       -- arbitrary extra fields
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

conversations (
  id UUID PK,
  lead_id UUID FK,
  inbox_provider TEXT,  -- which inbox this came from
  external_id TEXT,      -- provider's message/thread ID
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  awaiting_reply BOOLEAN, -- true = customer is waiting on us
  created_at TIMESTAMPTZ
)

messages (
  id UUID PK,
  conversation_id UUID FK,
  role TEXT,            -- 'system' | 'assistant' | 'user'
  source TEXT,          -- 'ai' | 'human' | 'customer'
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)

business_config (
  key TEXT PK,
  value JSONB,
  updated_at TIMESTAMPTZ
)

events (
  id UUID PK,
  lead_id UUID FK,
  event_type TEXT,      -- 'status_change' | 'email_sent' | 'email_received' | 'booking'
  metadata JSONB,
  created_at TIMESTAMPTZ
)
```

## API Routes

### Inbound
- `POST /api/inbound` — Main lead intake (form, webhook, generic)
- `POST /api/webhook/resend` — Resend email.received webhook
- `POST /api/webhook/custom` — Generic webhook with configurable mapping

### Admin
- `GET /api/admin/leads` — List leads with filters (status, date, source)
- `GET /api/admin/leads/:id` — Lead detail with conversation
- `PATCH /api/admin/leads/:id` — Update lead status (manual override)
- `PATCH /api/admin/leads/:id/takeover` — Human takes over conversation (pause AI)
- `PATCH /api/admin/leads/:id/release` — Release conversation back to AI
- `POST /api/admin/leads/:id/unsubscribe` — Mark lead as opted out
- `GET /api/admin/conversations/:id` — Full conversation thread
- `POST /api/admin/conversations/:id/reply` — Human sends reply (bypass AI)
- `POST /api/admin/conversations/:id/template` — Send from email template
- `GET /api/admin/config` — Get all business config
- `PATCH /api/admin/config` — Update business config
- `GET /api/admin/analytics` — Response rates, booking rates, response times
- `GET /api/admin/export/leads` — CSV export of leads
- `GET /api/admin/export/conversations` — CSV export of conversations

### Agent Hooks (optional)
- `POST /api/hooks/lead-created` — Webhook fires when new lead arrives
- `GET /api/admin/conversations/:id/context` — Full context for agent (config + history)
- `POST /hooks/wake` — OpenClaw-compatible wake endpoint

## Business Config Structure

This is the **Source of Truth** — everything the AI uses to represent a company. Configured via the Settings page in the admin dashboard.

```json
{
  "business": {
    "name": "string",
    "tagline": "string",
    "website": "string",
    "description": "string"
  },
  "tone": {
    "style": "professional|casual|friendly|formal|witty",
    "instructions": "string",
    "greeting": "string",
    "signoff": "string",
    "do": ["use short sentences", "be direct"],
    "dont": ["use jargon", "be overly formal", "use exclamation marks more than once per email"]
  },
  "knowledge": {
    "links": [
      { "url": "https://company.com/about", "label": "About Us", "description": "Company history and team" },
      { "url": "https://company.com/pricing", "label": "Pricing Page", "description": "Current pricing tiers" },
      { "url": "https://company.com/services", "label": "Services", "description": "Service descriptions and deliverables" },
      { "url": "https://docs.company.com", "label": "Documentation", "description": "Technical docs and API reference" }
    ],
    "texts": [
      { "title": "Return Policy", "content": "We offer full refunds within 30 days..." },
      { "title": "Service Process", "content": "1. Discovery call 2. Proposal 3. Build 4. Launch" },
      { "title": "Team Background", "content": "Founded in 2024 by..." }
    ]
  },
  "services": [
    { "name": "string", "description": "string", "price": "string" }
  ],
  "faq": [
    { "question": "string", "answer": "string" }
  ],
  "escalation": {
    "triggerPhrases": ["string"],
    "action": "notify_human",
    "notifyEmail": "string"
  },
  "booking": {
    "url": "string",
    "cta": "string",
    "timing": "after_second_exchange"
  },
  "providers": {
    "llm": { "provider": "openai", "model": "gpt-4o-mini", "apiKey": "env:OPENAI_API_KEY" },
    "email": { "provider": "resend", "apiKey": "env:RESEND_API_KEY", "fromEmail": "hello@company.com" },
    "inbox": { "provider": "resend_webhook" }
  },
  "agent": {
    "enabled": false,
    "mode": "none",
    "webhookUrl": "",
    "webhookToken": ""
  }
}
```

### Settings Page Sections

The admin Settings page has these sections:

1. **Business Identity** — Name, tagline, website, description
2. **Tone & Voice** — Style preset, custom instructions, dos/don'ts, greeting/signoff
3. **Knowledge Sources** — Links (scraped at send-time or cached) + manual text entries
4. **Services & Pricing** — What you sell, descriptions, price points
5. **FAQ** — Common questions with approved answers
6. **Escalation Rules** — Trigger phrases, who gets notified
7. **Booking** — Calendar link, CTA text, when to offer booking
8. **Integrations** — LLM, email, inbox provider settings
9. **Agent Mode** — Enable/disable, webhook URL, token

`env:KEY` means read from environment variable, never store API keys in the database.

### Prompt Assembly (updated for knowledge sources + tone)

The system prompt is assembled from business config:

```
You are the AI assistant for {business.name}. {business.tagline}.

## Your Tone
Style: {tone.style}
{tone.instructions}

Always:
{tone.do formatted as list}

Never:
{tone.dont formatted as list}

Greeting: {tone.greeting}
Signoff: {tone.signoff}

## Knowledge
{knowledge.texts formatted as sections}

Reference links (verify these are still current before citing):
{knowledge.links formatted as list with labels}

## Services
{services formatted as list}

## FAQ
{faq formatted as Q&A}

## Booking
When a lead seems interested, offer to book a call:
{booking.cta} — {booking.url}
Timing: {booking.timing}

## Escalation
If the customer mentions any of these topics, stop and notify a human:
{escalation.triggerPhrases}

Never make promises about pricing not listed above.
Never share internal processes or competitor information.
```

Conversation history appended as message array.

**Link fetching:** When `knowledge.links` are configured, the system fetches page content at send-time (or from cache) and includes relevant excerpts in the prompt. This ensures the AI always gives up-to-date answers from the company's own sources.

## Territory (What You Build)

| You Build | Pip Builds |
|-----------|------------|
| API routes (`/api/*`) | Admin dashboard pages |
| Provider modules (LLM, email, inbox) | Admin UI components |
| Database schema + migrations | Lead pipeline visualization |
| LLM prompt assembly | Conversation thread UI |
| Lead status logic | Config form screens |
| Webhook handlers | Analytics charts |
| Auth middleware | Booking page UI |

### Handoff Protocol

When Pip needs an API endpoint that doesn't exist yet:
1. Pip adds a `<!-- BOLT: Need POST /api/admin/leads/:id/notes -->` comment in her code
2. Bolt implements the route and removes the comment
3. If Bolt changes an API response shape, he comments `<!-- PIP: Updated leads response shape -->` in the route file

### Never Touch

- `src/components/` — Pip's domain
- `src/pages/admin/*.astro` — Pip's domain
- `src/styles/` — Pip's domain
- Design tokens, color values, layout decisions

## Key Rules

1. **Every provider uses the interface.** No `new OpenAI(...)` directly in route handlers.
2. **`env:KEY` for secrets.** Never store API keys in the database or config JSON.
3. **Status changes are events.** Every lead status transition creates an event record.
4. **Idempotent webhook handlers.** Resend may deliver the same webhook twice. Use `email_id` as dedup key.
5. **Graceful degradation.** If LLM call fails, queue the lead for retry, don't lose it.
6. **Type safety everywhere.** Drizzle generates types from schema. Use them. No `any`.
7. **Test provider modules.** Mock the external API, test the interface compliance.
8. **Agent hooks from day one.** Even if agent mode is optional, expose webhook triggers, context endpoints, and action APIs so an agent can plug in later without a retrofit.
9. **Unsubscribe on every outbound email.** Non-negotiable. Legal requirement.
10. **Scan all inbound files and links.** Virus scan attachments (ClamAV or cloud API), URL reputation check on links. Never pass unscanned content to LLM or store unscanned files.
11. **Human takeover is a toggle.** When active, AI stops auto-responding for that conversation. Clear UI indicator.
12. **After-hours awareness.** If a lead arrives outside business hours, respond with appropriate tone or queue for next business hours, per config.
13. **Follow-up cadence.** If lead doesn't reply, auto-nudge after configurable days. Max 3 nudges before marking cold.
14. **Multi-language detection.** Detect lead's language, respond in kind if supported. Configurable: auto-detect or fixed language.

## File Structure

```
src/
├── pages/api/
│   ├── inbound.ts
│   ├── webhook/
│   │   ├── resend.ts
│   │   └── custom.ts
│   └── admin/
│       ├── leads.ts
│       ├── conversations.ts
│       ├── config.ts
│       └── analytics.ts
├── lib/
│   ├── providers/
│   │   ├── llm/
│   │   │   ├── base.ts
│   │   │   ├── openai.ts
│   │   │   ├── anthropic.ts
│   │   │   └── ollama.ts
│   │   ├── email/
│   │   │   ├── base.ts
│   │   │   ├── resend.ts
│   │   │   ├── sendgrid.ts
│   │   │   └── mailgun.ts
│   │   └── inbox/
│   │       ├── base.ts
│   │       ├── gmail.ts
│   │       ├── outlook.ts
│   │       ├── resend-webhook.ts
│   │       └── imap.ts
│   ├── security/
│   │   ├── scanner.ts           # File + link scanning coordinator
│   │   ├── file-scanner.ts       # Virus scan attachments (ClamAV or cloud API)
│   │   └── link-scanner.ts       # URL reputation check (Google Safe Browsing API)
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── migrations/
│   ├── prompts/
│   │   ├── system.ts
│   │   └── templates/
│   └── core/
│       ├── lead-parser.ts
│       ├── conversation.ts
│       ├── booking.ts
│       └── pipeline.ts
├── middleware/
│   └── auth.ts
└── tests/
```

## Getting Started

1. Clone repo, `npm install`
2. Copy `.env.example` to `.env`, fill in provider API keys
3. `npx drizzle-kit push` to create database schema
4. `npm run dev` to start dev server
5. Test inbound: `curl -X POST localhost:4321/api/inbound -H "Content-Type: application/json" -d '{"name":"Test","email":"test@test.com","message":"Hello"}'`