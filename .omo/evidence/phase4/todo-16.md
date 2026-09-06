# Phase 4 · Wave C · todo 16 — a graph on connect, and a way to ask for another

**Date:** 2026-09-06 · **Scope:**
`supabase/migrations/202609060006_backfill_and_rescan.sql` (new),
`apps/web/lib/github/backfill-scan.ts` (new),
`apps/web/lib/github/connect-repository.ts`,
`apps/web/lib/mcp/supabase-store.ts`, `packages/mcp/src/{store,hosted}.ts`,
`apps/worker/src/run-local.ts`, `tests/backfill-and-rescan.test.ts` (new).

## Connecting a repository did nothing until someone pushed

The connect flow stored a row and waited for a webhook. A repository that is
*finished* — the case this whole wave exists for — may not see a push for
weeks, so the product's first impression was an empty graph and an implicit
suggestion to go and commit something.

Two entry points now, both deterministic and both free:

- **`enqueue_backfill_scan`** runs once per `(repository, head)` at connect
  time. A first scan has nothing to be incremental against, so it is full by
  construction rather than by flag.
- **`enqueue_repository_rescan`** is the "scan again" path and the MCP tool
  behind it. It scans at the head the repository was last seen at, because a
  rescan is a re-read of what is stored, not a fetch of something newer.

Idempotency is on what actually identifies the request. A backfill is keyed by
the head, so a double-clicked button, a retried form post and a re-render all
resolve to the same job. A rescan's key carries **the mode as well**: asking
for a full relink after an incremental one is a different request, not a
repeat.

## The mode is chosen twice on purpose

An incremental pass never re-parses an unchanged file, so a repository whose
edges came from an older resolver would keep its thin graph until every file
happened to change (R5 §2.2 D2). `runRepositoryScan` has upgraded such a scan
since todo 0; the enqueue function now applies the same rule, and returns the
reason:

> stored links are from resolver generation 2; the current one is 3

That is what lets `request_rescan` tell a caller *why* their incremental
request became a full one, instead of leaving them to infer it from the row
count. The worker remains the authority — it would upgrade the mode anyway.

## `request_rescan`

`readOnlyHint: false`, because it changes something — a job appears in the
queue — even though it costs nothing and writes no repository content. A tool
that scheduled work while claiming to be read-only would be lying to every
client that gates on the hint.

Naming a repository is the caller's job when a workspace holds more than one;
the store resolves an omitted id only when there is exactly one, and otherwise
says so rather than scanning the wrong repository silently.

**The catalogue is now 23 tools, up one.** The plan budgets that trade
explicitly — todo 22's consolidation is where it comes back down — and the
contract test carries the number so the increase is recorded rather than
absorbed.

## Failure here does not fail the connect

A repository that is connected but not yet scanned is a state the product
already reports (`structure: building`, from S6). A connect that failed
*after* the row was written would leave a half-finished setup with no way to
retry short of disconnecting. `connectSelectedRepository` returns the
scheduling outcome alongside the repository id so the caller can say what
happened.

## The rescan is where prose goes stale

보완(R-02) asked for this to be stated. It falls out of S1 and S6 rather than
needing new machinery, and the test pins the three facts together: after a
rescan lands a new blob, the structure is `ready`, the analysis is `pending`,
and the summary written for the old blob still sits in the row carrying its
old digest — which is exactly what makes every reader treat it as `stale`
without anyone deleting it.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces), `npx vitest run`
(156 files, 1,310 passed, 1 skipped — 12 more than S6),
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
330 files).

`tests/backfill-and-rescan.test.ts` (12 cases) against real PostgreSQL: one
free full scan for a never-pushed repository; the same job however many times
the button is pressed; a head that is not a commit sha refused; a repository
from another workspace refused; a rescan of a never-scanned repository saying
so rather than guessing; incremental by default at the last-seen head; full
and incremental kept apart while a repeat of either is not; the resolver-
generation upgrade with its reason; an unknown mode refused; backfill and
rescan of the same head kept apart; **both free with an empty credit ledger**;
and the structure-ready / analysis-pending / prose-stale trio after a rescan.

## Not verified here

- **The gate.** Wave C is gated on G2 (GitHub App live-fire), and this
  machine has neither a live installation nor Docker. Everything above is the
  deterministic half; the live connect has not been exercised once.
- **The head commit sha is not fetched.** `connectSelectedRepository` takes it
  as an argument and neither API route supplies one yet, so today every
  connect returns `scheduled: false` with "the repository's head commit is
  unknown". The reader is honest about it, but the backfill does not actually
  fire in production until a caller reads the default branch's head — one
  GitHub call with the token the connect already mints. That is the next
  concrete step and it needs G2 to verify.
- **No onboarding progress and no button.** The plan asks for both. The
  scheduling result is on the connect response and `request_rescan` is live,
  so the screen work has a contract; rendering it is todo 19's surface work
  and the connect page has not been touched.
- **The e2e acceptance is unrun**: "connect → progress → `/app/map` nodes > 0"
  needs Docker and a live installation. So is T2FV — connect-to-first-useful-
  screen has no number, because nothing has been connected.
- **The worker source factory is unchanged.** The plan asks for per-kind lazy
  creation so a DB-only deterministic job runs on a CLI repository. Today's
  factory is already lazy (the token is minted inside the loader, on demand),
  and no job kind currently reads only the database — scan, analyze and enrich
  all need bodies. Splitting it now would be motion without a caller; it
  belongs with todo 17's local serving mode, where a source-less job actually
  appears.
- **`run_id` is a `manual` run per request.** A backfill and each rescan mode
  open their own run, keyed like the job. Whether these should instead attach
  to one long-lived onboarding run is a product question nobody has asked yet.
