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
(React/Vite SPA + Supabase + Cloudflare Workers) — see `Overrides` for why. **Current state:
bare scaffold.** No auth, no dashboards, no marketplace integrations exist yet. No real users,
no real money.

## Commands (verified — if one fails, fix the script or this doc, never work around silently)

| Task | Command |
|---|---|
| Dev server (app) | `pnpm dev:app` |
| Dev server (worker) | `pnpm dev:worker` |
| Typecheck (all) | `pnpm typecheck` |
| Lint (all) | `pnpm lint` |
| Unit/integration tests (all) | `pnpm test` |
| Single test file | `pnpm --filter app exec vitest run <path>` (or `--filter worker`) |
| E2E | not yet wired — no routes exist; see `e2e/visual.spec.example.ts` |
| Build (all) | `pnpm build` |
| DB: new migration | `pnpm db:new <name>` |
| DB: apply locally | `pnpm db:reset` (requires Docker + `supabase start`) |
| DB: regen types | `pnpm db:types` (writes `app/src/types/database.ts`) |
| Worker: local | `pnpm dev:worker` |
| Worker: validate deploy | `pnpm --filter worker deploy:dry-run` |

## Repo map

- `app/` — React 19 + Vite + TypeScript SPA. Tailwind v4 via `@tailwindcss/vite`. `src/lib/supabase.ts`
  is the **browser** Supabase client (anon key only, RLS-enforced).
- `worker/` — Cloudflare Worker (TypeScript). `src/index.ts` is the fetch handler — this is
  where all privileged logic will live: marketplace webhooks, OAuth token refresh, order
  sync, anything holding the Supabase service-role key or marketplace secrets.
- `supabase/` — local Supabase config (`config.toml`) and `migrations/` — the only legitimate
  way schema changes happen.
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

**Not yet built (ASSUMPTION, will change as features land):** auth model (brand/provider/admin
roles), the SKU-mapping schema, and the marketplace integrations themselves. Nothing below
this line is implemented — it's the target shape carried over from the prior version's design.

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
- Plain client-rendered SPA, no SSR/routing framework yet. If/when routing is added, note the
  choice and pattern here.
- Data access: Supabase client directly from components/hooks for anything RLS can authorize
  alone. Anything requiring a secret or third-party call goes through the Worker, called via
  `fetch`.
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
  - `app/.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
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
- Playwright e2e is not installed yet (`e2e/visual.spec.example.ts` is a template, not a
  running spec) — there are no routes to test. Wire it up alongside the first real page.
