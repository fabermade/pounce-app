# Pip Brief — Public Site UI

**Date:** 2026-04-27  
**Agent:** Pip  
**Repo:** `hamburgers/TrueLeads`  
**Branch:** `pip/public-site`  
**Estimate:** ~14h  

---

## Overview

You're building the public face of Pounce. Right now `pouncefirst.com` redirects straight to `/admin` — there's no product page, no pricing, no docs, no way to learn about or try Pounce. You're fixing that.

The site has 7 public pages + a reusable logo component + a usage bar for the admin dashboard.

---

## Brand Specs

Use these exact values. They're already in `src/styles/global.css` and `AdminPage.astro`.

| Token | Value | Usage |
|-------|-------|-------|
| `--color-pounce-orange` | `#F5A623` | Primary brand, CTAs, links |
| `--color-pounce-orange-dark` | `#E09620` | Hover/active states |
| `--color-pounce-orange-light` | `#FDB913` | Highlights, badges |
| `--color-charcoal` | `#1E1E1E` | Primary text |
| `--color-charcoal-light` | `#2D2D2D` | Secondary text |
| `--color-charcoal-muted` | `#666666` | Muted text |
| `--color-cream` | `#FAF7F2` | Page background |
| `--color-cream-dark` | `#F0EDE8` | Card backgrounds |
| `--font-heading` | `Space Grotesk` | Headings, logo |
| `--font-body` | `Inter` | Body text |

Fonts are already loaded via `AdminPage.astro` — copy the Google Fonts link to `PublicLayout.astro`.

---

## Components to Build

### 1. `PounceLogo.astro`

Reusable SVG logo component. Two variants:
- **Icon + wordmark:** Stylized orange "P" + "ounce" in charcoal (matches admin login page pattern: `<span class="text-pounce-orange">P</span><span class="text-charcoal">ounce</span>`)
- **Icon only:** Just the "P" mark

Props: `variant: "full" | "icon"`, `size: "sm" | "md" | "lg"`

Place in `src/components/PounceLogo.astro`.

### 2. `PublicLayout.astro`

Wrapper for all public pages. Includes:
- `<PublicHeader>` with logo, nav links (Features, Pricing, Docs, Support), "Get Started Free" CTA button
- `<slot />` for page content
- `<PublicFooter>` with links, copyright, social placeholders
- Mobile hamburger menu
- Smooth scroll for anchor links

Auth: **No auth required.** Public pages are fully accessible.

### 3. `PricingCard.astro`

Tier card for `/pricing`. Props:
- `tier: "free" | "starter" | "pro" | "enterprise"`
- `price: string`, `annualPrice: string`
- `features: string[]`
- `ctaText: string`, `ctaHref: string`
- `highlighted?: boolean` (for the recommended tier)

### 4. `UsageBar.astro`

For admin dashboard. Shows monthly lead usage with upgrade CTA when over 80%.

Props: `used: number`, `limit: number`, `tier: string`

Shows: "347/500 leads this month" with progress bar. When `used >= limit * 0.8`, show orange warning + "Upgrade" link. When `used >= limit`, show red + "AI auto-reply paused" message.

### 5. `DocSidebar.astro` + `DocContent.astro`

Sidebar navigation + markdown content area for `/docs/*`.

### 6. `FAQAccordion.astro`

Expandable Q&A items for `/support`.

---

## Pages to Build

### Page 1: Homepage (`/`)

**Currently:** Redirects to `/admin`. **Change:** Full marketing homepage.

Sections:
1. **Hero** — Headline, subhead, CTA ("Get Started Free → /signup"). Placeholder screenshot slot (gray box labeled "Dashboard Screenshot")
2. **How It Works** — 3 steps with placeholder illustration slots:
   - Connect your inbox (Gmail/Outlook)
   - AI responds to every lead
   - You close more deals
3. **Features Grid** — 6 cards: AI lead response, inbox integration, form builder, booking webhooks, multi-user, self-hosted
4. **Pricing Preview** — 3 tier cards (Free, Starter, Pro) with "See all plans →" link to `/pricing`
5. **CTA** — "Get Pounce Free" → `/signup`

### Page 2: Pricing (`/pricing`)

4 tier cards in a row:

| | Free | Starter | Pro | Enterprise |
|---|------|---------|-----|------------|
| Sites | 1 | 1 | 5 | Unlimited |
| Leads | 500/mo | Unlimited | Unlimited | Unlimited |
| AI Reply | ✓ (up to 500) | ✓ | ✓ | ✓ |
| Price | $0 | $10/mo ($100/yr) | $40/mo ($175/yr) | Contact us |
| CTA | "Get Started Free" | "Start 7-Day Trial" | "Start 7-Day Trial" | "Contact Sales" |

Monthly/Annual toggle. Annual prices shown with discount badge.

### Page 3: Signup (`/signup`)

Self-signup for free tier. No credit card required.

Fields: Email, Business name, Password (for admin login)
Submit → Bolt's `/api/auth/signup` → auto-generate free license key → redirect to `/admin/setup?key=PC-XXXX-XXXX-XXXX`

Simple, clean, no friction. "Already have an account? Sign in → /admin/login"

### Page 4: Docs (`/docs/*`)

Pages:
- `/docs` — Index with cards linking to each section
- `/docs/getting-started` — Quick start (5 min)
- `/docs/installation` — System requirements, bare metal install
- `/docs/configuration` — Environment variables, settings
- `/docs/forms` — Form builder, embed options
- `/docs/inbox` — Gmail/Outlook setup
- `/docs/booking` — Cal.com/Calendly integration
- `/docs/api` — Admin API reference
- `/docs/license` — License activation, tier limits, renewal
- `/docs/self-hosting` — Production deploy, nginx, SSL, backups
- `/docs/troubleshooting` — Common issues

**Doc content:** Patch writes the self-hosting and troubleshooting pages. You build the layout and create placeholder content for the rest. Bolt fills in API reference content later.

### Page 5: Support (`/support`)

FAQ accordion (6-8 common questions) + Pounce form embed at the bottom.

**This page IS our dogfood.** The support form submits to our own Pounce instance. If this doesn't work, nothing ships.

### Page 6: Contact (`/contact`)

Sales/enterprise inquiries. Pounce form embed. Different form slug than support (sales tone config).

Fields: Name, Email, Company, Message, "What are you interested in?" dropdown (Self-hosted, Cloud, Enterprise, Partnership)

### Page 7: Blog (`/blog/*`)

Blog index + individual post pages. Start with 2-3 seed posts:
- "Introducing Pounce: AI-Powered Lead Response for Self-Hosters"
- "Why We're Building Pounce in the Open"
- "Self-Hosted vs SaaS: Why Control Matters"

You build the layout and index page. Ty/Patch write the content.

---

## File Structure

```
src/
├── components/
│   ├── PounceLogo.astro
│   ├── PricingCard.astro
│   ├── UsageBar.astro
│   ├── DocSidebar.astro
│   ├── DocContent.astro
│   ├── FAQAccordion.astro
│   ├── FeatureCard.astro
│   ├── StepCard.astro
│   └── admin/                    (existing, don't touch)
├── layouts/
│   ├── PublicLayout.astro         (NEW)
│   ├── PublicHeader.astro         (NEW)
│   ├── PublicFooter.astro         (NEW)
│   └── AdminPage.astro            (existing, don't touch)
├── pages/
│   ├── index.astro                (REPLACE redirect with homepage)
│   ├── pricing.astro              (NEW)
│   ├── signup.astro               (NEW)
│   ├── support.astro              (NEW)
│   ├── contact.astro              (NEW)
│   ├── blog/
│   │   ├── index.astro            (NEW)
│   │   └── [slug].astro           (NEW)
│   ├── docs/
│   │   ├── index.astro            (NEW)
│   │   ├── getting-started.astro  (NEW)
│   │   ├── installation.astro    (NEW)
│   │   ├── configuration.astro   (NEW)
│   │   ├── forms.astro            (NEW)
│   │   ├── inbox.astro            (NEW)
│   │   ├── booking.astro          (NEW)
│   │   ├── api.astro              (NEW)
│   │   ├── license.astro          (NEW)
│   │   ├── self-hosting.astro    (NEW)
│   │   └── troubleshooting.astro  (NEW)
│   ├── admin/                     (existing, don't touch)
│   ├── api/                       (existing, don't touch)
│   ├── book.astro                 (existing, don't touch)
│   └── f/                         (existing, don't touch)
└── styles/
    └── global.css                 (existing, add public page styles)
```

---

## Build Order

| # | Task | Hours | Depends On |
|---|------|-------|------------|
| 1 | PounceLogo SVG component | 1 | — |
| 2 | PublicLayout + Header + Footer | 2 | 1 |
| 3 | Homepage (hero, how it works, features, CTA) | 3 | 2 |
| 4 | Pricing page (4 cards, toggle, responsive) | 2 | 2 |
| 5 | Signup page | 1.5 | 2 |
| 6 | Docs layout (sidebar, content, code blocks) | 2 | 2 |
| 7 | Support page (FAQ + form) | 1 | 2 |
| 8 | Contact page | 0.5 | 2 |
| 9 | Blog layout (index + post) | 1 | 2 |
| 10 | UsageBar component (admin) | 1 | — |
| 11 | Mobile responsive pass | 0.5 | 3-9 |
| 12 | Doc content: self-hosting + troubleshooting | — | 6 |

**Total: ~14h** (Task 12 content written by Patch, not your hours)

---

## Territory Boundaries

**You build:** All UI components, page layouts, CSS, responsive design, SVG logo, animations.

**Bolt builds:** `/api/auth/signup`, `/api/stripe/*`, lead rate limiting logic, Stripe Checkout integration, webhook handlers. Don't create API routes.

**Patch writes:** Self-hosting doc (`/docs/self-hosting`) and troubleshooting doc (`/docs/troubleshooting`). Don't write these yourself — you'll get infra details wrong.

**Don't touch:** `src/pages/admin/*`, `src/pages/api/*`, `src/middleware.ts`, `src/lib/*`. These are Bolt's territory.

---

## Key Rules

1. **No top-level `return` in `<script>` tags.** Astro processes them as ES modules. Use `if (x) { ... }` instead of `if (!x) return;`.
2. **No `define:vars` for complex objects.** Use `<script type="application/json">` for passing server data to client scripts. Pip's last `forms/[id].astro` had this bug — don't repeat it.
3. **No `{/* JSX comments */}` in standalone `.astro` files.** Babel can't handle them reliably.
4. **Wrap all admin pages in `<AdminPage>`.** But you're building public pages — use `<PublicLayout>` instead.
5. **Hidden input before checkbox:** `<input type="hidden" name="x" value="false"><input type="checkbox" name="x" value="true">`
6. **All images use placeholders** — gray boxes with labels. Ty will replace with real screenshots.

---

## Reference Files

- Brand colors + fonts: `src/styles/global.css`
- Existing admin layout: `src/layouts/AdminPage.astro`
- Existing login page (logo pattern): `src/pages/admin/login.astro`
- Full build plan: `docs/PUBLIC-SITE-PLAN.md`