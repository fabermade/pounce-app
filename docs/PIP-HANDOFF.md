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

### API Routes (Working Now)
- `POST /api/inbound` — Lead intake (form, webhook, email)

### Provider Interfaces (Built, not yet called from routes)
- **LLM:** OpenAI, Anthropic, Ollama
- **Email:** Resend, SendGrid, Mailgun

### Core Modules (Built)
- `src/lib/core/lead-parser.ts` — Normalize inbound payloads
- `src/lib/core/conversation.ts` — Conversation state + message history
- `src/lib/core/pipeline.ts` — Status transitions + event logging
- `src/lib/core/booking.ts` — Booking CTA logic
- `src/lib/prompts/system.ts` — System prompt builder from business config

## What Pip Builds

### Admin Dashboard Pages (`src/pages/admin/`)
- `/admin` — Dashboard home (pipeline overview, recent leads)
- `/admin/leads` — Lead pipeline view (new → contacted → scheduled → closed)
- `/admin/conversations` — Conversation threads
- `/admin/settings` — Business config (9 sections)
- `/admin/analytics` — Response rates, booking rates

### UI Components (`src/components/`)
- Lead cards, conversation thread, pipeline board, config forms, etc.

### Booking Page (`src/pages/book.astro`)
- Cal.com embed (v1)

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

### Conversation
```json
{
  "id": "uuid",
  "leadId": "uuid",
  "inboxProvider": "string|null",
  "externalId": "string|null",
  "lastInboundAt": "ISO 8601|null",
  "lastOutboundAt": "ISO 8601|null",
  "awaitingReply": true,
  "humanTakeover": false,
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

### Business Config (key → JSONB value)
Keys: `business`, `tone`, `knowledge`, `services`, `faq`, `escalation`, `booking`, `providers`, `agent`

Each key stores its config section as a JSON object. See `docs/PLAN.md` → "Source of Truth" section for the full structure.

## Admin API Routes (Bolt Will Build Next)

Pip can start building UI with mock data. When she needs a real API endpoint, drop a `<!-- BOLT: Need GET /api/admin/leads -->` comment and I'll build it.

Priority admin routes I'll build in order:
1. `GET /api/admin/leads` — List leads with filters
2. `GET /api/admin/leads/:id` — Lead detail + conversation
3. `GET /api/admin/conversations/:id` — Full message thread
4. `GET /api/admin/config` — All business config
5. `PATCH /api/admin/config` — Update config
6. `PATCH /api/admin/leads/:id` — Update lead status
7. `POST /api/admin/conversations/:id/reply` — Human reply
8. `GET /api/admin/analytics` — Dashboard stats

## Settings Page Sections

1. **Business Identity** — name, tagline, website, description
2. **Tone & Voice** — style preset, custom instructions, dos/don'ts
3. **Knowledge Sources** — links (scraped) + manual text entries
4. **Services & Pricing** — what you sell
5. **FAQ** — common questions + approved answers
6. **Escalation Rules** — trigger phrases, who gets notified
7. **Booking** — calendar link, CTA text, timing
8. **Integrations** — LLM, email, inbox provider settings
9. **Agent Mode** — enable/disable, webhook URL

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