# Pounce — Bolt Phase 3 Brief

**Repo:** `github.com/hamburgers/TrueLeads`
**Branch:** `bolt/phase3-inbox`
**Base:** `main` (commit `d6ac65e`)

---

## What You're Building

Phase 3 is the email inbox — the core of Pounce. Without inbound email, Pounce is just a dashboard. With it, Pounce automatically responds to leads like a real employee.

The Resend webhook already receives inbound emails and creates leads. What's missing is:

1. **Wire the response pipeline to inbound** — When a lead emails in, Pounce auto-replies using the configured LLM + tone + knowledge
2. **Gmail OAuth provider** — Connect a Gmail inbox to read replies
3. **Outlook OAuth provider** — Connect an Outlook inbox to read replies
4. **OAuth token storage** — Store + refresh tokens in `business_config`
5. **Email parser improvements** — Better MIME handling, signature stripping

## Architecture

### Inbound Flow (already partially working)

```
Email arrives → Resend webhook OR Gmail/Outlook poll
  → Parse email (extract text, strip quotes)
  → Find or create lead by email
  → Find or create conversation
  → Append customer message
  → Run response pipeline (LLM + tone + knowledge → send reply)
```

The Resend webhook at `src/pages/api/webhook/resend.ts` already does steps 1-5. It even calls `runResponsePipeline()`. Your job is to make the Gmail and Outlook providers work the same way.

### Provider Pattern

All providers follow the same pattern as the existing ones:

```
src/lib/providers/
  email/       ← Already exists (Resend, SendGrid, Mailgun)
  llm/         ← Already exists (OpenAI, Ollama, Anthropic)
  booking/     ← Already exists (Cal.com, Calendly)
  inbox/       ← NEW — you're building this
    base.ts    ← EmailInboxProvider interface
    gmail.ts   ← Gmail OAuth2 + Gmail API
    outlook.ts ← Microsoft Graph OAuth2
    index.ts   ← Factory
```

### Key Files You Need to Know

| File | What It Does |
|------|-------------|
| `src/lib/core/response-pipeline.ts` | The main engine. Takes a conversation ID, loads config, builds prompt, calls LLM, sends email. You call `runResponsePipeline(conversationId)` after receiving an inbound message. |
| `src/lib/core/conversation.ts` | `addMessage()`, `canAIRespond()`, `getConversationContext()`. Use these to add messages and check if AI should respond. |
| `src/lib/core/pipeline.ts` | `transitionLeadStatus()`, `logEvent()`. Use these when leads change status. |
| `src/lib/core/email-parser.ts` | **Doesn't exist yet.** Create this. Strip HTML, extract plain text, remove signatures/quotes. The Resend webhook has a basic `extractReplyContent()` — move it here and improve it. |
| `src/lib/db/schema.ts` | All tables: leads, conversations, messages, events, business_config, users, forms, etc. |
| `src/pages/api/admin/config.ts` | GET/PATCH config. The `providers` section already has `llmApiKey`, `emailApiKey`, `fromEmail`. You'll add `inbox` (provider name) and OAuth tokens here. |
| `src/pages/api/webhook/resend.ts` | Resend inbound webhook. **Already working.** Creates leads, adds messages, runs pipeline. Use this as your reference for how inbox providers should work. |
| `src/lib/providers/email/base.ts` | Email provider interface + factory. Follow this pattern for inbox providers. |

### Config Storage

Business config is stored in `business_config` table as key→JSONB rows. Current keys:

```
business, tone, knowledge, services, faq, escalation, booking, providers, agent
```

You'll add OAuth token storage under the `providers` key. Example:

```json
{
  "providers": {
    "llm": "openai",
    "llmApiKey": "env:LLM_API_KEY",
    "llmModel": "gpt-4o",
    "email": "resend",
    "emailApiKey": "env:EMAIL_API_KEY",
    "fromEmail": "hello@pouncefirst.com",
    "inbox": "gmail",
    "gmailClientId": "env:GMAIL_CLIENT_ID",
    "gmailClientSecret": "env:GMAIL_CLIENT_SECRET",
    "gmailAccessToken": "env:GMAIL_ACCESS_TOKEN",
    "gmailRefreshToken": "env:GMAIL_REFRESH_TOKEN",
    "gmailTokenExpiry": "2026-04-26T12:00:00Z",
    "outlookClientId": "env:OUTLOOK_CLIENT_ID",
    "outlookClientSecret": "env:OUTLOOK_CLIENT_SECRET",
    "outlookAccessToken": "env:OUTLOOK_ACCESS_TOKEN",
    "outlookRefreshToken": "env:OUTLOOK_REFRESH_TOKEN",
    "outlookTokenExpiry": "2026-04-26T12:00:00Z"
  }
}
```

**Rule:** API keys and OAuth tokens stored with `env:` prefix resolve to environment variables at runtime. Never store raw secrets in the DB.

### OAuth Flow

Both Gmail and Outlook follow the same pattern:

1. Admin clicks "Connect Gmail" in settings
2. Browser redirects to OAuth consent screen
3. User grants permissions
4. OAuth callback at `/api/auth/gmail/callback` (or `/api/auth/outlook/callback`)
5. Exchange auth code for access + refresh tokens
6. Store tokens in `business_config` under `providers` key
7. Refresh tokens automatically when they expire

**Gmail scopes:** `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/gmail.modify`

**Outlook scopes:** `https://graph.microsoft.com/Mail.Read`, `https://graph.microsoft.com/Mail.ReadWrite`

### Inbox Provider Interface

```typescript
// src/lib/providers/inbox/base.ts

export interface EmailInboxProvider {
  readonly name: string;
  
  /** Start listening for new emails. Calls onMessage for each new email. */
  listen(onMessage: (email: InboundEmail) => Promise<void>): void;
  
  /** Stop listening. */
  stop(): void;
}

export interface InboundEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  headers: Record<string, string>;
  inReplyTo?: string;      // Message-ID header for threading
  references?: string;       // References header for threading
  messageId: string;
}
```

For Gmail and Outlook, `listen()` doesn't actually poll — it sets up webhook subscriptions so the provider pushes new emails to us. But the interface supports both polling and pushing.

## Task Breakdown

### Task 3.1: Wire Resend webhook to pipeline (2h)

**What:** The Resend webhook already works, but the response pipeline might not be sending emails properly. Verify end-to-end: inbound email → create/update lead → create/update conversation → add message → AI generates reply → send reply via Resend.

**Files to modify:**
- `src/pages/api/webhook/resend.ts` — May need updates to conversation threading
- `src/lib/core/response-pipeline.ts` — Verify it loads config correctly and sends replies

**Test:** Send an email to the Resend inbound address. Verify: lead created, conversation created, AI reply sent, lead status updated to `contacted`.

### Task 3.2: Email parser (1h)

**What:** Extract `src/lib/core/email-parser.ts` from the inline code in `resend.ts`. Improve it:

- Better HTML→text conversion (handle `<blockquote>`, `<div class="gmail_quote">`, etc.)
- Strip common email signatures (Gmail "On ... wrote:", Outlook separators)
- Handle multipart MIME messages
- Extract In-Reply-To and References headers for threading

**Files to create:**
- `src/lib/core/email-parser.ts`

**Files to modify:**
- `src/pages/api/webhook/resend.ts` — Import from email-parser instead of inline functions

### Task 3.3: Conversation threading (1h)

**What:** Match inbound replies to existing conversations using email headers (In-Reply-To, References) and sender email. Currently `matchToLead()` just finds the most recent conversation. Improve it to:

- Match by In-Reply-To header first (most accurate)
- Fall back to sender email + most recent open conversation
- Create new conversation if no match (same lead, new thread)

**Files to modify:**
- `src/lib/core/conversation.ts` — Add `findConversationByEmailThread()` function
- `src/pages/api/webhook/resend.ts` — Use improved threading

### Task 3.4: Inbox provider interface (30m)

**What:** Create the `EmailInboxProvider` interface and factory.

**Files to create:**
- `src/lib/providers/inbox/base.ts` — Interface + `InboundEmail` type
- `src/lib/providers/inbox/index.ts` — Factory: `createInboxProvider(config)`

### Task 3.5: Gmail inbox provider (2h)

**What:** Gmail OAuth2 + Gmail API. Admin connects Gmail in settings, Pounce reads new messages.

**Files to create:**
- `src/lib/providers/inbox/gmail.ts` — Gmail provider with OAuth2, `listMessages()`, `getMessage()`, token refresh
- `src/pages/api/auth/gmail.ts` — OAuth redirect endpoint
- `src/pages/api/auth/gmail/callback.ts` — OAuth callback, exchange code for tokens
- `src/pages/api/webhook/gmail.ts` — Push notification webhook (Gmail Cloud Pub/Sub)

**OAuth flow:**
1. GET `/api/auth/gmail` → redirect to Google consent screen
2. GET `/api/auth/gmail/callback?code=...` → exchange code for tokens → store in config → redirect to settings
3. POST `/api/webhook/gmail` → Google Pub/Sub notification → fetch message → process

**Note:** Google Pub/Sub setup requires a Google Cloud project with Gmail API enabled. For v1, you can also use polling (every 30s) as a simpler alternative.

### Task 3.6: Outlook inbox provider (2h)

**What:** Microsoft Graph OAuth2 + subscription webhooks. Same pattern as Gmail.

**Files to create:**
- `src/lib/providers/inbox/outlook.ts` — Outlook provider with OAuth2, Microsoft Graph API
- `src/pages/api/auth/outlook.ts` — OAuth redirect endpoint
- `src/pages/api/auth/outlook/callback.ts` — OAuth callback, exchange code for tokens
- `src/pages/api/webhook/outlook.ts` — Microsoft Graph webhook notification

**OAuth flow:** Same as Gmail but with Microsoft endpoints.

### Task 3.7: OAuth token storage (30m)

**What:** Store and refresh OAuth tokens in `business_config`. Auto-refresh when tokens expire.

**Files to create:**
- `src/lib/providers/oauth.ts` — `refreshOAuthToken()`, `getValidToken()`, `storeTokens()`

**Files to modify:**
- `src/pages/api/admin/config.ts` — Add inbox section to config
- `src/lib/providers/inbox/gmail.ts` — Use `getValidToken()` before API calls
- `src/lib/providers/inbox/outlook.ts` — Same

### Task 3.8: Admin inbox config (30m)

**What:** Update settings page to show inbox provider selection and connection status.

**Files to modify:**
- `src/pages/api/admin/config.ts` — Add `inbox` to config keys, add OAuth token fields
- `src/components/admin/settings/IntegrationsSection.astro` — Add Gmail/Outlook connect buttons

**Note:** Pip will build the full UI for the connect flow (task 3P.2, 3P.3). You just need the API endpoints and config storage working.

## Bug Fixes to Include

While you're working, fix these known bugs:

1. **Invite emails don't send** — `POST /api/admin/invite` should send an actual email via Resend with the invite link
2. **Password reset emails don't send** — `POST /api/admin/reset-password` should send an actual email via Resend with the reset link
3. **`dailySendCounts` table exists but isn't wired** — Either wire it into the response pipeline or remove it from the schema

## Rules

- **No feature gating.** All features available to every license. No tiers.
- **Script tag embed only for forms.** No React component, no iframe version.
- **`env:` prefix for secrets.** API keys stored as `env:VAR_NAME` resolve to `process.env[VAR_NAME]`.
- **Never expose raw secrets in API responses.** Mask with `••••••••`.
- **Follow existing patterns.** Look at `src/lib/providers/email/base.ts` for the provider interface pattern. Look at `src/pages/api/webhook/resend.ts` for the inbound flow pattern.
- **Don't touch Pip's files.** `src/components/admin/`, `src/pages/admin/*.astro` (except settings.astro for config additions). Pip owns the UI.
- **Don't modify the DB schema** unless adding the `inbox_provider` and `inbox_provider_id` columns to `conversations` table.
- **Test your code.** Every endpoint should work with `curl`. Include error handling for missing config, invalid tokens, expired tokens.

## Testing

After each task, test with:

```bash
# Config
curl -b cookies.txt https://pouncefirst.com/api/admin/config

# Resend webhook (simulate inbound email)
curl -X POST https://pouncefirst.com/api/webhook/resend \
  -H "Content-Type: application/json" \
  -d '{"from":"test@example.com","to":["hello@pouncefirst.com"],"subject":"Test","text":"Hello","html":"<p>Hello</p>"}'

# Gmail OAuth (will need browser)
curl https://pouncefirst.com/api/auth/gmail
```

## Build Priority

1. **Task 3.1** (Resend pipeline wiring) — This is the most important. Makes Pounce actually respond to leads.
2. **Task 3.2** (Email parser) — Extract and improve.
3. **Task 3.3** (Threading) — Makes conversations threaded properly.
4. **Tasks 3.4-3.8** — Inbox providers and OAuth.

Ship tasks 3.1-3.3 first as a working PR. Tasks 3.4-3.8 can be a second PR.

## Existing Codebase Map

```
src/
├── components/admin/          ← Pip's territory. Don't modify.
├── layouts/
│   └── AdminPage.astro        ← Page shell with Tailwind + fonts
├── lib/
│   ├── auth/                   ← Session, users, password, roles, rate-limit
│   ├── core/
│   │   ├── booking.ts          ← Booking helper
│   │   ├── conversation.ts     ← Conversation context + message management
│   │   ├── email-parser.ts     ← YOU CREATE THIS
│   │   ├── lead-parser.ts      ← Parse inbound leads
│   │   ├── pipeline.ts         ← Status transitions + event logging
│   │   └── response-pipeline.ts ← The main engine (LLM → email)
│   ├── db/
│   │   ├── client.ts           ← Drizzle client
│   │   ├── index.ts            ← Re-exports
│   │   └── schema.ts           ← All tables (leads, conversations, messages, events, etc.)
│   ├── prompts/
│   │   └── system.ts           ← Builds the LLM system prompt from config
│   └── providers/
│       ├── booking/             ← Cal.com, Calendly
│       ├── email/               ← Resend, SendGrid, Mailgun
│       ├── inbox/               ← YOU CREATE THIS (base.ts, gmail.ts, outlook.ts, index.ts)
│       └── llm/                 ← OpenAI, Ollama, Anthropic
├── middleware.ts                ← Auth middleware (protect /admin/* and /api/admin/*)
└── pages/
    ├── admin/                   ← SSR pages (Astro)
    └── api/
        ├── admin/               ← Auth, config, CRUD endpoints
        ├── f/[slug]/            ← Public form endpoints
        └── webhook/
            ├── booking.ts       ← Cal.com/Calendly webhook
            └── resend.ts        ← Resend inbound email (YOUR REFERENCE)
```