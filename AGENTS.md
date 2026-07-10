<!-- INSTALL: <repo-root>/AGENTS.md — read by Cursor, Antigravity, Codex, Zed, and other agents. -->

# Agent Instructions

Before doing any work in this repository, read these files. They are binding, in this order:

1. `CLAUDE.md` — repo facts: commands, architecture, stack rules, landmines.
2. `TESTING.md` — the verification ladder. Nothing is "done" without its evidence block.
3. `SKILLS.md` — the playbooks (Recon, Plan, Build Loop, Verify, Bughunt, Review, Handoff, Teach).

Core invariants, in case the files above are unavailable: never edit a file you haven't
read this session; label every claim VERIFIED or ASSUMPTION; typecheck + lint + touched
tests after every edit; failing test before every bug fix; full suite + build before
claiming done; end non-trivial work with a What & Why explanation.
