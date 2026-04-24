# True Leads — Product Plan

## Vision

True Leads is an AI-powered lead response system that turns inbound inquiries into booked calls. It replaces the "contact form → black hole" experience with instant, personalized responses that guide leads toward scheduling.

**Two products, one engine:**
- **True Leads Managed** — We set up, host, and manage the pipeline. Customer pays monthly.
- **True Leads Self-Host** — Customer buys the software, runs it on their infrastructure.

Faber Made is True Leads' first customer.

---

## Core Question: Do We Need an OpenClaw Agent?

**No.** The current pipeline works like this:

```
Lead → Webhook → OpenClaw wakes Hank → Hank reads context → Hank drafts reply → Hank sends via Resend
```

That's fundamentally: **receive event → call LLM with context → send response**. An agent loop is overkill for a deterministic workflow. What we need:

| Current (Agent) | True Leads (Service) |
|-----------------|---------------------|
| SOUL.md | System prompt (configurable) |
| MEMORY.md | Database (conversation history) |
| OpenClaw heartbeat | Webhook triggers (event-driven) |
| Agent session loop | Single LLM API call per event |
| OpenClaw message send | Direct email API call |

The agent adds latency, cost, and a single point of failure. A service adds reliability, speed, and configurability.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Admin Dashboard                    │
│  (React/Astro — lead pipeline, config, analytics)   │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
┌─────────▼──┐  ┌─────▼─────┐  ┌──▼──────────┐
│ Lead Intake │  │  LLM Call  │  │   Sending   │
│             │  │            │  │             │
│ • Web form  │  │ • OpenAI   │  │ • Resend    │
│ • Email     │  │ • Anthropic│  │ • SendGrid  │
│ • Webhook   │  │ • Ollama   │  │ • Mailgun   │
│ • API       │  │ • Local    │  │ • Postmark  │
└──────┬──────┘  └─────┬──────┘  └──────┬──────┘
       │               │                │
       └───────────────┼────────────────┘
                       │
              ┌────────▼────────┐
              │    Database      │
              │  (PostgreSQL)    │
              │                 │
              │ • leads         │
              │ • conversations │
              │ • config        │
              │ • templates     │
              └─────────────────┘
```

### Request Flow

```
1. Lead arrives (form post / email / webhook)
   → POST /api/inbound
   
2. Normalize & enrich
   → Parse payload into standard lead format
   → Optional: CRM lookup, LinkedIn enrichment

3. Check: Is this a new lead or a reply?
   → New lead: Load business context, draft initial response
   → Reply: Load conversation history, draft contextual response

4. LLM call
   → System prompt (from admin config)
   → Business context (services, pricing, tone, FAQ)
   → Conversation history (last N messages)
   → Current message
   → Instructions (booking CTA, escalation rules)

5. Review & send
   → Auto-send if confidence > threshold
   → Queue for human review if uncertain (admin dashboard)
   → Send via configured email provider

6. Track
   → Log to database
   → Update admin dashboard
   → If booking link clicked, track conversion

7. If lead replies again → loop back to step 3
```

---

## Module Design

### 1. Lead Intake (`/api/inbound`)

Standardized endpoint that accepts:
- **Form submissions** — JSON from website contact form
- **Email replies** — Resend webhook (already built)
- **Webhooks** — Generic JSON payload
- **API calls** — For CRM integrations

All normalized to:
```json
{
  "id": "uuid",
  "source": "form|email|webhook|api",
  "type": "lead|reply|booking",
  "name": "string",
  "email": "string",
  "company": "string|null",
  "message": "string",
  "conversation_id": "uuid|null",
  "metadata": {}
}
```

### 2. LLM Provider (Modular)

```typescript
interface LLMProvider {
  chat(params: {
    system: string;
    messages: { role: string; content: string }[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
}
```

Implementations:
- **OpenAIProvider** — GPT-4o, GPT-4o-mini (most popular, best for SaaS sell)
- **AnthropicProvider** — Claude (good for long context)
- **OllamaProvider** — Self-hosted, no per-token cost (good for managed tier)
- **GroqProvider** — Fast inference (good for real-time responses)

Admin configures which provider + model to use. Switchable per-customer.

### 3. Email Provider (Modular)

```typescript
interface EmailProvider {
  send(params: {
    to: string;
    from: string;
    subject: string;
    html: string;
    replyTo?: string;
  }): Promise<{ messageId: string }>;
}
```

Implementations:
- **ResendProvider** — Already built, great DX, free tier
- **SendGridProvider** — Enterprise favorite
- **MailgunProvider** — Good for high volume
- **PostmarkProvider** — Great deliverability

### 4. Calendar/Booking (Modular)

- **Cal.com** — Embed or link, free tier, API available
- **Calendly** — Most customers will already have this
- **Built-in** — Simple time slot picker (v2, after MVP)

### 5. Admin Dashboard

Pages:
- **Leads** — Pipeline view (new → contacted → booked → closed)
- **Conversations** — Full email thread with AI responses highlighted
- **Configuration** — Business info, system prompt, tone, FAQ
- **Integrations** — LLM, email, calendar provider settings
- **Analytics** — Response rate, booking rate, response time

### 6. Source of Truth (Config)

This replaces SOUL.md and MEMORY.md with structured, editable config:

```json
{
  "business": {
    "name": "Faber Made",
    "tagline": "Custom AI agent teams, crafted by hand",
    "tone": "professional but warm, no jargon",
    "replyStyle": "concise, direct, no fluff"
  },
  "services": [
    { "name": "AI Team Strategy", "description": "...", "price": "From $2,000/mo" },
    { "name": "Web Development", "description": "...", "price": "Custom quote" }
  ],
  "faq": [
    { "question": "How long does setup take?", "answer": "Typically 2-4 weeks..." },
    { "question": "Do you use templates?", "answer": "No. Every agent is custom-built..." }
  ],
  "escalation": {
    "triggerPhrases": ["refund", "cancel", "lawyer", "attorney"],
    "action": "notify_human",
    "notifyEmail": "tyler@fabermade.net"
  },
  "booking": {
    "url": "https://fabermade.vercel.app/book",
    "cta": "Ready to chat? Book a 30-minute call →",
    "timing": "after_second_exchange"
  }
}
```

### 7. Database Schema

```sql
-- Core tables
leads (
  id, source, type, name, email, company, 
  status, created_at, updated_at
)

conversations (
  id, lead_id, provider, external_id,
  created_at
)

messages (
  id, conversation_id, role, content,
  source, created_at
)

business_config (
  key, value, updated_at
)

-- Analytics
events (
  id, lead_id, event_type, metadata, created_at
)
```

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Astro + React islands | Same stack as Faber Made, fast, SSG + islands |
| API | Astro API routes | Already built, same deploy target |
| Database | PostgreSQL (Neon free tier for MVP) | Scalable, easy admin |
| ORM | Drizzle | Lightweight, type-safe, Astro-friendly |
| Auth | Lucia or NextAuth | Admin dashboard auth |
| Email | Resend (default), modular others | Already integrated |
| LLM | OpenAI (default), modular others | Best quality, easy sell |
| Calendar | Cal.com embed (MVP) | Zero custom dev for booking |
| Hosting | Vercel (managed) or Docker (self-host) | Same as Faber Made |
| Webhook receiver | Built into API routes | No separate Python process needed |

---

## MVP Scope (v1)

**What's in:**
- Lead intake (form + email webhook)
- Single LLM provider (OpenAI)
- Single email provider (Resend)
- Auto-response to new leads
- Conversation history tracking
- Booking CTA in responses
- Admin dashboard (leads, conversations, config)
- Cal.com booking link

**What's out (v2+):**
- Multiple LLM/email provider switching (architecture supports it, UI comes later)
- CRM integrations (HubSpot, Salesforce)
- LinkedIn enrichment
- Built-in calendar
- Human review queue
- Analytics dashboard
- Self-host installer

---

## Migration Path (Faber Made → True Leads)

1. **Extract patterns from current pipeline**
   - Webhook receiver → Astro API route
   - Hank's system prompt → Business config
   - Resend integration → EmailProvider module
   - Booking link → Cal.com config

2. **Build True Leads core**
   - Database schema + ORM
   - Lead intake API
   - LLM provider abstraction
   - Email provider abstraction
   - Admin dashboard skeleton

3. **Point Faber Made at True Leads**
   - Change `AGENT_WEBHOOK_URL` to point to True Leads `/api/inbound`
   - Configure business info in admin
   - Test end-to-end

4. **Turn off Hank for lead responses**
   - Hank still runs for other tasks (personal assistant)
   - But lead pipeline now goes through True Leads

---

## Product Positioning

**Tagline:** "Your leads deserve a response in seconds, not days."

**Pricing:**

| Tier | Price | Includes |
|------|-------|----------|
| **Starter** | $99/mo | 1 business, 100 leads/mo, OpenAI-powered, Resend email |
| **Growth** | $299/mo | 3 businesses, 1000 leads/mo, any LLM, any email provider |
| **Managed** | $500-2K/mo | We set up and run everything, custom integrations |
| **Self-Host** | $2,999 one-time | Full codebase, self-host, unlimited leads |

**Differentiators vs competitors:**
- Not a chatbot — it's an AI sales rep that books calls
- Conversation memory across replies
- Human escalation triggers
- Works with any LLM provider (not locked to OpenAI)
- Self-host option (data sovereignty)

---

## Repo Structure (Proposed)

```
true-leads/
├── src/
│   ├── pages/
│   │   ├── api/
│   │   │   ├── inbound.ts        # Lead intake endpoint
│   │   │   ├── webhook/
│   │   │   │   ├── resend.ts      # Email reply webhook
│   │   │   │   └── custom.ts     # Generic webhook
│   │   │   └── admin/
│   │   │       ├── leads.ts
│   │   │       ├── config.ts
│   │   │       └── analytics.ts
│   │   ├── admin/                 # Dashboard pages
│   │   │   ├── index.astro
│   │   │   ├── leads.astro
│   │   │   ├── conversations.astro
│   │   │   └── settings.astro
│   │   └── book.astro             # Booking page (v1: Cal embed)
│   ├── lib/
│   │   ├── providers/
│   │   │   ├── llm/
│   │   │   │   ├── base.ts        # LLMProvider interface
│   │   │   │   ├── openai.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   └── ollama.ts
│   │   │   └── email/
│   │   │       ├── base.ts        # EmailProvider interface
│   │   │       ├── resend.ts
│   │   │       ├── sendgrid.ts
│   │   │       └── mailgun.ts
│   │   ├── db/
│   │   │   ├── schema.ts          # Drizzle schema
│   │   │   └── migrations/
│   │   ├── prompts/
│   │   │   ├── system.ts          # System prompt builder
│   │   │   └── templates/         # Response templates
│   │   └── core/
│   │       ├── lead-parser.ts     # Normalize inbound data
│   │       ├── conversation.ts    # Conversation manager
│   │       └── booking.ts          # Booking link generator
│   └── components/                # Admin dashboard UI
├── db/                            # SQLite or Neon PostgreSQL
├── tests/
├── astro.config.mjs
├── drizzle.config.ts
└── package.json
```

---

## Next Steps

1. **Ty creates `hamburgers/true-leads` repo on GitHub**
2. **Patch generates deploy key and clones**
3. **Bolt builds MVP** (per this plan, starting with database + API routes)
4. **Pip designs admin dashboard UI** (leads pipeline, config screens)
5. **Patch sets up hosting** (Vercel project, Neon database, env vars)
6. **Migrate Faber Made** as first customer

---

## Open Questions

1. **Database:** PostgreSQL (Neon free tier) vs SQLite (simpler for self-host)? Recommend Postgres for managed, SQLite for self-host option.
2. **Auth:** Lucia (lighter) or NextAuth (more providers)? Both work with Astro.
3. **Admin framework:** Separate dashboard app or same Astro project? Same project is simpler for MVP.
4. **LLM costs:** Who eats the LLM API costs? Customer's own key (self-host) or included in subscription (managed)?
5. **Multi-tenancy:** Single database with tenant isolation, or separate databases per customer? Start single-tenant, add multi-tenancy in v2.