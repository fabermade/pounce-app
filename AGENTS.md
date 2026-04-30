# AGENTS.md — Pounce App

This file is read by every agent (Bolt, Pip, Codex, Claude Code) at the start of each session. Follow it.

## Sites & Domains

These are four distinct things. Do not mix them.

| Site | Domain | Purpose |
|------|--------|---------|
| **Faber Made** | fabermade.net | Agency site. Contact forms embed Pounce forms from `app.pouncefirst.com`. Leads go into Pounce, AI responds. This is what a customer site looks like. |
| **Pounce App** | app.pouncefirst.com | The running product. Admin panel, lead pipeline, AI responses, settings. fabermade.net's forms POST here. Not the marketing site — this is the app. |
| **Pounce Marketing** | www.pouncefirst.com | Where new customers learn about Pounce, sign up, and get a license key. Has a contact form running through Pounce so prospects can test the product. The form is the demo. |
| **License Server** | (internal) | Validates license keys for customer Pounce installations. Controls access and manages users. |

**Key relationships:**
- fabermade.net → embeds forms from → app.pouncefirst.com
- www.pouncefirst.com → embeds forms from → app.pouncefirst.com (demo)
- Future customer site → embeds forms from → their own Pounce instance → validates license via → license server

**Rules:**
- No hardcoded `pouncefirst.com` URLs in app code — use `APP_URL` env var
- fabermade.net is not admin. app.pouncefirst.com is not marketing. www.pouncefirst.com is not the product.
- The AI in the Pounce installation responds to leads. That's the product. No routing leads to humans instead of AI.
- Embed forms are served from the Pounce instance, rendered on the customer's site, submitted back to the Pounce instance.

## This Repo

**TrueLeads** = Pounce App (`app.pouncefirst.com`)

The full SaaS application: admin dashboard, API routes, lead pipeline, form builder, AI response engine, booking integrations.

### Team

| Role | Who | Owns |
|------|-----|------|
| Product | Ty | Decisions, priorities, business logic |
| Backend | Bolt | API routes, pipeline, integrations, DB schema |
| Frontend | Pip | UI components, pages, Astro templates |
| Infra | Patch | Deploys, monitoring, server health |

**Stay in your lane.** If you're Bolt, don't redesign Pip's components. If you're Pip, don't rewrite Bolt's API endpoints. Flag cross-domain issues to Ty.

### Astro Patterns

- `<script is:inline>` — required for any script that needs server-side data or must remain in-place. Without it, Astro bundles, scopes, or strips the script.
- `set:html` — required for injecting JSON into `<script type="application/json">` tags. Without it, Astro HTML-escapes the content.
- `is:global` on `<style>` — required when styles must apply to third-party embedded content (Cal.com, etc.). Without it, Astro scopes CSS and breaks embeds.
- Empty arrays in forms — use `__empty_array__` sentinel hidden inputs so `FormData` sends empty arrays correctly.

### Business Logic

- **AI responds to leads.** The response pipeline (`runResponsePipeline`) is called on every form submission and inbound email. That's core product. Don't bypass it.
- **Lead flow:** form submission → validate → create/find lead → create conversation → run AI pipeline → send response email.
- **Escalation** means flagging for human review. It does NOT mean routing the reply to a human instead of AI.