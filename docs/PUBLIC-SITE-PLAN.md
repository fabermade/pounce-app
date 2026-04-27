# Pounce Public Site — Build Plan

**Date:** 2026-04-27  
**Status:** Draft — needs Ty's approval before work starts  
**Target:** pouncefirst.com (public-facing site + admin + purchase)

---

## Overview

Right now `pouncefirst.com` redirects straight to `/admin`. There is no public-facing presence — no product page, no docs, no way to learn about or buy Pounce. This plan adds the public site that turns pouncefirst.com into a real product website.

**Stripe** handles payments. The license server (Bolt) validates keys. The public site (Pip) sells them.

---

## Architecture

```
pouncefirst.com/              → Marketing homepage
pouncefirst.com/pricing       → Pricing tiers + Stripe checkout
pouncefirst.com/signup         → Free tier self-signup (no credit card)
pouncefirst.com/docs/...      → Documentation (setup, deploy, API)
pouncefirst.com/support       → Support (Pounce-powered: form → lead → AI reply)
pouncefirst.com/contact       → Contact (Pounce-powered: form → lead → AI reply)
pouncefirst.com/blog/...      → Blog posts
pouncefirst.com/admin/...     → Existing admin dashboard
pouncefirst.com/api/...       → Existing API routes
pouncefirst.com/f/...         → Existing public forms
pouncefirst.com/book          → Existing booking page
```

All pages share the same Astro project. Public pages use a **PublicLayout** (header, footer, no auth). Admin pages keep the existing **AdminLayout** (auth required).

---

## Pages & Content

### 1. Homepage (`/`)

**Purpose:** First impression. Explain what Pounce does, who it's for, why it's different.

**Sections:**
- **Hero:** Headline + subhead + CTA button ("Start Free Trial" → `/pricing`). Placeholder: screenshot of Pounce admin dashboard (Ty to capture)
- **How It Works:** 3-step visual — (1) Connect your inbox, (2) AI responds to leads, (3) You close deals. Placeholder: 3 illustration slots (Ty to capture or provide)
- **Features:** Grid of 6 key features with icons — AI lead response, inbox integration, form builder, booking webhooks, multi-user, self-hosted
- **Testimonials:** Placeholder section (empty until we have customers)
- **CTA:** Bottom call-to-action — "Get Pounce" → `/pricing`

**Pip owns:** Layout, design, copy, illustrations, responsive
**Bolt owns:** Stripe "Start Free Trial" button integration (checkout session redirect)

### 2. Pricing Page (`/pricing`)

**Purpose:** Show tiers, collect payment, deliver license key.

**Tiers:**

| Tier | Sites | Monthly | Annual |
|------|-------|---------|--------|
| Free | 1 site | $0 | — | 500 leads/mo |
| Starter | 1 site | $10/mo | $100/yr | Unlimited |
| Pro | 5 sites | $40/mo | $175/yr | Unlimited |
| Enterprise | Unlimited | Custom | Custom | Unlimited |

### Free Tier — Soft Wall Behavior

**Decision:** Option B — soft wall with upsell.

When a free tier site hits 500 leads/month:
- ✅ Lead 501+ **still gets stored** in the database
- ✅ Lead 501+ **still gets forwarded to the business email**
- ✅ The business owner **still sees every lead** in their dashboard
- ❌ **AI auto-reply stops** for leads beyond the 500 limit
- 📣 **Banner in admin:** "You've exceeded your free tier (523/500 leads this month). Upgrade to keep AI responding automatically."
- 📣 **Lead confirmation page** shows normal "We'll get back to you" (no indication of limits)

**The value upgrade:** Free = "see every lead, respond manually." Paid = "never miss a lead, AI handles it for you."

Leads counter resets on the 1st of each month.

**Self-signup flow:**
1. User visits pouncefirst.com → clicks "Get Started Free"
2. Enters email + business name → auto-generates free license key
3. Redirected to setup wizard → install Pounce
4. No credit card required
5. Upgrade anytime from Settings → Billing

**API changes:**
- `/api/f/{slug}` — before creating a lead, check site's `leadsThisMonth` vs tier limit
- If under limit: AI auto-reply proceeds normally
- If over limit: lead stored + emailed, but `aiReplyEnabled: false` in response
- Admin dashboard: show usage bar ("347/500 leads this month") with upgrade CTA when >80%

**Flow:**
1. User clicks "Get Started" on a tier
2. Stripe Checkout session created (Bolt API route)
3. User pays via Stripe
4. Stripe webhook → Bolt API generates license key → stores in DB
5. Post-checkout page shows license key + setup instructions
6. Confirmation email with license key sent via Resend

**Pip owns:** Pricing card design, toggle (monthly/annual), feature comparison table, responsive layout
**Bolt owns:** Stripe Checkout integration, webhook handler, license key generation post-payment, confirmation email, `/api/stripe/checkout`, `/api/stripe/webhook`

### 3. Documentation (`/docs/*`)

**Purpose:** Everything a customer needs to install, configure, and run Pounce.

**Pages:**
- `/docs` — Doc index / landing
- `/docs/getting-started` — Quick start (5 min setup)
- `/docs/installation` — System requirements, bare metal install steps
- `/docs/configuration` — Environment variables, settings reference
- `/docs/forms` — Form builder guide, embed options
- `/docs/inbox` — Gmail/Outlook OAuth setup, email parsing
- `/docs/booking` — Cal.com/Calendly integration
- `/docs/api` — Admin API reference
- `/docs/license` — License activation, tier limits, renewal
- `/docs/self-hosting` — Production deploy, nginx, SSL, backups
- `/docs/troubleshooting` — Common issues and fixes

**Pip owns:** Doc layout, sidebar navigation, search UI, code block styling, responsive
**Bolt owns:** Actual doc content (he wrote the code, he knows the API), API reference generation
**Patch owns:** Self-hosting and troubleshooting sections (infra expertise)

### 4. Support (`/support`)

**Purpose:** Customers get help. Non-customers reach us too.

**Implementation:** A Pounce form embedded on the page. The form submits to `/api/f/support` → creates a lead → AI responds. **We dogfood our own product.**

The support page IS a Pounce form. This is the proof point.

**Pip owns:** Support page layout, form styling, FAQ accordion above the form
**Bolt owns:** Ensure the form→lead→AI reply pipeline actually works (this is test 8.1 from the test plan)

### 5. Contact (`/contact`)

**Purpose:** Sales inquiries, enterprise requests, partnerships.

**Implementation:** Same as support — Pounce form. Different form slug, different tone config (more sales-oriented AI response).

**Pip owns:** Contact page layout
**Bolt owns:** Form pipeline

---

## Stripe Integration

### Setup Required (Ty)
1. **Stripe account** — Create if not exists
2. **3 Products** in Stripe: Starter, Pro, Enterprise
3. **6 Prices** — monthly + annual for Starter and Pro; Enterprise is custom (no Stripe price, links to `/contact`)
4. **Stripe keys** — `STRIPE_PUBLIC_KEY` + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in Vercel env vars
5. **Webhook endpoint** — Stripe dashboard → point to `https://pouncefirst.com/api/stripe/webhook`

### API Routes (Bolt)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/stripe/checkout` | POST | Create Checkout Session, return redirect URL |
| `/api/stripe/webhook` | POST | Handle `checkout.session.completed` → generate license key → send email |
| `/api/stripe/portal` | POST | Create Customer Portal session (manage billing) |

### Post-Purchase Flow
1. Stripe confirms payment via webhook
2. Bolt generates license key (`PC-XXXX-XXXX-XXXX`)
3. Key stored in DB (hashed) + sent to customer via Resend email
4. Customer redirected to `/docs/getting-started` with key pre-filled
5. Customer activates key during Pounce setup wizard

---

## Shared Components

**Pip builds these for reuse across all public pages:**

| Component | Used On |
|-----------|---------|
| `PublicLayout.astro` | All public pages — header, footer, no auth |
| `PublicHeader.astro` | Logo, nav links, "Get Pounce" CTA button |
| `PublicFooter.astro` | Links, copyright, social |
| `PricingCard.astro` | `/pricing` — tier name, price, features, CTA |
| `DocSidebar.astro` | `/docs/*` — navigation sidebar |
| `DocContent.astro` | `/docs/*` — markdown rendering, code blocks |
| `FAQAccordion.astro` | `/support` — common questions |
| `UsageBar.astro` | Admin dashboard — "347/500 leads this month" with upgrade CTA |
| `FeatureCard.astro` | `/` — icon + title + description |
| `StepCard.astro` | `/` — numbered step illustration |

---

## Routing & Auth

```
/ (and all public pages)   → No auth required, PublicLayout
/admin/*                   → Auth required, AdminLayout (existing)
/api/admin/*               → Auth required (existing middleware)
/api/stripe/*              → Stripe signature verification (no auth)
/api/f/*                   → Public form submissions (no auth)
/api/webhook/*             → Webhook signature verification (no auth)
```

The existing middleware already protects `/admin/*` and `/api/admin/*`. Public pages bypass auth entirely.

---

## Image Placeholders

Ty will need to capture or provide:

| Image | Size | Used On | Notes |
|-------|------|---------|-------|
| Hero screenshot | 1200×800 | Homepage | Pounce admin dashboard screenshot |
| Step 1 illustration | 400×300 | Homepage | "Connect your inbox" visual |
| Step 2 illustration | 400×300 | Homepage | "AI responds" visual |
| Step 3 illustration | 400×300 | Homepage | "Close deals" visual |
| Feature icons (6) | 64×64 | Homepage | Simple line icons for each feature |
| OG image | 1200×630 | All pages | Social share preview |

For now, Pip uses gray placeholder boxes with labels. Ty replaces with real captures.

---

## Build Order

### Phase A — Pip (Public Site UI) — ~12h

| Task | Hours | Depends On |
|------|-------|------------|
| A1. PublicLayout + Header + Footer | 2 | — |
| A2. Homepage (hero, how it works, features, CTA) | 4 | A1 |
| A3. Pricing page (cards, toggle, responsive) | 2 | A1 |
| A4. Docs layout (sidebar, content, code blocks) | 2 | A1 |
| A5. Support page (FAQ + Pounce form embed) | 1 | A1 |
| A6. Contact page (Pounce form embed) | 0.5 | A1 |
| A7. Signup page (email + business name → free tier) | 1.5 | A1 |
| A8. Usage bar component (admin dashboard) | 1 | A7 |
| A9. Mobile responsive pass | 0.5 | A2-A8 |

### Phase B — Bolt (Stripe + Purchase Pipeline + Free Tier) — ~13h

| Task | Hours | Depends On |
|------|-------|------------|
| B1. Stripe products/prices setup (4 tiers: free, starter, pro, enterprise) | 0.5 | Ty provides Stripe keys |
| B2. `/api/stripe/checkout` route | 1.5 | B1 |
| B3. `/api/stripe/webhook` handler | 2 | B1 |
| B4. License key generation on payment | 1 | B3 |
| B5. Confirmation email via Resend | 1 | B4 |
| B6. `/api/stripe/portal` (manage billing) | 1 | B1 |
| B7. Post-checkout success page | 1 | B2 |
| B8. Doc content (API, inbox, booking, license) | 1 | — |
| B9. Free tier: self-signup flow (`/signup`) | 2 | — |
| B10. Free tier: lead rate limiting (`/api/f/*` check monthly count) | 1.5 | B9 |
| B11. Free tier: AI auto-reply bypass when over limit | 0.5 | B10 |
| B12. Free tier: admin usage banner + upgrade CTA | 0.5 | B10 |

### Phase C — Patch (Infra) — ~2h

| Task | Hours | Depends On |
|------|-------|------------|
| C1. Stripe env vars in Vercel | 0.5 | B1 |
| C2. Stripe webhook endpoint config | 0.5 | B3 |
| C3. Self-hosting + troubleshooting docs | 1 | A4 |
| C4. Deploy + verify all public pages 200 | 0.5 | A+B |

### Total: ~30h (Pip 12h, Bolt 13h, Patch 2h)

---

## Decisions Made

1. ✅ **Stripe account** — Ty has one
2. ✅ **Enterprise pricing** — "Contact us" → `/contact` form
3. ✅ **Free tier** — $0, 1 site, 500 leads/month. Soft wall: leads still stored and emailed, but AI auto-reply stops. Upsell banner in admin. Self-signup, no credit card.
4. ✅ **Blog** — Included now
5. ✅ **Domain** — Keep everything on `pouncefirst.com`. License server API routes under `/api/license/*`. No subdomain split. Simpler for Stripe webhooks, SSL, and CORS. License server code deploys as a separate Vercel project but can be mounted as API routes later.
6. ✅ **Logo/branding** — Reuse existing Pounce brand specs from the admin app. Create a reusable SVG logo component. Designer refines later.

### Pounce Brand Specs (from admin app)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-pounce-orange` | `#F5A623` | Primary brand color |
| `--color-pounce-orange-dark` | `#E09620` | Hover/active state |
| `--color-pounce-orange-light` | `#FDB913` | Accent/highlight |
| `--color-charcoal` | `#1E1E1E` | Primary text |
| `--color-charcoal-light` | `#2D2D2D` | Secondary text |
| `--color-charcoal-muted` | `#666666` | Muted text |
| `--color-cream` | `#FAF7F2` | Page background |
| `--color-cream-dark` | `#F0EDE8` | Card background |
| `--font-heading` | `Space Grotesk` | Headings, logo |
| `--font-body` | `Inter` | Body text |

### Logo SVG

Reusable `<PounceLogo>` component — stylized "P" in `pounce-orange` with wordmark "ounce" in `charcoal`. Both icon-only and icon+wordmark variants. Pip creates as SVG, drops in `src/components/PounceLogo.astro`.

---

## What This Unlocks

- **Real product presence** — People can learn about, try, and buy Pounce
- **Dogfooding proof** — Support and contact pages run ON Pounce. If it doesn't work for us, it doesn't ship.
- **Revenue path** — Stripe → license key → self-hosted install. The full loop.
- **Customer self-service** — Docs, support form, billing portal. Less manual work for you.