# Pounce — Phases 3-7: Next Build Plan

**Updated:** 2026-04-26  
**Status:** Phases 1-2 shipped. This plan covers what's next.

---

## What's Done (Phases 1-2)

| Feature | Status |
|---------|--------|
| Session auth (HMAC-SHA256 cookies) | ✅ Live |
| Login/logout | ✅ Live |
| Password reset flow | ✅ Live |
| User management (owner/admin/viewer) | ✅ Live |
| Invite flow (API) | ✅ Live |
| Accept invite page | ✅ Live |
| Setup wizard | ✅ Live |
| Dashboard with real data | ✅ Live |
| Leads page (real DB) | ✅ Live |
| Conversations page (real DB) | ✅ Live |
| Analytics page (real DB) | ✅ Live |
| Settings page (9 sections) | ✅ Live |
| Forms CRUD (API + pages) | ✅ Live |
| Users page | ✅ Live |
| Change password | ✅ Live |
| Resend webhook (inbound email) | ✅ Live |
| Booking webhook endpoint | ✅ Live |
| Agent mode toggle | ✅ Live (bug fixed) |
| SSR pages read from DB directly | ✅ Live (Bolt's fix) |
| AdminPage layout on all pages | ✅ Live (Patch's fix) |

## Known Bugs to Fix First

| Bug | Severity | Fix |
|-----|----------|-----|
| Invite emails don't actually send | Medium | Wire Resend `POST /emails` to invite flow |
| Password reset emails don't send | Medium | Same — need Resend send endpoint |
| Setup wizard: "Create Admin" button says "Saving..." forever on first setup | Medium | Verify setup flow works end-to-end after fresh DB |
| `dailySendCounts` table exists in schema but isn't used | Low | Wire into pipeline or remove |

---

## Phase 3: Email Inbox (Priority: High)

**Goal:** Receive replies from leads and have Pounce respond automatically.

### What exists
- `src/pages/api/webhook/resend.ts` — Resend webhook handler for inbound email
- `src/lib/providers/email/` — Resend, Mailgun, SendGrid outbound providers
- Conversations table + messages table in schema
- Response pipeline (`src/lib/core/response-pipeline.ts`) — but needs wiring to inbound messages

### What's missing
- **Inbound message flow:** Resend webhook receives email → parse → create/update conversation → trigger response pipeline
- **Gmail OAuth:** Connect Gmail to read replies
- **Outlook OAuth:** Connect Outlook to read replies
- **Email parser:** Extract text from MIME, strip signatures/quotes
- **Conversation threading:** Match inbound replies to existing conversations by lead email + thread ID

### Bolt Tasks (Phase 3)

| # | Task | Files | Est |
|---|------|-------|-----|
| 3.1 | **Wire Resend webhook to pipeline** — Inbound email → parse → find/create lead → find/create conversation → append message → trigger AI response | `src/pages/api/webhook/resend.ts`, `src/lib/core/pipeline.ts` | 2h |
| 3.2 | **Email parser** — Extract plain text from MIME, strip signatures, quotes, HTML | `src/lib/core/email-parser.ts` | 1h |
| 3.3 | **Conversation threading** — Match replies to existing conversations using In-Reply-To / References headers or lead email | `src/lib/core/conversation.ts` | 1h |
| 3.4 | **Inbox provider interface** — `EmailInboxProvider` with `listen()` / `stop()` methods | `src/lib/providers/inbox/base.ts`, `index.ts` | 30m |
| 3.5 | **Gmail inbox provider** — OAuth2 flow, Gmail API `messages.list` + `messages.get` | `src/lib/providers/inbox/gmail.ts`, `src/pages/api/auth/gmail.ts`, `src/pages/api/webhook/gmail.ts` | 2h |
| 3.6 | **Outlook inbox provider** — Microsoft Graph OAuth2, subscription webhooks | `src/lib/providers/inbox/outlook.ts`, `src/pages/api/auth/outlook.ts`, `src/pages/api/webhook/outlook.ts` | 2h |
| 3.7 | **OAuth token storage** — Store + refresh tokens in `business_config` (encrypted) | Update `schema.ts`, `src/lib/providers/oauth.ts` | 30m |
| 3.8 | **Admin inbox config** — Connect Gmail/Outlook buttons, status indicators in settings | `src/pages/api/admin/config.ts` updates | 30m |

**Bolt total: ~9.5h**

### Pip Tasks (Phase 3)

| # | Task | Files | Est |
|---|------|-------|-----|
| 3P.1 | **Inbox settings section** — Provider selector (Resend/Gmail/Outlook), connect button, status badge | `src/components/admin/settings/IntegrationsSection.astro` update | 45m |
| 3P.2 | **Gmail OAuth connect flow** — "Connect Gmail" button → redirect → callback → status | `src/pages/admin/connect-gmail.astro` | 30m |
| 3P.3 | **Outlook OAuth connect flow** — Same pattern for Microsoft | `src/pages/admin/connect-outlook.astro` | 30m |
| 3P.4 | **Conversation view upgrades** — Show AI vs human messages differently, reply indicator, thread grouping | `src/pages/admin/conversations.astro` update | 1h |

**Pip total: ~3h**

### Patch Tasks (Phase 3)

| # | Task | Est |
|---|------|-----|
| 3X.1 | Vercel env: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET` | 15m |
| 3X.2 | Test Resend inbound end-to-end: send email → webhook → lead created → AI responds | 30m |

**Patch total: ~45m**

---

## Phase 4: Booking Integrations (Priority: Medium)

**Goal:** Leads can book meetings, and Pounce updates the lead status automatically.

### What exists
- `src/lib/providers/booking/` — Cal.com and Calendly provider classes
- `src/lib/core/booking.ts` — Booking helper
- `src/pages/api/webhook/booking.ts` — Webhook handler
- `src/components/admin/settings/BookingSection.astro` — UI in settings
- Booking config section in config API

### What's missing
- **Cal.com embed widget** on public `/book` page
- **Webhook → lead status update** — When booking confirmed, move lead to `scheduled`
- **Booking confirmation in conversation** — Show booking status badge
- **Public booking page** — `/book` route

### Bolt Tasks (Phase 4)

| # | Task | Files | Est |
|---|------|-------|-----|
| 4.1 | **Booking webhook → lead status** — On confirmed booking, update lead status to `scheduled` | `src/pages/api/webhook/booking.ts` update, `src/lib/core/pipeline.ts` | 1h |
| 4.2 | **Cal.com embed** — Render Cal.com widget on `/book` page using booking config URL | `src/pages/book.astro` | 30m |
| 4.3 | **Calendly embed** — Same for Calendly | `src/pages/book.astro` update | 30m |
| 4.4 | **Booking config API update** — Add provider selection (calcom/calendly/none), embed URL, webhook secret verification | `src/pages/api/admin/config.ts` update | 30m |

**Bolt total: ~2.5h**

### Pip Tasks (Phase 4)

| # | Task | Files | Est |
|---|------|-------|-----|
| 4P.1 | **Public booking page** — `/book` route with Cal.com or Calendly embed | `src/pages/book.astro` | 30m |
| 4P.2 | **Booking status in leads** — Show "📅 Scheduled" badge when lead status is `scheduled` | `src/pages/admin/leads.astro` update | 20m |
| 4P.3 | **Booking confirmation in conversation** — Show booking event in conversation thread | `src/pages/admin/conversations.astro` update | 20m |

**Pip total: ~1h**

---

## Phase 5: Form Builder (Priority: Medium)

**Goal:** Customers create lead capture forms in admin, embed on their site, submissions create leads.

### What exists
- `forms` and `form_submissions` tables in schema
- `src/pages/api/admin/forms/` — CRUD API (create, read, update, delete)
- `src/pages/api/f/[slug]/submit.ts` — Public form submission endpoint
- `src/pages/api/f/[slug]/embed.ts` — Embed config endpoint
- `src/pages/f/[slug].astro` — Iframe form page
- `src/pages/admin/forms.astro` — Form list page
- `src/pages/admin/forms/new.astro` — Create form page
- `src/pages/admin/forms/[id].astro` — Edit form page

### What's missing
- **Embed script** — `<script>` tag that renders a form on external sites
- **Live preview** in form editor
- **Form analytics** — View count, submission rate
- **Theme customization** — Colors, fonts, border radius

### Bolt Tasks (Phase 5)

| # | Task | Files | Est |
|---|------|-------|-----|
| 5.1 | **Form submit → lead pipeline** — Wire form submissions through the response pipeline | `src/pages/api/f/[slug]/submit.ts` update, `src/lib/core/pipeline.ts` | 1h |
| 5.2 | **Form analytics** — Track views and submissions, add `form_views` table | `src/lib/db/schema.ts` update, `src/pages/api/admin/forms/[id].ts` update | 45m |
| 5.3 | **Embed script** — Vanilla JS, < 15KB, renders form from config API | `public/embed.js` or `src/embed/` | 2h |
| 5.4 | **Spam protection** — Honeypot field, rate limiting, reCAPTCHA optional | `src/pages/api/f/[slug]/submit.ts` update | 30m |

**Bolt total: ~4.25h**

### Pip Tasks (Phase 5)

| # | Task | Files | Est |
|---|------|-------|-----|
| 5P.1 | **Form editor upgrade** — Drag-and-drop field reorder, live preview panel | `src/pages/admin/forms/[id].astro` update | 1.5h |
| 5P.2 | **Embed modal** — Show snippet (script tag, React component, iframe) with copy button | `src/components/admin/EmbedModal.tsx` | 30m |
| 5P.3 | **Theme picker** — Light/dark/branded, primary color, border radius | `src/components/admin/ThemePicker.tsx` | 30m |
| 5P.4 | **Form analytics page** — Submission chart, conversion rate, source breakdown | `src/pages/admin/forms/[id]/analytics.astro` | 1h |

**Pip total: ~3.5h**

---

## Phase 6: License Client (Priority: Low — parallel with license server)

**Goal:** Pounce checks the license server on startup and every 24h. Blocks admin + sending on invalid license.

### What exists
- License server spec in `trueleads-license/docs/IMPLEMENTATION-PLAN.md`
- Nothing built yet in Pounce

### Bolt Tasks (Phase 6)

| # | Task | Files | Est |
|---|------|-------|-----|
| 6.1 | **License client lib** — Verify, activate, deactivate, cache result, 72h grace period | `src/lib/license/client.ts` | 1h |
| 6.2 | **License middleware** — Block admin + sending on invalid license, show warning | `src/middleware.ts` update | 30m |
| 6.3 | **License settings UI** — Enter key, show status, domain binding info | `src/pages/api/admin/license.ts`, settings page update | 45m |
| 6.4 | **Feature flags from license** — Gate features per tier | `src/lib/license/features.ts` | 30m |
| 6.5 | **Grace period logic** — 72h full access if check fails, 14-day watermark if expired, then read-only | `src/lib/license/grace.ts` | 30m |

**Bolt total: ~3.5h**

---

## Phase 7: Self-Host Distribution (Priority: Last)

**Goal:** Distributable Docker image + installer script.

### Patch Tasks (Phase 7)

| # | Task | Est |
|---|------|-----|
| 7.1 | **Dockerfile** — Multi-stage build, Astro production server, Node 20 | 1h |
| 7.2 | **docker-compose.yml** — Pounce + PostgreSQL, env vars, volumes | 30m |
| 7.3 | **Installer script** — `curl pouncefirst.com/install \| bash` | 2h |
| 7.4 | **Environment template** — `.env.example` with all required vars documented | 30m |
| 7.5 | **Health check endpoint** — `GET /api/health` for Docker/Compose | 15m |

**Patch total: ~4h**

---

## Build Order

```
Phase 3 (Inbox)  ──→  Phase 4 (Booking)  ──→  Phase 5 (Forms)
                                                          │
Phase 6 (License) ───────────────────────────────────────┤
                                                          │
                                                   Phase 7 (Distribution)
```

- **Phase 3 is next** — without inbound email, Pounce can't respond to leads
- Phase 4 is quick — mostly wiring existing providers
- Phase 5 is mostly frontend — form editor + embed script
- Phase 6 starts when license server is being built (parallel track)
- Phase 7 is last — depends on everything else

## Time Estimates

| Phase | Bolt | Pip | Patch |
|-------|------|-----|-------|
| 3. Inbox | 9.5h | 3h | 45m |
| 4. Booking | 2.5h | 1h | — |
| 5. Forms | 4.25h | 3.5h | — |
| 6. License | 3.5h | — | — |
| 7. Distribution | — | — | 4h |
| **Total** | **19.75h** | **7.5h** | **4.75h** |

## Priority Recommendation

1. **Phase 3** — Core product value: Pounce responds to leads automatically. Without this, it's just a dashboard.
2. **Phase 4** — Quick win: booking integration makes the pipeline real.
3. **Bug fixes** — Invite emails, password reset emails, setup wizard verification.
4. **Phase 5** — Form builder completes the inbound funnel.
5. **Phase 6** — License client gates self-serve deployment.
6. **Phase 7** — Distribution is last once everything works.

## Decisions Needed from Ty

- **Phase 3 priority:** Start with Resend-only (already working) or build Gmail/Outlook too?
- **Form embed:** Script tag only, or also React component + iframe?
- **License tiers:** What features gate at which tier? (single_provider, multi_provider, analytics, etc.)
- **Pricing:** Not setting numbers (rule 3a), but need tier boundaries defined.
- **Self-host timeline:** Is Docker distribution v1 or v2?