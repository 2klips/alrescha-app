# RE-03 ⑶b — the change brief reaches one consumer path, and stops claiming to be whole

**Date:** 2026-09-22 · **Base:** `9834656` (RE-03 ⑶a head = PR #27 head)
**Worktree:** `research/re-03b-change-brief-path` @ `../re-03b-path`
**Scope:** `packages/mcp/src/prepare-change.ts`, `packages/mcp/src/hosted.ts`,
`packages/mcp/src/index.ts`, `packages/mcp/src/hosted.test.ts` (ratchet
comment only), `tests/change-brief.test.ts` (new).
Contract: [`CHANGE_BRIEF_CONTRACT.md`](../../docs/reports/CHANGE_BRIEF_CONTRACT.md).

No migration, no new tool, no library, no pricing change, no deployment.

## The defect

`ChangeBrief` handed back `impactOf`'s `dependencyImpact` and dropped its
`bound`, `boundReasons`, `confidence` and `affectedRoutes`. `dependencyImpact.complete`
reports only whether the **walk** ran out of graph. It knows nothing about a
table that stopped at its row budget or a relation outside the vocabulary — so
a brief over a truncated read reported `complete: true`, and an agent could
conclude a change was safe because it could not see what it would break.

Pinned in `tests/change-brief.test.ts`: on a read with a capped `edges` table
and 12 dropped `contains` edges, `complete` is `true` and `stoppedBy` is
`null` while `bound` is `lower-bound` with both reasons named.

## The selector — measured, and it changed the design

The contract's first candidate was to expand whichever code card
`request_context_pack` had already chosen, needing no new input. Measured on
this repository at `57304f30` — **998 artifacts**, 12 task descriptions
(Korean and English), three budgets (500 / 2,000 / 8,000):

| `codeCards` length | runs |
| ------------------ | ---: |
| exactly 1          | **0** |
| 0                  | 3 |
| 20 (the cap)       | 33 |
| total              | 36 |

Never one, at any budget. The first card path was identical for every task
(`.env.example`), because the selection walks `repository.artifacts` in path
order and takes the first 20 that survived edge expansion. **A selector that
cannot name a target cannot carry a brief**, so the contract's stated
fallback applies.

`get_artifact` is where a caller has *already* named one target by id or
path. The opt-in cost was measured before the change (3,131 → 3,141, +10) and
again after implementing it: **3,141 tokens, 21 tools**, inside the unchanged
3,150 ratchet. The prediction and the outcome agree exactly.

## What the brief now carries

- `basis` — commit, revision, stages and read consistency, or `available: false`
  with a reason. `McpReadBasis` is optional per repository and the in-memory
  store never sets one, so an absent basis says so rather than showing a null-shaped
  commit. `graphGeneration` stays `null` because it is typed `null` at the source.
- `target` — `ambiguous`, `candidates` when a path named several repositories,
  `card` (unchanged), `freshness` from the card's own summary state, `nodeId`,
  `path`, `sourceDigest` (null when the row stored `""`).
- `consumers` — everything `DependencyImpact` carried, **plus** `bound`,
  `boundReasons` and `confidence`. `null` still means *not computed*, never
  "no consumers".
- `budget` — `targetCardTokens` (body), `briefTokens` (this brief serialised),
  `approach` naming the UTF-16/4 heuristic as an approximation rather than a
  billed count, and `truncatedItems` for what a cap dropped.
- Consumers are capped at `CHANGE_BRIEF_CONSUMER_CAP` (25); exceeding it adds
  a `boundReason` and a `truncatedItems` entry, so the cap cannot hide.

## Verification

Run in the worktree, 2026-09-22:

| command | result |
| --- | --- |
| `pnpm exec vitest run tests/change-brief.test.ts` | 18 passed |
| `pnpm exec vitest run` (hosted, artifact-card, context-pack, change-brief, search-accuracy) | 5 files / 101 passed |
| `pnpm lint` | clean, `--max-warnings=0` |
| `pnpm typecheck` | 6 projects, clean |
| `pnpm test` | **209 files / 1,952 passed / 1 skipped** |
| `node --import tsx scripts/verify-scope-boundaries.ts` | PASS, 12 boundaries, 388 files |
| catalogue probe | **21 tools / 3,141 tokens** (ratchet 3,150) |

209 = the 208 files at `9834656` plus this card's one; 1,952 = 1,934 + 18.
Every pre-existing file passed unchanged. This is a working-tree run in an
isolated worktree, **not a commit's CI** — this branch was not pushed.

## Compatibility

- `prepareChange(workspace, selector, found?)` keeps its signature; the
  `resolved` parameter is a fourth optional argument.
- Every field the old `ChangeBrief` carried is still present under the same
  name — `tests/artifact-card.test.ts` passes untouched.
- `get_artifact` without `include_change_brief` returns exactly what it did;
  the `changeBrief` key is absent, not null. The multi-id (`ids`) read never
  carries one: four ids are four targets and a brief is about one.
- `tools/list` stays 21 tools. The 3,150 ratchet is unchanged; the rise from
  3,131 to 3,141 is recorded in that test's own running log, as its comment
  asks.
- One store lookup per call, pinned with a spy on `findArtifacts`; `impactOf`
  runs once per target.
- No source body reaches the brief — pinned by a fixture whose content is a
  sentinel string.

## Deviation from the 03a contract, for review

The contract named `budget.responseTokens` ("응답 전체 추정"). Implemented it is
`budget.briefTokens` — the brief's own serialised estimate. A field inside the
brief cannot honestly state the size of the whole response that will contain
it without being a number about itself. `get_artifact`'s total is already
metered by `emitAccessEvent`. **Flagged for Codex to reconcile in the contract
document**, which was not edited here because PR #27 is under review.

## Not verified here

- No production workspace, no rescan, no deployment. RE-00's operator full
  rescan is still outstanding and this card does not touch it.
- `affectedRoutes` is still dropped. Contract §7 ⑵ left it open pending a
  budget measurement; this card did not make it.
- `impactOf`'s cost on a large graph is not measured (RE-04).
- The selector measurement is one repository at one commit. It is decisive for
  this repository; it is not a claim about every workspace.
