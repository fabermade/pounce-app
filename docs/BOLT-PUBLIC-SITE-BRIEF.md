# Bolt Brief — Stripe + Free Tier + License Server Integration

**Date:** 2026-04-27  
**Agent:** Bolt  
**Repo:** `hamburgers/TrueLeads` (Pounce app) + `hamburgers/trueleads-license` (license server)  
**Branches:** `bolt/stripe-free-tier` (TrueLeads), `bolt/license-server` (trueleads-license — already exists)  
**Estimate:** ~14h  

---

## Overview

You're building the money pipe, the free tier backend, and integrating Stripe with the existing license server. Pip is building the public site UI in parallel.

The license server is already built on `bolt/license-server` in the `trueleads-license` repo. It's a Cloudflare Workers service (Hono + Drizzle + Neon). Your work on the Pounce app side calls its API to generate/upgrade/downgrade license keys.

**Free tier is the funnel.** No credit card, no friction. Sign up, get a license key, start responding to leads. At 500 leads/month, AI auto-reply pauses — leads still arrive, business still sees them, just no AI response. That's the upgrade path.

---

## Architecture

```
pouncefirst.com/signup           → Pip builds UI
  POST /api/auth/signup          → Create user + call license server API to generate free key
  Redirect to /admin/setup?key=PC-XXXX-XXXX-XXXX

pouncefirst.com/pricing           → Pip builds UI
  POST /api/stripe/checkout     → Create Stripe Checkout Session
  Redirect to Stripe → pay → webhook

pouncefirst.com/api/stripe/webhook → Handle checkout.session.completed
  → Call license server API to upgrade tier
  → Send confirmation email via Resend

pouncefirst.com/api/f/{slug}      → Lead submission (existing)
  → Check license tier + leads this month count
  → IF free tier AND count >= 500: store lead + email, skip AI reply
  → IF paid OR under 500: store lead + email + AI auto-reply

license.pouncefirst.com (Cloudflare Workers, already built)
  POST /license/activate          → Activate a license key for a domain
  POST /license/verify            → Verify license is valid for a domain
  POST /license/deactivate        → Deactivate a license for a domain
  POST /admin/license/generate    → Generate a new license key (admin API, used by Pounce signup)
  POST /admin/license/upgrade     → Upgrade a license tier (admin API, used by Stripe webhook)
  GET  /admin/license/list        → List licenses (admin API)
```

---

## Existing License Server (Already Built)

The license server on `bolt/license-server` branch is **done and working**. It has:

- ✅ Hono + TypeScript + Drizzle + Neon PostgreSQL
- ✅ Cloudflare Workers deployment (Wrangler)
- ✅ `POST /license/activate` — activate a key for a domain
- ✅ `POST /license/verify` — verify key is valid for domain
- ✅ `POST /license/deactivate` — deactivate a domain
- ✅ `POST /admin/license/generate` — generate keys (admin API key auth)
- ✅ `GET /admin/license/list` — list licenses
- ✅ Key format: `PC-XXXX-XXXX-XXXX`, SHA-256 hashed, no ambiguous chars
- ✅ Rate limiting middleware
- ✅ Tiers: Starter ($10/mo, 1 site), Pro ($40/mo, 5 sites), Enterprise (contact us, unlimited)

**What needs updating on the license server:**

### LS1: Add `free` tier (~0.5h)

`src/lib/tiers.ts` — add free tier:
```typescript
free: {
  name: 'Free',
  maxSites: 1,
  maxLeads: 500,
  monthly: 0,
  annual: 0,
},
```

`src/lib/db/schema.ts` — update tier enum:
```typescript
export const tierEnum = pgEnum('tier', ['free', 'starter', 'pro', 'enterprise']);
```

`src/lib/keygen.ts` — add maxLeads mapping:
```typescript
export const TIER_MAX_LEADS: Record<string, number | null> = {
  free: 500,
  starter: null,  // unlimited
  pro: null,       // unlimited
  enterprise: null, // unlimited
};
```

### LS2: Add Stripe columns to licenses table (~0.5h)

`src/lib/db/schema.ts` — add to licenses table:
```typescript
stripeCustomerId: text('stripe_customer_id'),  // Link to Stripe customer
stripeSubscriptionId: text('stripe_subscription_id'),  // Link to Stripe subscription
maxLeads: integer('max_leads'),  // 500 for free, null for unlimited
```

### LS3: Add lead count verification to verify endpoint (~1h)

`src/routes/verify.ts` — the verify endpoint should return `maxLeads` so the Pounce app can check:
```json
{
  "valid": true,
  "tier": "free",
  "maxSites": 1,
  "activeSites": 1,
  "maxLeads": 500,
  "expiresAt": null
}
```

This lets the Pounce app check `if (tier === 'free' && leadsThisMonth >= maxLeads)` without calling the license server on every lead submission.

### LS4: Add upgrade/downgrade admin endpoints (~1h)

`src/routes/admin.ts` — add:
- `PATCH /admin/license/:id/upgrade` — change tier, update maxSites/maxLeads
- `PATCH /admin/license/:id/downgrade` — downgrade to free tier

These are called by the Stripe webhook handler in the Pounce app.

---

## Pounce App Tasks

### B9: Free Tier — Self-Signup (~2h)

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
1. Validate email + password (8+ chars)
2. Check if email exists → 409 "Account already exists"
3. Hash password with bcrypt
4. Create user in `users` table (role: `owner`)
5. Call `POST https://license.pouncefirst.com/admin/license/generate` with:
   ```json
   { "tier": "free", "email": "user@example.com" }
   ```
   (Include `Authorization: Bearer <LICENSE_SERVER_API_KEY>` header)
6. Store the returned license key hash in the `sites` table
7. Create default Pounce form for the site
8. Send welcome email via Resend with license key
9. Return `{ success: true, key: "PC-XXXX-XXXX-XXXX", redirectUrl: "/admin/setup?key=PC-XXXX-XXXX-XXXX" }`

**Important:** The raw key is returned ONCE in the signup response and in the email. It's never shown again.

### B10: Free Tier — Lead Rate Limiting (~1.5h)

Modify `/api/f/[slug]` (existing lead submission endpoint):

Before creating a lead:
1. Look up the site's license from the site's config
2. Count leads created for this site in the current calendar month: `SELECT COUNT(*) FROM leads WHERE site_id = ? AND created_at >= start_of_month`
3. Check against tier limits:

| Tier | Monthly Lead Limit | AI Auto-Reply |
|------|-------------------|---------------|
| free | 500 | Yes (up to 500), then paused |
| starter+ | Unlimited | Yes |

4. If `count < 500` OR tier is not `free`: proceed normally (store lead, send email, trigger AI auto-reply)
5. If `count >= 500` AND tier is `free`: store lead, send email to business, **skip AI auto-reply**, set `aiReplyEnabled: false` in response
6. The lead confirmation page shown to the customer always looks normal — no limit indication

Add to lead submission response:
```json
{
  "success": true,
  "leadId": "xxx",
  "aiReplyEnabled": true  // false when free tier limit hit
}
```

### B11: Free Tier — AI Auto-Reply Bypass (~0.5h)

When `aiReplyEnabled` is false:
- Lead is stored in DB normally
- Email notification still sent to the business
- AI response generation is skipped
- No `dailySendCounts` increment
- Admin dashboard shows the lead with: "AI reply paused — free tier limit reached"

### B12: Free Tier — Admin Usage Endpoint (~0.5h)

`GET /api/admin/config` — add to existing response:
```json
{
  ...existing fields...,
  "license": {
    "tier": "free",
    "maxSites": 1,
    "maxLeads": 500
  },
  "leadsThisMonth": 347,
  "leadsLimit": 500,
  "leadsPercentage": 69.4
}
```

Pip's `UsageBar.astro` component reads this.

### B1: Stripe Products + Prices Setup (~0.5h)

Create in Stripe dashboard:

| Product | Price ID | Amount | Interval |
|---------|----------|--------|----------|
| Starter | `price_starter_monthly` | $10 | monthly |
| Starter | `price_starter_annual` | $100 | yearly |
| Pro | `price_pro_monthly` | $40 | monthly |
| Pro | `price_pro_annual` | $175 | yearly |

Free: no Stripe product. Enterprise: no Stripe product (contact form).

7-day free trial on Starter and Pro: set `trial_period_days: 7` on Checkout Session.

Store price IDs in env vars:
```
STRIPE_STARTER_MONTHLY_PRICE_ID=price_xxx
STRIPE_STARTER_ANNUAL_PRICE_ID=price_xxx
STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx
STRIPE_PRO_ANNUAL_PRICE_ID=price_xxx
```

### B2: `/api/stripe/checkout` (~1.5h)

`POST /api/stripe/checkout`

Request body:
```json
{
  "priceId": "price_xxx",
  "email": "user@example.com",
  "tier": "starter" | "pro"
}
```

Logic:
1. Validate price ID matches tier
2. Create Stripe Checkout Session with `trial_period_days: 7`
3. `metadata: { tier, email }`
4. Return `{ "url": "https://checkout.stripe.com/..." }`

### B3: `/api/stripe/webhook` (~2h)

`POST /api/stripe/webhook`

Handle events:
- `checkout.session.completed` → call license server upgrade API, send confirmation email
- `customer.subscription.updated` → update tier if changed
- `customer.subscription.deleted` → downgrade to free
- `invoice.payment_failed` → mark as `past_due`

**On payment success:**
1. Get tier and email from checkout session metadata
2. Call `PATCH https://license.pouncefirst.com/admin/license/:id/upgrade` with `{ tier, stripeCustomerId, stripeSubscriptionId }`
3. Send confirmation email via Resend with license key + setup instructions

**Signature verification:** Use `STRIPE_WEBHOOK_SECRET` to verify. Reject invalid signatures with 400.

**Idempotency:** Check if checkout session ID was already processed before generating a new key.

### B4: `/api/stripe/portal` (~1h)

`POST /api/stripe/portal`

Request body:
```json
{
  "customerId": "cus_xxx"
}
```

Create Customer Portal Session. Allow plan changes, cancel, update payment method. Return redirect URL.

### B5: Post-Purchase Confirmation (~1h)

After Stripe Checkout, redirect to `/admin/setup?key=PC-XXXX-XXXX-XXXX`. The setup page shows:
- License key (copy button)
- Quick start instructions
- Link to `/docs/getting-started`

Pip builds the UI. You provide the data via `/api/admin/config` or URL params.

---

## Environment Variables

### Pounce app (Vercel) — Patch sets these:

```
STRIPE_SECRET_KEY=sk_xxx
STRIPE_PUBLIC_KEY=pk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_STARTER_MONTHLY_PRICE_ID=price_xxx
STRIPE_STARTER_ANNUAL_PRICE_ID=price_xxx
STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx
STRIPE_PRO_ANNUAL_PRICE_ID=price_xxx
LICENSE_SERVER_API_KEY=lks_xxx
LICENSE_SERVER_URL=https://license.pouncefirst.com
```

### License server (Cloudflare Workers) — you set via Wrangler:

```
DATABASE_URL=postgresql://...
ADMIN_API_KEY=lks_xxx
```

---

## Database Changes

### License server (Neon, separate DB):

Already has `licenses`, `activations`, `verification_log` tables. Add:
- `stripe_customer_id` column (text, nullable)
- `stripe_subscription_id` column (text, nullable)
- `max_leads` column (integer, nullable — 500 for free, null for unlimited)
- `free` tier to the tier enum

### Pounce app (Neon, main DB):

Add to `sites` table:
- `license_key_hash` column (text, nullable) — links site to license server record
- `license_tier` column (text, default 'free')

Add to `users` table:
- `tier` column (text, default 'free')

No need to duplicate the full license schema in the Pounce DB — the license server is the source of truth for license data. The Pounce app just stores a reference.

---

## Build Order

| # | Task | Hours | Depends On | Blocks |
|---|------|-------|------------|--------|
| LS1 | Add free tier to license server | 0.5 | — | B9 |
| LS2 | Add Stripe columns to license server | 0.5 | — | B3 |
| LS3 | Add maxLeads to verify response | 1 | LS1 | B10 |
| LS4 | Add upgrade/downgrade admin endpoints | 1 | LS1 | B3 |
| B9 | Free tier signup (calls LS generate API) | 2 | LS1 | Pip's signup page |
| B10 | Lead rate limiting | 1.5 | B9, LS3 | — |
| B11 | AI auto-reply bypass | 0.5 | B10 | — |
| B12 | Usage config endpoint | 0.5 | B10 | Pip's UsageBar |
| B1 | Stripe products/prices setup | 0.5 | Ty provides keys | B2, B3 |
| B2 | Stripe checkout route | 1.5 | B1 | Pip's pricing page |
| B3 | Stripe webhook handler | 2 | B1, LS2, LS4 | — |
| B4 | Stripe portal | 1 | B1 | — |
| B5 | Post-purchase confirmation data | 1 | B2 | Pip's success page |

**Parallel track:** LS1-LS4 + B9-B12 (free tier) can start immediately. B1-B5 (Stripe) starts when Ty provides Stripe keys.

**Total: ~14h** (license server 3h + Pounce app 11h)

---

## Territory Boundaries

**You build:** All API routes, database schema changes, Stripe integration, license server updates, email sending.

**Pip builds:** All UI pages (homepage, pricing, signup form, docs, support, contact, blog, UsageBar component). Don't create `.astro` page files.

**Patch handles:** Vercel env vars, Stripe webhook config, deploy/verify, self-hosting + troubleshooting doc content.

**Don't touch:** `src/pages/admin/*.astro` (Pip's territory for UI), `src/components/admin/*.astro` (Pip builds UsageBar).

---

## Key Rules

1. **License keys are never stored in plaintext.** SHA-256 hash only. Raw key shown once at generation, then gone.
2. **The license server is the source of truth for license data.** The Pounce app stores a reference (`license_key_hash`, `license_tier`) but calls the license server API for generation, verification, and tier changes.
3. **Free tier has no Stripe customer.** `stripe_customer_id` and `stripe_subscription_id` are null until they upgrade.
4. **Leads always get stored and emailed.** The only thing that stops at the limit is AI auto-reply.
5. **7-day free trial on paid tiers.** Set `trial_period_days: 7` in Stripe Checkout Session creation.
6. **Rate limit check happens before lead creation.** Count first, decide, then create.
7. **The customer-facing form never reveals limits.** Lead 501 shows the same "We'll get back to you" as lead 1.
8. **Enterprise has no Stripe product.** "Contact Sales" → `/contact` form.
9. **Webhook idempotency.** Stripe can send the same event twice. Check if already processed before creating/upgrading.
10. **Call license server APIs with `Authorization: Bearer <LICENSE_SERVER_API_KEY>`.** This is the admin API key, stored in Pounce env vars.

---

## Reference Files

- License server repo: `/home/claw/repos/trueleads-license/` (branch `bolt/license-server`)
- License server schema: `src/lib/db/schema.ts`
- License server tiers: `src/lib/tiers.ts`
- License server keygen: `src/lib/keygen.ts`
- License server routes: `src/routes/activate.ts`, `verify.ts`, `deactivate.ts`, `admin.ts`
- Pounce app schema: `src/lib/db/schema.ts`
- Pounce app auth: `src/middleware.ts`, `src/pages/api/admin/login.ts`, `src/pages/api/admin/invite.ts`
- Pounce app lead submission: `src/pages/api/f/[slug].ts`
- Pounce app config endpoint: `src/pages/api/admin/config.ts`
- Full build plan: `docs/PUBLIC-SITE-PLAN.md`
- Original license server plan: `docs/IMPLEMENTATION-PLAN.md` (in trueleads-license repo)