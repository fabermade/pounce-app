# Pounce

AI-powered lead response SaaS — turns inbound inquiries into booked calls, instantly.

**Public name:** Pounce  
**Domain:** pouncefirst.com  
**Tagline:** "Your leads deserve a response in seconds, not days."

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in keys
cp .env.example .env

# 3. Push database schema to Neon
npm run db:push

# 4. Start dev server
npm run dev

# 5. Test inbound endpoint
curl -X POST http://localhost:4321/api/inbound \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","message":"Hello, I need help!"}'
```

## Architecture

```
Lead → POST /api/inbound → Normalize → LLM Prompt → Email Response
                                                        ↕
                                              Admin Dashboard
                                              (leads, config, analytics)
```

### Provider Pattern

Every external service uses a provider interface. Swap via admin config, no code changes.

- **LLM:** OpenAI (default), Anthropic, Ollama
- **Email:** Resend (default), SendGrid, Mailgun
- **Inbox:** Resend webhook (default), Gmail, Outlook, IMAP

### Lead Pipeline

```
new → contacted → customer_waiting → scheduled → closed_won/closed_lost
                                              ↘ escalated
                                              ↘ opted_out
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Astro (SSG + API routes) |
| Language | TypeScript (strict) |
| Database | PostgreSQL (Neon) |
| ORM | Drizzle |
| Email | Resend (modular) |
| LLM | OpenAI (modular) |
| Auth | Session-based (custom) |

## Project Structure

```
src/
├── pages/api/          # API routes (Bolt's territory)
├── lib/
│   ├── db/             # Drizzle schema, client, types
│   ├── providers/      # LLM, Email, Inbox provider modules
│   ├── prompts/        # System prompt builder
│   ├── core/           # Pipeline, conversation, lead parser
│   └── security/       # Scanning, rate limiting
├── middleware/          # Auth middleware
└── components/         # Pip's territory (do not touch)
```

## Development

```bash
npm run dev           # Start dev server
npm run db:push       # Push schema changes to Neon
npm run db:studio     # Open Drizzle Studio (DB browser)
npm run test          # Run tests
npm run test:watch    # Run tests in watch mode
```

## Team

| Role | Who |
|------|-----|
| Product | Ty |
| Backend | Bolt |
| Frontend | Pip |
| Infra | Patch |
| OpenClaw | Clay |