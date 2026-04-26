# Phase 3-5 Code Review — Fixes Required

**Date:** 2026-04-26  
**Reviewer:** Patch  
**Branches reviewed:** `bolt/phase3-inbox`, `bolt/phase4-booking`, `bolt/phase5-forms`, `pip/phase3-inbox-ui`, `pip/phase5-forms-ui`

---

## Bolt — Fix These In Order

### Fix 1: Calendly Signature Verification (🔴 Security)

**File:** `src/pages/api/webhook/booking.ts`  
**Function:** `verifyCalendlySignature()`

**Problem:** The function computes HMAC over `timestamp.secret` but Calendly's actual algorithm is `HMAC-SHA256(timestamp + "." + rawBody, signingKey)`. The raw request body is never passed to the function.

**Current code:**
```typescript
function verifyCalendlySignature(
  signature: string,
  secret: string,
): boolean {
  // ...
  const payload = `${timestamp}.${secret}`;  // WRONG
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
```

**Fix:**
```typescript
function verifyCalendlySignature(
  signature: string,
  rawBody: string,    // ADD THIS PARAM
  secret: string,
): boolean {
  // ...
  const payload = `${timestamp}.${rawBody}`;  // Use rawBody, not secret
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
```

Also update the call site (around line 67):
```typescript
// Change:
if (!verifyCalendlySignature(signature, webhookSecret)) {
// To:
if (!verifyCalendlySignature(signature, rawBody, webhookSecret)) {
```

---

### Fix 2: Embed Script XSS — `</script>` Injection (🔴 Security)

**File:** `src/pages/api/f/[slug]/embed.ts`  
**Lines:** 63-64 (string escaping) and 73-79 (template interpolation)

**Problem:** DB values (`formName`, `submitMessage`, field labels) are interpolated into a JS template literal served as `<script>` content. A form named `Test</script><script>alert(1)</script>` breaks out of the script tag. Only single quotes are escaped, not `</script>`, backticks, or `${`.

**Current code:**
```typescript
const formName = form.name.replace(/'/g, "\\'");
const submitMessage = (form.submitMessage ?? 'Thank you!...').replace(/'/g, "\\'");
const fieldsJson = JSON.stringify(fields);
```

**Fix — add a sanitizer function and use it:**
```typescript
function sanitizeForScript(str: string): string {
  return str
    .replace(/</g, '\\x3c')       // Prevent </script> breakout
    .replace(/>/g, '\\x3e')
    .replace(/`/g, '\\x60')       // Prevent template literal injection
    .replace(/\$/g, '\\x24');     // Prevent ${} interpolation
}

const formName = sanitizeForScript(form.name);
const submitMessage = sanitizeForScript(form.submitMessage ?? 'Thank you! We\'ll be in touch soon.');
const fieldsJson = JSON.stringify(fields)
  .replace(/</g, '\\x3c')
  .replace(/>/g, '\\x3e');
```

Also apply `sanitizeForScript` to `primaryColor` and `borderRadius` from query params (lines 56-57) since those come from user input.

---

### Fix 3: Embed Error Message Uses `innerHTML` (🔴 Security)

**File:** `src/pages/api/f/[slug]/embed.ts`  
**Line:** 226

**Problem:** `showError(msg)` injects `msg` into `innerHTML`. If a future code change returns user-controlled HTML in error messages, it's XSS.

**Current code:**
```javascript
function showError(msg) {
  container.innerHTML = '<div class="pounce-error"><h3>Something went wrong</h3><p>' + (msg || 'Please try again.') + '</p><button onclick="window.__pounceRetry()">Try Again</button></div>';
}
```

**Fix:**
```javascript
function showError(msg) {
  container.innerHTML = '';
  var wrap = document.createElement('div');
  wrap.className = 'pounce-error';
  var h3 = document.createElement('h3');
  h3.textContent = 'Something went wrong';
  var p = document.createElement('p');
  p.textContent = msg || 'Please try again.';
  var btn = document.createElement('button');
  btn.textContent = 'Try Again';
  btn.onclick = function() { window.__pounceRetry(); };
  wrap.appendChild(h3);
  wrap.appendChild(p);
  wrap.appendChild(btn);
  container.appendChild(wrap);
}
```

Same pattern for `showSuccess()` on line 222 — use `textContent` for `SUBMIT_MSG`.

---

### Fix 4: OAuth Connect Pages Need App Shell (🟡 Functionality)

**Files:** `src/pages/admin/connect-gmail.astro`, `src/pages/admin/connect-outlook.astro`

**Problem:** Both pages are standalone HTML with inline CSS. No `AdminPage`/`AdminLayout` wrapper, no nav, no auth check. If a user's session expires during OAuth redirect, they see a broken page with no way to navigate back.

**Fix:** Wrap each page in `AdminPage` + `AdminLayout` like all other admin pages:

```astro
---
import AdminPage from '../../layouts/AdminPage.astro';
import AdminLayout from '../../components/admin/AdminLayout';

const params = Astro.url.searchParams;
const status = params.get('status');
const errorMsg = params.get('error') || '';
---

<AdminPage title="Connect Gmail" currentPath="/admin/settings">
  <AdminLayout currentPath="/admin/settings">
    <!-- existing card content here, remove the standalone HTML shell -->
  </AdminLayout>
</AdminPage>
```

Remove the `<!DOCTYPE html>`, `<html>`, `<head>`, `<style>`, `<body>` tags — `AdminPage` provides all of that. Keep only the card content and move any needed styles to Tailwind classes.

---

### Fix 5: Booking Webhook — Clean Up Body Parsing (🟡 Cleanup)

**File:** `src/pages/api/webhook/booking.ts`  
**Lines:** 68-92

**Problem:** `rawBody` is declared with `var` inside an `if` block and used in a different scope. It works due to hoisting but is confusing. The no-secret path uses `request.json()` while the secret path uses `request.text()` then `JSON.parse()`.

**Fix — consolidate:**
```typescript
export const POST: APIRoute = async ({ request, url }) => {
  // ... provider config ...

  // Always read raw body first
  const rawBody = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify signature if secret is configured
  const webhookSecret = resolveEnvKey(String(providers.bookingWebhookSecret ?? ''));
  if (webhookSecret) {
    const signature = request.headers.get('cal-signature') ?? request.headers.get('calendly-webhook-signature') ?? '';

    if (providerName === 'calcom' && signature) {
      if (!verifyCalcomSignature(rawBody, signature, webhookSecret)) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401, headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (providerName === 'calendly' && signature) {
      if (!verifyCalendlySignature(signature, rawBody, webhookSecret)) {  // Now passes rawBody
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401, headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  // body is already parsed — continue with handler logic
```

This also fixes Fix 1 since `rawBody` is now available for the Calendly signature check.

---

### Fix 6: Remove Redundant Dynamic Imports (🟢 Cleanup)

**File:** `src/pages/api/f/[slug].ts`  
**Lines:** 165-166

**Problem:** The handler re-imports `db`, `leads`, `conversations`, and `eq` via dynamic `await import()`. These are already imported at the top of the file (lines 15-16).

**Fix:** Delete lines 165-166:
```typescript
// DELETE THESE:
const { db: dbClient, leads, conversations } = await import('@/lib/db/index.js');
const { eq: eqOp } = await import('drizzle-orm');
```

Then replace all references in the handler:
- `dbClient` → `db`
- `eqOp` → `eq`

The top-level imports already cover everything needed.

---

### Fix 7: Validate Redirect URL in Form Submission (🟢 Security)

**File:** `src/pages/api/f/[slug]/embed.ts` (client-side) and `src/pages/api/admin/forms/[id].ts` (admin save)

**Problem:** `form.redirectUrl` from the database is passed to the client which does `window.location.href = result.redirectUrl`. An admin could set a redirect to `javascript:alert(1)` or an external phishing URL.

**Fix — client side (embed.ts, around line 240):**
```javascript
if (REDIRECT_URL && REDIRECT_URL.startsWith('https://')) {
  window.location.href = REDIRECT_URL;
  return;
}
```

**Fix — admin side (forms API):** Validate `redirectUrl` starts with `https://` when saving. Reject anything else.

---

## Pip — Fix These In Order

### Fix 8: Wrap Connect Pages in AdminPage (🟡 Functionality)

Same as Bolt's Fix 4 above. Apply to:
- `src/pages/admin/connect-gmail.astro`
- `src/pages/admin/connect-outlook.astro`

---

### Fix 9: conversations.astro — Use leadData.status Correctly (🟡 Bug)

**File:** `src/pages/admin/conversations.astro`

**Problem:** Your `pip/phase5-forms-ui` branch correctly changed `conv.status` → `(leadData as any).status` because conversations don't have a `.status` property — leads do. But your `pip/phase3-inbox-ui` branch still references `selectedConv.status` in the detail header.

**Fix:** After merging both branches, ensure ALL references to `conv.status` and `selectedConv.status` use the lead's status instead:
- In the conversation list: `(leadData as any).status` ✅ (already fixed in phase5)
- In the detail header: use `selectedConv.lead.status` or pass lead status as a separate variable
- In the status badge: same fix

---

### Fix 10: conversations.astro — Resolve Merge Conflict (🟡 Merge)

**File:** `src/pages/admin/conversations.astro`

**Problem:** Your `pip/phase3-inbox-ui` and `pip/phase5-forms-ui` branches both modify this file in overlapping areas.

**Fix:** Take `phase3-inbox-ui` as the base (it has the big styling upgrade). Then manually apply the `conv.status` → `leadData.status` fix from `phase5-forms-ui` on top of it. The key changes from phase5 to carry over:
- Line 87: `conv.status === 'new'` → `(leadData as any).status === 'new'`
- Lines 107-108: `statusColors[conv.status]` → `statusColors[(leadData as any).status]`
- Same pattern for `statusLabels[conv.status]`

---

## Merge Order

When all fixes are applied, merge in this order:

```
1. bolt/phase3-inbox → main
2. bolt/phase4-booking → main
3. bolt/phase5-forms → main
4. pip/phase3-inbox-ui → main
5. pip/phase5-forms-ui → main  (resolve conversations.astro conflict)
```

Or merge Pip's branches first (they include Bolt's base commits) then Bolt's delta. Either way, resolve `conversations.astro` manually per Fix 10.