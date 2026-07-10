#!/usr/bin/env bash
# INSTALL: <repo-root>/.claude/hooks/commit-gate.sh   (chmod +x)
# PreToolUse hook on Bash. Fires before every shell command the agent runs;
# acts only on `git commit` and dangerous pushes, passes everything else through.
#
# Why this is the wall (not the Stop hook): PreToolUse blocking is STATELESS.
# Every commit attempt re-runs the full gate — there is no loop to guard against,
# so there is no one-strike escape. Red code cannot become a commit through this
# agent, period. Note also: this is a Claude Code hook, not a git hook, so
# `git commit --no-verify` does NOT bypass it.
#
# What it does NOT cover: commits a human makes directly in a terminal.
# That hole is closed by CI + branch protection (see .github/workflows/ci.yml).

set -u
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

INPUT="$(cat 2>/dev/null || true)"

get_cmd() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null
  else
    printf '%s' "$INPUT" | python3 -c '
import json,sys
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("command", ""))
except Exception:
    pass' 2>/dev/null
  fi
}

CMD="$(get_cmd)"
[ -n "$CMD" ] || exit 0

# --- Hard blocks: history rewrites against shared branches ---------------------
if echo "$CMD" | grep -Eq 'git[[:space:]]+push[[:space:]].*(--force|-f)([[:space:]]|$)' \
   && echo "$CMD" | grep -Eq '(main|master)'; then
  echo "BLOCKED: force-push to main/master is never allowed. Use a branch + PR." >&2
  exit 2
fi

# --- Commit gate ---------------------------------------------------------------
echo "$CMD" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+commit' || exit 0
[ -f package.json ] || exit 0

fail() { echo "COMMIT BLOCKED ($1 is red). Fix, verify, then commit again:" >&2; echo "$2" | tail -50 >&2; exit 2; }

OUT="$(npm run --if-present typecheck 2>&1)"  || fail "typecheck" "$OUT"
OUT="$(npm run --if-present lint 2>&1)"       || fail "lint" "$OUT"
OUT="$(npm run --if-present test 2>&1)"       || fail "tests" "$OUT"
OUT="$(npm run --if-present build 2>&1)"      || fail "build" "$OUT"

# E2E smoke, only if Playwright is configured in this repo.
if ls playwright.config.* >/dev/null 2>&1; then
  OUT="$(npx --no-install playwright test --grep @smoke 2>&1)" || fail "e2e @smoke" "$OUT"
fi

exit 0
