# Pounce Auth — Layer 1 (MVP) — Refined Plan

## Goal

Lock down `/admin/*` and `/api/admin/*` with single-admin session auth. No user accounts, no database sessions. This is a launch requirement — not optional.

## How It Works

1. **Env vars:** `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` — set by Patch in Vercel
2. **Login page:** `GET /admin/login` — email + password form (Pip builds UI)
3. **Login endpoint:** `POST /api/admin/login` — hashes input password, compares against `ADMIN_PASSWORD_HASH` with constant-time comparison, sets signed session cookie
4. **Session:** Signed cookie (`pounce_session`) using `crypto.subtle` HMAC-SHA256 with `SESSION_SECRET`. Cookie contains `{ email, iat, expires }`. Stateless — no database.
5. **Middleware:** `src/middleware.ts` — checks for valid session cookie on every `/admin/*` and `/api/admin/*` route. No cookie → redirect to `/admin/login`. Expired → same.
6. **Logout:** `POST /api/admin/logout` — clears cookie, redirects to login
7. **Password change:** `POST /api/admin/change-password` — requires current password, updates `ADMIN_PASSWORD_HASH` in... (see open question below)

## Excluded Routes (No Auth Required)

- `/admin/login` — the login page itself
- `/api/admin/login` — the login endpoint
- `/api/inbound` — public lead intake
- `/api/unsubscribe` — public unsubscribe
- `/book` — public booking page
- `/api/forms/:id/config` — public form config (for embed rendering)
- `/api/forms/:id/submit` — public form submission

## Files Bolt Builds

| File | What it does |
|------|-------------|
| `src/middleware.ts` | Astro middleware — session check, redirect unauthenticated |
| `src/lib/auth/session.ts` | Create/verify/destroy signed session cookies |
| `src/lib/auth/password.ts` | Hash password with bcrypt, constant-time compare |
| `src/pages/api/admin/login.ts` | POST — validate email+password, set cookie |
| `src/pages/api/admin/logout.ts` | POST — clear cookie, redirect to login |
| `src/pages/api/admin/change-password.ts` | POST — verify current, set new password hash |

## Files Pip Builds

| File | What it does |
|------|-------------|
| `src/pages/admin/login.astro` | Login form (email + password), matches admin design |
| `src/components/admin/ChangePassword.tsx` | Password change form for settings page |

## Env Vars Patch Sets in Vercel

| Variable | What it is | Example |
|----------|-----------|---------|
| `ADMIN_EMAIL` | Admin login email | `tyler@fabermade.com` |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of admin password | `$2b$10$...` |
| `SESSION_SECRET` | 32-char random string for HMAC signing | `a1b2c3d4...` |

**Important:** `ADMIN_PASSWORD` (plaintext) is NOT stored in env vars. Only the bcrypt hash. Patch generates the hash locally and puts the hash in Vercel. The plaintext never touches Vercel's infrastructure.

## Security Details

- **Password storage:** bcrypt hash only. No plaintext in env vars. `bcryptjs` works on Vercel (pure JS, no native deps).
- **Password comparison:** Constant-time via `bcrypt.compare()` — prevents timing attacks.
- **Cookie:** `HttpOnly`, `Secure` (production), `SameSite=Lax`, 24-hour expiry.
- **Session cookie claims:** `{ email, iat, expires }` — `iat` (issued-at) enables future session invalidation after password changes without a database.
- **Session signing:** HMAC-SHA256 via `crypto.subtle` — no dependencies, edge-compatible.
- **Failed login:** Generic "Invalid credentials" message — no email enumeration.
- **Login rate limit:** 5 per minute per IP (in-memory counter). Returns 429 with `Retry-After` header.
- **CSRF:** Login form includes `csrf_token` hidden field. Server generates nonce, stores in cookie, verifies on POST. Double-submit cookie pattern.
- **Middleware exclusions:** `/admin/login`, `/api/admin/login` MUST be excluded from session check to avoid redirect loops.

## Open Questions (Ty to Decide)

1. **Password change mechanism:** `ADMIN_PASSWORD_HASH` is an env var — changing it requires a Vercel redeploy. Options:
   - **A:** Accept it. Admin changes password → Patch updates env var → Vercel redeploys. Works for single-admin.
   - **B:** Store the hash in `business_config` table alongside other settings. Changeable from the UI without a redeploy. More complex but more practical.
   - **Recommendation:** Option B. If we're already reading business config from the DB, store the password hash there too. It's one more row in a table that already exists.

2. **Session invalidation after password change:** If using Option B (DB-stored hash), add a `password_changed_at` timestamp. Middleware checks `iat < password_changed_at` → force re-login. Clean, no DB sessions needed.

## What This Doesn't Do (v2 Territory)

- Multiple users / roles
- Password reset / email verification
- "Remember me" beyond 24h
- Team invites
- OAuth / social login
- Database-backed sessions
- API key auth (for programmatic admin access)

## Timeline

- **Bolt:** ~1.5 hours (session lib + password lib + middleware + login/logout/change-password endpoints + CSRF)
- **Pip:** ~45 min (login page + change password form in settings)
- **Patch:** 5 min (generate hash + secret, add 3 env vars to Vercel, or seed DB row)

## v1.5 Hardening (Post-Launch)

- Move from in-memory rate limiting to Vercel KV or Upstash Redis (survives serverless cold starts)
- Add `Content-Security-Policy` headers
- Add brute-force alerting (notify admin after 10 failed attempts)
- Add optional 2FA (TOTP)
- Add API key auth for programmatic access