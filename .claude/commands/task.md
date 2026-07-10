---
description: Run any task through the full engineering loop (WORKFLOW.md)
---
Task: $ARGUMENTS

Execute this through the loop in WORKFLOW.md, no steps skipped:

1. Recon first — produce the Recon Report (SKILLS.md §1) before writing any code.
   Every claim VERIFIED (file:line) or labeled ASSUMPTION.
2. If the change spans >2 files, touches foundation code, or hits an ask-trigger
   (global contract §3): present the Plan (SKILLS.md §2) and wait.
3. Build Loop: smallest slice → floor → next. Bug fixes start with a failing test.
4. UI touched → Eyes (SKILLS.md §9): run scripts/eyes.mjs on affected routes,
   open the screenshots, and actually look before proceeding.
5. Verify: run the correct ladder rung (TESTING.md) and produce the Evidence
   Block, including the UNVERIFIED list.
6. Review the full diff as a hostile reviewer (SKILLS.md §6).
7. Finish with the What & Why (SKILLS.md §8) and, if the session was
   substantial, a Handoff with landmines appended to CLAUDE.md.
