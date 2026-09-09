# Phase 4 · Wave E · todo 24 — three kinds of number, kept apart

**Date:** 2026-09-06 · **Scope:**
`packages/core/src/stats/{token-estimate,pilot-stats}.ts`,
`packages/core/src/inspection/instruction-cost.ts`, `packages/core/src/index.ts`,
`packages/mcp/src/repo-map.ts`, `apps/web/lib/stats/pilot-report.ts`,
`apps/web/app/app/(shell)/stats/{page,pilot-stats-dashboard}.tsx`,
`apps/web/app/app/(shell)/harness/page.tsx`,
`apps/web/app/(shell)/harness/page.tsx`,
`apps/web/app/ui/instruction-cost-table.tsx`,
`apps/web/lib/strings/{stats,harness}.ts`,
`apps/web/app/styles/screens/harness-library.css`,
`tests/e2e/instruction-cost.spec.ts`, `spec/OPEN_QUESTIONS.md`.

Todo 23 recorded what the server sends. This spends it, and the whole design
is one rule: **a screen that mixes a measurement, a self-report and an
estimate in one grid has published three measurements.**

## `/app/stats` — three cards, three labels, three assumptions

| card | what it is | assumption on the card |
|---|---|---|
| 서빙 토큰 (실측) | characters this server sent, from `usage_daily` | the characters are counted, the 4 chars/token ratio is not |
| 에이전트 보고 사용량 (자가보고) | provider counters the client volunteered | opt-in and unverified |
| 팩 예산 (추정) | the selected pack against a full dump nobody ran | an estimate, not a measurement |

Each card withholds its **headline** below a named threshold
(`PILOT_EVIDENCE_THRESHOLDS`: 2 pack measurements, 5 self-reports, 20 measured
calls) and shows `증거 부족 — n/임계` instead. The totals stay in the JSON
export — it is the number a reader would act on that is withheld, not the
data. The thresholds are judgements, so they are exported rather than
inlined: a reader who disagrees can see what they disagreed with.

The repository filter narrows **in the queries**, not in the browser: receipts,
runs, pack events and `usage_daily` are each scoped through the parameterised
builder. A total narrowed after the fact is still a total over every
repository, and one of them would be the one the reader was excluding. An id
from the query string is validated as a ULID and is a request, not a claim —
every query it touches is already scoped to the caller's workspace.

"벤치 수치 ≠ 내 수치" is now a sentence beside the benchmark link, in both the
Korean copy and the exported methodology block.

## `/app/harness` — WORK_SPEC §5.2-③ 표1, with real bytes

`buildInstructionCostTable` reads what the scan already stores — path,
classification, `size_bytes` — and never a body. The loading rules:

- **Codex** reads the `AGENTS.md` chain from the root: root file `always`, a
  nested one `conditional` on the working directory.
- **Claude Code** loads `CLAUDE.md` and `.claude/rules/*` the same way, and a
  `SKILL.md` `on_demand` — a catalogue carries the name, the body loads when
  the skill runs.
- **Cursor** is `unknown`: `alwaysApply` is frontmatter and the scan stores no
  bodies to read it from (**OQ-062**).

**Only `always` rows are summed.** Conditional, on-demand and unknown tokens
are printed beside the total with the sentence saying they are not in it —
guessing `alwaysApply: true` would put a maybe into the one number the table
exists to state, and guessing `false` would hide a real cost. Every row
carries the rule's reason verbatim, because a loading rule a reader cannot
check is a rule they have to trust.

## Measured — on this repository

| file | mode | bytes | est. tokens |
|---|---|---|---|
| `AGENTS.md` | always (Codex) | 2,599 | 650 |
| `CLAUDE.md` | always (Claude Code) | 444 | 111 |
| `apps/web/AGENTS.md` | conditional | 678 | 170 |
| `apps/web/CLAUDE.md` | conditional | 11 | 3 |

**Always-loaded: 761 tokens across 2 files.** The acceptance check runs the
builder over this repository's real files: table total 934 tokens against
3,732 bytes ÷ 4 = 933 — **0.1% drift**, inside the ±10% bar the plan sets, and
the per-file `ceil` can only ever run ahead of the aggregate.

Beside todo 23's catalogue measurement that is a real pair: this repository's
always-loaded instructions cost **761 tokens** and its MCP tool catalogue
costs **2,890** — the harness is about a quarter of what a session pays before
it asks anything.

## One ratio, one place

`CHARS_PER_TOKEN` was about to have a third home. It is
`packages/core/src/stats/token-estimate.ts` now; `packages/mcp/src/repo-map.ts`
re-exports `estimateTokens` so every existing caller is unchanged, and todo
23's generated database column is the same arithmetic. Three copies of an
assumption is three assumptions, and the one that drifts is the one a screen
quotes.

## Two bugs the browser found

The dev-server pass on `/harness` caught what the unit tests did not:

1. The footer read "상시 로드 합계 … 1,003 bytes → 80 tokens" — the byte cell
   was the whole table's while the token cell was the always rows'. Anyone
   dividing them would get a ratio that means nothing.
   `totals.alwaysSizeBytes` now backs that cell, and a test pins it.
2. The per-loader summary dropped **Claude Code entirely** from the demo
   fixture, because it had files but none loaded unprompted. "This repository
   gives Claude Code nothing at session start" is an answer; a missing row is
   not. The filter is now "has any file at all", and the line carries
   `alwaysFiles/files`.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
— **170 files, 1,478 passed, 1 skipped** (from 168/1,458) —
`node --import tsx scripts/verify-scope-boundaries.ts` PASS (12 boundaries,
344 files). `/harness` rendered and read through the dev server in the
browser: the table, the demo label, the assumption line and the corrected
totals are the numbers above.

## Not done

- **Playwright unrun.** `tests/e2e/instruction-cost.spec.ts` is written — the
  two-theme axe pass on `/app/harness` and `/app/stats`, the demo label above
  the table, the tokenizer assumption on screen, the benchmark caveat beside
  the link — and this machine has no Docker, so **none of it has executed**.
  The acceptance criterion "두 테마 axe" is written, not met.
- **No live data behind the two new cards.** G2 is closed, so no hosted MCP
  session has written a `response_chars` and no agent has reported usage: the
  served and reported cards have only ever been rendered from fixtures.
- **`/app/harness` shows a table only for a scanned repository.** The live
  screen was exercised through unit tests and the demo route; the signed-in
  route needs a workspace with artifacts, which needs G2.
- **The estimate is two assumptions deep, both stated.** 4 chars/token
  (OQ-060) and bytes-read-as-characters (**OQ-063** — Korean is three bytes a
  character, so a Korean `AGENTS.md` reads about three times its true
  character count). The header says both. Nothing calls the result a
  measurement.
- **`/app/stats` still has no per-repository *savings* claim** — it reports
  what each meter says and refuses to subtract one from another. Turning
  served bytes and reported usage into a savings figure needs OQ-060 settled
  first, and the plan's own RULE 4 is the reason not to guess it.

> **정정(2026-09-07):** 위의 "Docker 부재" 전제는 틀렸다. 실측과 각 항목의 실제 상태는 [e2e-debt.md](e2e-debt.md)에 있다.
