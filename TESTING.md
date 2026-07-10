<!-- INSTALL: <repo-root>/TESTING.md — referenced by CLAUDE.md; binding for all agents and humans -->

# Testing Doctrine

Verification **is** the product. Untested code is a hypothesis; a claim without machine
evidence is an opinion. Tokens and minutes spent here are the point, not the cost.

## The ladder — what runs when

The floor is non-negotiable. Higher rungs are triggered by what the change touches.
The reason this is a ladder and not "run everything every time": an instruction that is
impossible to follow gets ignored wholesale, and then nothing runs. The floor is cheap
enough to be unconditional; the full suite gates every claim of "done."

| Rung | Trigger | Runs |
|---|---|---|
| **Floor** | after **every** edit, incl. one-liners | typecheck + lint + tests for touched modules |
| **Slice** | a feature slice complete | floor + integration tests for the changed path |
| **Foundation** | shared code touched (types, utils, auth, db layer, shared components, config) | floor + **full** unit + integration suite |
| **Done-gate** | before "done" / commit | full suite + build + e2e `@smoke` |
| **Ship-gate** | before push / PR / deploy | everything + full e2e (locally or via CI — and CI red means it is not shipped) |

Order for a red result: reproduce → fix code → rerun. Never proceed on red. Never make
red green by weakening the test.

## The types, defined operationally

**Unit** — pure logic in isolation, no I/O. Vitest. Milliseconds each. Mock only at real
boundaries (network, DB, clock, randomness) — a test that mocks the function under test's
collaborators into meaninglessness verifies nothing.

**Functional / component** — behavior through the user's interface. React Testing Library:
render, interact via `userEvent`, assert on what a user sees. Never assert on internal
state, hook internals, or implementation details — those tests break on refactors and pass
on bugs.

**Integration** — real seams working together. Route handlers and server actions executed
against **local Supabase** (`supabase start`), asserting on actual DB side effects, not on
mocks of the DB. Third-party HTTP mocked at the network layer with MSW so the code under
test still exercises its real client. If a test mocks the seam it claims to test, it is
decoration.

**E2E** — full user journeys in a real browser. Playwright. Tag the 3–7 critical paths
`@smoke` (auth, the core create/read/update flow, payment if it exists) — that subset runs
at the done-gate; the full e2e suite runs at the ship-gate. E2E is for journeys, not for
every permutation — permutations live at unit/integration level where they're cheap.

**Smoke** — "is the app alive": the `@smoke` e2e subset, plus `next build` succeeding, plus
`wrangler deploy --dry-run` for Workers. Broken build = failed smoke, whatever the tests say.

**Regression** — a rule, not a suite: **every bug gets a test that fails before the fix and
passes after.** The test is named after the bug (include the Linear ID) and never deleted.
Fixing a bug without capturing it as a test is deferring the same bug to a future date.

**Lint + typecheck** — the cheapest tests owned. Zero warnings policy; a genuinely needed
suppression carries an inline comment with the reason. `tsc --noEmit` is a test run.

## Stack-specific requirements

### Supabase — RLS policy tests (mandatory per table)
RLS is security code; untested policies are unverified security. For each table, test as
three principals against local Supabase:
- **anon** — can access exactly what's intended for the public (usually: nothing).
- **user A** — full intended access to their own rows.
- **user B** — **cannot** read or mutate A's rows. The negative case is the security test.

Mechanics: create clients per principal (anon key + `signInWithPassword` for seeded test
users) and assert both allowed and denied operations. Alternative: pgTAP suites in
`supabase/tests/` run by `supabase test db`. Either way: **new table or policy change =
policy tests in the same change.**

### Cloudflare Workers
Tests run **in the Workers runtime**, not Node — `@cloudflare/vitest-pool-workers` with
`defineWorkersConfig`. Cover: fetch handlers, scheduled handlers, queue consumers, and
binding access (KV/D1/R2/queues via the test env). A Worker test that runs in plain Node
proves the code runs somewhere it will never execute.

### Next.js
- Server actions and route handlers get integration tests (real Supabase local, MSW for
  third parties): happy path, validation rejection, **authorization rejection**.
- Every server entry point has a test proving an unauthorized caller is refused. Missing
  authz is the classic Next.js production bug; the test is cheaper than the incident.

## Non-negotiables

- **Never weaken to pass.** No loosened assertions, no `any` to appease the checker, no
  deleted cases. Spec changed? Say so explicitly first, then change the test.
- **No `.only` / `.skip` in committed code.** A skip needs a ticket and an expiry.
- **Flaky = failing.** Quarantine with a ticket the same day; a suite people rerun until
  green trains everyone to ignore it.
- **Determinism:** fake timers for time, seeded randomness, MSW for network, fresh DB state
  per test (transactions or reset). A test that depends on execution order is broken today,
  discovered later.
- **Coverage is a flashlight, not a target.** The requirement is behavioral: touched code
  has tests for its behaviors and edge cases. 100% lines with assertion-free tests is 0%.
- **Test names state behavior:** `rejects expired tokens with 401`, not `test handleAuth 2`.

## Writing order for a new feature

1. Contract first — types, schema migration, API shape.
2. Failing integration test for the happy path (this is the spec, executable).
3. Unit tests for the interesting logic as it's written.
4. Implement until green; edge cases as units.
5. `@smoke` e2e step if the feature is a critical user path.
6. Ladder from the top of this file, then Evidence Block.

## Evidence Block (required at done-gate and ship-gate)

```
EVIDENCE
  pnpm tsc --noEmit ............ exit 0
  pnpm lint .................... exit 0 (0 warnings)
  pnpm test .................... exit 0 (148 passed)
  pnpm build ................... exit 0
  pnpm playwright test --grep @smoke ... exit 0 (6 passed)
UNVERIFIED
  - webhook path against live Stripe (verify: trigger test event in dashboard)
```

The UNVERIFIED list may be empty. It may never be missing.

## UI verification (two layers, one browser stack)

Both layers run on Playwright's Chromium — the same install used for e2e. One
browser stack, not two: a second automation library doubles the flake surface
and splits the team's knowledge for zero capability gained.

**Layer 1 — Eyes (dev loop):** `node scripts/eyes.mjs <routes>` after every UI
change. Screenshots desktop + mobile, fails red on console errors, page
crashes, or failed requests. Then the screenshots get *looked at* — see
SKILLS.md → Eyes. This is a development discipline, not a committed test.

**Layer 2 — Visual regression (the pixel gate):** `e2e/visual.spec.ts` holds a
committed baseline screenshot per route per viewport; any drift beyond the
threshold is a red test at the ship-gate. Unintended UI change stops being a
surprise in production and becomes a failing check in CI. Baselines are
OS-specific: generate and update them on the CI runner (Linux), never from a
Mac, or the check cries wolf until everyone ignores it. Intentional redesign =
update snapshots + human eyeball + explicit note in the What & Why.
