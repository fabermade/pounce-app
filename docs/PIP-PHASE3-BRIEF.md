# Pounce — Pip Phase 3 Brief

**Repo:** `github.com:hamburgers/TrueLeads`
**Branch:** `pip/phase3-inbox-ui`
**Base:** `main` (commit `d6ac65e`)

---

## What You're Building

Phase 3 UI for the inbox providers. Bolt is building the backend (Gmail/Outlook OAuth, email parsing, conversation threading). You're building the settings UI and connect flows.

## Tasks

### Task 3P.1: Inbox Settings Section (45m)

Update `src/components/admin/settings/IntegrationsSection.astro` to show:

- **Inbox provider selector** — Dropdown: None / Resend / Gmail / Outlook
- **Connect button** — For Gmail and Outlook, show "Connect Gmail" / "Connect Outlook" button that starts OAuth flow
- **Connection status badge** — Green "Connected" or red "Not connected" with last sync time
- **Disconnect button** — Revoke OAuth tokens

The settings page already has an `IntegrationsSection.astro`. Update it with the inbox provider UI.

**API:** `GET /api/admin/config` returns `config.providers.inbox` (provider name) and OAuth token status.

### Task 3P.2: Gmail OAuth Connect Flow (30m)

Create `src/pages/admin/connect-gmail.astro`:

- Redirects to Google OAuth consent screen
- Shows loading state while OAuth completes
- On success: shows "Gmail connected!" and redirects to settings
- On error: shows error message with retry button

**URL flow:**
1. User clicks "Connect Gmail" in settings
2. Browser navigates to `/api/auth/gmail` → Google consent screen
3. Google redirects to `/api/auth/gmail/callback?code=...`
4. Backend exchanges code for tokens, stores in config
5. Backend redirects to `/admin/connect-gmail?status=success`
6. Page shows success message and redirects to `/admin/settings`

### Task 3P.3: Outlook OAuth Connect Flow (30m)

Same as Gmail but for Microsoft. Create `src/pages/admin/connect-outlook.astro`:

- Same UX pattern: loading → success/error → redirect to settings
- Microsoft OAuth URLs instead of Google

### Task 3P.4: Conversation View Upgrades (1h)

Update `src/pages/admin/conversations.astro` to show:

- **AI messages** with a different background color (light blue or similar)
- **Human messages** with a different color (light gray)
- **Customer messages** with a left border accent
- **Reply indicator** — When AI has responded, show "🤖 AI responded" label
- **Booking badge** — When lead status is `scheduled`, show "📅 Scheduled" badge
- **Timestamp grouping** — Group messages by date with date dividers

The conversations page already loads data from `/api/admin/conversations/[id]`. You're just improving the visual presentation.

## Rules

- **Wrap all pages in `AdminPage` layout.** Every page needs `<AdminPage title="..." currentPath="...">` → `<AdminLayout currentPath="...">` → content → `</AdminLayout>` → `</AdminPage>`. This provides Tailwind CSS, fonts, and the HTML shell. Pages without this will render without styling.
- **No Astro JSX type assertions in templates.** Don't use `{} as Record<string, number>` inside template expressions — move them to frontmatter instead. Astro's parser can't handle them.
- **Always use hidden inputs for checkboxes.** Pattern: `<input type="hidden" name="field" value="false"><input type="checkbox" name="field" value="true">`. Without the hidden input, unchecked checkboxes send nothing in form data.
- **Don't touch Bolt's files.** `src/lib/`, `src/pages/api/`, `src/middleware.ts` — Bolt owns these.
- **Match the existing design system.** Space Grotesk for headings, Inter for body, pounce-orange accent, charcoal text, cream background.

## Design Reference

- **Colors:** pounce-orange `#F5A623`, charcoal `#1E1E1E`, cream `#FAF7F2`
- **Fonts:** Space Grotesk (headings), Inter (body)
- **Pattern:** Card-based layout with `bg-white rounded-xl shadow-sm border border-gray-100 p-6`
- **Buttons:** `bg-charcoal text-white rounded-lg hover:bg-charcoal-light`
- **Danger buttons:** `bg-red-600 text-white rounded-lg hover:bg-red-700`

## Existing Page Structure

All admin pages follow this pattern:

```astro
---
import AdminPage from '../../layouts/AdminPage.astro';
import AdminLayout from '../../components/admin/AdminLayout';
// ... data fetching
---
<AdminPage title="Page Title" currentPath="/admin/page">
  <AdminLayout currentPath="/admin/page">
    <!-- Content here -->
  </AdminLayout>
</AdminPage>
```

## Build Priority

1. **Task 3P.1** (Inbox settings) — Can start immediately
2. **Task 3P.4** (Conversation view) — Can start immediately
3. **Tasks 3P.2, 3P.3** (OAuth connect flows) — Depends on Bolt's auth endpoints being ready

Ship 3P.1 and 3P.4 as a first PR. 3P.2 and 3P.3 as a second PR once Bolt's OAuth endpoints are deployed.