# Patch Brief — Infrastructure + Documentation

**Date:** 2026-04-27  
**Agent:** Patch  
**Estimate:** ~3h  

---

## Overview

Pip builds the UI, Bolt builds the backend, I handle infrastructure and write two doc pages. This is the smallest brief but it's critical — wrong env vars or webhook config means Stripe payments fail silently.

---

## Tasks

### Task C1: Stripe Environment Variables (~0.5h)

When Ty provides Stripe API keys, add to Vercel production environment:

```bash
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_PUBLIC_KEY production  
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add STRIPE_STARTER_MONTHLY_PRICE_ID production
vercel env add STRIPE_STARTER_ANNUAL_PRICE_ID production
vercel env add STRIPE_PRO_MONTHLY_PRICE_ID production
vercel env add STRIPE_PRO_ANNUAL_PRICE_ID production
```

Also store in `memory/secrets.env` (chmod 600) for backup.

**Dependencies:** Ty creates Stripe products and provides price IDs.

### Task C2: Stripe Webhook Endpoint (~0.5h)

1. In Stripe dashboard, create webhook endpoint:
   - URL: `https://pouncefirst.com/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy signing secret → `STRIPE_WEBHOOK_SECRET`

2. Verify webhook works: `curl -X POST https://pouncefirst.com/api/stripe/webhook -H "Content-Type: application/json" -d '{"type":"test"}'` → should return 400 (signature verification fails, not 500)

**Dependencies:** Bolt's webhook endpoint deployed.

### Task C3: Documentation Content (~1.5h)

Write content for two doc pages. Pip builds the layout, I write the words.

#### `/docs/self-hosting`

Production deployment guide:
- System requirements (Node 20, PostgreSQL 14+, 2GB RAM minimum)
- Install steps: clone repo, `npm install`, configure `.env`, `npm run build`, `npm start`
- Systemd service file template
- Nginx reverse proxy config (HTTPS with Let's Encrypt)
- SSL setup with Certbot
- Environment variables reference (all required and optional)
- Database setup (Neon or local PostgreSQL)
- First-run setup wizard walkthrough
- Backup strategy (PostgreSQL dumps, env file, license key)
- Updating Pounce (git pull, npm install, npm run build, systemctl restart)

#### `/docs/troubleshooting`

Common issues and fixes:
- "License key invalid" — check key format, re-copy from email
- "AI not responding to leads" — check free tier limit, check Resend API key
- "Forms not submitting" — check form slug, check site is active
- "Email not sending" — check Resend API key, check domain DNS
- "Port already in use" — find and kill the process
- "Database connection refused" — check DATABASE_URL, check PostgreSQL is running
- "SSL certificate errors" — check Certbot renewal, check nginx config

### Task C4: Deploy + Verify (~0.5h)

After Pip and Bolt merge their branches:

1. Pull latest main
2. Local build check: `npm run build` → 0 errors
3. Push to main → Vercel auto-deploys
4. Verify all public pages return 200:
   - `/`, `/pricing`, `/signup`, `/support`, `/contact`, `/docs`, `/blog`
5. Verify admin pages still work:
   - `/admin/login`, `/admin/settings`, `/admin/forms`, `/admin/leads`
6. Verify API endpoints:
   - `POST /api/auth/signup` returns expected structure
   - `POST /api/stripe/checkout` returns redirect URL
7. Set GitHub commit status to success

---

## Timeline

| # | Task | Hours | When |
|---|------|-------|------|
| C3 | Write doc content | 1.5 | Can start now (no dependencies) |
| C1 | Stripe env vars | 0.5 | After Ty provides keys |
| C2 | Stripe webhook config | 0.5 | After Bolt's webhook endpoint is deployed |
| C4 | Deploy + verify | 0.5 | After Pip + Bolt merge to main |

**Total: ~3h**

I'll write the self-hosting and troubleshooting docs first since they have no dependencies. Can deliver them as markdown files in the repo for Pip to wire into her doc layout.