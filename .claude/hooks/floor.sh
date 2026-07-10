#!/usr/bin/env bash
# INSTALL: <repo-root>/.claude/hooks/floor.sh   (chmod +x)
# The mechanical floor. Prompts ask; hooks enforce.
#
#   floor.sh file  -> PostToolUse on Edit|Write: fast lint on the changed file
#   floor.sh turn  -> Stop hook: typecheck + lint before the turn may end (fast)
#
# The heavy gate (tests + build + smoke) moved to commit-gate.sh, where blocking
# is stateless and repeatable — no Stop-loop risk, no one-strike weakness.
#
# Exit codes (Claude Code hook contract):
#   0 = pass, proceed
#   2 = BLOCK — stderr is fed back to the agent, which must fix and retry

set -u
MODE="${1:-turn}"
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

INPUT="$(cat 2>/dev/null || true)"

json_get() { # json_get <key> — best-effort extraction without hard jq dependency
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r "$1 // empty" 2>/dev/null
  else
    printf '%s' "$INPUT" | python3 -c '
import json,sys
try:
    d = json.load(sys.stdin)
    for k in sys.argv[1].lstrip(".").split("."):
        d = d.get(k, {}) if isinstance(d, dict) else {}
    print(d if isinstance(d, str) else ("true" if d is True else ""))
except Exception:
    pass' "$1" 2>/dev/null
  fi
}

fail() { echo "FLOOR FAILED ($1). Fix before continuing:" >&2; echo "$2" | tail -40 >&2; exit 2; }

if [ "$MODE" = "file" ]; then
  FILE="$(json_get .tool_input.file_path)"
  case "$FILE" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
    *) exit 0 ;;
  esac
  [ -f "$FILE" ] || exit 0
  if [ -f package.json ]; then
    OUT="$(npx --no-install eslint --max-warnings=0 "$FILE" 2>&1)" \
      || fail "eslint: $FILE" "$OUT"
  fi
  exit 0
fi

# ---- MODE turn: end-of-turn gate (kept fast so it never gets disabled) -------
[ "$(json_get .stop_hook_active)" = "true" ] && exit 0
[ -f package.json ] || exit 0

OUT="$(npx --no-install tsc --noEmit 2>&1)" || fail "typecheck" "$OUT"
OUT="$(npm run --if-present lint 2>&1)"     || fail "lint" "$OUT"

exit 0
