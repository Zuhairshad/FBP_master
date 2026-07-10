<!-- INSTALL: <repo-root>/WORKFLOW.md — imported by CLAUDE.md, loaded every session. -->

# The Workflow

One loop, every task. The playbook details live in SKILLS.md; the rungs live in
TESTING.md; this page is the order they happen in and — more important — **what
enforces each step**. Instructions are context; gates are physics. The loop is
designed so the steps that matter most are the ones that don't depend on being
remembered.

## The loop

```
TASK arrives (or: /task <description>)
  │
  1. RECON ............ read before write; Recon Report before code
  2. PLAN ............. if >2 files, foundation code, or any ask-trigger → wait
  3. BUILD LOOP ....... smallest slice → floor → next slice
  4. EYES ............. UI touched? screenshot desktop+mobile, LOOK, fix
  5. VERIFY ........... run the ladder rung → Evidence Block (+ UNVERIFIED list)
  6. REVIEW ........... hostile self-review of the full diff
  7. COMMIT ........... the gate re-runs everything; red cannot commit
  8. TEACH + HANDOFF .. What & Why; landmines → CLAUDE.md
  │
PUSH → CI ship-gate → branch protection → merge
```

## Who enforces what

| Step | Behavioral (context) | Mechanical (gate) |
|---|---|---|
| Recon before write | CLAUDE.md §2 + per-prompt reminder | — (judgment can't be gated) |
| Floor per edit | CLAUDE.md §4 | `floor.sh file` (PostToolUse) |
| Turn can't end red | — | `floor.sh turn` (Stop) |
| Eyes on UI | SKILLS.md §9 | `eyes.mjs` exits red on JS errors |
| Evidence before "done" | CLAUDE.md §4, TESTING.md | — (verify by spot-checking early) |
| Red can't commit | — | `commit-gate.sh` (PreToolUse, stateless) |
| No force-push to main | CLAUDE.md §7 | `commit-gate.sh` hard block |
| Red can't merge | — | `ci.yml` + branch protection |
| Visual drift caught | — | `visual.spec.ts` baselines in CI |
| Teach / What & Why | CLAUDE.md §5 + reminder | — |

Left column decays as context fills. Right column doesn't. Everything
irreversible lives in the right column — that is the design, not an accident.

## Session protocol

**Start.** Claude Code auto-loads `~/.claude/CLAUDE.md`, this repo's
`CLAUDE.md`, and its `@imports` (TESTING.md, SKILLS.md, this file). Trust but
verify once per machine: run `/memory` and confirm all four are listed. If the
project CLAUDE.md still contains `{{placeholders}}`, the only legal first task
is **Recon: full-repo**.

**During.** Every prompt, the UserPromptSubmit hook re-injects a one-line
contract summary — the heartbeat that keeps invariants hot after the opening
context has scrolled into history. Long session? `/compact` is safe: the root
CLAUDE.md and its imports are re-read from disk and re-injected afterward.

**End.** Handoff (SKILLS.md §7). Landmines get appended to CLAUDE.md **now**,
not remembered for later — a landmine in your head is a landmine lost.

## The trust model (why four layers)

1. **Context** — CLAUDE.md + imports. Necessary; sets judgment. Probabilistic.
2. **Heartbeat** — per-prompt reinjection. Fights context-rot drift. Still probabilistic.
3. **Hooks** — floor, turn, commit gate. Deterministic on this machine.
4. **CI + branch protection** — deterministic everywhere, immune to the agent,
   the hooks being edited, and you at 2am.

Rule of placement: the more expensive a mistake, the further right it must be
caught. A style slip is fine at layer 1; a red commit must be impossible at
layer 3; a red merge impossible at layer 4.

## When the agent drifts anyway

It will. Context pressure, a novel situation, an instruction it pattern-matched
past. The correction protocol:

1. **Never scold-and-continue.** A verbal correction fixes one turn and evaporates.
2. Convert every drift into the cheapest durable rule that would have caught it:
   a landmine line in CLAUDE.md → a sentence in the relevant doctrine file →
   a hook check → a CI step. Prefer the rightmost that's proportionate.
3. If the same drift happens twice, the rule wasn't mechanical enough. Move it right.

Rules compound. Scolding doesn't. Six months of this and the system knows more
about your failure modes than any model ever will — which is the point: the
system is the senior engineer; models are interchangeable hands.
