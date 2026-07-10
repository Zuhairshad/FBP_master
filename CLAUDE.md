<!-- INSTALL: <repo-root>/CLAUDE.md  (commit it — this is shared team knowledge) -->

# CLAUDE.md — FBP (Fulfillment By People) — rebuild

This file holds **facts about this repo**. Discipline (evidence, recon, verification ladder,
teaching) comes from the global contract and applies here in full.

The imports below are the loading mechanism: Claude Code inlines each file into
context at session launch, and re-reads them from disk after `/compact`. They are
binding, not reference material. (Sanity-check once per machine with `/memory`.)

@WORKFLOW.md
@TESTING.md
@SKILLS.md

## What this is

FBP (Fulfillment By People) is a multi-platform fulfillment management SaaS: it connects
Brands (sellers) with Fulfillment Providers (warehouse owners) and syncs orders from
marketplaces (Amazon, TikTok, eBay, Walmart, Shopify) into the provider's dashboard. This
repo is a **from-scratch rebuild** of an existing PHP/Laravel + React version on a new stack
(React/Vite SPA + Supabase + Cloudflare Workers) — see `Overrides` for why. **Current state:**
auth + role model built (Phase 1 of `ROADMAP.md`) — sign-up/sign-in, brand/provider/admin roles,
RLS on `profiles`. Phase 2 built on top: provider warehouse setup (`warehouses` +
`warehouse_services` + `storage_spaces`) and brand product listings (`products`, Master SKU),
both owner-only RLS with a role check on insert. Phase 3 built on top of that: a directory
so brands can browse providers/warehouses, a brand↔provider booking request flow
(`booking_requests`, pending/approved/rejected), and brand-owned `inventory` that becomes
visible to a provider once a booking is approved. Phase 4 built on top of that: `sku_mappings`
resolves a marketplace SKU back to a brand's Master SKU, brand-owned via a trigger-derived
`brand_id`. No marketplace integrations exist yet. No real users, no real money.

## Commands (verified — if one fails, fix the script or this doc, never work around silently)

| Task | Command |
|---|---|
| Dev server (app) | `pnpm dev:app` |
| Dev server (worker) | `pnpm dev:worker` |
| Typecheck (all) | `pnpm typecheck` |
| Lint (all) | `pnpm lint` |
| Unit/integration tests (all) | `pnpm test` |
| Single test file | `pnpm --filter app exec vitest run <path>` (or `--filter worker`) |
| E2E | not yet wired — `e2e/visual.spec.example.ts` is still a template. Playwright itself IS installed (root devDependency) so `scripts/eyes.mjs` can run. |
| Build (all) | `pnpm build` |
| DB: new migration | `pnpm db:new <name>` |
| DB: apply locally | `pnpm db:reset` (requires Docker + `supabase start`) |
| DB: regen types | `pnpm db:types` (writes `app/src/types/database.ts`) |
| Worker: local | `pnpm dev:worker` |
| Worker: validate deploy | `pnpm --filter worker deploy:dry-run` |

## Repo map

- `app/` — React 19 + Vite + TypeScript SPA. Tailwind v4 via `@tailwindcss/vite`. `react-router`
  for client-side routing. `src/lib/supabase.ts` is the **browser** Supabase client (publishable
  key only, RLS-enforced). `src/hooks/` (auth context/provider/hook), `src/components/`
  (route guards, shared UI), `src/pages/` (routed pages), `src/types/database.ts` (Supabase
  types — regenerate with `pnpm db:types`, never hand-edit once real).
- `worker/` — Cloudflare Worker (TypeScript). `src/index.ts` is the fetch handler — this is
  where all privileged logic will live: marketplace webhooks, OAuth token refresh, order
  sync, anything holding the Supabase service-role key or marketplace secrets.
- `supabase/` — local Supabase config (`config.toml`), `migrations/` (the only legitimate way
  schema changes happen), and `tests/` (pgTAP RLS policy tests, run via `supabase test db`).
- `.claude/` — engineering-os hooks (`floor.sh`, `commit-gate.sh`, `remind.sh`) and the `/task`
  command.
- `e2e/` — Playwright specs. Currently only `visual.spec.example.ts` — rename to `visual.spec.ts`
  and list real routes once pages exist.
- `scripts/eyes.mjs` — dev-loop UI screenshot + console-error check (desktop + mobile).

## Architecture facts

Browser (`app/`) talks to Supabase directly with the anon key for reads/writes authorized by
Postgres RLS — no custom API layer for simple CRUD. Anything privileged — calling
Amazon SP-API / eBay / Walmart / Shopify / TikTok APIs, refreshing OAuth tokens, receiving
per-brand marketplace webhooks, running scheduled order sync — goes through the Cloudflare
Worker (`worker/`), which holds the service-role key and per-marketplace secrets via
`wrangler secret put` (`.dev.vars` locally, gitignored).

**Auth model (built, Phase 1):** Supabase Auth handles credentials; `public.profiles` (one row
per `auth.users` row, `role` enum: `brand`/`provider`/`admin`) is populated by the
`handle_new_user` trigger from sign-up metadata. **Brand and provider are self-service** (picked
at sign-up); **admin is never self-service** — the trigger silently forces any self-service
signup requesting `admin` down to `brand`, and a `prevent_role_change` trigger blocks changing
`role` after creation even via an otherwise-permitted `UPDATE`. RLS on `profiles`: anon has no
access; mutation (`UPDATE`) is owner-only; **read is directory-open to any authenticated user**
as of Phase 3 (see below) — see `supabase/tests/profiles_rls.test.sql`.
`ProtectedRoute` (unauthenticated → `/sign-in`) and `RequireRole` (wrong role → own dashboard)
are the client-side route guards; real authorization is still RLS, not the route guard.

**Core data model (built, Phase 2):** `warehouses` (provider-owned, `provider_id` →
`profiles.id`) with child tables `warehouse_services` and `storage_spaces` (ownership derived
via the parent warehouse — no `provider_id` column on the children, RLS policies join up to
`warehouses`); `products` (brand-owned, `brand_id` → `profiles.id`, unique per-brand
`master_sku` — the anchor Phase 4's `sku_mappings` will resolve marketplace SKUs back to).
RLS on all four: owner-only, **plus a role check in the `INSERT` policy's `WITH CHECK`**
(`profiles.role = 'provider'`/`'brand'`) — ownership alone (`auth.uid() = provider_id`) would
let a brand account insert a row into `warehouses` under its own id, since nothing else stops
it; the role check closes that. See `supabase/tests/warehouses_rls.test.sql` and
`products_rls.test.sql`. Frontend: `/provider/warehouses` (`WarehousesPage`) and
`/brand/products` (`ProductsPage`) query Supabase directly (no Worker involved — plain
RLS-authorized CRUD, per the Architecture facts rule above).

**Booking flow + inventory visibility (built, Phase 3):** three new migrations on top of
Phase 2's schema —
1. **Directory visibility** (`20260710133050_extend_directory_visibility.sql`): adds a
   permissive `to authenticated using (true)` SELECT policy to `profiles`, `warehouses`,
   `warehouse_services`, and `storage_spaces`, layered on top of (not replacing) their
   existing owner-only policies — Postgres ORs multiple permissive policies together, so
   mutation stays owner-only while read becomes directory-open. This is a deliberate,
   **reversible** widening of Phase 1/2's security model: a brand must be able to see a
   provider's identity and available storage space *before* any relationship exists between
   them, which owner-only RLS categorically can't support. No secret or email lives in any
   of these tables, so the exposure is low. Updated `profiles_rls.test.sql` and
   `warehouses_rls.test.sql` accordingly (their old "other user sees nothing" assertions are
   now "other user can read, but still can't mutate").
2. **`booking_requests`** (`20260710133104_create_booking_requests.sql`): a brand requests
   one of a provider's `storage_spaces`; the provider approves or rejects. `provider_id` is
   never client-supplied — a `SECURITY DEFINER` `BEFORE INSERT` trigger
   (`set_booking_request_provider_id`) derives it from the storage space's owning warehouse,
   so a brand can't misdirect a request. RLS: only the two parties (`brand_id`/`provider_id`
   matching `auth.uid()`) can `SELECT`; only a `brand`-role account can `INSERT` (same
   role-check pattern as Phase 2); only the provider can `UPDATE` (approve/reject) — brand
   has no update policy at all, so a request is immutable to its creator once submitted. A
   second trigger (`protect_booking_request_updates`) blocks changing
   `brand_id`/`provider_id`/`storage_space_id` via that same permitted `UPDATE` and bumps
   `updated_at`.
3. **`inventory`** (`20260710133106_create_inventory.sql`): brand-owned stock levels per
   warehouse (`product_id`, `warehouse_id`, `quantity`, unique per product+warehouse).
   Visible to the owning brand always; visible to a provider **only** through an existing
   `booking_requests` row with `status = 'approved'` connecting that brand to a storage space
   in the same warehouse — no direct ownership column, so visibility is derived entirely by
   joining through the booking relationship. This migration also extends `products`' RLS
   (owner-only since Phase 2) with the same approved-booking predicate
   (`products_select_via_approved_booking`), since a provider viewing visible inventory needs
   to resolve the product's name/SKU too, not just an opaque `product_id`.

Frontend: `/brand/bookings` (`BookingsPage` — browse + request), `/brand/inventory`
(`InventoryPage` — set stock levels), `/provider/bookings` (`ProviderBookingsPage` —
approve/reject), `/provider/inventory` (`ProviderInventoryPage` — read-only), all plain
RLS-authorized CRUD against Supabase directly, same pattern as Phase 2.

**SKU mapping (built, Phase 4):** `sku_mappings` (`20260710135941_create_sku_mappings.sql`)
resolves a marketplace-assigned `platform_sku` back to a brand's `products` row
(`product_id`), so Phase 5+'s order sync has something to resolve incoming SKUs against.
`platform` is a new enum (`amazon`/`tiktok`/`ebay`/`walmart`/`shopify`). Uniqueness is
"one brand can't map the same `platform_sku` twice per platform" — `(brand_id, platform,
platform_sku)` — but a unique constraint can't span the join to `products.brand_id`, so
`brand_id` is denormalized onto `sku_mappings` itself, set by a `BEFORE INSERT`
`SECURITY DEFINER` trigger (`set_sku_mapping_brand_id`, same shape as `booking_requests`'
`provider_id` derivation) that resolves it from `product_id`. This derivation does double
duty as the authorization check: unlike `products`/`warehouses` (self-referential ownership,
needed an explicit role check in `INSERT`'s `WITH CHECK`), here `brand_id` always resolves
to the product's *actual* owner regardless of who's inserting, so a brand attempting to map
a SKU onto another brand's `product_id` gets its own id overwritten by the trigger and then
rejected by `WITH CHECK` for not matching — no separate role check needed, since `products`'
own insert policy already gates who could own a product in the first place. RLS: owner-only
select/insert/delete, **no update policy** — a wrong mapping is deleted and recreated, not
edited in place (ASSUMPTION: simplest option given no UI need for it yet). Frontend:
`/brand/sku-mappings` (`SkuMappingsPage`) — form to add one mapping at a time + list with
delete; the roadmap's Phase 4 goal specifies "bulk entry", which this does **not** yet do
(see `ROADMAP.md` scope note) — single-row entry only, matching `ProductsPage`/
`InventoryPage`'s existing form pattern.

**Not yet built (ASSUMPTION, will change as features land):** the marketplace integrations
themselves (Phase 5+) — the target shape carried over from the prior version's design.

## Stack rules

### TypeScript
- `strict` is on in both `app/` and `worker/` — verified in `tsconfig.app.json` /
  `tsconfig.node.json` / `worker/tsconfig.json`. Never silence an error with `any`, `as`, or
  `@ts-ignore` — fix the type.
- Generated types are the source of truth (`app/src/types/database.ts` from Supabase, once
  generated). Never hand-edit; regenerate with `pnpm db:types`.
- Exhaustive `switch` over unions with a `never` default. Model states with discriminated
  unions, not boolean flags.

### React (Vite SPA — no meta-framework)
- Plain client-rendered SPA. Routing is `react-router` (v8, the unified package — `BrowserRouter`
  / `Routes` / `Route`, no data-router/loader features used yet).
- Data access: Supabase client directly from components/hooks for anything RLS can authorize
  alone. Anything requiring a secret or third-party call goes through the Worker, called via
  `fetch`.
- One export per file for anything importing React hooks/context (`react/only-export-components`
  in `.oxlintrc.json`) — e.g. `hooks/auth-context.ts` (context + types), `hooks/AuthProvider.tsx`
  (the provider component), `hooks/useAuth.ts` (the hook) are three files, not one, on purpose.
- `.env.local` (gitignored) holds `VITE_*` vars from `app/.env.example`. Anything in a `VITE_*`
  var ships to the client — never put a secret there.

### Supabase
- **Every schema change is a migration** in `supabase/migrations/` (`pnpm db:new <name>`).
  Dashboard-only changes are drift and treated as bugs.
- After any schema change: `pnpm db:reset` locally, **regenerate types
  (`pnpm db:types`), commit them** in the same change.
- **RLS is on for every table.** A new table isn't done until its policies exist and have
  tests (TESTING.md → RLS tests). Assume the anon key is public.
- `service_role` key: Worker context only, never bundled for the client, never logged.
- Local ports (`supabase/config.toml`): API `54321`, Postgres `54322`, pooler `54329`, Studio
  `54323`, inbucket/SMTP `54324`, analytics `54327`. Local-first: develop against
  `supabase start`, not production.
- Supabase CLI is a pinned workspace devDependency (`supabase` in root `package.json`) — run
  via `pnpm exec supabase ...` / the `db:*` scripts, not a global install or `pnpm dlx` (dlx
  re-resolves the version every call).

### Cloudflare Workers
- `worker/wrangler.toml` is the source of truth for bindings; keep the `Env` interface in
  `worker/src/index.ts` in sync with it.
- Workers ≠ Node. `nodejs_compat` is enabled in `wrangler.toml`; still verify each Node API
  used is actually supported before relying on it.
- Secrets via `wrangler secret put` in production, `.dev.vars` (gitignored) locally — never in
  code or committed to `wrangler.toml`.
- Mind the limits: CPU time, subrequest count, body sizes. Long-running order-sync work will
  need a queue/cron approach, not a single request — decide and document here when it's built.
- Tests run in the Workers runtime via `@cloudflare/vitest-pool-workers` (`worker/vitest.config.ts`),
  not plain Node. **Landmine:** this package's v4 line (`0.18.x`, matching Vitest 4) dropped the
  `@cloudflare/vitest-pool-workers/config` subpath and `defineWorkersConfig`. Current API: import
  `{ cloudflareTest }` from the package root, pass it as a Vitest `plugins: [cloudflareTest({ wrangler:
  { configPath: './wrangler.toml' } })]` entry in a config built with `defineConfig` from
  `vitest/config`. Don't reintroduce the old `/config` import from an older tutorial/example.

## Environment & secrets

- `app/.env.example` and `worker/.dev.vars.example` are the contracts — every required var
  listed there with a comment. Adding a var without updating the example breaks the next
  machine.
- Never print secret values in logs, test output, or chat. Refer to them by name.
- Required vars today:
  - `app/.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `worker/.dev.vars`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - More will be added per marketplace integration (Amazon/eBay/Walmart/Shopify/TikTok client
    IDs and secrets) — each addition updates this list and the relevant `.example` file.

## Definition of Done

A change is done when **all** are true:
- [ ] Recon Report produced before the work (non-trivial changes)
- [ ] Floor green after every edit (typecheck + lint + touched-code tests)
- [ ] New/changed behavior has tests at the right level (TESTING.md ladder)
- [ ] Full suite + build green; e2e smoke green for user-facing changes
- [ ] Evidence Block delivered — commands, exit codes, UNVERIFIED list (may be empty)
- [ ] What & Why delivered
- [ ] This file updated if commands, architecture, or landmines changed

## Landmines (living section — append as discovered)

- `@cloudflare/vitest-pool-workers` v4 (`0.18.x`) has no `/config` export — see Cloudflare
  Workers stack rule above. Cost real debugging time during initial scaffold; don't copy an
  older v3-era example verbatim.
- `pnpm dlx supabase init` run from *inside* a `supabase/` directory nests a second
  `supabase/supabase/` — always run Supabase CLI commands (`init`, `migration new`, etc.) from
  the **repo root**, never from inside `supabase/`.
- `.claude/hooks/floor.sh` (Stop-hook "turn" mode) originally hardcoded `npx tsc --noEmit` at
  repo root. That's fine for a single-package repo but this is a pnpm workspace with no root
  `tsconfig.json` — bare `tsc` at root found no project and dumped CLI help instead of
  type-checking, which the hook then treated as a failure. Fixed to run `npm run --if-present
  typecheck`, which delegates to the real `pnpm -r typecheck` in root `package.json`. If a hook
  ever hardcodes a tool invocation instead of calling the repo's own verified script, assume it
  will drift the moment the repo stops being a flat single-package layout.
- New workspace deps with native/native-adjacent postinstall scripts (`workerd`, `esbuild`,
  `sharp`) get silently skipped by pnpm until approved. They're pre-approved via
  `onlyBuiltDependencies` in `pnpm-workspace.yaml` — if a fresh install ever behaves as if
  `wrangler`/`vitest-pool-workers` didn't build, check that list before debugging further.
- `.claude/hooks/floor.sh` (PostToolUse "file" mode) originally hardcoded `npx --no-install
  eslint` on every edited `.ts`/`.tsx` file. This repo has never installed ESLint anywhere —
  we use `oxlint` (see Overrides) — so that `npx` call was silently resolving to an unrelated
  eslint binary from outside the repo and failing on a missing `eslint.config.js`. Fixed to
  walk up from the edited file to the nearest `package.json` and run **that package's own**
  `lint` script, so it works for any linter and both `app/` and `worker/` without hardcoding a
  tool name.
- CI's `pnpm/action-setup@v4` step must **not** pass an explicit `version:` input — root
  `package.json` already pins `"packageManager": "pnpm@10.33.0"`, and the action refuses to
  run at all ("Multiple versions of pnpm specified") when both are set. Let the action read
  the version from `packageManager` alone.
- This sandbox's outbound network policy hard-blocks Docker Hub's registry CDN and `supabase.co`
  directly (403, confirmed via the proxy status endpoint, not a fixable retry). Raw-TCP database
  connections are also categorically unsupported through this session's proxy regardless of
  host. Net effect: **no live DB (local Docker or hosted) is reachable from inside this specific
  sandboxed session** — migrations/RLS tests get authored here and executed/verified by the
  human (or a different, unrestricted session) against a real Postgres. Don't assume this
  limitation applies to every environment this repo is developed in — it's this sandbox's policy,
  not a property of the repo.
- `scripts/eyes.mjs`'s `chromium.launch()` failed with "Executable doesn't exist" the first time
  it ran in this environment — the pre-installed Chromium build (`/opt/pw-browsers`, pinned
  build 1194) didn't match what the installed `@playwright/test` version expected (build 1228).
  Fixed by passing `executablePath: '/opt/pw-browsers/chromium'` explicitly instead of letting
  Playwright resolve its own expected bundled browser.
- Assumed an RLS-blocked cross-user `UPDATE` would raise an error; per Supabase's own security
  guidance (and confirmed while writing `supabase/tests/profiles_rls.test.sql`) it instead
  silently matches zero rows (`UPDATE` requires a `SELECT`-visible row first). Test for the row
  count via `GET DIAGNOSTICS ... = ROW_COUNT`, not `throws_ok`.

## Overrides

- **No Next.js**, despite it being common for this stack combination. This app is entirely
  auth-gated dashboards (brand/provider/admin) with no public/SEO surface — Next.js's main
  value (SSR, ISR, SEO) buys nothing here, and running it on Cloudflare needs the Workers
  adapter and its edge-runtime restrictions for no benefit. Instead: a plain Vite SPA
  (`app/`) deployed as static assets, with **all** privileged/server-side logic in a Cloudflare
  Worker (`worker/`). If a public marketing page is ever needed, build it as a small separate
  static/Astro page rather than pulling the whole app into a meta-framework.
- `app/` uses `oxlint` (shipped by the `create-vite` template) instead of ESLint. Not yet
  reconsidered; revisit if oxlint's rule coverage proves insufficient.
- Playwright (`@playwright/test`, root devDependency) is installed for `scripts/eyes.mjs` as of
  the first real pages (sign-up/sign-in), but `e2e/visual.spec.example.ts` is still a template,
  not a running spec — wire up real `@smoke` e2e once there's a journey worth automating
  end-to-end (not just eyeballing).
