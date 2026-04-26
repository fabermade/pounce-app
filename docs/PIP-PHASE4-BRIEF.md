# Pounce — Pip Phase 4 Brief

**Repo:** `github.com:hamburgers/TrueLeads`
**Branch:** `pip/phase4-booking-ui`
**Base:** `main` (merge `bolt/phase4-booking` first)

---

## What You're Building

Phase 4 UI for booking integrations. Bolt built the backend — public booking page, webhook upgrades, booking config API. You're building the settings UI and conversation view upgrades.

## Tasks

### Task 4P.1: Booking Settings Section (30m)

Update `src/components/admin/settings/BookingSection.astro` to show:

- **Provider selector** — Radio buttons or dropdown: Cal.com / Calendly / None
- **Booking URL** — Text input for the Cal.com or Calendly scheduling link
- **CTA text** — Customizable call-to-action text (default: "Book a Call")
- **Timing selector** — When to offer booking: Immediately / After 1st exchange / After 2nd exchange / Manual
- **Webhook secret** — Password field for `bookingWebhookSecret` (masked with ••••••••)

All fields save via `PATCH /api/admin/config` under the `booking` and `providers` sections.

**API:** `GET /api/admin/config` returns:
```json
{
  "booking": { "url": "...", "cta": "Book a Call", "timing": "after_second_exchange", "provider": "calcom" },
  "providers": { "booking": "calcom", "bookingWebhookSecret": "••••••••", ... }
}
```

### Task 4P.2: Booking Status in Leads (20m)

Update `src/pages/admin/leads.astro` to show:

- **📅 Scheduled** badge next to leads with `status === 'scheduled'`
- Clicking the badge could link to the conversation view (nice to have, not required)

The leads page already loads lead data with status. Just add visual treatment for the `scheduled` status.

### Task 4P.3: Booking Confirmation in Conversations (20m)

Update `src/pages/admin/conversations.astro` to show:

- **System messages** (role: `system`, source: `ai`) with a distinct style — e.g. light yellow background with a 📅 icon
- When a booking event comes through, it appears as a system message like: `📅 Booking confirmed: Call at 4/26/2026, 2:00 PM`
- **AI messages** — light blue background, 🤖 icon
- **Customer messages** — left border accent, normal background

The conversation detail page already loads messages. Add visual differentiation by `role` and `source` fields.

### Task 4P.4: Public Booking Page Preview (15m)

The public `/book` page already exists (Bolt built it). Add a "Preview Booking Page" link in the Booking settings section that opens `/book` in a new tab. Simple — just an anchor tag.

## Rules

- **Wrap all pages in `AdminPage` layout.** Every page needs `<AdminPage title="..." currentPath="...">` → `<AdminLayout currentPath="...">` → content → `</AdminLayout>` → `</AdminPage>`.
- **No Astro JSX type assertions in templates.** Don't use `{} as Record<string, number>` inside template expressions — move them to frontmatter instead.
- **Always use hidden inputs for checkboxes.** Pattern: `<input type="hidden" name="field" value="false"><input type="checkbox" name="field" value="true">`.
- **Don't touch Bolt's files.** `src/lib/`, `src/pages/api/`, `src/middleware.ts` — Bolt owns these.
- **Match the existing design system.** Space Grotesk for headings, Inter for body, pounce-orange accent, charcoal text, cream background.

## Design Reference

- **Colors:** pounce-orange `#F5A623`, charcoal `#1E1E1E`, cream `#FAF7F2`
- **Fonts:** Space Grotesk (headings), Inter (body)
- **Pattern:** Card-based layout with `bg-white rounded-xl shadow-sm border border-gray-100 p-6`
- **Buttons:** `bg-charcoal text-white rounded-lg hover:bg-charcoal-light`
- **Danger buttons:** `bg-red-600 text-white rounded-lg hover:bg-red-700`

## API Reference

### GET /api/admin/config
Returns all config sections. Key ones for booking:
```json
{
  "booking": { "url": "", "cta": "Book a Call", "timing": "after_second_exchange", "provider": "calcom" },
  "providers": { "booking": "calcom", "bookingWebhookSecret": "••••••••", ... }
}
```

### PATCH /api/admin/config
Merges provided sections. Send `booking` and/or `providers` objects:
```json
{
  "booking": { "url": "https://cal.com/my-team/call", "provider": "calcom", "cta": "Schedule a Call", "timing": "after_first_exchange" },
  "providers": { "bookingWebhookSecret": "whsec_abc123" }
}
```

Webhook secret follows same masking rules as API keys — send `••••••••` or empty string to keep existing value.

### GET /api/booking/config (public, no auth)
Returns booking config for the public `/book` page:
```json
{ "url": "https://cal.com/...", "provider": "calcom", "cta": "Book a Call", "businessName": "Pounce", "businessTagline": "..." }
```

## Build Priority

1. **Task 4P.1** (Booking settings) — Can start immediately
2. **Task 4P.3** (Conversation view) — Can start immediately  
3. **Task 4P.2** (Leads badge) — Quick, do it with 4P.1
4. **Task 4P.4** (Preview link) — Trivial, do last

Ship all 4 tasks in one PR: `pip/phase4-booking-ui`.