# Opt-in harness hooks

Phase 4 Wave E todo 22 ⑶. Nothing here is installed by Alrescha — these
are snippets you paste, and each one is inert until you set its
environment variable. A harness that starts calling home because a scan
ran is the behaviour ADR-011 exists to forbid.

Two rules hold over all of it:

- **Opt-in.** No variable, no call. Every script exits 0 immediately.
- **Never blocking.** The `Read`/`Grep` hook advises and exits 0 on every
  path. An advisory that can fail a tool call has made this product a
  gate, and a gate that is wrong once is a gate nobody installs twice.

`packages/core/src/context/agent-hooks.ts` is the source; this page is
generated from it and `agent-instructions.test.ts` holds the two apart
from drifting.

## Claude Code

### Claude Code — hook registration

Wires both hooks below. Neither runs without ALRESCHA_MCP_ENDPOINT set.

`.claude/settings.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "command": ".claude/hooks/alrescha-search-first.sh",
            "type": "command"
          }
        ],
        "matcher": "Grep|Read"
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "command": ".claude/hooks/alrescha-log-progress.sh",
            "type": "command"
          }
        ]
      }
    ]
  }
}
```

### Claude Code — SessionEnd → log_progress

One log_progress call when a session ends. Times out at five seconds and swallows every failure.

`.claude/hooks/alrescha-log-progress.sh`

```sh
#!/usr/bin/env sh
# Inert without both variables — that is the opt-in.
[ -n "$ALRESCHA_MCP_ENDPOINT" ] && [ -n "$ALRESCHA_MCP_TOKEN" ] || exit 0
summary=$(git log -1 --pretty=%s 2>/dev/null || echo "session ended")
curl -sS -m 5 -X POST "$ALRESCHA_MCP_ENDPOINT" \
  -H "Authorization: Bearer $ALRESCHA_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(printf '%s' "$summary" | tr -d '\\"' | sed 's/.*/{"jsonrpc":"2.0","id":1,"method":"tools\\/call","params":{"name":"log_progress","arguments":{"task":"&","status":"done","summary":"&"}}}/')" \
  >/dev/null 2>&1 || true
# A telemetry call that fails a session costs more than it records.
exit 0
```

### Claude Code — PreToolUse(Grep|Read) → search_index advice

Suggests search_index before a Read or Grep. Advisory: it exits 0 on every path and blocks nothing.

`.claude/hooks/alrescha-search-first.sh`

```sh
#!/usr/bin/env sh
# Advisory only. This hook never blocks: it exits 0 on every path.
[ -n "$ALRESCHA_MCP_ENDPOINT" ] || exit 0
echo "alrescha: one \`search_index\` call answers with ids and paths; at most 2 calls before reading a file."
exit 0
```

## Codex

### Codex — no hook runner, one documented convention

Codex loads AGENTS.md but runs no hooks; the same script is invoked by hand or from a wrapper.

`AGENTS.md`

```text
# Alrescha (optional)

Codex has no hook runner, so this is a convention rather than a hook:
run the same script from your own shell wrapper when a task unit ends.

    sh .claude/hooks/alrescha-log-progress.sh

It is inert without ALRESCHA_MCP_ENDPOINT and ALRESCHA_MCP_TOKEN.
```

## Cursor

### Cursor — an on-demand rule, not an always-applied one

alwaysApply stays false on purpose: a rule applied every turn is paid for every turn.

`.cursor/rules/alrescha.mdc`

```text
---
description: Alrescha graph lookups
alwaysApply: false
---

Prefer one `search_index` call over a repository-wide grep.
At most 2 calls before reading a file.
```

## The flow these hooks point at

```text
## Working with this project's graph
- Start with one `search_index` call. It answers with ids and paths; that is the point.
- Use `get_neighbors`, `trace_path` or `impact_of` only for a relational question — a path, an impact, a dependency.
- Then read the file. After three lookups without an answer, read it anyway — the graph is an index, not an oracle.
- Before editing a file this graph calls risky, call `impact_of` once and read `bound` — `lower-bound` means the answer is a floor, not a list.
- When a task unit is done: `log_progress` once, `memory_write` at most once. `assert_link` and `record_ruled_out` only when there is something to record.
- At most 2 calls before you read a file.
- Do not mark this rule `alwaysApply`. It is a map to read once, not a policy to re-read every turn — a block that loads on every message costs more than the lookups it replaces.
```
