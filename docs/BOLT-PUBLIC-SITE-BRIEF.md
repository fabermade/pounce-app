# Bolt Brief — Stripe + Free Tier + Purchase Pipeline

**Date:** 2026-04-27  
**Agent:** Bolt  
**Repo:** `hamburgers/TrueLeads`  
**Branch:** `bolt/stripe-free-tier`  
**Estimate:** ~13h  

---

## Overview

You're building the money pipe and the free tier backend. Pip is building the public site UI in parallel — you don't need to wait for her pages to be done, but you do need to have API routes ready for her to call.

The free tier is the funnel. No credit card, no friction. Sign up, get a license key, start responding to leads. At 500 leads/month, AI auto-reply pauses and the business sees an upsell banner. That's the upgrade path.

---

## Architecture

```
/signup                          → Self-signup form (Pip builds UI)
  POST /api/auth/signup         → Create user + generate free license key
  Redirect to /admin/setup?key=PC-XXXX-XXXX-XXXX

/pricing                         → Pricing page (Pip builds UI)
  POST /api/stripe/checkout     → Create Stripe Checkout Session
  Redirect to Stripe → pay → webhook

/api/stripe/webhook              → Handle checkout.session.completed
  → Generate license key
  → Store in DB (hashed)
  → Send confirmation email via Resend
  → Update tier from free to starter/pro

/api/stripe/portal               → Customer Portal (manage billing)

/api/f/{slug}                    → Lead submission (existing)
  → CHECK: count leads this month for this site's license
  → IF free tier AND count >= 500: store lead + email, but aiReplyEnabled = false
  → IF paid tier OR count < 500: store lead + email + AI auto-reply as normal

/api/auth/signup                 → NEW: self-signup for free tier

/admin/settings                  → Show UsageBar (Pip builds UI)
  → GET /api/admin/config returns leadsThisMonth + leadsLimit
```

---

## Tasks

### Task B1: Stripe Products + Prices Setup (~0.5h)

Create in Stripe dashboard (Ty will provide account access):

| Product | Price ID | Amount | Interval |
|---------|----------|--------|----------|
| Starter | `price_starter_monthly` | $10 | monthly |
| Starter | `price_starter_annual` | $100 | yearly |
| Pro | `price_pro_monthly` | $40 | monthly |
| Pro | `price_pro_annual` | $175 | yearly |

Free tier: no Stripe product needed (no payment).
Enterprise: no Stripe product (handled via `/contact` form).

Store Stripe price IDs in env vars:
```
STRIPE_STARTER_MONTHLY_PRICE_ID=price_xxx
STRIPE_STARTER_ANNUAL_PRICE_ID=price_xxx
STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx
STRIPE_PRO_ANNUAL_PRICE_ID=price_xxx
```

**7-day free trial** on Starter and Pro: set `trial_period_days: 7` on Checkout Session creation.

### Task B2: `/api/stripe/checkout` (~1.5h)

`POST /api/stripe/checkout`

Request body:
```json
{
  "priceId": "price_xxx",
  "email": "user@example.com",
  "tier": "starter" | "pro"
}
```

Response:
```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_xxx"
}
```

Logic:
1. Validate price ID matches tier
2. Create Stripe Checkout Session with:
   - `mode: "subscription"`
   - `trial_period_days: 7`
   - `success_url: "${APP_URL}/admin/setup?key={CHECKOUT_SESSION_ID}"`
   - `cancel_url: "${APP_URL}/pricing"`
   - `metadata: { tier, email }`
3. Return redirect URL

### Task B3: `/api/stripe/webhook` (~2h)

`POST /api/stripe/webhook`

Handle these events:
- `checkout.session.completed` → Generate license key, create/update user, send email
- `customer.subscription.updated` → Update tier if changed
- `customer.subscription.deleted` → Downgrade to free tier
- `invoice.payment_failed` → Mark license as `past_due`

**License key generation on payment:**
1. Generate `PC-XXXX-XXXX-XXXX` (3 groups of 4 alphanumeric chars)
2. Hash with SHA-256 for storage
3. Store in `licenses` table: `{ key_hash, tier, email, max_sites, status: 'active' }`
4. Send email via Resend with the **raw** key (only shown once)
5. Store raw key in checkout session metadata for the success page

**Signature verification:** Use `STRIPE_WEBHOOK_SECRET` to verify webhook signatures. Reject invalid signatures with 400.

### Task B4: License Key Generation (~1h)

Already covered in B3, but specifically:

```typescript
function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
  const group = () => Array.from({ length: 4 }, () => 
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `PC-${group()}-${group()}-${group()}`;
}
```

Key derivation for storage:
```typescript
import { createHash } from 'crypto';
const keyHash = createHash('sha256').update(rawKey).digest('hex');
```

### Task B5: Confirmation Email via Resend (~1h)

When a license key is generated (either via signup or Stripe payment):

**Free tier signup email:**
- From: `hello@pouncefirst.com`
- Subject: "Welcome to Pounce — Here's Your License Key"
- Body: License key + link to `/docs/getting-started`

**Paid purchase email:**
- From: `hello@pouncefirst.com`
- Subject: "Pounce Starter/Pro — License Key & Setup Instructions"
- Body: License key + link to `/docs/getting-started` + billing portal link

Use the existing Resend setup. `RESEND_API_KEY` is in env vars.

### Task B6: `/api/stripe/portal` (~1h)

`POST /api/stripe/portal`

Request body:
```json
{
  "customerId": "cus_xxx"
}
```

Response:
```json
{
  "url": "https://billing.stripe.com/session/xxx"
}
```

Logic:
1. Create Stripe Customer Portal Session
2. Configure portal to allow: plan changes, cancel, update payment method
3. Return redirect URL

### Task B7: Post-Checkout Success Page (~1h)

Pip builds the UI at `/admin/setup`. The success page should:
- Show the license key (from checkout session metadata)
- Show setup instructions: "Copy this key → paste during setup"
- Link to `/docs/getting-started`
- Have a "Copy Key" button

The page receives the key via URL param or fetches from `/api/admin/config`.

### Task B8: Doc Content (~1h)

Write actual content for these doc pages (Pip builds the layout, you write the words):

- `/docs/api` — Admin API reference (all `/api/admin/*` endpoints)
- `/docs/inbox` — Gmail/Outlook OAuth setup instructions
- `/docs/booking` — Cal.com/Calendly webhook integration
- `/docs/license` — License activation, tier limits, renewal

Put content in markdown files under `src/content/docs/`. Pip's `DocContent.astro` renders them.

### Task B9: Free Tier — Self-Signup (~2h)

`POST /api/auth/signup`

Request body:
```json
{
  "email": "user@example.com",
  "name": "Acme Corp",
  "password": "securepassword"
}
```

Logic:
1. Validate email format, password strength (8+ chars)
2. Check if email already exists → 409 "Account already exists"
3. Hash password with bcrypt
4. Create user in `users` table (role: `owner`)
5. Generate free license key `PC-XXXX-XXXX-XXXX`
6. Create `licenses` row: `{ key_hash, tier: 'free', email, max_sites: 1, status: 'active' }`
7. Create `sites` row: `{ name, domain: '', license_id, user_id }`
8. Create default Pounce form for the site
9. Send welcome email with license key
10. Return `{ success: true, key: 'PC-XXXX-XXXX-XXXX', redirectUrl: '/admin/setup?key=PC-XXXX-XXXX-XXXX' }`

**Important:** The raw key is returned ONCE in the signup response and in the email. It's never shown again. The user must copy it.

### Task B10: Free Tier — Lead Rate Limiting (~1.5h)

Modify `/api/f/[slug]` (existing lead submission endpoint):

Before creating a lead, check:
1. Look up the site's license from the form's site_id
2. Count leads created for this site in the current calendar month
3. Compare against tier limits:

| Tier | Monthly Lead Limit | AI Auto-Reply |
|------|-------------------|---------------|
| free | 500 | Yes (up to 500), then paused |
| starter | Unlimited | Yes |
| pro | Unlimited | Yes |
| enterprise | Unlimited | Yes |

4. If `count < 500` OR tier is not `free`: proceed normally (store lead, send email, trigger AI auto-reply)
5. If `count >= 500` AND tier is `free`: store lead, send email to business, **skip AI auto-reply**, set `aiReplyEnabled: false` in response
6. The lead confirmation page shown to the customer should always look normal — no indication of limits

Add a new field to the lead submission response:
```json
{
  "success": true,
  "leadId": "xxx",
  "aiReplyEnabled": true  // false when free tier limit hit
}
```

### Task B11: Free Tier — AI Auto-Reply Bypass (~0.5h)

When `aiReplyEnabled` is false (free tier over limit):
- Lead is still stored in DB
- Email notification still sent to the business
- AI response generation is skipped
- No `dailySendCounts` increment
- Admin dashboard shows the lead with a note: "AI reply paused — free tier limit reached"

### Task B12: Free Tier — Admin Usage Banner (~0.5h)

`GET /api/admin/config` currently returns site settings. Add:
```json
{
  ...existing fields...,
  "leadsThisMonth": 347,
  "leadsLimit": 500,
  "leadsPercentage": 69.4
}
```

Pip's `UsageBar.astro` component reads this and renders:
- Under 80%: green progress bar
- 80-99%: orange progress bar + "Approaching limit" message
- 100%+: red progress bar + "AI auto-reply paused — Upgrade" link

---

## Database Changes

### New table: `licenses`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| key_hash | text (unique) | SHA-256 hash of raw key |
| tier | text | `free`, `starter`, `pro`, `enterprise` |
| email | text | Customer email |
| max_sites | integer | 1 (free), 1 (starter), 5 (pro), null (enterprise) |
| max_leads | integer | 500 (free), null (unlimited for rest) |
| status | text | `active`, `past_due`, `revoked`, `expired` |
| stripe_customer_id | text (nullable) | Link to Stripe customer |
| stripe_subscription_id | text (nullable) | Link to Stripe subscription |
| expires_at | timestamp (nullable) | null = never expires (free tier) |
| created_at | timestamp | |
| updated_at | timestamp | |

### Update `sites` table

Add: `license_id uuid REFERENCES licenses(id)`

### Update `users` table

Add: `tier text DEFAULT 'free'`

### New table: `lead_counts` (or compute on the fly)

You can either:
- **Option A (recommended):** Compute `leadsThisMonth` on the fly with a `COUNT(*)` query on the `leads` table filtered by `site_id` and `created_at` within current month. Simple, always accurate.
- **Option B:** Maintain a `lead_counts` table with monthly rollups. More complex, slightly faster reads.

Go with Option A. At 500 leads/month/site, the count query is fast enough.

---

## Environment Variables

Add to Vercel (Patch handles this):

```
STRIPE_SECRET_KEY=sk_xxx
STRIPE_PUBLIC_KEY=pk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_STARTER_MONTHLY_PRICE_ID=price_xxx
STRIPE_STARTER_ANNUAL_PRICE_ID=price_xxx
STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx
STRIPE_PRO_ANNUAL_PRICE_ID=price_xxx
```

Existing vars already set:
```
DATABASE_URL=postgresql://...
RESEND_API_KEY=re_xxx
SESSION_SECRET=xxx
ADMIN_PASSWORD_HASH=xxx
```

---

## Build Order

| # | Task | Hours | Depends On | Blocks |
|---|------|-------|------------|--------|
| B1 | Stripe products/prices | 0.5 | Ty provides keys | B2, B3 |
| B9 | Free tier signup | 2 | — | Pip's signup page |
| B10 | Lead rate limiting | 1.5 | B9 | — |
| B11 | AI auto-reply bypass | 0.5 | B10 | — |
| B12 | Usage config endpoint | 0.5 | B10 | Pip's UsageBar |
| B2 | Stripe checkout | 1.5 | B1 | Pip's pricing page |
| B3 | Stripe webhook | 2 | B1 | — |
| B4 | License key generation | 1 | B3 | — |
| B5 | Confirmation email | 1 | B4 | — |
| B6 | Stripe portal | 1 | B1 | — |
| B7 | Success page data | 1 | B2 | Pip's success page |
| B8 | Doc content | 1 | — | — |

**Parallel track:** B9-B12 (free tier) can start immediately, no Stripe dependency. B2-B7 (Stripe) can start as soon as Ty creates the Stripe products.

**Total: ~13h**

---

## Territory Boundaries

**You build:** All API routes (`/api/auth/*`, `/api/stripe/*`), database schema changes, license key logic, Stripe integration, email sending.

**Pip builds:** All UI pages (homepage, pricing, signup form, docs, support, contact, blog, UsageBar component). Don't create `.astro` page files.

**Patch handles:** Vercel env vars, Stripe webhook endpoint config, deploy/verify, self-hosting + troubleshooting doc content.

**Don't touch:** `src/pages/admin/*.astro` (Pip's territory for UI changes), `src/components/admin/*.astro` (Pip builds UsageBar).

---

## Key Rules

1. **License keys are never stored in plaintext.** SHA-256 hash only. Raw key shown once at generation, then gone.
2. **Free tier has no Stripe customer.** `stripe_customer_id` and `stripe_subscription_id` are null until they upgrade.
3. **Leads always get stored and emailed.** The only thing that stops at the limit is AI auto-reply.
4. **7-day free trial on paid tiers.** Set `trial_period_days: 7` in Stripe Checkout Session creation for Starter and Pro.
5. **Rate limit check happens before lead creation.** Not after. Count first, decide, then create.
6. **The customer-facing form never reveals limits.** Lead 501 shows the same "We'll get back to you" as lead 1.
7. **Enterprise has no Stripe product.** The "Contact Sales" button on `/pricing` links to `/contact` — a Pounce form, not Stripe.
8. **Webhook idempotency.** Stripe can send the same event twice. Check if you've already processed a `checkout.session.id` before generating a new license key.

---

## Reference Files

- Existing auth: `src/middleware.ts`, `src/pages/api/admin/login.ts`, `src/pages/api/admin/invite.ts`
- Existing lead submission: `src/pages/api/f/[slug].ts`
- Existing config endpoint: `src/pages/api/admin/config.ts`
- Database schema: `src/lib/db/schema.ts`
- Email sending: `src/lib/core/email.ts` (or Resend API directly)
- Full build plan: `docs/PUBLIC-SITE-PLAN.md`
- License server plan: `docs/IMPLEMENTATION-PLAN.md` (in trueleads-license repo)