# Pounce Infrastructure — Scaling & Operations Brief

**Date:** 2026-04-27  
**Author:** Patch  
**Status:** Reference doc — decisions are Ty's call  

---

## Current Architecture

```
pouncefirst.com (Vercel)
├── Pounce app (Astro + Hono API)
│   ├── Public pages (marketing, docs, blog, signup)
│   ├── Admin dashboard (forms, leads, conversations, settings)
│   ├── API routes (auth, forms, leads, stripe, webhooks)
│   └── Neon PostgreSQL (neondb)
│
└── License server (separate Vercel project, same team)
    ├── License API (activate, verify, deactivate, admin)
    └── Neon PostgreSQL (separate DB or project)

Third-party services:
├── Stripe (payments)
├── Resend (email)
├── Gmail/Outlook OAuth (inbox integration)
└── Cal.com/Calendly (booking webhooks)
```

**Server:** Single VPS, 2 cores, 4GB RAM, ~48GB disk, Ubuntu  
**Other services on this server:** Kern (NBA), Hank (MLB/P.A.), Lemon Squeeze, MLB stats, etc.

---

## Scaling Thresholds

### When things break without intervention

| Users | What Happens | Threshold | Fix |
|-------|-------------|-----------|-----|
| 1-100 | Nothing — everything fits in current resources | — | Ship and learn |
| 100-500 | Neon connection limits under load spikes | 100 concurrent connections (free tier) | Upgrade Neon plan or add PgBouncer |
| 500-1,000 | Vercel function duration limits on slow AI responses | 10s (free), 60s (Pro) | Stream AI responses, increase Vercel plan |
| 1,000-5,000 | Rate limiting becomes necessary on public endpoints | None today | Add Redis-backed rate limiting |
| 5,000-10,000 | Resend email volume limits | 100 emails/day (free), 3,000/mo ($20 plan) | Upgrade Resend, add email queue |
| 10,000+ | License verification volume might matter | ~40K requests/day | Consider Cloudflare Workers split for edge latency |
| 50,000+ | Single Neon instance can't handle the traffic | Connection saturation | Read replicas, connection pooling, sharding |

### The "10,000 Customer" Milestone

At 10,000 paying customers:
- **License checks:** ~40K/day (4 checks per instance per day). Trivial for Vercel.
- **Database:** Neon handles it fine with connection pooling.
- **Email:** Resend Pro ($20/mo) covers 3,000 emails. Need custom domain + higher volume plan.
- **Stripe:** No issues — Stripe scales infinitely.
- **Vercel:** Need Pro plan ($20/mo) for higher function duration limits and no bandwidth caps.

**Bottom line:** You can get to 10,000 customers on the current architecture. The bottlenecks are Neon connections and Resend volume, not Vercel vs Cloudflare.

---

## Infrastructure Concerns by Category

### 1. Database (Neon PostgreSQL)

**Current state:** One Neon project, one database (`neondb`), free tier.

**Risks:**
- **Connection limits:** Neon free tier allows ~100 concurrent connections. Each Vercel serverless function opens a connection. Under load, this fills up fast.
- **Cold starts:** Neon suspends inactive databases after 5 minutes (free tier). First request after suspension is slow (~500ms).
- **Data isolation:** License server data in the same database as Pounce app data = one compromise exposes everything.

**Mitigations:**
- **Short term (now):** Use Neon's built-in connection pooling (`?sslmode=require` connection string with pooler). Free tier supports it.
- **Medium term (500+ users):** Separate the license server into its own Neon database or project. One DB compromise doesn't expose everything.
- **Long term (5,000+ users):** Upgrade Neon to Pro ($19/mo). Higher connection limits, no cold starts, branch protection.

**Recommendation:** Set up the license server with its own Neon project now. It's free, takes 5 minutes, and isolates license data from day one.

### 2. Deployment Platform (Vercel)

**Current state:** Two Vercel projects under `hamburgers1s-projects` — `fabermade` and `pouncefirst.com`.

**Risks:**
- **Function duration:** Hobby tier = 10s timeout. If AI response generation takes longer (multiple LLM calls), the function times out.
- **Cold starts:** Serverless functions have ~200ms cold start. Acceptable for API routes, noticeable if overused.
- **Bandwidth:** Hobby tier = 100GB/mo. A marketing site with docs won't hit this, but lots of form submissions could.
- **Concurrent builds:** Only 1 concurrent build on Hobby. If Pip and Bolt both push at the same time, one queues.

**Mitigations:**
- **Short term (now):** Hobby tier is fine. Ship on it.
- **Medium term (100+ users):** Upgrade to Vercel Pro ($20/mo). 60s function duration, 1TB bandwidth, concurrent builds.
- **License server:** Separate Vercel project (`pounce-license`) under same team. Independent deployments.

**Recommendation:** Stay on Hobby until you have paying customers. Upgrade to Pro when the first Stripe payment clears.

### 3. Email (Resend)

**Current state:** Resend free tier (100 emails/day, 3,000/mo). Domain `fabermade.net` verified.

**Risks:**
- **Volume limits:** Free tier = 3,000 emails/month. At 500 leads per free-tier customer, 6 customers sending 2 emails per lead (notification + AI reply) = 6,000 emails/month. Over the limit.
- **Deliverability:** New domains have no sender reputation. Emails may land in spam.
- **Rate limits:** 10 emails/second on paid plans. Batch sends may need queuing.

**Mitigations:**
- **Short term (now):** Free tier is fine for testing and early customers.
- **Medium term (100+ users):** Upgrade to Resend Pro ($20/mo, 50K emails, custom domain, better deliverability).
- **Long term:** Set up DKIM, SPF, DMARC for `pouncefirst.com` domain. Monitor deliverability scores.
- **Alternative:** If email volume becomes a problem, consider Postmark or Mailgun as fallbacks.

**Recommendation:** Verify `pouncefirst.com` domain in Resend now (DNS records). Upgrade to Pro when you have 50+ active customers.

### 4. Security

**Current state:** Basic auth (HMAC-SHA256 session cookies). Admin API key for license server. No WAF, no DDoS protection.

**Risks:**
- **Public form endpoints:** `/api/f/{slug}` accepts unauthenticated submissions. Spam bots will find them.
- **License key brute-forcing:** `PC-XXXX-XXXX-XXXX` has ~1.3 trillion combinations. Rate limiting makes brute-force impractical, but not impossible.
- **Stripe webhook spoofing:** Without proper signature verification, someone could send fake payment confirmations.
- **XSS in form submissions:** User-submitted data (lead names, messages) must be sanitized before display.

**Mitigations (already in place or planned):**
- ✅ Honeypot field on public forms (`pounce_hp` field)
- ✅ Rate limiting on license server endpoints
- ✅ Stripe webhook signature verification
- ✅ Sanitization of user input (Bolt's XSS fix in Phase 3-5)
- ❌ **Missing:** Rate limiting on Pounce app's `/api/f/{slug}` — needs Redis or Vercel KV
- ❌ **Missing:** Rate limiting on `/api/auth/signup` — prevent mass account creation
- ❌ **Missing:** CSRF protection on admin endpoints — session cookies + same-site isn't enough

**Recommendation:** Add rate limiting on signup and form submission endpoints before launch. Vercel KV ($0.50/GB/mo) is cheaper than Redis for this use case.

### 5. Monitoring & Observability

**Current state:** None. No error tracking, no uptime monitoring, no logging beyond Vercel's built-in.

**Risks:**
- **Silent failures:** License server returns 500, no one knows.
- **Stripe webhook failures:** Payment succeeds but license key isn't generated. Customer paid but can't use the product.
- **AI response failures:** LLM returns gibberish or times out. Lead gets no response.

**Mitigations:**
- **Short term (now):** Vercel logs + my heartbeat monitoring (every 60 min). Not great, but something.
- **Medium term (launch):** Add Sentry for error tracking ($26/mo for team plan). Catches 500s, unhandled promises, etc.
- **Medium term (launch):** Set up uptime monitoring on key endpoints (UptimeRobot free tier = 50 monitors).
- **Long term:** Alert on Stripe webhook failures specifically. These are revenue-impacting.

**Recommendation:** Before accepting real payments, add Sentry. Silent Stripe webhook failures = lost revenue.

### 6. Backup & Recovery

**Current state:** Neon has automatic backups (point-in-time recovery on paid plans, daily on free). No manual backup strategy.

**Risks:**
- **Accidental deletion:** Someone drops the wrong table. Neon PITR can recover, but only on paid plans.
- **License key loss:** If the licenses table gets corrupted, customers lose access. Keys can be regenerated, but it's painful.
- **Neon free tier:** Free tier has limited PITR (hours, not days). Paid has 7 days.

**Mitigations:**
- **Short term (now):** Neon free tier backups are sufficient for testing.
- **Medium term (launch):** Upgrade Neon to Pro ($19/mo) for 7-day PITR and branch protection.
- **Alternative:** Daily `pg_dump` to S3 ($0.023/GB/mo). Cheap insurance.

**Recommendation:** Before accepting payments, upgrade Neon to Pro or set up automated `pg_dump` to S3.

### 7. DNS & SSL

**Current state:** `pouncefirst.com` on Vercel with Let's Encrypt. `license.pouncefirst.com` needs setup.

**Risks:**
- **SSL certificate renewal:** Vercel handles this automatically. No risk.
- **DNS propagation:** New subdomains take minutes to hours to propagate.
- **Domain hijacking:** DNS provider account compromise.

**Mitigations:**
- Enable 2FA on DNS provider account (Cloudflare, Namecheap, etc.)
- Set up DNSSEC if supported
- Use CNAME records for subdomains pointing to Vercel (not A records)

**Recommendation:** Ty handles DNS. Patch will configure the `license.pouncefirst.com` subdomain in Vercel when the license server is ready to deploy.

### 8. Cost Projection

| Service | Free Tier | Paid Tier | When to Upgrade |
|---------|-----------|----------|------------------|
| Vercel | Hobby (free) | Pro ($20/mo) | First paying customer |
| Neon | Free (0.5GB) | Pro ($19/mo) | 500+ users or before accepting payments |
| Resend | Free (3K emails) | Pro ($20/mo, 50K emails) | 50+ active customers |
| Stripe | Free (pay per transaction) | 2.9% + $0.30/transaction | Always |
| Sentry | Free (5K errors) | Team ($26/mo) | Before accepting payments |
| Vercel KV | Free (256MB) | Pro ($0.50/GB/mo) | When adding rate limiting |
| S3 backups | — | ~$0.50/mo | Before accepting payments |

**Monthly cost at launch (0-100 customers):** ~$0 (free tiers)  
**Monthly cost at 100-500 customers:** ~$60 (Vercel Pro + Neon Pro + Resend Pro)  
**Monthly cost at 1,000+ customers:** ~$100-150 (add Sentry, higher Resend volume)  

---

## What to Build vs What to Buy

| Concern | Build | Buy/Use Service | Why |
|---------|-------|-----------------|-----|
| Rate limiting | ❌ | Vercel KV + custom middleware | Don't build a rate limiter from scratch |
| Error tracking | ❌ | Sentry | Industry standard, $26/mo |
| Email delivery | ❌ | Resend | Already using it |
| Payments | ❌ | Stripe | Already using it |
| Database | ❌ | Neon | Already using it, serverless PostgreSQL |
| License validation | ✅ | — | Core business logic, must own |
| AI response pipeline | ✅ | — | Core business logic, must own |
| Uptime monitoring | ❌ | UptimeRobot (free) | 50 monitors free |
| Backups | ❌ | Neon PITR + pg_dump to S3 | Combination of built-in + cheap |

---

## Pre-Launch Checklist

Before accepting real payments, these must be done:

- [ ] Neon upgraded to Pro (7-day PITR) or daily `pg_dump` to S3 configured
- [ ] Vercel upgraded to Pro (60s function timeout, needed for AI responses)
- [ ] Resend domain verified for `pouncefirst.com` (DKIM, SPF, DMARC)
- [ ] Rate limiting on `/api/auth/signup` and `/api/f/{slug}`
- [ ] Sentry error tracking installed and configured
- [ ] Stripe webhook signature verification tested
- [ ] License server deployed to Vercel with `ADMIN_API_KEY` set
- [ ] `pouncefirst.com` and `license.pouncefirst.com` DNS configured
- [ ] Uptime monitoring on key endpoints (`/`, `/admin/login`, `/api/f/{slug}`, `/license/verify`)
- [ ] Incident response runbook (what to do when things break)

---

## Decision Record

| Decision | Choice | Rationale | Date |
|----------|--------|-----------|------|
| License server platform | Vercel (not Cloudflare Workers) | Same platform, simpler ops, one bill, equally secure | 2026-04-27 |
| License server database | Separate Neon project | Data isolation from day one | 2026-04-27 |
| Neon upgrade timing | Before accepting payments | PITR and connection limits | 2026-04-27 |
| Vercel upgrade timing | After first paying customer | Pro plan needed for 60s timeout | 2026-04-27 |
| Error tracking | Sentry | Industry standard, easy setup | 2026-04-27 |
| Rate limiting | Vercel KV | Cheaper than Redis, integrated | 2026-04-27 |

---

*Patch keeps this doc updated as infrastructure decisions change. Ty approves all upgrades and spending.*