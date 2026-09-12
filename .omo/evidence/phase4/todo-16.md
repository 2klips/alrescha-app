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

---

# 2026-09-12 — the other half: the connect reads the head, the screen shows the run, and it was measured live

**Scope:** `apps/web/lib/github/{api,backfill-scan,connect-repository}.ts`
(+ `backfill-scan.test.ts`), `apps/web/app/api/github/repositories/{,url/}route.ts`,
`supabase/migrations/202609120002_backfill_analyze_pair.sql` (new),
`apps/web/lib/home/journey.ts` (+ test), `apps/web/app/app/(shell)/{page,home-screen,actions}.tsx`,
`apps/web/app/app/(shell)/map/map-screen.tsx`, `apps/web/lib/strings/{home,map,terms}.ts`,
`apps/web/app/styles/screens/home.css`, `apps/worker/src/{run-local,worker,analysis-job,postgres-analysis-store}.ts`,
`tests/e2e/{onboarding-progress,connect-backfill-live}.spec.ts` (new),
`tests/e2e/helpers/session.ts`, `tests/e2e/global-setup.ts`, `.env.example`.

## The head is read, so the backfill fires

`connectSelectedRepository` mints a repository-scoped installation token to
verify access and used to drop it. It now keeps the token for one more call
— `GET /repos/{full}/branches/{default}` — and hands the sha to the queue.
Two GitHub round trips, no token stored, and a connect that could not read
the branch (an empty repository answers 404) still succeeds: the result says
`scheduled: false` with the read's reason, the redirect says `backfill=unscheduled`,
and the home explains that a push starts the scan. `tests/backfill-and-rescan`
(the queue) and `apps/web/lib/github/backfill-scan.test.ts` (the read, the
two ways it declines, the scheduling) pin it; the live run below is the
proof that it fires: the redirect landed on `backfill=scheduled` and the
pair was in the queue at the branch's live head.

## The pair, not the scan

A push queues `scan` **and** `analyze`; the backfill queued only the scan,
so a finished repository connected today got a graph and then waited for a
push before any requirement, finding, CI evidence or receipt existed — the
2026-09-06 live scan had to queue the analysis by hand. `202609120002`
makes both manual entry points (backfill, rescan) queue the same pair on the
same run, keyed `…:analyze`, both at zero credits (the ledger test still
holds them to it). The return values are unchanged. The queue orders the
tie; an analyze claimed before its scan fails fast and retries on the
backoff — the exact pattern the live run exhibited (below), and the drain
loop serves one workspace sequentially, so the retry is the common case.

Found on the way: **the analysis never published**. `publish_repository_change`
(remedy S6) takes the analysed commit and the scan called it; the analyze
job did not, so `last_analyzed_commit_sha` stayed null on every repository
ever analysed and the basis read `analysis: pending` forever. The analyze
handler now publishes after the receipt (asserted in order in
`analysis-job.test.ts`), which is what lets the progress below ever say
"완료" for the second stage — and what makes the MCP basis truthful.

## The run, on the screen (보완 R-02)

`buildScanProgress` reads two stages from the newest job of each kind and
the repository row: **structure** (`idle · queued · running · ready · failed`)
and **analysis** (the same, plus `local` for a pushed repository the hosted
worker never analyses — todo 17). They are independent on purpose: the map
opens on the first (`/app/map` now says "scanning" rather than "connect" when
a repository is connected and has no nodes yet), the Findings follow with
the second. A failed job shows the queue's `last_error` verbatim (WORK_SPEC
§4.5). "다시 스캔" is a form on the home that calls
`enqueue_repository_rescan` — the same function the MCP tool calls — rate
limited, audited as `scan_requested`, with the outcome carried on the
redirect: `scheduled` (and whether it became a full relink), `never-scanned`,
`local`, `rate-limited`, `error`.

`tests/e2e/onboarding-progress.spec.ts` (2 tests, harness email session,
no GitHub) walks every state: an unscheduled connect, the pair queued, the
map's scanning state, a permanent scan failure with its reason on screen,
structure ready while analysis is still queued, the button queuing a new
free pair and saying so; and the local-push path to `/app/map` nodes > 0
with `analysis: local`. `journey.test.ts` gained 8 cases for the builder.

## The live run — measured

`tests/e2e/connect-backfill-live.spec.ts` drives the product path against
the real GitHub App and this repository's own worker, and gates itself
(credentials, network, App installed on the pilot, pilot readable) rather
than failing. It ran here, green, on 2026-09-12:

- **Pilot:** `2klips/alrescha-app` at `1eb4de7` (main after PR #7),
  installation `154681535`, connected through the real picker form; the
  redirect said `backfill=scheduled` — the head read worked on the first
  live attempt.
- **Workspace reused.** `github_installations.github_installation_id` is
  unique and this database already held the installation in the 2026-09-06
  pilot workspace, whose owner is not a harness user. The spec signs in as
  that owner through an admin magic link (nothing about the user changed —
  `signInExistingUser`) and connects there. The head was already backfilled
  by a first run of the same spec (killed mid-way, see below), so the
  measured pass was the **full relink at the same head** through the same
  queue function the button calls — `t2fv-live.json` says `measured:
  "rescan-full"`. The scan re-reads every blob either way.
- **Measured** (`todo-16/t2fv-live.json`, wall clock from the queue call,
  worker spawned by the spec with `WORKER_WORKSPACE_IDS`, `WORKER_CONCURRENCY=1`):

  | from the request to… | seconds | minutes |
  | --- | --- | --- |
  | structure ready at the head | 151.0 | 2.5 |
  | `/app/map` painted at the head (1,000 file nodes, settled) | 157.5 | 2.6 |
  | worker idle (analysis current at the head) | 157.6 | 2.6 |

  Per job, from the queue's own timestamps (claimed → completed): the full
  scan **35.6 s** (attempt 2) and **41.2 s** (the backfill's attempt 2, run
  from a shell); the analysis **83.9 s** and **65.9 s**. The wall clock is
  longer than scan + analysis because the scan's **first attempt failed**
  with `fetch failed (cause: UND_ERR_SOCKET)` inside the spawned worker, the
  analyze job (already queued, artifacts present from the earlier scan) ran
  during the backoff, and the scan then succeeded on its retry — the queue's
  retry did what it is for. Without the failed attempt the same pair is
  ~2 minutes; **either way T2FV is under the plan's 5-minute bar**, on this
  machine, for a 1,170-blob repository. Production (Fly, 2026-09-12) measured
  the same full scan at 55.5 s; it has not measured connect-to-map.

  The plan's "T2FV(연결→의미 있는 첫 화면)" as *the user* would live it also
  includes the worker's poll interval (2 s idle sleep) and, in production,
  the analysis only if one counts findings as the first useful screen. The
  map opens on structure; that is the number in the second row.
- **After:** the pilot repository row reads structure ready and analysis
  current at `1eb4de7` (`data_revision` 25), 1,403 nodes / 5,845 edges for
  the repository, 127 active requirements, 200 open findings, 0 evidence
  rows (no Actions — todo 18's gate). Screenshots: `todo-16/live-home-queued.png`,
  `live-home-structure-ready.png`, `live-home-analysis.png`, `live-map.png`.
- **Side effects on the local pilot workspace, stated:** a stale `enrich`
  job queued on 2026-09-06 was drained by the first (killed) run's worker
  with the provider keys replaced (`e2e-disabled`), failed three times on
  `fetch failed` and ended `failed: worker lease expired`; no credit was
  spent (the ledger settles a failed reservation as a refund). The spec
  replaces the keys precisely so nothing but scan and analyze can do work.

## Also changed, and why

- `run-local.ts` takes `WORKER_WORKSPACE_IDS` (comma-separated) to drain
  only those workspaces — a browser test on a shared local database, or an
  operator replaying one tenant. Unset drains all, as before.
- `worker.ts` appends the `cause` of a failure to `last_error` when there
  is one. `fetch` says "fetch failed" for every network failure and hides
  the reason in `cause`; the first live run's scan failed three times on
  those two words. `UND_ERR_SOCKET` is what the second run recorded.
- `tests/e2e/global-setup.ts` warms `/app/map`.

## Verification

`pnpm lint`, `pnpm typecheck` (root and every workspace), `pnpm test`,
`node --import tsx scripts/verify-scope-boundaries.ts` (PASS, 12 boundaries,
359 files), `npx playwright test` on `onboarding-progress`, `connect-backfill-live`,
`app-home`, `workspace-map`, `map-verified`, `local-ingest-card`, and the
`app-workspace`/`app-map` theme and axe sweeps — numbers in the session
report.

## Not verified here

- **A first connect into a fresh workspace, live.** The measured pass was a
  full relink at an already-backfilled head (above). The connect itself —
  token, head read, pair queued — was exercised live twice (both spec runs
  landed on `backfill=scheduled`), and the fresh-workspace path is what the
  spec takes on a clean database; that path has not run on this machine.
- **The socket error's origin.** The scan's first attempt failed only when
  the worker was spawned from the Playwright process; a worker started from
  a shell, minutes earlier, succeeded on its first attempt. The cause is
  now recorded; what closes the socket is not known.
- **The worker source factory per kind** stays with todo 20's `docskeleton`
  (the first kind that reads only stored rows), as the two earlier notes
  decided.
