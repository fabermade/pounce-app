# Pounce Form Builder & Embed — Spec

## Overview

Customers create forms in the Pounce admin dashboard, customize fields and styling, then embed them on their site with a single script tag. No coding required from the customer.

## User Flow

1. Customer logs into Pounce admin
2. Goes to **Forms** section
3. Clicks **Create Form**
4. Configures: form name, fields, styling, success message
5. Clicks **Publish**
6. Gets a snippet: `<script src="https://pouncefirst.com/embed.js" data-form-id="f_abc123"></script>`
7. Pastes it into their site
8. Form renders, submissions flow into Pounce

## Form Builder UI

### Form Editor Page (`/admin/forms/[id]`)

**Left panel — Fields:**
- Drag-and-drop field list
- Field types: text, email, textarea, select, multi-select, radio, checkbox, date, phone, number, URL
- Each field: label, placeholder, required toggle, validation rules, width (half/full)
- Reorder by drag
- Add/remove fields
- Pre-built templates: "Contact Us", "Book a Call", "Lead Capture", "Newsletter Signup"

**Right panel — Preview:**
- Live preview of the form as they build it
- Desktop/mobile toggle
- Theme selector (light, dark, branded)
- Shows the form exactly as it'll appear on their site

### Form Settings (per form):

| Setting | Options | Default |
|---------|---------|---------|
| Form name | Free text | "New Form" |
| Success message | Free text / rich | "Thanks! We'll be in touch soon." |
| Redirect URL | URL (optional) | None (show success message) |
| Submit button text | Free text | "Send Message" |
| Theme | light / dark / branded | light |
| Primary color | Hex picker | `#c49360` |
| Font | System / Inter / Space Grotesk | System |
| Max submissions | Number (0 = unlimited) | 0 |
| Rate limit | Per-IP submissions per hour | 5 |

### Form List Page (`/admin/forms`)

| Column | Description |
|--------|-------------|
| Name | Form name |
| Status | Published / Draft |
| Submissions | Total count |
| Conversion | Views → submissions % |
| Created | Date |
| Actions | Edit / Embed / Disable / Delete |

## Embed Options

After publishing, customer sees the **Embed** modal with 3 options:

### 1. Script Tag (Simplest — works everywhere)

```html
<div id="pounce-form-abc123"></div>
<script src="https://pouncefirst.com/embed.js" data-form-id="abc123" defer></script>
```

- Renders the form inside the div
- Auto-styles based on form settings
- Handles validation, submission, success message
- No framework dependency

### 2. React Component (for React/Next.js sites)

```jsx
import { PounceForm } from '@pouncefirst/react';

<PounceForm formId="abc123" />
```

- NPM package: `@pouncefirst/react`
- Server-side rendering friendly
- Theme prop overrides form settings

### 3. Iframe (for restrictive CMS platforms)

```html
<iframe
  src="https://pouncefirst.com/f/abc123"
  width="100%"
  height="600"
  frameborder="0"
  style="border: none;"
></iframe>
```

- Works in WordPress, Squarespace, Wix, etc.
- Responsive height auto-adjustment via postMessage
- Sandboxed for security

## Embed Script (`/public/embed.js`)

The embed script is the core of the form builder. It:

1. Finds the `data-form-id` element
2. Fetches form config from `GET /api/forms/abc123/config`
3. Renders the form with styling
4. Handles client-side validation
5. Submits to `POST /api/forms/abc123/submit`
6. Shows success message or error states
7. Tracks form views for analytics

**Size target:** < 15KB gzipped. No dependencies. Vanilla JS.

## API Routes

### Public (no auth required)

```
GET  /api/forms/:id/config     — Form config for embed rendering (fields, theme, validation)
POST /api/forms/:id/submit     — Form submission (leads into Pounce pipeline)
GET  /f/:id                     — Iframe standalone form page
```

### Admin (auth required)

```
GET    /api/admin/forms          — List all forms
POST   /api/admin/forms          — Create new form
GET    /api/admin/forms/:id      — Get form detail + submissions
PATCH  /api/admin/forms/:id      — Update form settings/fields
DELETE /api/admin/forms/:id      — Delete form
POST   /api/admin/forms/:id/publish — Publish form (generates embed code)
POST   /api/admin/forms/:id/disable — Disable form (stops accepting submissions)
GET    /api/admin/forms/:id/stats   — Form analytics (views, submissions, conversion)
```

## Database Schema

```sql
forms (
  id UUID PK DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,              -- URL-friendly identifier
  status TEXT DEFAULT 'draft',   -- 'draft' | 'published' | 'disabled'
  fields JSONB NOT NULL,         -- Array of field definitions
  settings JSONB NOT NULL,       -- Theme, colors, success message, etc.
  submit_button_text TEXT DEFAULT 'Send Message',
  success_message TEXT DEFAULT 'Thanks! We''ll be in touch soon.',
  redirect_url TEXT,             -- Optional redirect after submission
  max_submissions INT DEFAULT 0, -- 0 = unlimited
  rate_limit_per_ip INT DEFAULT 5,
  view_count INT DEFAULT 0,
  submission_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Field definition shape (stored in forms.fields):
-- {
--   id: "field_1",
--   type: "text" | "email" | "textarea" | "select" | "multi_select" |
--         "radio" | "checkbox" | "date" | "phone" | "number" | "url",
--   label: "Your Name",
--   placeholder: "John Smith",
--   required: true,
--   width: "full" | "half",
--   options: ["Option A", "Option B"],  -- for select/radio/checkbox
--   validation: { minLength: 2, maxLength: 100, pattern: "..." }
-- }

form_submissions (
  id UUID PK DEFAULT gen_random_uuid(),
  form_id UUID FK REFERENCES forms(id),
  lead_id UUID FK REFERENCES leads(id),  -- Links to Pounce lead
  data JSONB NOT NULL,                     -- Submitted field values
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

form_views (
  id UUID PK DEFAULT gen_random_uuid(),
  form_id UUID FK REFERENCES forms(id),
  source TEXT,                -- 'script' | 'react' | 'iframe'
  referer TEXT,               -- Page URL where form was embedded
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

## File Structure (New Files)

```
src/
├── pages/
│   ├── admin/
│   │   └── forms.astro           — Form list page
│   │   └── forms/
│   │       └── [id].astro        — Form editor page
│   ├── api/
│   │   ├── forms/
│   │   │   ├── [id]/
│   │   │   │   ├── config.ts      — GET form config for embed
│   │   │   │   └── submit.ts      — POST form submission
│   │   └── admin/
│   │       └── forms/
│   │           ├── index.ts        — GET list, POST create
│   │           └── [id]/
│   │               ├── index.ts    — GET detail, PATCH update, DELETE
│   │               ├── publish.ts  — POST publish
│   │               ├── disable.ts  — POST disable
│   │               └── stats.ts    — GET analytics
│   └── f/
│       └── [id].astro              — Standalone form page (for iframe)
├── lib/
│   ├── core/
│   │   └── forms.ts                — Form validation, field rendering logic
│   └── db/
│       └── schema.ts               — Add forms, form_submissions, form_views tables
├── components/
│   └── admin/
│       ├── FormBuilder.tsx          — Drag-and-drop form editor
│       ├── FormPreview.tsx          — Live preview component
│       ├── FormEmbedModal.tsx       — Embed code generator modal
│       └── FieldEditor.tsx         — Individual field configuration
└── public/
    └── embed.js                    — Embeddable form script (< 15KB gzipped)
```

## Build Priority

1. Database schema — add `forms`, `form_submissions`, `form_views` tables
2. Admin API routes — CRUD for forms
3. Public API routes — config fetch + submit
4. Form editor UI — drag-and-drop field builder
5. Live preview — real-time rendering as they build
6. Embed script — `embed.js` that renders forms on external sites
7. Standalone form page — `/f/[id]` for iframe embed
8. Analytics — view tracking, submission tracking, conversion rate
9. Form templates — pre-built configs for common use cases
10. React NPM package — `@pouncefirst/react` (separate package, v2)

## Design Tokens

Uses the same Pounce design system as the admin dashboard:

- **Primary:** `#c49360` (orange) — buttons, links, focus rings
- **Background:** `#0a0a0a` (dark mode) / `#ffffff` (light mode)
- **Text:** `#1a1a1a` (headings) / `#666` (body)
- **Success:** `#4a7c59`
- **Error:** `#dc3545`
- **Font:** System stack or Space Grotesk (matching admin)
- **Border radius:** `0.75rem` (inputs), `1rem` (buttons/cards)
- **Spacing:** 24px between fields, 32px sections

Form inputs match Pounce's ContactForm island style from the Faber Made site for consistency.