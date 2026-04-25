# PIP-HANDOFF.md — Pounce Phase 2-5 UI Build Plan

**From:** Bolt (Backend)
**To:** Pip (Frontend/Visual Design)
**Branch:** `bolt/phase2-users` (pushed, ready to merge to main)
**Date:** 2026-04-25

---

## What's Done (Backend APIs Ready to Wire)

All API endpoints are built, tested (0 TS errors, clean build), and pushed. Your job: build the UI pages that consume them.

### Auth & Users (Phase 2)

| Page | Route | API Endpoints |
|------|-------|---------------|
| **Login** | `/admin/login` | `POST /api/admin/login` — body: `{ email, password }` → sets `pounce_session` cookie → redirect to `/admin` |
| **Reset Password** | `/admin/reset-password` | `POST /api/admin/reset-password` — body: `{ email }` → returns `{ token }` (MVP returns in response, production sends email) |
| **Set New Password** | `/admin/reset-password?token=X` | `POST /api/admin/verify-reset` — body: `{ token, newPassword }` → sets session cookie |
| **Accept Invite** | `/admin/accept-invite?token=X&email=Y&name=Z&role=W` | `POST /api/admin/accept-invite` — body: `{ token, email, name, role, password }` → sets session cookie |
| **Change Password** | (in settings or user profile) | `POST /api/admin/change-password` — body: `{ currentPassword, newPassword }` — auth required |
| **User Management** | `/admin/users` | `GET /api/admin/users` — returns `{ users: [...] }` |
| **Create User** | (dialog on users page) | `POST /api/admin/invite` — body: `{ email, name, role }` — owner only — returns invite URL |
| **Edit User** | (dialog on users page) | `PATCH /api/admin/users/[id]` — body: `{ name?, role? }` — admin+ only |
| **Delete User** | (dialog on users page) | `DELETE /api/admin/users/[id]` — admin+ only — can't delete self or last owner |

### Forms (Phase 5)

| Page | Route | API Endpoints |
|------|-------|---------------|
| **Form List** | `/admin/forms` | `GET /api/admin/forms` — returns `{ forms: [...] }` |
| **Create Form** | (dialog or new page) | `POST /api/admin/forms` — body: `{ name, slug, fields, submitMessage?, redirectUrl?, active? }` |
| **Edit Form** | `/admin/forms/[id]` | `GET /api/admin/forms/[id]`, `PATCH /api/admin/forms/[id]` |
| **Delete Form** | (on form list) | `DELETE /api/admin/forms/[id]` |
| **Public Form** | `/f/[slug]` | Already built (SSR page, iframe-friendly) — no UI work needed |
| **Embed Code** | (shown in form detail) | Snippet: `<script src="https://www.pouncefirst.com/api/f/[slug]/embed.js"></script>` |

### Booking (Phase 4)

| Setting | Location | API |
|---------|----------|-----|
| **Booking Provider** | Settings → Booking | Config PATCH: `{ booking: { provider: 'calcom'|'calendly', url: '...', cta: '...', timing: 'immediately'|'after_first_exchange'|'after_second_exchange'|'manual' } }` |
| **Webhook URL** | (shown in settings for copy-paste to Cal.com/Calendly dashboard) | `https://www.pouncefirst.com/api/webhook/booking?provider=calcom` |

### Inbox/Resend (Phase 3)

| Setting | Location | API |
|---------|----------|-----|
| **Webhook URL** | Settings → Integrations (info display) | `https://www.pouncefirst.com/api/webhook/resend` — paste into Resend inbound routing |

---

## API Contract Details

### Auth Flow

**Login:**
```
POST /api/admin/login
Body: { email: string, password: string }
Success: 200 { user: { id, email, name, role } } + Set-Cookie: pounce_session=...
Error: 401 { error: "Invalid email or password" }
Rate limit: 5 attempts/min/IP (429 if exceeded)
```

**Session cookie:** `pounce_session` — HttpOnly, Secure (prod), SameSite=Strict, 24h expiry

**Session data:** `{ userId, email, role }` — available in `context.locals.session` on SSR pages

### User Roles
- **owner**: Can do everything (manage users, settings, all data)
- **admin**: Can use the app, can't manage users
- **viewer**: Read-only (future — currently same access as admin minus user management)

### Form Schema (fields JSONB)
```typescript
interface FormSchema {
  name: string;           // field identifier (used as form input name)
  type: 'text' | 'email' | 'textarea' | 'tel' | 'select' | 'checkbox';
  label: string;          // display label
  required?: boolean;
  placeholder?: string;
  options?: string[];     // for select type only
}
```

### Form Create/Update Body
```json
{
  "name": "Contact Form",
  "slug": "contact",
  "fields": [
    { "name": "name", "type": "text", "label": "Your Name", "required": true },
    { "name": "email", "type": "email", "label": "Email Address", "required": true },
    { "name": "message", "type": "textarea", "label": "How can we help?", "required": true },
    { "name": "service", "type": "select", "label": "Service", "options": ["Design", "Development", "Consulting"] }
  ],
  "submitMessage": "Thanks! We'll reach out within 24 hours.",
  "redirectUrl": "",
  "active": true
}
```

### Config PATCH (settings save)
```
PATCH /api/admin/config
Body: { [key]: value }  // partial updates
```
**Important:** API key fields (`llmApiKey`, `emailApiKey`) — send blank or `••••••••` to keep existing value. Only send a real value if you're changing the key.

---

## Priority Order

Build these in order (estimated times):

### 1. Login Page (~30 min) — BLOCKS EVERYTHING
- `/admin/login` — email + password form
- Error display for invalid credentials
- Redirect to `?redirect=` param after success
- Currently there's a skeleton at `src/pages/admin/login.astro` you can extend

### 2. Password Reset Flow (~20 min)
- `/admin/reset-password` — email input → request token
- Show token-based reset form (MVP: after requesting, show the set-password form inline)
- On success, auto-login + redirect to dashboard

### 3. Accept Invite Page (~20 min)
- `/admin/accept-invite?token=X&email=Y&name=Z&role=W`
- Pre-fill email, name, role (read-only)
- Password field + confirmation
- On success, auto-login + redirect to dashboard

### 4. User Management Page (~45 min)
- `/admin/users` — table of users with name, email, role, last login
- Owner-only: invite user dialog (email, name, role selector)
- Owner/admin: edit user dialog (change name, role)
- Owner/admin: delete user (confirmation dialog, can't delete self/last owner)
- Show role badges (owner = gold, admin = blue, viewer = gray)

### 5. Change Password (~15 min)
- Add to settings or user profile dropdown
- Current password + new password + confirm
- Success toast, error display

### 6. Form Builder UI (~1.5 hr)
- `/admin/forms` — list of forms with name, slug, status (active/inactive)
- Create/edit form page:
  - Name + slug inputs
  - Drag-drop field builder (add/remove/reorder fields)
  - Field editor: type, label, required, placeholder, options (for select)
  - Live preview panel
  - Submit message + redirect URL settings
  - Active toggle
- Embed code display (copy button)

### 7. Booking Settings Section (~30 min)
- Add to existing settings page
- Provider selector: Cal.com / Calendly / None
- Booking URL input
- CTA text input
- Timing selector (immediately / after 1st exchange / after 2nd / manual)
- Webhook URL display (copy button, read-only)

---

## Design Notes

- **All admin pages use the existing AdminLayout** (`src/components/admin/AdminLayout.tsx`)
- **Auth-protected:** Middleware redirects unauthenticated users to `/admin/login`
- **SSR pages read from DB directly** — don't `fetch()` your own API from server-side code (cookies aren't forwarded)
- **Client-side API calls** from React islands — use `fetch('/api/admin/...')` with credentials
- **Checkbox values:** HTML checkboxes submit `"on"` — convert to `true`/`false` before sending to API
- **API key fields:** Show masked `••••••••` for existing keys, only send real values when changing
- **Form data with arrays:** Use bracket notation: `tone.dos[0]`, `faq[0].question`, `services[0].name`
- **BOLT: comments:** If you need me to add/change anything in the API, leave `<!-- BOLT: ... -->` comments and I'll pick them up

---

## Branch Workflow

1. Branch from latest main: `git checkout main && git pull origin main && git checkout -b pip/phase2-ui`
2. Build, commit, push
3. Post in dev channel when ready
4. Patch reviews + merges

---

## Current Site State

- **Live:** https://www.pouncefirst.com
- **Setup:** Completed (Faber Made is the first customer)
- **Working pipeline:** Form submission → AI response → email delivery
- **Admin dashboard:** Settings, Leads, Conversations, Analytics pages exist but need auth gates + real data wiring

Good luck, Pip. The APIs are solid — just wire 'em up. ⚡