# A renamed repository keeps its name: the selection goes by GitHub id

**Date:** 2026-09-12 · **Trigger:** the one acceptance the PR #10 production
rollout could not claim
(`.omo/evidence/phase4/pr10-production-rollout-2026-09-12.md`): re-selecting
GitHub repository id `1328886745` through the picker wrote the picker's stale
label `2klips/arr-app` over the canonical `2klips/alrescha-app` on the home
and the header. **Boundary:** production was neither read nor changed; no
row, name, timestamp, failed job, threshold, applied migration or GitHub
permission was touched. **Branch:** `claude/repository-canonical-name` on
`main@80a99cb`, commit `e615e3d`; **PR:**
<https://github.com/2klips/alrescha-app/pull/11>. **Scope:** `apps/web/lib/github/api.ts`
(`fetchRepositoryById`), `apps/web/lib/github/repository-identity.ts` (new,
+ test), `apps/web/lib/github/onboarding-store.ts` (`saveSelectedRepository`,
`refreshAvailableRepository`), `apps/web/lib/github/connect-repository.ts`,
`apps/web/lib/github/webhook-store.ts` (+ test), `tests/github-api.test.ts`,
`tests/e2e/connect-backfill-live.spec.ts`, `docs/frontend/{WORKLOG.md,logs/…}`,
`spec/OPEN_QUESTIONS.md` (OQ-066). No migration, no worker change, no new
string, no UI change.

## Why the name came back

The reproduction is a chain of four facts, each already in the code:

1. **The picker's inventory is written once.** `github_available_repositories`
   is filled by `savePendingInstallation` from GitHub's
   `/user/installations/{id}/repositories` when the OAuth callback runs, and
   by nothing else. The App subscribes to `push`, `check_run`, `workflow_run`
   and `installation` (`GITHUB_WEBHOOK_EVENTS`) — not to `repository`
   (`renamed`) or `installation_repositories` — so a rename on GitHub never
   reaches that table.
2. **The 2026-09-01 rename was repaired by name, in one table.**
   `202609010001_alrescha_repository_identity.sql` updated
   `repositories.full_name` from `2klips/arr-app` to `2klips/alrescha-app`
   and left the inventory row as it was. The picker lists the inventory, so
   it kept offering `2klips/arr-app`.
3. **A selection copied the inventory into the row.**
   `connectSelectedRepository` read the inventory row for the posted
   `githubRepositoryId`, minted a token scoped to that id, and handed the
   inventory's `full_name` and `default_branch` to `saveSelectedRepository`,
   which upserted them on `(workspace_id, github_repository_id)`. The id
   matched the canonical row; the name overwrote it. The head read that
   follows used the stale name too and only worked because GitHub answers a
   renamed path with a redirect.
4. **The webhook then stopped matching.** `resolveRepository` looked the row
   up by installation, GitHub id *and* `full_name`. A push carries the
   repository's current name; the row now said `2klips/arr-app`; every push
   to `2klips/alrescha-app` since the re-selection at
   `2026-09-12T13:43:36.972Z` has been acknowledged as
   `repository_not_selected` (202) and queued nothing. The rollout record
   did not observe this because the merge-push run it timed (`80a99cb`) was
   delivered before that re-selection.

Nothing in the chain is a data fault to repair by hand: the row holds what
the code wrote, and the code will write it again on the next selection
until it identifies the repository by id and stores what GitHub says now.

## The change

**GitHub's record, by id** — `fetchRepositoryById({ githubRepositoryId,
token })` (`api.ts`) reads `GET /repositories/{id}` with the
repository-scoped installation token the connect already mints — the
endpoint GitHub's own redirect for a renamed repository lands on, and the one
whose answer cannot be about another repository. It returns `{ repository }`
or `{ error }` (a status, a shape complaint, a network message — never a
body or the token), and refuses an answer whose `id` is not the one asked
for.

**What a selection stores** — `reconcileConnectedRepository` (new,
`repository-identity.ts`), called from the connect's `saveSelection`
callback once the token exists:

| GitHub answered                | inventory row                          | `repositories` row                                            | outcome                                     |
| ------------------------------ | -------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| yes, and it differs            | updated to the record (`observed_at`)  | upsert on `(workspace_id, github_repository_id)` with the record | `confirmed: true, renamed: true`            |
| yes, and it matches            | untouched                              | same upsert                                                   | `confirmed: true, renamed: false`           |
| no (status, shape, wrong id, no token) | untouched                       | existing row: only `selected_at` and `installation_id` move — its name stands; no row: the inventory's values, which are all there is | `confirmed: false, reason` |
| yes, but the name is another row's (`23505`) | updated                  | existing row keeps its own name                               | `confirmed: false, reason` (name taken)     |

The head read that keys the backfill then uses what the row holds, so a
rename also fixes the branch path and a changed default branch is read at
its new name. The connect's result carries `metadata` (the row's record,
`confirmed`, `renamed` or `reason`), and the existing `repository_selected`
audit row gains `{ metadataSource: "github" | "inventory", kept, renamed }`
so the production check below is a read of `security_audit_events`, not a
guess from the screen.

**The row is the identity** — `saveSelectedRepository` writes only through
the `(workspace_id, github_repository_id)` key (upsert, or an update filtered
by it), so a repeated selection is the same row. `resolveRepository`
(webhook store) matches a delivery on workspace, installation and GitHub id
and no longer on the name it carries: a push to a renamed repository finds
its row whether the row was renamed yet or not.

Both stores take an optional `SupabaseClient` (the pattern
`scheduleBackfillAtHead` already uses), which is what the unit tests fake;
the routes pass nothing and get the admin client as before.

## Red, then green

The three test files, run against `main@80a99cb` with the implementation
stashed (`repository-identity.ts` removed, the four edited modules restored):

| file                                            | before                                                                                | after |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | ----- |
| `apps/web/lib/github/repository-identity.test.ts` (9) | module missing                                                                  | 9 ✓   |
| `apps/web/lib/github/webhook-store.test.ts` (2)  | 2 × the store ignores the injected client and asks for the admin environment; the name filter is present | 2 ✓   |
| `tests/github-api.test.ts` (+3)                  | 3 × `fetchRepositoryById is not a function`                                            | 5 ✓   |

What the nine identity cases pin: the rename stores GitHub's name in both
tables and audits `renamed: true`; a matching record leaves the inventory
alone; a refused read (403) keeps the row's name and writes no name at all
(`update` carries only `selected_at`, `installation_id`); an answer naming
another id counts as no answer; a first connect with no answer stores the
inventory's values; a taken name keeps the row's name and says so while the
inventory still converges; any other write error throws instead of
pretending; no token means no GitHub call; three selections in a row all
resolve to the one row and every write goes through the id key. The
webhook cases pin the id-only match and the unchanged refusals (revoked
installation, no row). The API cases pin the by-id URL, the token in the
header and not the URL, the wrong-id refusal, and 403 / malformed / network
as reasons.

## Playwright — the live App on the pilot

`tests/e2e/connect-backfill-live.spec.ts` now seeds the inventory row under
`2klips/alrescha-app-before-rename` — the production situation, one label
off — clicks that label in the real picker, and asserts that the
`repositories` row for GitHub id `1328886745` and the inventory row both
carry `2klips/alrescha-app` afterwards and that the header names it. The
spec is gated on the App's credentials and on the App being installed on
the pilot, as before.

**Live run** (this machine: local docker Supabase, the real GitHub App on
the pilot, the local worker via `run-local.ts --once`; 30.6 s):

- **The rename assertions passed.** The picker listed
  `2klips/alrescha-app-before-rename`; the click answered
  `/app?github=pending&backfill=scheduled`; the `repositories` row for id
  `1328886745` and the inventory row both read `2klips/alrescha-app`; the
  page snapshot at the end shows the header `strong` and the connect step
  (`2klips/alrescha-app 연결됨`) naming the canonical repository. Before
  this change the same seed renamed the row to the stale label and the
  head read went to a path that does not exist.
- **The scan did not land, and that is not this change.** The spec's step
  4 (structure ready at the head) failed because the worker deferred the
  scan and exited idle. The job stayed `queued` — not failed — with the
  worker's classification from PR #9 as its `last_error`:

  ```text
  GitHub repository request failed: 403 primary-rate-limit; retry after 1051s;
  rate limit 0/5000 core, resets in 1051s
  (/repos/2klips/alrescha-app/contents/scripts/verify-benchmark-report.ts?ref=80a99cb…)
  ```

  This is the first classified 403 anyone has seen for this installation,
  and it is **primary**: the installation's 5,000-per-hour core budget was
  at 0. The budget is per installation and shared by every worker that
  mints its tokens, so the production worker's two full scans of
  `alrescha-app` at 13:44Z and 13:48Z (the merge-push pair and the picker
  backfill), its LostArk pair at 13:53Z, and this local full scan at
  ~14:20Z all drew on the same hour. A full scan is one recursive tree
  read plus one `contents` read per scanned file; the pilot has 1,211
  tracked files at `80a99cb`, so three full scans of it in one hour are on
  the order of the whole budget by themselves. The worker did what PR #9
  built it to do — deferred to the reset instead of burning attempts —
  and the local run is not repeated here so that the shared budget is
  left for the production verification below. No pacer or concurrency
  change follows from this record; it is evidence for that decision, not
  the decision.

## Gates (branch tip)

| gate                                                          | result                                       |
| ------------------------------------------------------------- | -------------------------------------------- |
| `pnpm lint`                                                   | clean                                        |
| `pnpm typecheck` (root + every workspace)                     | clean                                        |
| `pnpm test`                                                   | 188 files, 1,720 passed, 1 skipped (PR #10: 186 / 1,706) |
| Prettier `--check` on every changed file                      | clean                                        |
| `scripts/verify-scope-boundaries.ts`                          | PASS, 12 boundaries, 363 files               |
| `git diff --check`                                            | clean                                        |

## Rollout — for the Codex lane

**What to deploy:** the web, by merging the PR. **No migration** (no SQL
changed). **No worker deploy** (the worker reads `repositories.full_name`
for its API paths and never the inventory; a stale name there is answered
by GitHub's redirect, and the re-selection below makes it canonical). **No
environment variable.** Rollback is Vercel Instant Rollback to the `80a99cb`
deployment; nothing else to undo.

1. Merge the PR with a merge commit. **Expect the merge push itself to queue
   nothing:** the push webhook reaches the deployment that is live at that
   moment, which still matches by name against a row that says
   `2klips/arr-app` — `repository_not_selected`, 202. That is the last time
   it happens. Wait for Vercel: `/` 200, `/api/mcp` GET 405.
2. Open the picker (`/app/connect/github/repositories?installation=…`,
   linked from the home's `다른 레포 선택`). **It still lists
   `2klips/arr-app`** — the inventory is refreshed by a selection, not by a
   render (OQ-066). Click it.
3. Expect the home and the header to name `2klips/alrescha-app`, the picker
   (on return) to list `2klips/alrescha-app`, and a new backfill pair at the
   merge head, both jobs at 0 credits. **That pair is a full scan of the
   pilot (~1,200 `contents` reads).** If the installation's hourly budget
   is low from the day's scans, v18 defers the scan with the line quoted
   under "Live run" (`403 primary-rate-limit; retry after Ns`) and runs it
   at the reset — expected, and the production-side answer to PR #9's open
   question if it happens; record the line's kind and reset. Read-only
   checks (values are names, ids and booleans — nothing sensitive to keep
   out of the record):

   ```sql
   select full_name, default_branch, selected_at
   from public.repositories
   where github_repository_id = 1328886745;

   select full_name, default_branch, observed_at
   from public.github_available_repositories
   where github_repository_id = 1328886745;

   select created_at, metadata
   from public.security_audit_events
   where action = 'repository_selected'
   order by created_at desc
   limit 1;
   ```

   Expected: both `full_name` values `2klips/alrescha-app`, `observed_at`
   and `selected_at` at the click, and the audit metadata
   `{"kept": false, "renamed": true, "metadataSource": "github"}`. A
   `metadataSource` of `inventory` with `kept: true` means GitHub could not
   be read at that moment and nothing was overwritten — the row's name is
   whatever it was; click again.
4. The webhook fix shows on the next real push to either repository: a run
   appears for it (before this change, a push to `2klips/alrescha-app`
   produced none). The next PR merge is such a push. Nothing to force.
5. `pnpm ops:health`: unchanged — the 14 historical permanent failures until
   their window passes, queue 0 once the pair lands, no new failure.

## Not done here, and why

- **The picker is right after a selection, not before.** Refreshing the
  listing on render would need either a token scoped to every inventory row
  (one absent row fails the mint for all) or the `repository` /
  `installation_repositories` webhooks, which the App does not subscribe
  to. Recorded as OQ-066; not an expansion this fix should carry.
- **The URL connect path still finds repositories by name**
  (`findConnectedRepository`, `findAvailableRepository`). Until the
  inventory row is refreshed by one picker selection, pasting the canonical
  URL of a renamed repository answers `no_access`. Same OQ.
- `첫 레포를 선택하세요` during re-selection: wording, unchanged (per the
  handoff).
- No pacer or `SCAN_FETCH_CONCURRENCY` change; no 403 kind was observed by
  anything here.
