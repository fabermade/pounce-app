# Pounce — Integration Test Plan

**Post Phase 3-5 Deploy Verification**  
**Date:** 2026-04-26

---

## 1. Auth & Session

| # | Test | Steps | Expected | Priority |
|---|------|-------|----------|----------|
| 1.1 | Login | POST `/api/admin/login` with tyler@fabermade.net / Pounce2026! | `{"success":true}`, session cookie set | 🔴 |
| 1.2 | Logout | Click logout from any admin page | Redirected to `/admin/login`, session cleared | 🟡 |
| 1.3 | Expired session | Wait 24h or clear cookie, navigate to `/admin/settings` | Redirected to login page | 🟡 |
| 1.4 | Unauthenticated API | GET `/api/admin/config` without cookie | 401 response | 🔴 |
| 1.5 | Password reset | Enter email at `/admin/reset-password` | Email received via Resend, reset link works | 🔴 |
| 1.6 | Invite user | Enter email + name in Users → Invite | Email received, accept-invite flow works, new user can login | 🔴 |

## 2. Leads Pipeline

| # | Test | Steps | Expected | Priority |
|---|------|-------|----------|----------|
| 2.1 | Form submission → lead | POST to `/api/f/{slug}` with valid data | Lead created in DB, status `new`, conversation created | 🔴 |
| 2.2 | AI auto-reply | Submit a form with agent mode ON | LLM generates response, email sent to lead | 🔴 |
| 2.3 | Duplicate lead | Submit form with same email twice | Same lead updated, new message appended to existing conversation | 🟡 |
| 2.4 | Honeypot catch | Fill `pounce_hp` field in form submission | Returns `{"success":true}` but no lead created | 🟡 |
| 2.5 | Rate limiting | Submit same form 6x in 1 minute | 6th request returns 429 | 🟡 |
| 2.6 | Lead status transitions | New → Contacted → Scheduled → Closed Won | Status updates persist, displayed correctly in UI | 🟡 |

## 3. Inbox Providers

| # | Test | Steps | Expected | Priority |
|---|------|-------|----------|----------|
| 3.1 | Resend inbound webhook | POST `/api/webhook/resend` with valid payload | Lead created/message appended, AI response triggered | 🔴 |
| 3.2 | Resend signature verification | POST with wrong `resend-signature` header | 401 response | 🟡 |
| 3.3 | Gmail OAuth connect | Settings → Integrations → Connect Gmail | Redirects to Google consent, tokens stored, "Connected" badge shows | 🔴 |
| 3.4 | Outlook OAuth connect | Settings → Integrations → Connect Outlook | Redirects to Microsoft consent, tokens stored, "Connected" badge shows | 🔴 |
| 3.5 | Inbox disconnect | Click "Disconnect" after connecting Gmail | Tokens cleared, badge shows "Not connected" | 🟡 |
| 3.6 | Email threading | Reply to a Pounce-sent email | In-Reply-To header matched, message appended to correct conversation | 🟡 |
| 3.7 | Email parsing | Send HTML email with Gmail quotes | Quotes stripped, only new reply text extracted | 🟡 |

## 4. Booking Integrations

| # | Test | Steps | Expected | Priority |
|---|------|-------|----------|----------|
| 4.1 | Booking page renders | Navigate to `/book` | Cal.com or Calendly embed renders, or fallback link shows | 🟡 |
| 4.2 | Cal.com webhook | POST `/api/webhook/booking?provider=calcom` with sample payload | Lead matched/created, status set to `scheduled` | 🟡 |
| 4.3 | Calendly webhook | POST `/api/webhook/booking?provider=calendly` with sample payload | Lead matched/created, status set to `scheduled` | 🟡 |
| 4.4 | Calendly signature verification | POST with valid `calendly-webhook-signature` | 200 response | 🟡 |
| 4.5 | Calendly bad signature | POST with invalid signature | 401 response | 🟡 |
| 4.6 | Booking message in conversation | Create booking via webhook | "📅 Booking confirmed" system message added to conversation | 🟡 |

## 5. Forms

| # | Test | Steps | Expected | Priority |
|---|------|-------|----------|----------|
| 5.1 | Create form | `/admin/forms/new` → add fields → save | Form appears in list, public page renders | 🔴 |
| 5.2 | Embed script | Add `<script src="/api/f/{slug}/embed.js">` to test page | Form renders, submits correctly | 🔴 |
| 5.3 | Embed XSS protection | Create form with name `Test</script><script>alert(1)</script>` | Script tag not broken, no alert, form renders safely | 🔴 |
| 5.4 | Embed redirect | Set redirect URL to `https://example.com` on form | After submit, redirects to example.com | 🟡 |
| 5.5 | Embed bad redirect | Set redirect URL to `javascript:alert(1)` | Rejected on save (Zod validation), or no redirect on submit | 🔴 |
| 5.6 | Form analytics | View a form, submit it, check stats | Views +1, submissions +1, conversion rate updates | 🟡 |
| 5.7 | Form deactivation | Toggle form to inactive | Public page returns 404, embed shows "Form not found" | 🟡 |
| 5.8 | Spam honeypot | Fill the hidden `pounce_hp` field in embed | Silently "succeeds", no lead created | 🟡 |

## 6. Admin UI

| # | Test | Steps | Expected | Priority |
|---|------|-------|----------|----------|
| 6.1 | Settings saves | Change business name, save | Name persists after page reload | 🔴 |
| 6.2 | Conversations list | Navigate to `/admin/conversations` | Conversations render with lead name, status badge, last message | 🔴 |
| 6.3 | Conversation threading | Click into a conversation | Messages show date dividers, AI/human/customer styling | 🟡 |
| 6.4 | Booking badge on lead | Lead with `scheduled` status | 📅 Scheduled badge shows in leads table and conversations | 🟡 |
| 6.5 | User management | Create, edit, delete users | All operations work, role permissions enforced | 🟡 |
| 6.6 | Change password | Enter current + new password | Password updated, can login with new password | 🟡 |
| 6.7 | Mobile view | Open admin on phone | Pages render correctly, no overflow, buttons are tappable | 🟢 |

## 7. Security

| # | Test | Steps | Expected | Priority |
|---|------|-------|----------|----------|
| 7.1 | SQL injection | Submit form with `' OR 1=1` in fields | No error, data stored as literal text | 🔴 |
| 7.2 | XSS in form fields | Submit `<script>alert('xss')</script>` in message field | Stored as text, not executed in admin UI | 🔴 |
| 7.3 | CSRF on API | POST to admin API from external site | 401 (session cookie doesn't send cross-origin with SameSite=Strict) | 🔴 |
| 7.4 | Role enforcement | Login as viewer, try to access admin-only actions | Edit/delete blocked, 403 response | 🟡 |
| 7.5 | Open redirect | Set form redirect to `https://evil.com` | Allowed (https:// only), `javascript:` blocked | 🟡 |

## 8. End-to-End Flow

| # | Test | Steps | Expected | Priority |
|---|------|-------|----------|----------|
| 8.1 | Full happy path | 1. Create form → 2. Embed on page → 3. User submits → 4. AI replies → 5. User replies → 6. Conversation updates → 7. Book call → 8. Lead status = scheduled | Every step works, data consistent across pipeline | 🔴 |
| 8.2 | Email reply flow | 1. AI sends email → 2. Lead replies → 3. Resend webhook fires → 4. Message appended → 5. AI responds again | Full loop works, threading preserved | 🔴 |

---

## Test Priority Legend

- 🔴 **Must pass before go-live** — blocks any real usage
- 🟡 **Should pass** — important for production quality
- 🟢 **Nice to have** — polish, not blocking

## Running Tests

**Quick smoke test (10 min):** Run all 🔴 items. If any fail, stop and fix before continuing.

**Full test (45 min):** Run everything. Document failures in a bug list.

**Security test (20 min):** Run section 7. Can be done in parallel with other tests.