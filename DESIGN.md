<!-- INSTALL: <repo-root>/DESIGN.md (commit it — this is shared team knowledge, same status as CLAUDE.md) -->

# DESIGN.md — FBP visual design system

**Source:** adapted from a Linear-marketing-site design system brief the user supplied
(Linear's dark-canvas, lavender-accent, hairline-bordered aesthetic). FBP is an
auth-gated **dashboard** app, not a marketing site, so this adaptation:
- adds a **light theme** (not in the source — Linear's marketing site is dark-only).
  Colors are new (labeled ASSUMPTION below); typography/spacing/radius/elevation
  rules are unchanged between themes, matching the source's own token structure.
- drops marketing-only components with no dashboard use (`pricing-card`,
  `testimonial-card`, `cta-banner`, `customer-logo-tile`, `pricing-tab`) and adds
  dashboard components the source doesn't cover (`list-row`, `page-header`,
  `empty-state`) by extrapolating from the same surface-ladder/hairline/radius
  tokens — see each component's note for which existing token pattern it mirrors.
- adds one semantic color (`error`) the source doesn't define — a marketing page
  has no form validation; a dashboard categorically does. Everything else follows
  the source's "one chromatic accent" spirit: `error` and `success` are the only
  two non-neutral colors anywhere in the system.

**Component architecture (adopted after the first round of pages shipped):** the
first pass at every page (Phases 1-9) rendered as a flat vertical stack of
full-width link buttons with no persistent chrome — functional, but it didn't
read as a dashboard app. `components/ui/*` is now built on **Radix UI primitives +
class-variance-authority** (the same structural pattern shadcn/ui uses) instead of
plain hand-rolled `<div>`/`<button>` markup — real focus-trapping/ARIA behavior for
the sidebar's mobile drawer and user menu, and a `cva()`-driven variant system
instead of string-concatenated Tailwind classes. **Deliberately not adopted:**
shadcn's own default color-variable convention (`--background`/`--foreground`/
`--popover`, etc.) — every Radix-backed component still reads FBP's own token
names (`bg-canvas`, `text-ink`, `border-hairline`, `bg-surface-2`, ...) rather than
introducing a second, parallel color-variable system that would need to be kept
in sync with the one already documented below. Same reasoning for `SelectField`:
it stays a styled **native** `<select>` rather than Radix's `Select` primitive,
because the existing test suite drives it via `userEvent.selectOptions` (which
only works against a real `<select>` element, not Radix's custom listbox) — see
the Landmines entry in `CLAUDE.md` for the full tradeoff.

## Colors

Both themes share the same relationships: `canvas` is the base, surfaces lift
away from it, `hairline*` borders separate lifted surfaces, `ink*` is a 4-step
text-emphasis ladder, `primary` is the single chromatic accent (same hue in both
themes — brand consistency, not restyled per theme).

### Dark theme (from the source brief)

| Token | Value | Use |
|---|---|---|
| `{colors.canvas}` | #010102 | Page background |
| `{colors.surface-1}` | #0a0a0d | Cards, panels, list rows |
| `{colors.surface-2}` | #121317 | Hovered/featured surfaces |
| `{colors.surface-3}` | #1a1b20 | Sub-nav, dropdowns |
| `{colors.surface-4}` | #23252a | Deepest lifted surface |
| `{colors.hairline}` | #23252a | Default 1px border |
| `{colors.hairline-strong}` | #34363d | Emphasized border, focus-adjacent |
| `{colors.hairline-tertiary}` | #1c1d21 | Nested/subtle border |
| `{colors.ink}` | #f7f8f8 | Headlines, primary body |
| `{colors.ink-muted}` | #d0d6e0 | Secondary text |
| `{colors.ink-subtle}` | #8a8f98 | Tertiary text, empty states |
| `{colors.ink-tertiary}` | #62666d | Disabled, footnotes |

### Light theme (ASSUMPTION — invented to mirror the dark theme's structure; not
in the source doc, which documents dark only)

| Token | Value | Use |
|---|---|---|
| `{colors.canvas}` | #f7f8fa | Page background — soft off-white, same faint cool tint as the dark canvas |
| `{colors.surface-1}` | #ffffff | Cards, panels, list rows — lift to pure white off the gray canvas |
| `{colors.surface-2}` | #eef0f4 | Hovered/featured surfaces |
| `{colors.surface-3}` | #e4e7ed | Sub-nav, dropdowns |
| `{colors.surface-4}` | #d8dce4 | Deepest lifted surface |
| `{colors.hairline}` | #e2e4e9 | Default 1px border |
| `{colors.hairline-strong}` | #c9cdd6 | Emphasized border, focus-adjacent |
| `{colors.hairline-tertiary}` | #edeef2 | Nested/subtle border |
| `{colors.ink}` | #0d0e12 | Headlines, primary body |
| `{colors.ink-muted}` | #4b4f58 | Secondary text |
| `{colors.ink-subtle}` | #6b7078 | Tertiary text, empty states |
| `{colors.ink-tertiary}` | #9195a0 | Disabled, footnotes |

Rationale for the light ladder's direction: dark-mode elevation moves *lighter*
(toward `ink`, away from black `canvas`). Light mode hits white at `surface-1`
and can't go lighter, so elevation beyond that moves *toward gray* instead —
same idea (increasing separation from `canvas`), opposite absolute direction
because white is a ceiling black isn't. `surface-1` is still the most common
lift (matches `surface-1` being the workhorse in the dark ladder too).

### Brand accent (same in both themes)

| Token | Value | Use |
|---|---|---|
| `{colors.primary}` | #5e6ad2 | Primary CTA, brand mark, focus ring, link emphasis — **scarce**, never a background fill |
| `{colors.primary-hover}` | #828fff | Hovered primary button |
| `{colors.primary-focus}` | #5e69d1 | Focus ring tint |
| `{colors.on-primary}` | #ffffff | Text/icons on a `{colors.primary}` fill (both themes) |

### Semantic

| Token | Dark | Light | Use |
|---|---|---|---|
| `{colors.success}` | #27a644 | #1a8a3a | Status pills, success states |
| `{colors.error}` | #e5484d | #d13438 | Form validation, RLS/network error text — **extension beyond the source doc**, which has no error color (a marketing page has no forms) |

## Typography

Same family/scale in both themes — themes are color-only.

- **Display/Text family:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif` — system UI font first, `Inter` (the source brief's recommended free substitute for Linear's proprietary cuts) as a fallback for platforms without a native UI font. **Not loaded from a CDN** (see Implementation notes) — on macOS/Windows/most Linux desktops the system font renders first and `Inter` never actually applies; this is an intentional, honest simplification, not a broken font load.
- **Mono family:** `ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace` — same reasoning: system mono font first, `JetBrains Mono` (source's substitute) as an unreachable fallback. Used only for IDs/SKUs/status tokens in dense dashboard tables, matching the source's "mono only in code contexts" rule.

| Token | Size | Weight | Line height | Tracking | Use |
|---|---|---|---|---|---|
| `{typography.display-md}` | 32px | 600 | 1.15 | -0.6px | Page title (dashboard shell heading) |
| `{typography.headline}` | 22px | 600 | 1.2 | -0.4px | Card/section titles |
| `{typography.body}` | 16px | 400 | 1.5 | -0.05px | Default body |
| `{typography.body-sm}` | 14px | 400 | 1.5 | 0 | Table/list rows, form labels, secondary content |
| `{typography.caption}` | 12px | 400 | 1.4 | 0 | Captions, meta, status badges |
| `{typography.button}` | 14px | 500 | 1.2 | 0 | Button labels |
| `{typography.mono}` | 13px | 400 | 1.5 | 0 | SKUs, order IDs, status codes |

FBP's dashboard headings never need the source's `display-xl`/`display-lg`
(80px/56px hero sizes) — there are no hero sections. `display-md` (32px) is the
largest heading anywhere, used once per page as the `DashboardShell` title.

## Spacing & Radius

Unchanged from the source — spacing/radius are theme-agnostic and not
marketing-specific.

- **Spacing** (4px base unit): `{spacing.xxs}` 4px · `{spacing.xs}` 8px ·
  `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px.
  (`{spacing.xxl}` 48px / `{spacing.section}` 96px from the source are marketing-scale
  and unused here.)
- **Radius:** `{rounded.sm}` 6px (inline tags, status badges) · `{rounded.md}` 8px
  (buttons, inputs) · `{rounded.lg}` 12px (cards, list rows) · `{rounded.pill}` 9999px
  (status pills, avatar circles).

## Elevation

Same as the source: surface ladder + hairline borders carry hierarchy, not
shadows. `{colors.primary-focus}` at 50% opacity, 2px outline, is the only ring.

## Components

Each entry names which token pattern it follows and, where dashboard-specific,
which source concept it's extrapolated from.

- **`button-primary`** / **`button-secondary`** / **`button-tertiary`** — same spec
  as the source (bg `primary`/`surface-1`+hairline/`canvas`; text `on-primary`/`ink`/`ink`;
  `{typography.button}`; padding 8px 14px; `{rounded.md}`).
- **`button-danger`** — **extension**, not in the source (no destructive actions on a
  marketing page). Bg `{colors.surface-1}`, text `{colors.error}`, border
  `{colors.error}` at 40% opacity, otherwise identical structure to `button-secondary`.
  Its own variant rather than a className override on `button-secondary` — Tailwind's
  compiled stylesheet order, not DOM class order, decides which same-property utility
  wins, so stacking a color override on a variant's own color classes is unreliable.
- **`card`** — bg `{colors.surface-1}`, 1px `{colors.hairline}` border, `{rounded.lg}`,
  padding `{spacing.lg}` 24px. Matches the source's `feature-card`/`pricing-card`
  structure, generalized to one dashboard card primitive (forms, dashboard nav lists).
- **`list-row`** — bg `{colors.surface-1}`, 1px `{colors.hairline}` border, `{rounded.md}`
  8px (smaller than `card`'s 12px — denser, repeated many times per page), padding
  `{spacing.sm}` 12px `{spacing.md}` 16px, flex row with `justify-between`.
  **Extrapolated** from the source's `changelog-row` (a repeated dense row with a
  hairline rule) — FBP's rows are bordered tiles instead of rule-separated flat rows
  since existing pages (bookings, inventory, orders) already render this way and a
  full restyle shouldn't also change the underlying list structure.
- **`text-input`** — bg `{colors.surface-1}`, text `{colors.ink}`, `{typography.body}`,
  `{rounded.md}`, padding 8px 12px, border `{colors.hairline}`; focused: 2px
  `{colors.primary-focus}` outline at 50% opacity. Matches the source exactly.
  **`select-field`** shares this exact spec — a `<select>` is functionally a text input
  for styling purposes; no separate token set needed.
- **`status-badge`** — bg `{colors.surface-2}`, text `{colors.ink-muted}`,
  `{typography.caption}`, `{rounded.pill}`, padding 2px 8px. Matches the source exactly.
  Status-specific tint (e.g. `resolved`→success, `unmapped`→error-adjacent) overrides
  text color only, never the pill's bg — keeps the neutral-pill-with-tinted-text
  pattern already used for booking/order status labels.
- **`app-shell`** — **extrapolated, and the biggest structural addition beyond the
  source.** A marketing page has no persistent navigation chrome; a dashboard
  categorically does. `DashboardShell` (`app/src/components/DashboardShell.tsx`)
  is a fixed-width (`w-64`) `bg-surface-1` sidebar + `bg-canvas` top bar, replacing
  the earlier flat stack-of-link-buttons layout entirely: role-aware nav groups
  (brand/provider/admin each see a different, section-labeled nav tree — Catalog /
  Fulfillment / Marketplaces for brand, a flat list for provider, a single item for
  admin), active-route highlighting via `NavLink`, and a footer user menu (avatar +
  name/role + a `DropdownMenu` for sign-out). Below `md:`, the sidebar becomes a
  `Sheet` (Radix `Dialog`)-based slide-in drawer triggered by a hamburger button in
  the top bar, rather than disappearing — every nav item stays reachable on mobile.
- **`avatar`** — `bg-surface-3` circular fallback showing initials (no avatar
  images anywhere in this app's data model, so `AvatarFallback` is the only variant
  used). Radix `react-avatar`, same token pattern as every other surface.
- **`dropdown-menu`** / **`sheet`** — Radix `react-dropdown-menu` / `react-dialog`
  under the hood; menu surfaces use `{colors.surface-2}` (one step up from `card`'s
  `surface-1`, matching the "popovers sit above cards" elevation convention
  already implied by the surface ladder), the sheet panel uses `{colors.surface-1}`
  like `card`.
- **`empty-state`** — **extrapolated**, and upgraded alongside the shadcn adoption:
  now a dashed-border `{colors.hairline}` box with a small centered icon (`lucide-react`'s
  `Inbox`) above the `{colors.ink-subtle}` `{typography.body-sm}` text, instead of bare
  text — every list page already has an "nothing here yet" message; this just gives
  it a real empty-state treatment instead of a stray line of text.
- **`error-text`** — text `{colors.error}`, `{typography.body-sm}`, now paired with a
  small `AlertCircle` icon (`lucide-react`) for faster visual scanning. Extension
  beyond the source (see Colors section).

## Do's and Don'ts

Same as the source, plus dashboard-specific additions:

- Do reserve `{colors.primary}` for brand mark, primary CTA, focus ring, link emphasis —
  never a background fill, never a card color.
- Do use the four-step surface ladder for hierarchy; don't skip levels.
- Do keep `{colors.error}`/`{colors.success}` as the *only* other chromatic colors —
  no third accent color anywhere, including status badges (tint text, not the pill).
- Don't reintroduce Tailwind's default `slate`/`red`/`green` palette classes directly in
  a page — always go through the tokens (Tailwind `@theme` variables, see below) so a
  future palette change is a one-file edit, not a grep-and-replace across every page.
- Don't add a manual theme toggle — dark/light already follows OS preference via
  Tailwind's `dark:` variant (`prefers-color-scheme`); no `ThemeProvider`/localStorage
  toggle exists in this app, and none is being added as part of this restyle.

## Implementation notes (FBP-specific, not in the source)

- Tokens are wired into Tailwind v4 as CSS custom properties in `app/src/index.css`'s
  `@theme` block — `bg-canvas`, `text-ink`, `border-hairline`, etc. become real
  utility classes. Dark values are the `@theme` defaults (`prefers-color-scheme: dark`
  is more visually "correct" as this app's primary mode, matching the source's
  dark-only marketing site); light values override via `@media (prefers-color-scheme: light)`.
- Shared primitives live in `app/src/components/ui/` (`Button.tsx`, `Card.tsx`,
  `TextField.tsx`, `SelectField.tsx`, `StatusBadge.tsx`, `ListRow.tsx`,
  `EmptyState.tsx`, `ErrorText.tsx`, plus the shell-only `Avatar.tsx`,
  `DropdownMenu.tsx`, `Sheet.tsx`, `Separator.tsx`) — pages compose these instead
  of hand-rolling utility-class strings, so this system stays a system instead of
  decaying back into ad-hoc classes the next time a page is touched. Every
  primitive's public prop API (`label`, `variant`, `tone`, plain children) was kept
  identical across the shadcn/Radix rewrite, so no page file needed to change to
  pick up the new look — only `components/ui/*` and `DashboardShell.tsx` did.
  `app/src/lib/utils.ts` exports the `cn()` helper (`clsx` + `tailwind-merge`) every
  primitive uses to merge its own classes with a caller-supplied `className`.
- **No webfont CDN.** Went in planning to load Inter/JetBrains Mono via a Google Fonts
  `<link>`; reverted after it failed in this sandbox's network-restricted environment
  (`ERR_CONNECTION_RESET` — the sandbox's proxy blocks it, confirmed via Eyes). Rather
  than treat that as sandbox-only noise, reconsidered the dependency itself: an external
  font CDN is one more thing that can fail/slow-load for a real user too, for a
  B2B dashboard where the system UI font is a perfectly reasonable look. Font stacks
  lead with the system font; `Inter`/`JetBrains Mono` sit at the end as fallbacks that,
  practically, never activate. Revisit with a self-hosted `@font-face` (no CDN
  round-trip) if exact Inter rendering ever becomes a real requirement.

## Known Gaps

- Light-theme color values are invented (see Colors section) — the source only
  documents Linear's dark marketing site. If FBP later gets real brand guidance for a
  light theme, replace this section's values, not the dark ones.
- Marketing-only source components (`pricing-card`, `testimonial-card`, `cta-banner`,
  `customer-logo-tile`, `pricing-tab`, `top-nav`'s centered-links variant) are
  intentionally not implemented — no dashboard use for them.
- No manual light/dark toggle exists; theme follows OS preference only (see Do's/Don'ts).
