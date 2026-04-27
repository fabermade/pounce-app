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
pouncefirst.com/docs/...      → Documentation (setup, deploy, API)
pouncefirst.com/support       → Support (Pounce-powered: form → lead → AI reply)
pouncefirst.com/contact       → Contact (Pounce-powered: form → lead → AI reply)
pouncefirst.com/blog/...      → Blog posts (optional, Phase 2)
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
| Starter | 1 site | $10/mo | $100/yr |
| Pro | 5 sites | $40/mo | $175/yr |
| Enterprise | Unlimited | Custom | Custom |

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
| A7. Mobile responsive pass | 0.5 | A2-A6 |

### Phase B — Bolt (Stripe + Purchase Pipeline) — ~8h

| Task | Hours | Depends On |
|------|-------|------------|
| B1. Stripe products/prices setup | 0.5 | Ty creates Stripe account |
| B2. `/api/stripe/checkout` route | 1.5 | B1 |
| B3. `/api/stripe/webhook` handler | 2 | B1 |
| B4. License key generation on payment | 1 | B3 |
| B5. Confirmation email via Resend | 1 | B4 |
| B6. `/api/stripe/portal` (manage billing) | 1 | B1 |
| B7. Post-checkout success page | 1 | B2 |
| B8. Doc content (API, inbox, booking, license) | 1 | — |

### Phase C — Patch (Infra) — ~2h

| Task | Hours | Depends On |
|------|-------|------------|
| C1. Stripe env vars in Vercel | 0.5 | B1 |
| C2. Stripe webhook endpoint config | 0.5 | B3 |
| C3. Self-hosting + troubleshooting docs | 1 | A4 |
| C4. Deploy + verify all public pages 200 | 0.5 | A+B |

### Total: ~22h (Pip 12h, Bolt 8h, Patch 2h)

---

## Open Decisions (Ty's Call)

1. **Stripe account** — Do you have one or need to create it?
2. **Enterprise pricing** — "Contact us" link to `/contact`, or specific dollar amount?
3. **Free trial?** — 14-day free trial before charging, or pay from day 1?
4. **Blog** — Include now or defer?
5. **Domain split** — Keep everything on `pouncefirst.com` or split `license.pouncefirst.com` for the license server API?
6. **Logo/branding** — Do you have Pounce logo/colors, or does Pip design from scratch?

---

## What This Unlocks

- **Real product presence** — People can learn about, try, and buy Pounce
- **Dogfooding proof** — Support and contact pages run ON Pounce. If it doesn't work for us, it doesn't ship.
- **Revenue path** — Stripe → license key → self-hosted install. The full loop.
- **Customer self-service** — Docs, support form, billing portal. Less manual work for you.