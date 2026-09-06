# Phase 4 · Wave E · todo 22 (완결) — ⑵ ⑶ ⑷ ⑹ and the `memory_read` cap

**Date:** 2026-09-06 · **Scope:**
`packages/core/src/context/{agent-instructions,agent-hooks,minimal-index}.ts`,
`packages/core/src/index.ts`, `packages/mcp/src/{graph-tools,workspace-risk,
data-brain,hosted,store,index,repo-map}.ts`,
`apps/web/lib/mcp/supabase-store.ts`, `docs/agents/HOOKS.md`,
`tests/minimal-index.test.ts`, `packages/mcp/src/hosted.test.ts`,
`apps/web/lib/mcp/supabase-store.test.ts`, `spec/OPEN_QUESTIONS.md`.

The first todo-22 commit (`a88cece`) did ⑴, ⑸ and the part of ⑵ that had gone
actively wrong. This is the rest, and the checkbox closes with it.

## ⑵ One flow, rendered — not four paraphrases

Four surfaces tell an agent the same thing: the instruction block a repo
installs, the minimal-index PR, `get_graph_schema.text`, and the tool
descriptions. Todo 22 already caught one copy teaching three tools that no
longer existed, so the fix is not a fifth copy but **data**:
`AGENT_FLOW_STEPS` in `@alrescha/core`, from which the sentence and the block
are both rendered.

- **Block ≤300 tokens.** Measured **220** (`estimateTokens`), with a ratchet
  at 240 beside the plan's budget.
- **Forced calls ≤2.** Counted from the same array — `forcedCallsBeforeFirstRead()`
  is **2**, and a test asserts every step after the file-read step is
  unforced. The rule is enforced, not described beside the thing it governs.
- **Cursor tension, stated.** `CURSOR_ALWAYS_APPLY_NOTE` is in the block and
  in the Cursor snippet: `alwaysApply: false`, because a rule applied every
  turn is paid for every turn and WORK_SPEC §1.5 is the promise not to do
  that quietly.
- The minimal index carries the block (17 lines, 365 tokens, inside the
  30-line cap), and `tests/minimal-index.test.ts` now holds a **token** bound
  as well as a line count — a long line costs a session as much as three
  short ones.

**Deviation, deliberate.** The plan's block text opens with
`query_brain(kind:'todo')`. That filter is todo 21's and is not built. A
block naming a call the server would reject is the exact failure this work
exists to prevent, so the step is absent and `hosted.test.ts` pins every tool
the flow names against the registered catalogue.

## ⑶ Hooks that are opt-in and never block

`packages/core/src/context/agent-hooks.ts`, rendered into
`docs/agents/HOOKS.md`, with a test that the doc still carries every snippet
verbatim — a doc that quietly falls behind is worse than none, because
someone pastes the old one.

- **Claude Code SessionEnd → `log_progress`.** WORK_SPEC §11's capture path
  finally has a caller that is not "the model remembered". Bounded (`-m 5`),
  swallowed (`|| true`), and inert without both variables.
- **Claude Code PreToolUse(`Grep|Read`) → advice.** Exits 0 on every path,
  asserted: no `exit 2`, no `deny`. An advisory that can fail a read has made
  the product a gate.
- **Codex — no hook runner**, said plainly, with the same script run by hand
  rather than a pretend hook.
- **Cursor —** an on-demand `.mdc`, `alwaysApply: false`.

## ⑷ `impact_of` says how it knows

- `confidence{resolved, reference, inferred, agent_asserted, unstated}` —
  edge tiers behind the set. A radius from resolved imports and one an agent
  asserted by hand are not the same claim, and one number in front of both
  hides which this is. `unstated` is counted apart, never promoted.
- `bound: 'exact' | 'lower-bound'` with `boundReasons`. `exact` needs three
  things at once: the walk ran out of graph rather than budget, the read
  carried every relation, and no table hit its row limit. An agent reading a
  truncated set as complete concludes the change is safe because it could not
  see what it would break.
- `affected{tests, docs, requirements, routes, tables}` — ids, the same
  ID-first contract as everything else.
- `targetRisk` — todo 21's risk entry for the changed node, or `null`.
  Absent from the map is not "safe", so it is `null` and not a zero. The
  adapter moved to `packages/mcp/src/workspace-risk.ts` so `query_brain` and
  `impact_of` cannot answer the same question two ways.

## ⑹ The banded read

`loadWorkspace(principal, { bands })`. Default is
`structure + evidence + semantic`; `database` and `route` are partial
queries, and `hierarchy` is the third state.

Each requested band reports `complete` / `truncated` / `unsupported` with a
reason, per the 보완. **`hierarchy` is `unsupported`** — directories and
`contains` are excluded from graph answers entirely, so a read that returned
an empty list would be telling a caller this repository has no directories.

The 보완's rule — do not delete before every caller has moved — is honoured
by moving them: `get_graph_schema` and `repo_overview` read every band
(a census that under-counted would teach a caller the workspace has no
routes); `impact_of` reads both partial bands because `affected.routes` and
`affected.tables` *are* its answer; `get_neighbors` and `query_brain` widen
when the caller names a `route`/`database` family or node type. Everything
else stays on the default and makes two fewer round trips.

Asserted:

- **The boundary, from both sides.** At `LIMIT-1`, `LIMIT` and `LIMIT+1` the
  last row inside the budget is in the answer and the one past it is
  reported. (`MCP_WORKSPACE_READ_LIMIT` is 2,000; the plan's 999/1,000/1,001
  was PostgREST's old default, and testing the budget the code actually uses
  is the stronger check.)
- **A band nobody asked for is not read** — `routes` and `db_objects` are
  absent from the query log on a default read, and present when named.
- **Ambiguity, not a pick.** A path in two repositories answers with both
  candidates and `artifact: null`.
- **Batch keeps one result per input**, misses included (already true since
  ⑴; now asserted here too).

## ⑴'s last clause: the `memory_read` cap

Newest first, default 25, max 200, and the answer says how many the cap left
out. Uncapped, a workspace that had been writing memory for a year answered
with all of it — the block meant to make a session cheap was making it
expensive.

## Measured

| | tools | tokens |
|---|---|---|
| before todo 22 | 23 | 9,995 |
| after ⑴ + ⑸ | 20 | 2,704 |
| after `report_session_usage` (todo 23) | 21 | 2,890 |
| after the `memory_read` cap | 21 | **2,914** |

Every rise was caught by the ratchet first, which is what it is for. The
ratchet stands at 2,950.

Instruction block: **220 tokens** (budget 300). Minimal index section: 365
tokens, 17 lines (cap 30). Forced calls before the first file read: **2**.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
— **171 files, 1,496 passed, 1 skipped** (from 170/1,478) —
`node --import tsx scripts/verify-scope-boundaries.ts` PASS (12 boundaries,
347 files). OQ-024 updated with what changed and what was **not** re-measured.

## Still not done

- **21 tools, not ≤16, and 2,914 tokens, not ≤1,500.** Measured unreachable
  on this SDK in the first todo-22 pass; OQ-059 carries the arithmetic and
  the remaining consolidation candidates. The ratchet is the substitute.
- **No real-client compat pass.** The `toolResult` double serialisation stays
  until Claude Code, Codex and Cursor have been tried against it — the plan
  makes the pass a precondition for the cleanup, and this machine has run
  none of them. The hook snippets are likewise untested against a live
  Claude Code install.
- **`query_brain(kind:'todo')`** is todo 21's and still missing; the flow
  block omits the step rather than naming a call that would fail.
