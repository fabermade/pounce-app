# Pounce — Pip Handoff

## Getting Started

```bash
cd ~/.openclaw/workspace-pip/repos  # or wherever you clone
git clone git@github.com:hamburgers/TrueLeads.git
cd TrueLeads
git checkout main && git pull origin main
npm install
```

Copy `.env.example` to `.env` (the DATABASE_URL is already filled in — you need it for the dev server).

```bash
npm run dev  # → http://localhost:4321
```

## What's Built (Backend)

### Database (Neon PostgreSQL)
6 tables already pushed and live:
- **leads** — inbound leads with pipeline status
- **conversations** — tied to leads, tracks inbound/outbound
- **messages** — conversation history (role: system/assistant/user, source: ai/human/customer)
- **business_config** — key-value JSONB store for all settings
- **events** — audit log for status changes, emails, bookings
- **daily_send_counts** — rate limiting tracker

### API Routes (All Working, End-to-End Tested)

**Inbound:**
- `POST /api/inbound` — Lead intake + AI response pipeline (form, webhook, email)

**Admin:**
- `GET /api/admin/leads` — List leads with filters (status, source, search, pagination)
- `GET /api/admin/leads/[id]` — Single lead detail
- `PATCH /api/admin/leads/[id]` — Update lead, status transitions validated
- `GET /api/admin/conversations` — List conversations with messages and lead info
- `GET /api/admin/conversations/[id]` — Full message thread
- `POST /api/admin/conversations/[id]/reply` — Human takeover
- `GET /api/admin/config` — All 9 business config sections (with defaults)
- `PATCH /api/admin/config` — Update config (deep merge objects, replace arrays)
- `GET /api/admin/analytics` — Dashboard stats, weekly data, status breakdown, recent activity

**Unsubscribe:**
- `GET /api/unsubscribe?email=...` — One-click unsubscribe (CAN-SPAM compliant)

### Core Modules
- `src/lib/core/lead-parser.ts` — Normalize inbound payloads
- `src/lib/core/conversation.ts` — Conversation state + message history + 10-msg AI cap
- `src/lib/core/pipeline.ts` — Status transitions + event logging
- `src/lib/core/booking.ts` — Booking CTA logic
- `src/lib/core/response-pipeline.ts` — **The Pounce engine** (config → LLM → email → message → status)
- `src/lib/prompts/system.ts` — System prompt builder from business config

### Provider Interfaces (Swappable, No Hardcoded Providers)
- **LLM:** OpenAI, Anthropic, Ollama — config selects which, `llmApiKey` stores the env reference
- **Email:** Resend, SendGrid, Mailgun — config selects which, `emailApiKey` stores the env reference

## API Response Shapes (Mock Against These)

### Lead
```json
{
  "id": "uuid",
  "source": "form|email|webhook|api",
  "type": "lead|reply|booking",
  "name": "string",
  "email": "string",
  "company": "string|null",
  "message": "string",
  "status": "new|contacted|customer_waiting|scheduled|closed_won|closed_lost|escalated|opted_out",
  "metadata": {},
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### Conversation (list endpoint)
```json
{
  "id": "uuid",
  "lead": { "name": "...", "email": "...", "company": "...", "status": "new" },
  "status": "new",
  "awaitingReply": true,
  "humanTakeover": false,
  "messages": [ { "id": "...", "role": "user", "source": "customer", "content": "...", "createdAt": "..." } ],
  "createdAt": "ISO 8601"
}
```

### Message
```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "role": "system|assistant|user",
  "source": "ai|human|customer",
  "content": "string",
  "metadata": {},
  "createdAt": "ISO 8601"
}
```

### Config (GET response)
```json
{
  "config": {
    "business": { "name": "", "tagline": "", "website": "", "description": "" },
    "tone": { "style": "professional", "instructions": "", "dos": [], "donts": [] },
    "knowledge": { "links": [], "texts": [] },
    "services": [],
    "faq": [],
    "escalation": { "triggerPhrases": [], "notifyEmail": "" },
    "booking": { "url": "", "cta": "", "timing": "after_second_exchange" },
    "providers": {
      "llm": "openai",
      "llmApiKey": "env:LLM_API_KEY",
      "llmModel": "",
      "email": "resend",
      "emailApiKey": "env:EMAIL_API_KEY",
      "fromEmail": "hello@pouncefirst.com",
      "inbox": ""
    },
    "agent": { "enabled": false, "webhookUrl": "" }
  }
}
```

### Analytics
```json
{
  "stats": { "totalLeads": 0, "responseRate": 0, "avgResponseTime": "0.0", "bookingRate": 0, "leadsThisWeek": 0, "leadsLastWeek": 0 },
  "weeklyData": [{ "day": "Mon", "leads": 0, "responses": 0, "bookings": 0 }],
  "statusBreakdown": [{ "status": "new", "count": 1 }],
  "recentActivity": [{ "action": "email_received", "target": "email@example.com", "time": "ISO 8601" }]
}
```

## What Pip Builds

### Admin Dashboard Pages (`src/pages/admin/`)
- `/admin` — Dashboard home (pipeline overview, recent leads)
- `/admin/leads` — Lead pipeline view (new → contacted → scheduled → closed)
- `/admin/conversations` — Conversation threads
- `/admin/settings` — Business config (9 sections)
- `/admin/analytics` — Response rates, booking rates
- `/admin/book` — Cal.com booking embed

### UI Components (`src/components/`)
- Lead cards, conversation thread, pipeline board, config forms, etc.

## Settings Page Sections

1. **Business Identity** — name, tagline, website, description
2. **Tone & Voice** — style preset, custom instructions, dos/don'ts
3. **Knowledge Sources** — links (scraped) + manual text entries
4. **Services & Pricing** — what you sell
5. **FAQ** — common questions + approved answers
6. **Escalation Rules** — trigger phrases, who gets notified
7. **Booking** — calendar link, CTA text, timing
8. **Integrations** — LLM provider + API key reference, email provider + API key reference, inbox
9. **Agent Mode** — enable/disable, webhook URL

### Provider Config Format
The `providers` config section is fully dynamic — no hardcoded provider→env mapping:

```json
{
  "llm": "openai",
  "llmApiKey": "env:LLM_API_KEY",
  "llmModel": "gpt-4o-mini",
  "email": "resend",
  "emailApiKey": "env:EMAIL_API_KEY",
  "fromEmail": "hello@pouncefirst.com",
  "inbox": ""
}
```

To add a new LLM provider (e.g., Gemini): set `llm` to the provider name, `llmApiKey` to `env:LLM_API_KEY`. The actual key goes in `.env` as `LLM_API_KEY=sk-...` — same env var for any provider.

`env:KEY` references are resolved at runtime from `import.meta.env` / `process.env`.

## Handoff Protocol

- Pip needs an API → drop `<!-- BOLT: Need ... -->` comment
- Bolt changes API shape → adds `<!-- PIP: Updated ... -->` comment
- Pip's territory: `src/components/`, `src/pages/admin/`, `src/styles/`
- Bolt's territory: `src/pages/api/`, `src/lib/`, `src/middleware/`

## Lead Pipeline Statuses

```
new → contacted → customer_waiting → scheduled → closed_won
                                              ↘ closed_lost
                                              ↘ escalated
                                              ↘ opted_out
```

Color coding suggestions for the pipeline view:
- new → blue
- contacted → yellow
- customer_waiting → orange
- scheduled → green
- closed_won → green (solid)
- closed_lost → gray
- escalated → red
- opted_out → gray (muted)

## Trust & Safety (Non-Negotiable)

- **Unsubscribe link** on every outbound email — no exceptions
- **10 AI message cap** per conversation — then human must take over
- **Daily send cap** — enforced per tier (100 default)
- **AI disclosure** — first response must identify as AI
- **Content scanning** — escalation trigger phrases auto-detect
- **Opted-out leads** — never contacted again