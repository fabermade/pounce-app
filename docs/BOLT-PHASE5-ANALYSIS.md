# Pounce — Phase 5 Analysis (Form Builder)

## What Already Exists

| Component | Status | Notes |
|-----------|--------|-------|
| `forms` + `form_submissions` tables | ✅ Done | Schema in DB |
| `GET/POST /api/admin/forms` | ✅ Done | CRUD API |
| `GET/PATCH/DELETE /api/admin/forms/[id]` | ✅ Done | CRUD API |
| `POST /api/f/[slug]` | ✅ Done | Public form submission, runs pipeline |
| `GET /api/f/[slug]/embed.js` | ✅ Done | Iframe embed script |
| `/f/[slug]` public form page | ✅ Done | SSR form rendering |
| `/admin/forms` list page | ✅ Done | Lists all forms |
| `/admin/forms/new` create page | ✅ Done | Has TS errors (array indexing) |
| `/admin/forms/[id]` edit page | ✅ Done | Has TS errors (array indexing) |
| `FormSchema` type | ✅ Done | text, email, textarea, tel, select, checkbox |

## What's Missing (Phase 5 Scope)

### 5.1 — Form submit → lead pipeline (1h)
**Status: ALREADY DONE.** The form submission endpoint at `POST /api/f/[slug]` already:
- Looks up form by slug
- Validates fields against schema
- Creates or finds lead by email
- Creates conversation, adds message
- Stores form submission record
- Runs the AI response pipeline
- Returns success with `aiResponseSent` flag

**Verdict: SKIP.** This is already wired.

### 5.2 — Form analytics (45m)
**What's needed:**
- Add `form_views` tracking (simple counter, no new table needed — add `views` column to `forms` table or use events table)
- Add `GET /api/admin/forms/[id]/stats` endpoint — returns view count, submission count, conversion rate
- Track form views via `GET /api/f/[slug]` (increment on SSR render) or a `POST /api/f/[slug]/view` ping

**Implementation:**
- Add `views` integer column to `forms` table (default 0)
- Increment on each form page render
- Calculate conversion: submissions / views

### 5.3 — Embed script (2h)
**What exists:** `GET /api/f/[slug]/embed.js` — returns a basic JS snippet that creates an iframe.

**What's needed:**
- Rewrite as a proper embeddable widget script (< 15KB)
- Custom styling from form config (primary color, border radius)
- Smooth loading animation
- Error states (form not found, form inactive)
- Success message after submission
- Responsive iframe that auto-resizes

**Current embed is just an iframe inserter.** Need to make it feel like a proper widget.

### 5.4 — Spam protection (30m)
**What's needed:**
- Honeypot field in the form (hidden field, bots fill it, humans don't)
- Rate limiting: max 5 submissions per IP per minute per form
- Optional reCAPTCHA v3 (configured in business config)
- Server-side validation in `POST /api/f/[slug]`

**Implementation:**
- Add honeypot field to `/f/[slug]` form page
- Add rate limiting in submission endpoint (in-memory, same pattern as login rate limiting)
- Add `spamProtection` section to business config: `{ honeypot: true, rateLimit: 5, recaptchaSiteKey: '', recaptchaSecret: '' }`

## Revised Scope

| Task | Est | Priority |
|------|-----|----------|
| 5.1 Form → Pipeline | **SKIP** (already done) | — |
| 5.2 Form analytics | 45m | Medium |
| 5.3 Embed script rewrite | 2h | High |
| 5.4 Spam protection | 30m | High |
| **Total** | **2h 45m** | |

## Can I Start Now?

**Yes, but with caveats:**
- Phase 3 and 4 branches haven't been merged to main yet
- Phase 5 doesn't depend on Phase 3 or 4 backend — forms API is already complete
- I should branch from main and build independently
- The form submission endpoint, embed endpoint, and form pages all exist on main already

**Recommendation:** Start with 5.3 (embed script) and 5.4 (spam protection) since they're the highest value. 5.2 (analytics) is nice-to-have and can wait.