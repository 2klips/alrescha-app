# Phase 4 · Codex remedy S6 — a number that moves when the data moves

**Date:** 2026-09-06 · **Connects to:** BUILD_PLAN_PHASE4 보완 R-01 / P0-B
§5.3–§5.4, on todos 22 and 23, and **resolves OQ-053** in favour of option ⑴.
**Scope:** `supabase/migrations/202609060005_repository_revision.sql` (new),
`packages/mcp/src/store.ts`, `apps/web/lib/mcp/supabase-store.ts`,
`tests/repository-revision.test.ts` (new), the Supabase-store tests.

## S3 gave one page a snapshot; the rest of the read had none

PostgreSQL 17's Read Committed gives every statement its own snapshot, so a
workspace load that makes thirteen reads can straddle a write and hand back a
mix of two states. Wrapping the reads in a function would not have fixed that —
the remedy says so explicitly, and it is why S3 only ever claimed a page.

A fence needs something that moves when the data moves, and **a commit SHA
cannot be that something**: the same commit carries different summaries,
findings, todos and CI evidence depending on which jobs have run since.

## Two counters, moved by writers, in their own transactions

`repositories.data_revision` and `workspaces.memory_revision`. Two, not a
family: one counter per table would be cheaper to satisfy and mean less.

- `apply_repository_scan` bumps in the **same UPDATE** that publishes
  `last_scanned_commit_sha`, so there is no window where the data moved and
  the number had not.
- `apply_artifact_summaries` bumps only when a row actually changed. A run
  where every summary was superseded published nothing a reader can see, and
  bumping for it would invalidate every fence for no reason.
- `publish_repository_change` is one statement, so it lands inside whatever
  transaction its caller already opened — and rolls back with it.

**Reads never bump.** `access_events` and `mcp_tokens.last_used_at` are
written *by reading*; counting them would make every read invalidate itself
and no fence would ever hold. That is asserted directly.

## Three states, reported as three

A steady revision is not a claim that analysis finished.
`read_repository_basis` returns, per repository, the revision, the commit the
structure was published from, the commit the derived layer covered, and two
stage words. `last_scanned_commit_sha` ≠ `last_analyzed_commit_sha` is a real
and common state: a repository whose graph is current and whose findings are
from an older commit. A reader that collapses those into one word gets one of
them wrong.

`graphGeneration` is an explicit `null`. There is no immutable generation to
name, so nothing is named — borrowing the commit SHA and calling it one is the
invention the remedy forbids.

## The fence, on the read

`read_edge_page` takes `expected_revision`. When it differs from the current
one the function returns **no rows**, `revisionChanged: true`,
`stoppedBy: "revision"`, and the current revision to restart from — rather
than a page the caller would splice onto rows from another state.

`loadWorkspace` reads the revision before its reads and again after, and
reports `readConsistency`: `revision-fenced` when nothing published between
them, `unproven` when something did. Not an error, and not something to
present as one picture either.

## Verification

Against real PostgreSQL (PGlite, same engine, same roles).
`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(155 files, 1,298 passed, 1 skipped — 13 more than S5),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
328 files).

`tests/repository-revision.test.ts` (9 cases) is the S6 acceptance list:

- **same-commit mutation** — a second scan at the *same* head moves the
  revision, which is the case a commit SHA cannot express;
- a scan's bump and its published commit are one statement;
- a summary run that applied nothing does not move it, and one that wrote
  does;
- **a read does not move it** — an access event and a `last_used_at` touch
  both leave it alone;
- **rollback** — a writer that fails after publishing leaves the revision
  where it was;
- **the scan/analyze gap** — `pending` after a scan, `current` after an
  analysis publishes, `pending` again when a new scan lands, and
  `building`/`unavailable` for a repository never scanned;
- the fence answers when the ground held and refuses when it moved, handing
  back the current revision.

`apps/web/lib/mcp/supabase-store.test.ts` adds four: the revision is passed to
every page, a writer publishing mid-read makes the load `unproven`, a fenced
page that reports `revisionChanged` stops the walk instead of splicing, and
each repository's basis reaches the caller.

## Not verified here

- **No retry.** The remedy allows "discard and retry a limited number of
  times" on a moved fence; this reports `unproven` and returns what it read.
  Retrying means re-running the whole thirteen-read load, and doing that
  blind — without measuring how often the fence actually moves — would trade
  a stated weakness for an unmeasured cost.
- **Cursors still carry no policy.** The remedy's stronger cursor fixes
  scope, query, policy *and* revision inside the token; ours is an edge id
  plus a separately-passed revision. Permission is re-checked because every
  request authenticates, not because the cursor says so.
- **Only the edge read is fenced.** The other twelve reads in `loadWorkspace`
  are bounded (S2b) but unfenced individually; the before/after comparison
  covers the load as a whole, which is weaker than per-read fencing and is
  what `readConsistency` reports.
- **`memory_revision` has no writer yet.** The column exists because the
  remedy names workspace memory as the second scope; `writeMemory` does not
  bump it, so nothing fences on it.
- **The analyze job does not publish yet.** `publish_repository_change`
  exists and is tested, but `reconcileFindings`/`reconcileRequirements` do
  not call it, so `last_analyzed_commit_sha` only moves when something calls
  the function directly. Wiring it is todo 18's CI-evidence work, where the
  analyze completion point is already being touched.
- **No measurement.** How often the fence moves under real traffic, and what
  the extra two RPC round trips cost, are unmeasured.
- **Playwright** (no Docker daemon).
