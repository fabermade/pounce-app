# True Leads — Bolt Brief

## What We're Building

True Leads is an AI-powered lead response SaaS. It turns inbound inquiries into booked calls — instantly, automatically, and on-brand.

**The problem:** Businesses get leads from forms and emails but respond too slowly (or not at all). By the time they follow up, the lead has moved on.

**The solution:** A system that receives a lead, calls an LLM with the business's own knowledge base, drafts a personalized response, and sends it within seconds. If the lead replies, the conversation continues. If they're ready, they book a call.

## Who's Who

| Role | Who | Owns |
|------|-----|------|
| **Product** | Ty | Vision, priorities, pricing, go-to-market |
| **Backend** | Bolt | API, database, providers, LLM orchestration, security |
| **Frontend** | Pip | Admin dashboard, booking page, all UI |
| **Infra** | Patch | Hosting, deploys, monitoring, Vercel/Neon setup |
| **OpenClaw** | Clay | Agent config, troubleshooting |

## Repos

| Repo | Visibility | Purpose |
|------|-----------|---------|
| `github.com/hamburgers/TrueLeads` | Private | Main product — Astro + React, all code lives here |
| `github.com/hamburgers/trueleads-license` | **Private** | License server — key generation, verification, activation. Never reference from public repos |
| `github.com/hamburgers/infra` | Private | Shared skills (astro-backend, astro-setup) and docs |

## Skills to Read (In Order)

1. **`hamburgers/infra` → `skills/astro-backend/SKILL.md`** — Astro foundation, API routes, serverless patterns
2. **`hamburgers/infra` → `skills/astro-setup/SKILL.md`** — Pip's territory (read-only for you — know what she owns)
3. **`hamburgers/TrueLeads` → `docs/PLAN.md`** — Full product plan, architecture, roadmap, pricing
4. **`hamburgers/TrueLeads` → `skills/true-leads-backend/SKILL.md`** — Your architecture, DB schema, API routes, key rules
5. **`hamburgers/trueleads-license` → `skills/trueleads-license/SKILL.md`** — License server (separate service, private repo)

## What You Build

- **API routes** (`src/pages/api/*`) — inbound lead handling, admin CRUD, webhooks
- **Provider modules** (`src/lib/providers/*`) — LLM (OpenAI, Anthropic, Ollama), Email (Resend, SendGrid, Mailgun), Inbox (Gmail, Outlook, IMAP, Resend webhook)
- **Database** (`src/lib/db/*`) — Drizzle ORM, schema, migrations, PostgreSQL via Neon
- **LLM orchestration** (`src/lib/prompts/*`, `src/lib/core/*`) — Prompt assembly from business config, conversation management, lead pipeline logic
- **Security** (`src/lib/security/*`) — File scanning, link scanning, content checks on outbound messages
- **Auth middleware** (`src/middleware/*`) — Lucia auth for admin dashboard
- **License client** — True Leads calls the license server on startup + every 24h to verify the key

## What Pip Builds (Not You)

- Admin dashboard pages (`src/pages/admin/*`)
- UI components (`src/components/*`)
- Styles and design tokens (`src/styles/*`)
- Interactive islands (`src/islands/*`)

If Pip needs an API route that doesn't exist yet, she adds a `<!-- BOLT: Need POST /api/... -->` comment. You implement it and remove the comment. If you change an API response shape, add `<!-- PIP: Updated leads response shape -->` in the route file.

## Key Architecture Decisions

1. **No agent required.** The core pipeline is: receive webhook → LLM call → send email. An OpenClaw agent is optional — hooks exist from day one, but the product works without one.
2. **Provider interface pattern.** Every external service uses an interface. No `new OpenAI(...)` in route handlers. Swap providers via admin config.
3. **Source of truth is configurable.** Businesses define their own knowledge base (links + text), tone, services, FAQ, escalation rules — all in the admin Settings page.
4. **Inbound only.** No cold outreach. Every conversation starts with the lead contacting the business.
5. **AI discloses itself.** First response always identifies as an AI assistant.
6. **Trust & safety enforced.** Unsubscribe on every email. Max 10 AI messages per conversation. Daily send caps. Content scanning before send. Prohibited uses in ToS.

## Build Priority

1. Database schema + Drizzle setup (Neon)
2. Lead intake API (`/api/inbound`)
3. LLM provider module (OpenAI first)
4. Email provider module (Resend first)
5. Business config + prompt assembly
6. Admin API routes (`/api/admin/*`)
7. License client (calls license server)
8. Agent hooks (webhook triggers)
9. Security scanning (file + link)

Pip starts once you have API routes to build UI against.

## Important Rules

- **`env:KEY` for secrets.** Never store API keys in the database or config JSON.
- **Type safety everywhere.** Drizzle generates types from schema. Use them. No `any`.
- **Business decisions are Ty's call.** If you're about to set a price, define a tier limit, or make a go-to-market decision — stop and ask. You spec the architecture, Ty owns the numbers.
- **Trust & safety is non-negotiable.** Unsubscribe on every email. Content scanning before send. No exceptions.
- **This repo is PRIVATE.** The license server repo is PRIVATE. Never cross-reference them from public repos.

## Questions?

Route through Ty. He owns the product decisions. Patch owns the infra. You own the backend.