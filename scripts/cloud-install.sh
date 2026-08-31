#!/bin/bash
# Claude Code cloud-session bootstrap. Local sessions exit immediately —
# only the cloud sandbox (CLAUDE_CODE_REMOTE=true) clones fresh and needs
# workspace deps installed before lint/typecheck/vitest can run.
# Playwright browsers are intentionally NOT installed here (heavy);
# run `pnpm exec playwright install chromium` before e2e work.
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi
set -euo pipefail
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
