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

-- Lead statuses (pipeline)
--   new           → Just arrived, no response sent yet
--   contacted      → AI sent initial response, waiting for reply
--   customer_waiting → Lead replied back, needs AI or human response
--   scheduled     → Meeting/call booked
--   closed_won    → Deal closed after meeting
--   closed_lost   → Lead went cold or declined
--   escalated     → Handed off to human (trigger phrases, edge cases)

conversations (
  id, lead_id, provider, external_id,
  last_inbound_at,     -- when the customer last messaged us
  last_outbound_at,    -- when we last responded
  awaiting_reply boolean, -- true = customer is waiting on us
  created_at
)

messages (
  id, conversation_id, role, content,
  source,  -- 'ai' | 'human' | 'customer'
  created_at
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
- Unsubscribe/opt-out on every email
- Human takeover (pause AI, reply manually, release)

**What's in (v1.5 — quick wins):**
- Follow-up cadence (auto nudge after X days, configurable)
- After-hours detection (queue or different tone outside business hours)
- Lead scoring (auto-prioritize based on urgency/budget/company signals)
- Email templates (quick send from admin dashboard)
- Data export (CSV for leads + conversations)
- Attachment handling (receive, virus scan, summarize for AI context)

**What's in (v2):**
- Multiple LLM/email/inbox provider switching
- Multi-language detection and response
- Link and file vulnerability scanning
- Human review queue (AI drafts, human approves before send)
- Analytics dashboard (response time, reply rate, booking conversion)
- Knowledge link caching (scrape + cache, refresh on schedule)

**What's out (v3+):**
- CRM integrations (HubSpot, Salesforce, Pipedrive, Zoho)
- Two-way CRM sync (leads, contacts, deals, activities)
- CRM pipeline status mirroring (lead status → CRM stage)
- Custom CRM field mapping
- Webhook triggers on status changes (for Zapier/Make workflows)
- Slack/Teams notifications
- Self-host installer (Docker Compose + docs)

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

## Licensing & DRM (Self-Host Tier)

True Leads self-host requires a license key. The managed tier doesn't need one — we control hosting.

### License Model

| Tier | Price | Sites | Features |
|------|-------|-------|----------|
| **Starter** | $999/yr | 1 domain | Core features, 1 LLM provider, 1 email provider |
| **Business** | $2,999/yr | 5 domains | All providers, priority support, analytics |
| **Enterprise** | $7,999/yr | Unlimited | Everything, custom integrations, SLA |

### How It Works

```
1. Customer buys on trueleads.ai → gets license key (TL-XXXX-XXXX-XXXX)
2. Customer enters key in admin Settings → License section
3. On startup: True Leads POSTs to license server
   { key: "TL-XXXX", domain: "leads.customer.com" }
4. License server validates: key exists? domain authorized? not expired? within site limit?
5. Returns: { valid: true, expires: "2027-04-24", sites: 1, features: [...] }
6. True Leads caches result, re-verifies every 24 hours
7. If invalid: dashboard shows warning, email sending disabled, data stays readable
```

### Grace Periods

- License check fails (network issue): 72-hour grace period, full functionality
- After 72h without verification: read-only mode (can view data, can't send emails or use LLM)
- License expired: 14-day grace with watermark on outbound emails ("Sent via True Leads — license expired")
- After 14 days: sending disabled

### License Server API (we host, private)

- `POST /v1/license/verify` — validate key + domain (called by self-hosted instances)
- `POST /v1/license/activate` — bind key to a domain (first use)
- `POST /v1/license/deactivate` — release a domain (customer migrates to new server)
- `GET /v1/license/status/:key` — admin view of all activations for a key
- `POST /v1/license/generate` — create new key (internal, admin only)

### Anti-Piracy

1. **Domain binding** — key only works on registered domain(s)
2. **Phone home** — periodic verification (24h), graceful offline window (72h)
3. **Feature flags** — license response includes allowed features per tier
4. **Compiled distribution** — ship bundled/minified JS for self-host, not raw source
5. **Key in env var** — `TRUELEADS_LICENSE_KEY`, not in config DB

### Repos

| Repo | Visibility | Purpose |
|------|-----------|----------|
| `hamburgers/TrueLeads` | Public (or private) | Product code + client-side license check |
| `hamburgers/trueleads-license` | **Private** | License server, key generation, activation management |

The license server is never exposed to customers. It's our internal infrastructure.

---

## Pricing (Updated)

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

## Agent Integration (Optional)

True Leads works without an agent (pure API + LLM calls). But some customers want a persistent AI agent managing their pipeline — reading context, making nuanced decisions, handling edge cases an LLM call alone can't.

**Agent mode is optional, not required.** The core product works standalone.

### How Agent Mode Works

```
Standard mode (default):
  Lead → API → LLM call → Send email → Done

Agent mode (optional):
  Lead → API → OpenClaw agent wakes → Agent reads full context → 
  Agent drafts reply → Agent sends via Resend → Agent logs to DB → Done
```

### Agent Integration Points

The API provides hooks that an agent can consume:

1. **Webhook triggers** — `POST /api/hooks/lead-created` fires when a new lead arrives. An OpenClaw agent (or any webhook consumer) can subscribe.
2. **Conversation context endpoint** — `GET /api/admin/conversations/:id/context` returns full conversation history + business config + lead status. An agent calls this before drafting a reply.
3. **Action endpoints** — `POST /api/admin/conversations/:id/reply` lets an agent send a response. Same endpoint humans use for manual replies.
4. **Status updates** — `PATCH /api/admin/leads/:id/status` lets an agent move leads through the pipeline.
5. **Wake hook** — `POST /hooks/wake` (OpenClaw-compatible) triggers an agent immediately when a lead arrives.

### Config Toggle

```json
{
  "agent": {
    "enabled": true,
    "mode": "openclaw",  // "openclaw" | "webhook" | "none"
    "webhookUrl": "https://agent.company.com/hooks/wake",
    "webhookToken": "bearer-token-here"
  }
}
```

When `agent.mode` is `"none"` (default), the standard LLM pipeline handles everything. When `"openclaw"` or `"webhook"`, inbound leads trigger the agent via webhook and the agent calls back into the API to send replies.

### Why Keep Agent Mode

- Some businesses want a "face" — an agent with personality, not just automated emails
- Agents can handle edge cases (escalation, multi-step negotiation, custom logic)
- Agents can do research (LinkedIn lookup, CRM deep-dive) before responding
- Managed tier customers may prefer we run an agent for them
- It's our competitive advantage — we *are* an AI agent company

---

## Trust & Safety (Non-Negotiable)

True Leads is a powerful tool for automating outbound communication. Without safeguards, it can be weaponized for spam, phishing, harassment, or disinformation. These measures are mandatory, not optional.

### Anti-Abuse Rules

1. **No cold outreach.** True Leads responds to inbound leads only. Every conversation starts with the lead contacting the business — never the other way around. The system must not support unsolicited outreach campaigns.
2. **Opt-in required.** Every lead must have explicitly submitted a form, sent an email, or taken a comparable opt-in action. No purchased lists, no scraped contacts.
3. **Unsubscribe on every email.** Every outbound email includes a one-click unsubscribe link. Clicking it marks the lead as `opted_out` and the system never emails them again.
4. **CAN-SPAM compliance.** Physical mailing address in footer, clear sender identification, no deceptive subject lines.
5. **Rate limiting per lead.** Max 1 email per lead per 24 hours. Follow-up cadence caps at 3 attempts total. After 3 unanswered emails, the lead goes cold — no more messages.
6. **No impersonation.** The AI identifies itself as an AI assistant for the company. Never pretends to be a human. Never uses fake personas.
7. **No disinformation.** The system must not generate or distribute false information. If the knowledge base doesn't contain an answer, the AI says "I don't know" and offers to connect a human.
8. **Escalation triggers are mandatory.** Certain topics always escalate to a human: legal threats, refund demands, discrimination complaints, safety concerns, requests to be removed from all contact.

### Technical Enforcement

- **Conversation cap:** No more than 10 AI messages per conversation before requiring human review.
- **Daily send cap:** No more than 50 outbound emails per day per business in Starter tier. Business and Enterprise tiers have higher limits but still capped.
- **Content scanning:** Outbound messages are scanned for common abuse patterns (phishing links, misleading claims, threats) before sending.
- **Domain reputation:** New accounts start in a probation period (7 days) with reduced send limits. Accounts with high unsubscribe rates (>5%) are flagged for review.
- **Reporting:** Any recipient can report abuse via the unsubscribe page. Reports are logged and trigger manual review.

### Prohibited Use Cases

True Leads must not be used for:
- Unsolicited bulk email (spam)
- Phishing or social engineering
- Political campaigning without disclosure
- Health/medical advice without proper disclaimers
- Financial advice without proper disclaimers
- Targeted harassment
- Disinformation campaigns

### Terms of Service

The self-host license agreement and managed service agreement both include:
- Acceptable use policy referencing all above rules
- Right to revoke license for violations
- Indemnification clause — customer is responsible for how they use the tool
- Audit right — we can review usage patterns for compliance

---

## Open Questions

1. **Database:** PostgreSQL (Neon free tier) vs SQLite (simpler for self-host)? Recommend Postgres for managed, SQLite for self-host option.
2. **Auth:** Lucia (lighter) or NextAuth (more providers)? Both work with Astro.
3. **Admin framework:** Separate dashboard app or same Astro project? Same project is simpler for MVP.
4. **LLM costs:** Who eats the LLM API costs? Customer's own key (self-host) or included in subscription (managed)?
5. **Multi-tenancy:** Single database with tenant isolation, or separate databases per customer? Start single-tenant, add multi-tenancy in v2.
6. **Agent vs standard:** Default to standard LLM pipeline, but expose agent hooks from day one so it's not a retrofit.