# Patch Review Brief: TrueLeads Admin UI Overhaul

## 📦 Project Details
- **Repo:** `hamburgers/TrueLeads`
- **Branch:** `pip/admin-overhaul`
- **Target:** `main`

## 🎨 Design Goal
Modernize the Admin Dashboard to a high-end SaaS aesthetic. Shift from "generic admin" to a polished "Product" feel using the Pounce design system.

## 🛠 Key Changes
### 1. Global Design Tokens
- **Container Polish:** All settings sections transitioned from `rounded-xl` $\rightarrow$ `rounded-2xl` with `border-gray-200` and `transition-all`.
- **Typography:** 
    - Headers updated to `font-bold` with increased bottom margin (`mb-6`).
    - Labels transitioned to **Micro-Labels**: `text-xs font-bold text-gray-500 uppercase tracking-wider`.
    - Helper text updated to `text-xs text-gray-400 italic`.

### 2. Component Updates
- **`AdminLayout.tsx`**: Refined navigation items with solid Pounce-orange active states and refined user section card.
- **`PageHeader.tsx`**: Implemented as a standardized component for all admin pages to ensure consistent titles and action layouts.
- **`Leads.astro`, `Users.astro`, `Forms.astro`**: 
    - Modernized tables with high-contrast, wide-tracking micro-text headers.
    - Added `bg-pounce-orange/5` row hover effects.
    - Refined status badges to be bold uppercase.
- **Dialogs (Users/Forms)**: Overhauled with `backdrop-blur-sm`, Header + Body structure, and refined focus rings.
- **`Settings.astro` & Sub-components**: 
    - Full rewrite of layout for `ToneSection`, `KnowledgeSources`, `ServicesSection`, and `FaqSection`.
    - Updated `EscalationSection.astro` and `AgentMode.astro` to match the new micro-label and `rounded-2xl` system.

## ✅ Verification Checklist
- [ ] Verify all `rounded-2xl` containers render correctly.
- [ ] Confirm no layout shifts on mobile for the new table styles.
- [ ] Ensure `PageHeader` is used consistently across all updated pages.
- [ ] Check that the `pip/admin-overhaul` branch contains all polished versions of the settings components.

## 🚀 Deployment
Please review and merge `pip/admin-overhaul` into `main` upon approval.
