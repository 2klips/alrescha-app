# RE-04 B-01 — the shared MCP workspace read, measured and partly repaired

**Date:** 2026-09-23 · **Base:** `027ec63` (main, exact) · **Worktree:**
`research/re-04-mcp-read-recovery` · Commits `6b6554b` (B-01 receipts),
`3771ac8` (R-01), `2f6e7f2` (R-02 + contract).

No migration, no new tool, no timeout change, no production read or write.

## The blocker

`search_index`, `get_artifact` (default and opt-in), `get_neighbors` and
`impact_of` all load the workspace through one shared read, and that read hit
statement timeouts on `receipts` or on the edge page RPC (14.3–32.0 s
observed by deployment Codex). Two costs, investigated separately.

## Receipts — found, fixed

The shared read selected `receipts.summary`, the whole in-toto statement per
receipt: 330 rows, 40,101,144 bytes on the pilot (read-only count by
deployment Codex). Every consumer was audited:

| reader | uses |
| --- | --- |
| `data-brain.ts` brain nodes | id, commitSha, status |
| `graph-tools.ts` graph nodes | id |
| `hosted.ts` overview | `.length` |
| `repo-map.ts` counts | `.length` |
| `hosted.ts` `receipts-summary` resource | **summary** |

The fix reads what is needed: the shared read selects `id, repository_id,
commit_sha, status, digest`; the resource asks the new targeted
`loadReceiptSummaries` (same table, order and row budget, reports its own
truncation). The in-memory store drops summaries from its workspace read the
way it already drops the symbol layer, so the two stores cannot diverge.
`summary` is absent rather than `{}`.

**Measured on a synthetic fixture** (PGlite = real PostgreSQL in WASM, all
migrations, 330 receipts sized to the pilot, no production rows):

| receipt select | median | payload |
| --- | ---: | ---: |
| with `summary` | 199 ms | 40,100,611 bytes |
| without `summary` | 3 ms | 56,761 bytes |

Relative only — PGlite on a laptop is not the hosted database. The fixture's
40,100,611 bytes is within 0.002% of the pilot's 40,101,144, which is what
makes the comparison about the same problem.

The `receipts-summary` resource still reads all 40 MB when someone asks for
it. It no longer does so on every tool call; whether it should page is a
product decision, not made here.

## Edge page RPC — measured, NOT fixed

`read_edge_page` takes keyset pages of 2,000 rows, up to 4 pages (8,000).
Measured on the same kind of synthetic PGlite database:

- **Single tenant (23,619 edges):** every page is a Bitmap Heap Scan of all
  the workspace's edges followed by a Sort, keeping 2,001. The cursor
  `id > $after` is applied as a post-scan filter, not an index range — page
  cost is proportional to all workspace edges, not to the page. 35–40 ms per
  page here; the plan shape, not the time, is the finding.
- **Multi-tenant (60,003 edges, target 20%, interleaved):** the planner walks
  `edges_pkey` from the cursor and filters by workspace — ~10,000 rows touched
  to keep 2,001.
- **A `(workspace_id, id)` index did not help:** added and analysed, it was
  not chosen by the planner under the current catch-all predicate, a
  `coalesce` rewrite, an explicit `order by workspace_id, id`, or
  `random_page_cost = 1.1`. Rows touched and buffers were identical.
- **The synthetic layout does not model production.** Interleaving every
  fifth row spreads the target's rows over every heap page, so any access path
  touches the same pages. This system writes edges in bulk per scan, so
  production rows are more likely clustered by workspace. PGlite never
  reproduced a slow page.

**Conclusion: no migration was written.** An index or predicate change that
could not be shown to change the plan locally would be a guess shipped to
production. The edge cost needs the production plan, read-only (handoff §5).

Also found: `MCP_EDGE_PAGE_ROWS × MCP_EDGE_MAX_PAGES = 8,000`, and the pilot
has 11,809 edges (deployment Codex's count, which includes `contains`
hierarchy edges the store then omits). Every pilot workspace read is therefore
already edge-truncated. That is existing, reported behaviour — `impact_of` and
the change brief will say `lower-bound` with the reason — not a regression.

## R-01 — briefTokens scope

`briefTokens` counted the brief without its budget object. On the small test
fixture it reported 384 against 428 for what the brief serialises; the review's
own fixture showed 295 against 343. Now: the whole brief, budget metadata
included, less only the `briefTokens` field. Pinned against the real
serialisation for a small and a capped brief.

## R-02 — compact via

Each hop in the brief is `relation`, `tier`, `provenance`; `impact_of` keeps
all nine fields. Both sides are pinned. Known limit: the intermediate node of a
multi-hop path is not named in `via`.

The contract document was brought current as the review decided, with its
examples regenerated from the real `prepareChange`.

## Verification

Run in the worktree, 2026-09-23:

| command | result |
| --- | --- |
| `pnpm lint` | clean, `--max-warnings=0` |
| `pnpm typecheck` | 6 projects, clean |
| `pnpm test` | **210 files / 1,965 passed / 1 skipped** |
| `node --import tsx scripts/verify-scope-boundaries.ts` | PASS, 12 boundaries, 388 files |
| catalogue (probe) | 21 tools / 3,141 tokens, ratchet 3,150 |

1,965 = 1,952 at `027ec63` + 10 (B-01) + 1 (R-01) + 2 (R-02). Every
pre-existing test passed unchanged. Working-tree run in an isolated worktree —
**not a commit's CI**; the branch is not pushed.

**Red check:** with the four B-01 source files reverted to `027ec63` and the
new tests kept, 8 of the new tests fail; restored, all pass. The two that pass
on both are the fixture-size check and the resource-still-serves-summaries
check — the latter pins preserved behaviour and must pass on both.

## Not verified

- No hosted database read. The 14.3–32.0 s timeouts were not reproduced.
- Whether the receipt fix alone clears the four tools' timeouts in production.
- The edge RPC's production plan and cost.
- RE-00's MCP read re-verification and real Near halo.
