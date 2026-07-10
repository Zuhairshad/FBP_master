<!-- INSTALL: <repo-root>/SKILLS.md — invocable playbooks. In Claude Code these can also be split
     into .claude/commands/<name>.md (slash commands) or .claude/skills/<name>/SKILL.md; the
     single-file form works in any tool that can read markdown. -->

# Playbooks

Named procedures. The human invokes them by name ("run Recon on the checkout flow",
"Bughunt this", "Handoff"). The agent also self-invokes them when their trigger applies —
these are not optional ceremonies, they are how work happens here.

---

## 1. Recon

**Purpose:** line-level understanding of everything a change will touch, before touching it.
**Trigger:** any non-trivial feature, fix, or refactor. Also self-invoke when about to edit
a file not yet read this session — that is the tripwire.

**Mode A — feature-scoped**
1. Locate entry points: which route/page/action/handler/worker/cron starts this behavior?
2. Trace the complete path, hop by hop: UI event → server boundary → business logic → DB →
   response/side effects. Read each file on the path — small files in full; large files,
   every section the change interacts with.
3. Blast radius: grep every symbol to be modified; list **all** call sites. A signature
   change without a call-site list is a gamble.
4. Contracts: the types, schema/migrations, env vars, and external APIs involved. For
   third-party APIs, confirm against the installed version's types, not memory.
5. Prior art: find the closest existing feature; note the patterns to match.

**Mode B — full-repo** (generates/refreshes the project `CLAUDE.md`)
1. Read `package.json` (+ workspace files), lockfile name, `tsconfig`, `next.config`,
   `wrangler.toml`, `supabase/config.toml` + migrations dir, CI config, `.env.example`.
2. Map the tree: purpose of each top-level dir, where tests live, where shared code lives.
3. Execute or trace every command that will be documented — commands enter CLAUDE.md only
   after being seen to exist.
4. Identify the 2–3 core data flows and write them down.
5. Fill every `{{placeholder}}` in `CLAUDE.md` from this evidence; delete the generator note.

**Output — Recon Report:**
```
RECON: <scope>
Entry points: ...
Path: A → B → C (file:line for each hop)
Blast radius: symbol X — 7 call sites (list)
Contracts: tables/types/env vars touched
Prior art: closest pattern is <feature> in <path>
Risks: ...
Open questions: ... (each with a recommended answer)
```

---

## 2. Plan

**Purpose:** agreement on shape before multi-file changes.
**Trigger:** change spans >2 files, touches foundation code, or hits any ask-trigger from
the global contract §3.

1. Goal in one sentence; non-goals explicitly (scope creep dies here).
2. File-by-file change list: path → what changes → why.
3. Test plan mapped to the TESTING.md ladder: which tests will be written/updated, which
   rungs will run.
4. Risk & rollback: what could break, how it's detected, how it's undone.
5. If any ask-trigger applies → present the plan and **wait**. Otherwise state the plan and
   proceed.

---

## 3. Build Loop

**Purpose:** implementation without accumulating unverified state.
**Trigger:** any implementation work.

Repeat: **smallest coherent slice → floor (typecheck + lint + touched tests) → next slice.**
Never stack ten edits before the first verification — a floor failure after one slice has
one suspect; after ten, an archaeology project. Bug fixes enter this loop through Bughunt
(failing test first). When the last slice lands, run the Verify playbook.

---

## 4. Verify

**Purpose:** execute the ladder for the current diff and produce proof.
**Trigger:** claiming a slice/feature complete; before any commit; whenever asked
"is it done?"

1. Determine the rung from what the diff touches (TESTING.md table). When in doubt, the
   higher rung.
2. Run every command for that rung. Any red → back to Build Loop / Bughunt. No exceptions,
   no "it's unrelated" — an unrelated red gets triaged and reported, not ignored.
3. Output the **Evidence Block** (format in TESTING.md), including the UNVERIFIED list with
   exact human-runnable verification steps for each item.

---

## 5. Bughunt

**Purpose:** fix causes, not symptoms, and make the bug impossible to reintroduce silently.
**Trigger:** any defect, test failure, or "this behaves wrong."

1. **Reproduce before theorizing.** A failing test or script that demonstrates the bug.
   Cannot reproduce → say so and gather more evidence; never fix blind.
2. Convert the reproduction into a proper failing test, named after the bug/Linear ID.
3. Localize: trace data through the failing path (recon the path if not already read);
   bisect with logs or `git bisect` when the regression point is unknown.
4. Fix the cause. If the honest fix is bigger than expected, report that instead of
   shipping a patch over the symptom.
5. Failing test now green; run the appropriate rung.
6. One landmine line for `CLAUDE.md` → Landmines: what it was, why it happened, the tell.

---

## 6. Review

**Purpose:** hostile self-review of the diff before handing it over.
**Trigger:** end of any feature/fix, pre-commit.

Read the full diff as a reviewer who wants to reject it:
- **Correctness:** edge cases (empty, null, unicode, huge, concurrent); every promise
  awaited; error paths actually handled, not just logged.
- **Security:** authz checked inside every server entry touched; no injection via string
  building; secrets absent from client bundles, logs, and test output; RLS still airtight.
- **Performance:** N+1 queries, unbounded lists without pagination, obvious hot-path waste.
- **Consistency:** matches the repo's prior art; no drive-by refactors that snuck in.
Findings → fix now or list explicitly in the handoff. Silent known-issues are lies of omission.

---

## 7. Handoff

**Purpose:** institutional memory; the session's value survives the session.
**Trigger:** end of substantial sessions, or on request. Format pastes cleanly into Linear.

```
HANDOFF: <scope>
Decisions: choice + why + what was rejected
Changed: files, one line each
Evidence: (block, or link to it)
Open: TODOs with owner/next step
Landmines: discovered gotchas → propose CLAUDE.md append
Next session should start by: ...
```

---

## 8. Teach — the What & Why

**Purpose:** the human gets stronger with every task; the standing goal is that they could
re-implement the change unaided.
**Trigger:** end of every non-trivial task. Not optional.

```
WHAT & WHY
What changed: ...
Why this design: ... (and the alternatives that lost, with reasons)
Concept spotlight: one idea worth internalizing, + where to read deeper
Verify it yourself: exact steps to confirm this works with no agent involved
```

Register: peer explaining a decision, not tutor simplifying one. Depth over reassurance.

---

## 9. Eyes

**Purpose:** verify the UI by *looking at it*, not by inferring it from green tests.
Passing tests prove behavior; only pixels prove layout.
**Trigger:** any change to components, pages, styles, or layout — before claiming it done.

1. Dev server running. Run `node scripts/eyes.mjs <url of every affected route>`.
   It screenshots desktop + mobile into `.eyes/` and captures console errors,
   page crashes, and failed requests.
2. **Any console/page error = red**, even if the page renders. Fix, rerun.
3. **Open and read every screenshot.** Look for: broken layout, overflow, cut-off
   text, contrast failures, mobile collapse, loading states stuck on screen.
   An unexamined screenshot is an unrun test.
4. Findings → fix → rerun until the screenshots are actually right.
5. Intentional visual change? Update the visual-regression baselines
   (`playwright test e2e/visual.spec.ts --update-snapshots`), eyeball the new
   baseline, and declare the change in the What & Why. Updating a baseline
   without looking is deleting a test.
