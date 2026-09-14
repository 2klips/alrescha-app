# Phase 4 · Wave E · todo 25 — graph-surface v3: the installed budget, measured on the store that ships

**Date:** 2026-09-14 · **Scope:** `scripts/graph-surface-benchmark/{manifest,loop,report,tools,product-surface,auxiliary,risk-precision,audit,print-catalog}.ts`,
`scripts/bench-graph-surface.ts`, `scripts/bench-graph-surface-auxiliary.ts`,
`scripts/verify-benchmark-report.ts`, `packages/mcp/src/workspace-risk.ts`
(`workspaceRiskMap` split out, additive), `benchmarks/graph-surface/preregistration.v3*.json`,
`benchmarks/graph-surface/results.{dry-run.,}v3*.{json,md}`, `results.v3.smoke.*`,
`tests/graph-surface-v3.test.ts`, `spec/OPEN_QUESTIONS.md` (OQ-070, OQ-071).

**Verdict: NOT MET**, published as measured. Installing the budget cost
turns (+0.375 per trial, pooled) and cost nothing in quality (PASS rate
identical). The two commits are the lock (`c172b6b`) and the run.

## What v3 measures, and why it is not v2

v1 and v2 measured a graph arm that never shipped: a workspace the harness
built from the file corpus *with bodies attached*, and tool definitions
the harness wrote by hand. On the hosted product an artifact has no body
until enrich runs (OQ-039), and R5 §4.5 ⒀ named the contradiction. v3 is
the product:

- **Store.** Each corpus is scanned by the real scanner and projected
  through `buildLocalWorkspace` — the code `alrescha serve --local` uses.
  Every artifact carries `content: ""`; `assertBodilessWorkspace` refuses
  to start otherwise, and a test proves the v1/v2 shape trips it. The
  real-repository scan carried **759 nodes and 4,687 edges** (14 link
  families, A′ route/db_object/section hubs; directory `contains` is
  excluded by the product's own vocabulary, as todo 22 left it).
- **Tools.** The hosted server factory is opened through the SDK client
  and the hosted endpoint; `tools/list` is converted to the provider's
  function-calling shape — 21 tools, description and zod-generated input
  schema as served. The catalogue's SHA-256
  (`a3d56907414a85b97c3838c55766ab6c6adb310133239ba6c2ce6d85e411f0ac`)
  is pinned in the pre-registration and the runner refuses a mismatch.
  Calls go through `tools/call`, double-JSON serialisation included.
- **Instruction block.** The graph arm's system prompt carries
  `renderAgentInstructionBlock()` — the same block a repository installs.
- **Checkout tools in both arms.** A body-less store cannot answer a body
  question by itself, and the block's third step is "then read the file",
  so the graph arm has the baseline's `list_files`/`grep_files`/`read_file`
  as well. The baseline is unchanged (no MCP). The question v3 asks is
  therefore R5 §4.6 (d)'s: *with the budget installed, is quality
  non-inferior and are turns not increased?* — not v1's "does the graph
  beat grep".
- **One store per graph-arm trial.** `log_progress` from one trial can
  never be another trial's "existing todo".
- **Usage.** Cache creation / cache read (Anthropic) and `cached_tokens`
  (OpenAI) per model call, tool names per trial. No explicit cache
  breakpoints in either arm.

Unchanged from v1, byte for byte: the 12 questions (frozen v3 manifest
digest `7a317232…`), the grader, 96 trials, turn cap 10, concurrency 2,
output caps, the two models, the five memory fixtures. `get_doc_page`
does not exist (todo 20) and is not in the arm.

Pre-registration digests, all recorded in the reports:
main `7ce54ebf6cae6794290a2e56b76ebff0c47aadce4f3bf014feebe191a146f34d`,
relational `34b8fa8730ae47d5d25f62a28225175656506f5c7d82cc668fc760ed4bfd5f14`,
auxiliary `5f6a6d7b573025f43fc9b207808765bf64caf0e4aa6a6f8536f3ceba153f305f`.
Lock commit `c172b6b`; corpus commit at run `c172b6bc5e690f32e3d550ff3290c52d90d4413a`.

## Main run — 96/96, 0 failed, NOT MET

`benchmarks/graph-surface/results.v3.{json,md}`. Preflight smoke first
(`results.v3.smoke.*`, one task, 8 trials, both providers, 0 failed — not a
release, and the runner refuses a release basename for a partial grid).

| model | arm | trials | mean turns | mean tool calls | PASS/PARTIAL/FAIL | PASS rate | mean score | input | cache read | output |
|---|---|---|---|---|---|---|---|---|---|---|
| pooled | file-exploration | 48 | **4.896** | 8.813 | 33/11/4 | **0.688** | 0.833 | 2,050,111 | 574,660 | 36,411 |
| pooled | graph-surface | 48 | **5.271** | 8.604 | 33/12/3 | **0.688** | 0.821 | 2,161,344 | 663,406 | 33,157 |
| gpt-5.6-luna | file-exploration | 24 | 4.583 | 9.750 | 18/6/0 | 0.750 | 0.903 | 823,470 | 574,660 | 10,481 |
| gpt-5.6-luna | graph-surface | 24 | 5.625 | 9.958 | 18/6/0 | 0.750 | 0.875 | 843,727 | 663,406 | 10,990 |
| claude-sonnet-5 | file-exploration | 24 | 5.208 | 7.875 | 15/5/4 | 0.625 | 0.764 | 1,226,641 | 0 | 25,930 |
| claude-sonnet-5 | graph-surface | 24 | 4.917 | 7.250 | 15/6/3 | 0.625 | 0.767 | 1,317,617 | 0 | 22,167 |

Cache creation was 0 in every cell (no breakpoints were set; OpenAI's
automatic prefix cache reported reads, Anthropic reported none).

- **Primary (turns non-increasing, Δ ≤ 0):** 5.271 vs 4.896 → **Δ +0.375 —
  not met.** v1's strict reading (Δ < 0) is not met either.
- **Quality non-inferiority (PASS −5pp):** 0.688 vs 0.688 → Δ 0 — met.
- **By model, the sign flips.** Luna paid 1.04 turns for the budget
  (5.625 vs 4.583); Sonnet saved 0.29 (4.917 vs 5.208) and spent fewer
  tool calls (7.25 vs 7.875). Small samples: 24 trials per cell, point
  estimates only, no interval claimed.

Per task (mean turns, PASS/4; baseline → graph):

| task | baseline | graph |
|---|---|---|
| fixture-answer-session-policy | 3.0 · 4/4 | 3.5 · 4/4 |
| fixture-answer-audit-schema | 3.0 · 4/4 | 3.5 · 4/4 |
| fixture-answer-api-rule-conflict | 4.5 · 4/4 | 6.5 · 4/4 |
| fixture-answer-legacy-billing | 4.0 · 1/4 | 4.75 · 1/4 |
| real-answer-github-permissions | 4.5 · 4/4 | **3.5** · 4/4 |
| real-answer-mcp-contract | 4.25 · 4/4 | 5.5 · 4/4 |
| real-answer-job-queue-claim | 3.75 · 4/4 | 5.0 · 4/4 |
| real-answer-graph-renderer | 4.0 · 4/4 | 4.75 · 3/4 |
| real-answer-receipt-statement | 3.5 · 0/4 | 4.25 · 0/4 |
| real-answer-credit-honesty | 8.75 · 2/4 | **8.25** · 3/4 |
| real-answer-index-pr-limits | 8.0 · 0/4 | **5.75** · 0/4 |
| real-answer-evidence-grade-rule | 7.5 · 2/4 | 8.0 · 2/4 |

What the graph arm actually called (48 trials): `grep_files` 139,
`read_file` 104, `search_index` 97, `submit_answer` 41, `list_files` 15,
`repo_overview` 10, `get_artifact` 4, `memory_read` 2, `repo_map` 1 — and
none of `get_neighbors`, `trace_path`, `impact_of`, `query_brain`,
`get_findings`, `log_progress`, `memory_write`. Two `search_index` calls per
trial is the block's forced prefix; the answer to each was ids and paths
with `excerpt: ""` (the production shape), after which the agent read the
file it would have grepped for anyway. **The +0.375 is, to a first
approximation, the price of the forced call on questions grep answers in
one hop** — and where the index actually pointed at the right file first
(`github-permissions`, `index-pr-limits`, `credit-honesty`) the graph arm
was faster.

### Two things the run taught that are not about the budget

- **The frozen questions have drifted from the corpus.** Two real-repository
  facts no longer exist in source: `https://arr.dev/receipt/v1` and the
  `<!-- ARR:BEGIN` marker were renamed with the product. Every trial in both
  arms on `receipt-statement` and `index-pr-limits` topped out at 2/3 —
  PARTIAL by construction. The comparison is paired and survives; the
  absolute PASS rates do not compare with v2 (0.875 baseline then, 0.688
  now) and should not be read as a regression of either arm. Byte-identical
  questions were the requirement; **OQ-070** records the decision this
  forces (a v4 manifest revision is a pre-registration change).
- **Sonnet hits the turn cap on the two "rule" questions in both arms**
  (`credit-honesty`, `evidence-grade-rule`: 10 turns, FAIL) — consistent
  with v2's Sonnet FAILs on the same questions. Not a v3 effect.

## Auxiliary experiments — separate pre-registration, never part of the verdict

`benchmarks/graph-surface/results.v3-auxiliary.{json,md}`. ①②③ read the
main run's trials and changed nothing about it; ④ is its own grid; ⑤ is
offline.

**① Progress-log adoption: 0 / 48.** No graph-arm trial called
`log_progress`. The block's closing step ("when a task unit is done") has no
trigger in a question-answering trial, where the task ends at
`submit_answer`. This is the honest number for this harness and says
nothing about a coding session; it does say the block's last step is not
self-enforcing.

**② Tokens per model call** (provider usage, means):

| model | arm | calls | input | cache read | cache read share | output |
|---|---|---|---|---|---|---|
| pooled | file-exploration | 235 | 8,724 | 2,445 | 0.219 | 155 |
| pooled | graph-surface | 253 | 8,543 | 2,622 | 0.235 | 131 |
| gpt-5.6-luna | file-exploration | 110 | 7,486 | 5,224 | 0.411 | 95 |
| gpt-5.6-luna | graph-surface | 135 | 6,250 | 4,914 | 0.440 | 81 |
| claude-sonnet-5 | file-exploration | 125 | 9,813 | 0 | 0 | 207 |
| claude-sonnet-5 | graph-surface | 118 | 11,166 | 0 | 0 | 188 |

The 21-tool catalogue (~2.7k tokens, todo 22) rides on every call; on
Luna it is largely a cache hit, on Sonnet — with no breakpoint set — it is
paid in full each turn, which is where the +1,353 input tokens per call
come from.

**③ Todo duplication: undefined** — nothing was minted (see ①).

**④ Relational set — 32/32, 0 failed, NOT MET on turns, quality +6.3pp**
(`results.v3-relational.{json,md}`, 4 questions × 2 arms × 2 models × 2):

| model | arm | trials | mean turns | PASS |
|---|---|---|---|---|
| pooled | file-exploration | 16 | 4.563 | 0.875 |
| pooled | graph-surface | 16 | 4.938 | 0.938 |
| gpt-5.6-luna | file-exploration | 8 | 3.625 | 1.000 |
| gpt-5.6-luna | graph-surface | 8 | 5.000 | 1.000 |
| claude-sonnet-5 | file-exploration | 8 | 5.500 | 0.750 |
| claude-sonnet-5 | graph-surface | 8 | 4.875 | 0.875 |

Per question (baseline → graph, turns): importers-of-a-module 2.0 → 3.25
(grep answers it in one hop; the forced call is pure overhead), route →
handler 4.0 → 3.5, migration defines/modifies 4.75 → 4.75, section-token
references 7.5 → 8.25 (Sonnet at cap in both arms; the graph arm rescued
one more trial). Same shape as the main run: the budget helps where the
index points first and costs a turn where grep already did.

**⑤ Risk top-30 precision** (this repository = the production pilot
repository; rule: a fix-titled commit touched the file within 90 days):

| stratum | entries | precision@10 | precision@30 | true positives |
|---|---|---|---|---|
| with-ci | 0 | — | — | 0 |
| without-ci | 30 | **0.4** | **0.3** | 9 |

578 map entries, 39 qualifying commits, coverage and dependency-audit
unmeasured. Below R5 §4.6 (d)'s ≥0.70 bar for the top 10 — under a proxy
label, on a map with two of its signals grey, in one stratum. The CI
stratum is n=0 because this repository has no CI evidence, which is what
the risk map itself reports.

## The audit

`scripts/verify-benchmark-report.ts` now audits `benchmarks/graph-surface/`
with the databrain rules: pre-registration lock (file SHA vs report; for
v3 also the catalogue digest and the judged hypothesis), `mode: real`, a
40-hex corpus commit, the full grid with every cell exactly once, every
trial's score/quality/status consistency and — for v3 — the usage record
(cache halves, per-call usage summing to the trial, tool names), the
verdict recomputed from the trials, and the Markdown re-rendered byte for
byte from the published render inputs. v1/v2 predate the render inputs
and are checked for the facts their Markdown must carry.

```
PASS efficacy benchmark: 600/600 trials, 8.6906pp accuracy, 67.390662% token reduction, 270 claim files
PASS graph-surface benchmark: v1 96/96 (0 failed, NOT MET), v2 96/96 (0 failed, NOT MET), v3 96/96 (0 failed, NOT MET), v3-relational 32/32 (0 failed, NOT MET)
```

A seeded-defect test tampers a v1 report's digest, mode and verdict and
asserts three finding kinds. The efficacy audit's temp-root fixtures have
no graph-surface directory and are untouched.

## Verification

- `tests/graph-surface-v3.test.ts` (16): lock and arm-set contract, inline
  relational set with no answer alias in its own prompt, refusals; the
  production scan has no bodies and the guard trips on one; `tools/list`
  names and digest equal the pin; `search_index` answers with
  `excerpt: ""`, `get_artifact` with `content: ""`; cap clipping and a
  read-scope refusal as text; observations (matched verdicts, minted and
  duplicated todos); a fresh store per surface; Anthropic cache halves and
  OpenAI `cached_tokens` summed per call; Δ = 0 read as MET under v3 and
  NOT MET under v1; adoption / tokens-per-call / duplication from
  synthetic trials; git-log parsing and precision labelling; the audit on
  the committed releases and on a tampered copy.
- `pnpm lint` clean · `pnpm typecheck` clean · `pnpm test` 195 files /
  1,815 passed / 1 skipped · `scripts/verify-scope-boundaries.ts` PASS (12
  boundaries, 371 files) · `git diff --check` clean. No web screen changed;
  Playwright not run.
- Dry runs before any credit: main 96/96, relational 32/32, auxiliary
  pipeline, all 0 failed (`results.dry-run.v3*`).

Provider-reported consumption for the record: main run input 4.21M +
cache read 1.24M + output 0.07M; relational 1.21M + 0.38M + 0.02M; smoke
8 trials. Main run wall time ≈ 15 minutes at concurrency 2.

## Not done, and not claimed

- **No site copy changes.** The verdict is NOT MET; ADR-012's procedure
  is the only path to a sentence about efficiency, and the verifier's claim
  scan passed unchanged.
- **The fixture corpus's virtual scan sha differs between runs**
  (`02e7e479…` in the dry run, `a50f2daf…` in the smoke and the run):
  `createLocalRepositorySource` hashes the whole tree before the exclusion
  filter, and `fixtures/drifted-demo/recordings` is written by other
  suites. The scanned node set was identical (15 nodes, 5 edges). Recorded,
  not fixed: the id is the tree's, and the tree changed.
- **Precision is one repository, one proxy label.** The pilot repository
  in production is this one; a second repository with CI evidence would
  fill the empty stratum and nothing here pretends to.
- **What the numbers point at** is the product's, not this todo's:
  the forced first `search_index` call is a turn on grep-shaped questions,
  and a pointer with `excerpt: ""` is a hop that still ends in a file
  read. Both are **OQ-071**; changing the block or serving deterministic
  excerpts (OQ-039 ⑴) is a decision, and re-measuring it is a v4.
