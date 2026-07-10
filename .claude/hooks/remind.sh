#!/usr/bin/env bash
# INSTALL: <repo-root>/.claude/hooks/remind.sh   (chmod +x)
# UserPromptSubmit hook: on exit 0, stdout is injected into context alongside
# the user's prompt — every single turn. This is the heartbeat that keeps the
# contract hot after the session's opening context has scrolled far behind.
# Kept to ONE line on purpose: a paragraph here gets habituated into noise
# and burns context; a line stays sharp.
cat - >/dev/null 2>&1 || true   # drain stdin JSON; content not needed
echo "[contract] recon before write | floor after every edit | VERIFIED/ASSUMPTION labels | Evidence Block before 'done' | UI change -> Eyes + look | end with What & Why"
exit 0
