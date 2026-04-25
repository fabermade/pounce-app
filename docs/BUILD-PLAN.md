# Pounce — Build Plan: Next Stretch

**Goal:** Get Pounce to a shippable, self-host-ready product. Auth, inbox providers, booking integrations, form builder, and license client wired up so we can start on the license server.

**Decision:** Self-hosted, licensed, closed source. No public repo.

---

## Phase 1: Auth & Security (Bolt — Priority 1)

Auth exists as a plan (AUTH-PLAN.md) but isn't implemented yet. The dashboard is wide open.

### Bolt Tasks

| # | Task | Files | Est |
|---|------|-------|-----|
| 1.1 | **Session auth middleware** — HMAC-SHA256 signed cookies, `src/middleware.ts` protecting `/admin/*` and `/api/admin/*` | `src/middleware.ts` | 30m |
| 1.2 | **Password lib** — bcrypt hash + constant-time compare | `src/lib/auth/password.ts` | 15m |
| 1.3 | **Session lib** — create/verify/destroy signed cookies, 24h expiry | `src/lib/auth/session.ts` | 30m |
| 1.4 | **Login endpoint** — `POST /api/admin/login`, set cookie | `src/pages/api/admin/login.ts` | 20m |
| 1.5 | **Logout endpoint** — `POST /api/admin/logout`, clear cookie | `src/pages/api/admin/logout.ts` | 10m |
| 1.6 | **Change password endpoint** — `POST /api/admin/change-password`, store hash in `business_config` DB table (Option B from AUTH-PLAN) | `src/pages/api/admin/change-password.ts` | 20m |
| 1.7 | **CSRF protection** — double-submit cookie pattern on login | Inline in login.ts | 15m |
| 1.8 | **Login rate limit** — 5/min per IP, in-memory counter, 429 + Retry-After | `src/lib/auth/rate-limit.ts` | 20m |
| 1.9 | **Seed admin password** — Patch generates bcrypt hash, stores in `business_config` via setup wizard | Patch task | 5m |

**Bolt total: ~2.5 hours**

### Pip Tasks

| # | Task | Files | Est |
|---|------|-------|-----|
| 1P.1 | **Login page** — `src/pages/admin/login.astro`, email + password form, matches admin design, error states | `src/pages/admin/login.astro` | 30m |
| 1P.2 | **Change password form** — React island in settings page | `src/components/admin/ChangePassword.tsx` | 20m |
| 1P.3 | **Auth redirect** — Unauthenticated users get redirected to login everywhere | Inline in AdminLayout | 10m |

**Pip total: ~1 hour**

### Patch Tasks

| # | Task | Est |
|---|------|-----|
| 1X.1 | Set `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` env vars in Vercel | 5m |
| 1X.2 | Verify auth flow end-to-end after deploy | 10m |

---

## Phase 2: User Accounts (Bolt — Priority 2)

Single-admin auth is Phase 1. Multi-user accounts let teams collaborate.

### New DB Tables

```sql
-- Users table (extends single-admin to multi-user)
users (
  id uuid PK,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'admin',  -- 'owner' | 'admin' | 'viewer'
  last_login_at timestamp,
  created_at timestamp,
  updated_at timestamp
)

-- Password reset tokens
password_resets (
  id uuid PK,
  user_id uuid REFERENCES users(id),
  token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  used boolean DEFAULT false,
  created_at timestamp
)
```

### Bolt Tasks

| # | Task | Files | Est |
|---|------|-------|-----|
| 2.1 | **DB migration** — Add `users` and `password_resets` tables via Drizzle | `src/lib/db/schema.ts`, migration | 20m |
| 2.2 | **User management lib** — CRUD, role checks, session with user ID instead of just email | `src/lib/auth/users.ts` | 40m |
| 2.3 | **Registration endpoint** — `POST /api/admin/users` (owner-only) | `src/pages/api/admin/users/index.ts` | 25m |
| 2.4 | **Login update** — Session now includes `userId` and `role`, not just email | Update `src/lib/auth/session.ts` | 15m |
| 2.5 | **Role middleware** — `requireRole('owner')`, `requireRole('admin')` for route protection | `src/lib/auth/roles.ts` | 20m |
| 2.6 | **Password reset flow** — Token generation, email with reset link, expiry | `src/pages/api/admin/reset-password.ts`, `src/pages/api/admin/verify-reset.ts` | 30m |
| 2.7 | **Invite flow** — Owner sends invite email, new user sets password | `src/pages/api/admin/invite.ts`, `src/pages/admin/accept-invite.astro` | 30m |
| 2.8 | **Migrate existing admin** — Seed script to create `users` row from current `business_config` admin | Script | 10m |

**Bolt total: ~2.5 hours**

### Pip Tasks

| # | Task | Files | Est |
|---|------|-------|-----|
| 2P.1 | **User management page** — List users, invite new, change roles | `src/pages/admin/users.astro`, `src/components/admin/UserManager.tsx` | 45m |
| 2P.2 | **Password reset page** — `src/pages/admin/reset-password.astro` | 20m |
| 2P.3 | **Accept invite page** — `src/pages/admin/accept-invite.astro` | 20m |
| 2P.4 | **Settings page update** — Add user management section, change password form | Update settings.astro | 15m |

**Pip total: ~1.5 hours**

---

## Phase 3: Email Inbox Providers (Bolt — Priority 3)

Right now Pounce only sends outbound email. To respond to replies, it needs to receive email via webhooks or IMAP.

### Inbox Providers

| Provider | Method | Complexity |
|----------|--------|------------|
| **Resend** | Webhook (`email.received` event) | Low — we already have this for Faber Made |
| **Gmail** | Google OAuth2 + Gmail API | Medium — need OAuth flow, token refresh |
| **Outlook** | Microsoft Graph API | Medium — need OAuth flow, token refresh |
| **IMAP** | Direct IMAP connection | High — polling, parsing, not recommended for v1 |

### Bolt Tasks

| # | Task | Files | Est |
|---|------|-------|-----|
| 3.1 | **Inbox provider interface** — `EmailInboxProvider` with `listen()` and `stop()` methods | `src/lib/providers/inbox/base.ts` | 20m |
| 3.2 | **Resend inbox provider** — Webhook handler for `email.received` events, parse + normalize + route to `/api/inbound` | `src/pages/api/webhook/resend.ts`, `src/lib/providers/inbox/resend.ts` | 30m |
| 3.3 | **Gmail inbox provider** — OAuth2 flow, Gmail API messages.list + messages.get, poll or push (Cloud Pub/Sub) | `src/lib/providers/inbox/gmail.ts`, `src/pages/api/webhook/gmail.ts`, `src/pages/api/auth/gmail.ts` | 2h |
| 3.4 | **Outlook inbox provider** — Microsoft Graph API OAuth2, subscription webhooks for new messages | `src/lib/providers/inbox/outlook.ts`, `src/pages/api/webhook/outlook.ts`, `src/pages/api/auth/outlook.ts` | 2h |
| 3.5 | **IMAP fallback provider** — For self-hosted customers with custom mail servers | `src/lib/providers/inbox/imap.ts` | 1.5h |
| 3.6 | **Inbox provider factory** — Dynamic creation from business config, same pattern as LLM/email providers | `src/lib/providers/inbox/index.ts` | 15m |
| 3.7 | **Email parsing lib** — Extract text body from MIME, handle HTML/text parts, strip signatures | `src/lib/core/email-parser.ts` | 30m |
| 3.8 | **OAuth token storage** — Store + refresh tokens in `business_config` (encrypted at rest) | Update `schema.ts`, `src/lib/providers/oauth.ts` | 30m |
| 3.9 | **Admin inbox config UI** — Connect Gmail/Outlook buttons, OAuth flow, token status | `src/pages/api/admin/config.ts` (add inbox section) | 15m |

**Bolt total: ~7.5 hours**

### Pip Tasks

| # | Task | Files | Est |
|---|------|-------|-----|
| 3P.1 | **Inbox settings page** — Provider selection (Resend/Gmail/Outlook/IMAP), OAuth connect buttons, status indicators | `src/components/admin/InboxSettings.tsx` | 45m |
| 3P.2 | **Gmail OAuth connect flow** — "Connect Gmail" button → redirect → callback → store tokens | `src/pages/admin/connect-gmail.astro` | 30m |
| 3P.3 | **Outlook OAuth connect flow** — Same pattern for Microsoft | `src/pages/admin/connect-outlook.astro` | 30m |
| 3P.4 | **Inbox status widget** — Connected/disconnected, last sync time, error states | `src/components/admin/InboxStatus.tsx` | 20m |

**Pip total: ~2 hours**

---

## Phase 4: Booking Integrations (Bolt — Priority 4)

Right now booking is just a URL in config. Real integration means embedded booking and automatic status updates.

### Booking Providers

| Provider | Method | Complexity |
|----------|--------|------------|
| **Cal.com** | Embed + webhook for confirmed bookings | Low |
| **Calendly** | Embed + webhook | Medium — less API control |
| **Built-in** | Simple time slot picker, self-hosted | High — defer to v2 |

### Bolt Tasks

| # | Task | Files | Est |
|---|------|-------|-----|
| 4.1 | **Booking provider interface** — `BookingProvider` with `getAvailability()`, `createBooking()`, `cancelBooking()` | `src/lib/providers/booking/base.ts` | 20m |
| 4.2 | **Cal.com provider** — Embed widget + webhook handler for booking confirmed/cancelled | `src/lib/providers/booking/calcom.ts`, `src/pages/api/webhook/calcom.ts` | 1h |
| 4.3 | **Calendly provider** — Embed + webhook, OAuth for personal access | `src/lib/providers/booking/calendly.ts`, `src/pages/api/webhook/calendly.ts` | 1h |
| 4.4 | **Booking provider factory** — Dynamic from config | `src/lib/providers/booking/index.ts` | 15m |
| 4.5 | **Booking webhook → lead status update** — When a booking is confirmed, move lead to `scheduled` | Update `src/lib/core/pipeline.ts` | 20m |
| 4.6 | **Booking config in admin** — Provider selection, embed URL, webhook URL display | Update config API | 15m |

**Bolt total: ~3 hours**

### Pip Tasks

| # | Task | Files | Est |
|---|------|-------|-----|
| 4P.1 | **Booking settings page** — Provider select, Cal.com/Calendly embed config, webhook URL copy button | `src/components/admin/BookingSettings.tsx` | 40m |
| 4P.2 | **Public booking page** — `/book` route that renders embedded Cal.com or Calendly widget | Update `src/pages/book.astro` | 20m |
| 4P.3 | **Booking confirmation in conversation view** — Show booking status badge when lead has scheduled | Update conversations page | 20m |

**Pip total: ~1.5 hours**

---

## Phase 5: Form Builder (Bolt + Pip — Priority 5)

Already spec'd in FORM-BUILDER.md. Customers create forms in admin, embed on their site.

### Bolt Tasks

| # | Task | Files | Est |
|---|------|-------|-----|
| 5.1 | **DB migration** — Add `forms`, `form_submissions`, `form_views` tables | `src/lib/db/schema.ts`, migration | 25m |
| 5.2 | **Form CRUD API** — Create, read, update, delete, publish, unpublish | `src/pages/api/admin/forms/` | 1h |
| 5.3 | **Public form config endpoint** — `GET /api/forms/:id/config` (returns schema, no auth) | `src/pages/api/forms/[id]/config.ts` | 20m |
| 5.4 | **Public form submit endpoint** — `POST /api/forms/:id/submit` (creates lead, no auth) | `src/pages/api/forms/[id]/submit.ts` | 20m |
| 5.5 | **Embed script** — Vanilla JS, < 15KB gzipped, renders form from config | `public/embed.js` or `src/embed/` | 2h |
| 5.6 | **Iframe page** — `GET /f/:id` renders form in iframe | `src/pages/f/[id].astro` | 15m |
| 5.7 | **Form submission → lead pipeline** — Submissions go through `/api/inbound` flow | Wire into existing pipeline | 10m |

**Bolt total: ~4 hours**

### Pip Tasks

| # | Task | Files | Est |
|---|------|-------|-----|
| 5P.1 | **Form builder UI** — Drag-and-drop field editor, live preview, field types, required toggles | `src/pages/admin/forms/[id].astro`, `src/components/admin/FormBuilder.tsx` | 2h |
| 5P.2 | **Form list page** — Create, publish, disable, delete, view stats | `src/pages/admin/forms.astro`, `src/components/admin/FormList.tsx` | 1h |
| 5P.3 | **Embed modal** — Show snippet (script tag, React component, iframe) | `src/components/admin/EmbedModal.tsx` | 30m |
| 5P.4 | **Theme picker** — Light/dark/branded, primary color, font | `src/components/admin/ThemePicker.tsx` | 30m |

**Pip total: ~4 hours**

---

## Phase 6: License Client (Bolt — Priority 6)

This is the self-host enabler. Pounce checks the license server on startup and every 24h.

### Bolt Tasks

| # | Task | Files | Est |
|---|------|-------|-----|
| 6.1 | **License client lib** — Verify, activate, deactivate, cache result, 72h grace period | `src/lib/license/client.ts` | 1h |
| 6.2 | **License middleware** — Block admin + sending on invalid license, show warning | `src/middleware.ts` update | 30m |
| 6.3 | **License settings UI** — Enter key, show status (valid/expired/grace), domain binding info | `src/pages/api/admin/license.ts`, `src/components/admin/LicenseSettings.tsx` | 45m |
| 6.4 | **Feature flags from license** — Gate features per tier (single_provider, multi_provider, analytics, etc.) | `src/lib/license/features.ts` | 30m |
| 6.5 | **Grace period logic** — 72h full access if check fails, 14-day with watermark if expired, then read-only | `src/lib/license/grace.ts` | 30m |

**Bolt total: ~3.5 hours**

---

## Phase 7: Self-Host Distribution (Patch — Priority 7)

Once the license server is built (separate track), we need a way to distribute Pounce.

### Patch Tasks

| # | Task | Est |
|---|------|-----|
| 7.1 | **Dockerfile** — Multi-stage build, Astro production server, Node 20 | 1h |
| 7.2 | **docker-compose.yml** — Pounce + PostgreSQL, env vars, volumes | 30m |
| 7.3 | **Installer script** — `curl pouncefirst.com/install \| bash` — Docker + docker-compose + env setup | 2h |
| 7.4 | **Environment template** — `.env.example` with all required vars documented | 30m |
| 7.5 | **Health check endpoint** — `GET /api/health` for Docker/Docker Compose | 15m |
| 7.6 | **Compiled distribution** — Vercel build output or single binary via `pkg` | TBD |

**Patch total: ~4 hours**

---

## Summary: Time Estimates

| Phase | Bolt | Pip | Patch |
|-------|------|-----|-------|
| 1. Auth | 2.5h | 1h | 15m |
| 2. User Accounts | 2.5h | 1.5h | — |
| 3. Email Inbox | 7.5h | 2h | — |
| 4. Booking | 3h | 1.5h | — |
| 5. Form Builder | 4h | 4h | — |
| 6. License Client | 3.5h | — | — |
| 7. Distribution | — | — | 4h |
| **Total** | **23h** | **10h** | **4.5h** |

## Build Order

```
Phase 1 (Auth) ──→ Phase 2 (Users) ──→ Phase 3 (Inbox)
                                            │
Phase 4 (Booking) ──→ Phase 5 (Forms) ──────┤
                                            │
Phase 6 (License Client) ───────────────────┤
                                            ▼
                                     Phase 7 (Distribution)
```

- Phase 1 is the blocker — dashboard is wide open
- Phase 2 can start immediately after Phase 1
- Phases 3, 4, 5 are independent and can be parallelized between Bolt and Pip
- Phase 6 should start once the license server is being built (parallel track)
- Phase 7 is last — depends on everything else being done

## After This Stretch → License Server

Once Phases 1-6 are done, we start the license server in the `trueleads-license` repo. That's already spec'd in IMPLEMENTATION-PLAN.md — Bolt builds it, no Pip tasks needed (API-only, no UI).