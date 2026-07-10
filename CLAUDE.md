<!-- INSTALL: <repo-root>/CLAUDE.md  (commit it — this is shared team knowledge) -->

# CLAUDE.md — {{PROJECT_NAME}}

> **GENERATOR NOTE — read first, delete when done.**
> If any `{{placeholder}}` remains in this file, do not start feature work. Run the
> **Recon: full-repo** playbook from `SKILLS.md` and fill every section **from evidence** —
> read `package.json`, lockfile, `tsconfig.json`, `wrangler.toml`, `supabase/`, CI config,
> and the source tree. Never invent a command; every command below must have been executed
> or read from a script definition. A wrong CLAUDE.md is worse than none: agents trust it.

This file holds **facts about this repo**. Discipline (evidence, recon, verification ladder,
teaching) comes from the global contract and applies here in full.

The imports below are the loading mechanism: Claude Code inlines each file into
context at session launch, and re-reads them from disk after `/compact`. They are
binding, not reference material. (Sanity-check once per machine with `/memory`.)

@WORKFLOW.md
@TESTING.md
@SKILLS.md

## What this is

{{One paragraph: the problem, the users, current state (prototype / production / migrating). Include what "production" means here — real users? real money?}}

## Commands (verified — if one fails, fix the script or this doc, never work around silently)

| Task | Command |
|---|---|
| Dev server | `{{pnpm dev}}` |
| Typecheck | `{{pnpm tsc --noEmit}}` |
| Lint | `{{pnpm lint}}` |
| Unit/integration tests | `{{pnpm test}}` |
| Single test file | `{{pnpm vitest run path/to/file.test.ts}}` |
| E2E | `{{pnpm playwright test}}` |
| E2E smoke only | `{{pnpm playwright test --grep @smoke}}` |
| Build | `{{pnpm build}}` |
| DB: new migration | `{{supabase migration new <name>}}` |
| DB: apply locally | `{{supabase db reset}}` |
| DB: regen types | `{{supabase gen types typescript --local > src/types/database.ts}}` |
| Worker: local | `{{wrangler dev}}` |
| Worker: validate deploy | `{{wrangler deploy --dry-run}}` |

## Repo map

{{Top-level directories, one line each. Where features live, where tests live, where shared code lives. Example:
- `app/` — Next.js App Router routes and pages
- `src/lib/` — shared logic (pure where possible)
- `src/components/` — React components
- `workers/` — Cloudflare Workers
- `supabase/migrations/` — the only legitimate way schema changes
- `e2e/` — Playwright specs}}

## Architecture facts

{{The data flow in text: e.g. "Browser → Next.js server action → Supabase (RLS) → revalidate. Async work: Supabase webhook → CF Worker → external API." Auth model: who can do what, where it's enforced. External services and which env vars they need.}}

## Stack rules

Delete sections that don't apply to this repo.

### TypeScript
- `strict` stays on. Never silence an error with `any`, `as`, or `@ts-ignore` — fix the type. If an escape hatch is genuinely required, it carries a comment explaining why.
- Generated types are the source of truth (`{{src/types/database.ts}}` from Supabase). Never hand-edit generated files; regenerate.
- Exhaustive `switch` over unions with a `never` default. Model states with discriminated unions, not boolean flags.

### Next.js
- App Router. Server Components by default; `'use client'` only where interactivity requires it, as low in the tree as possible.
- Every server action and route handler: validate input at the boundary ({{zod}}) and check auth **inside** the action — middleware alone is not authorization.
- Secrets and service-role keys exist only in server code. Anything imported by a client component is public.
- After mutations, be deliberate about cache: `revalidatePath`/`revalidateTag` — note this repo's caching decisions here: {{fill}}.

### Supabase
- **Every schema change is a migration** in `supabase/migrations/`. Dashboard-only changes are drift and treated as bugs.
- After any schema change: apply locally, **regenerate types, commit them** in the same change.
- **RLS is on for every table.** A new table isn't done until its policies exist and have tests (see TESTING.md → RLS tests). Assume the anon key is public.
- `service_role` key: server/Worker context only, never in anything bundled for the client, never logged.
- Local-first: develop against `supabase start`, not production. {{Note the local ports/config here.}}

### Cloudflare Workers
- `wrangler.toml` is the source of truth for bindings; keep the `Env` type in sync with it: {{path to Env type}}.
- Workers ≠ Node. No `fs`, no Node networking; if `nodejs_compat` is enabled, still verify each API is supported before using it.
- Secrets via `wrangler secret put` — never in code or committed to `wrangler.toml`.
- Mind the limits: CPU time, subrequest count, body sizes. Long work belongs in queues/durable objects, not a single request: {{note this repo's approach}}.
- Tests run in the Workers runtime via `@cloudflare/vitest-pool-workers` (see TESTING.md), not plain Node.

### MongoDB / Express (MERN repos)
- {{Connection handling, where models live, validation layer, error middleware. Fill or delete.}}

## Environment & secrets

- `.env.example` is the contract — every required var listed there with a comment. Adding a var without updating it breaks the next machine.
- Never print secret values in logs, test output, or chat. Refer to them by name.
- Required vars: {{list, grouped by service}}.

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

{{Gotchas that cost someone an hour. Examples of the genre: "the webhook handler double-writes to a deleted DB — do not touch without reading X", "this module predates the type generation, its types lie", "test Y is order-dependent". Every Bughunt and Handoff feeds this list.}}

## Overrides

{{Where this repo deliberately deviates from the global contract or stack rules, and why. Empty is a valid state; silent deviation is not.}}
