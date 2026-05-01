# Pounce

Self-hosted AI lead responses. Your data, your rules.

Pounce connects to your website's contact forms and inbox, responds to leads with AI, and keeps your pipeline moving — even when you're asleep.

## Features

- **AI-powered lead responses** — inbound form submissions and emails get instant, contextual replies
- **Form embeds** — drop a snippet on any site, submissions flow into your Pounce dashboard
- **Conversation threading** — every lead gets a full conversation history
- **Lead pipeline** — track leads from new → contacted → booked → closed
- **Booking integrations** — connect Cal.com or custom booking flows
- **License-gated** — activate your instance with a license key from [pouncefirst.com](https://pouncefirst.com)

## Quick Start

```bash
# Install
curl -fsSL https://pouncefirst.com/install.sh | bash

# Or with npm
npm i -g @fabermade/pounce

# Or with Docker
docker run -it --rm -p 3000:3000 -v pounce-data:/data fabermade/pounce setup
```

Then activate your license:

```bash
pounce license activate YOUR_KEY
```

Get a key at [pouncefirst.com/account](https://www.pouncefirst.com/account).

## Tech Stack

- **Astro** with React islands
- **Node.js** adapter (standalone server mode)
- **Neon PostgreSQL** (or any Postgres)
- **Resend** for email delivery
- **Anthropic Claude** for AI responses

## Configuration

Copy `.env.example` to `.env` and fill in:

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=...
LLM_API_KEY=...
EMAIL_API_KEY=...
LICENSE_KEY=...
```

## License

MIT