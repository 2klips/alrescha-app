# Wave C todo 16 — first-run progress and "다시 스캔" on the workspace home

## Objective and acceptance

Close the screen half of Phase 4 Wave C todo 16: the `/app` home shows the first run's two stages (structure, analysis) from stored rows, offers "다시 스캔" once a scan has landed, and `/app/map` reads "scanning" rather than "connect" while a connected repository's first scan is in flight. Acceptance is the plan's: e2e "레포 연결 → 진행 표시 → `/app/map` 노드 > 0", plus the remedy's two-state split (structure-ready ≠ analysis-pending) asserted on screen.

## Starting state and isolation

- Start SHA: `1eb4de74514fe5e8c9c0ac0241edf395f8dce6da` (`origin/main` after PR #7), worktree `wave-c-todo16-18`.
- Desktop web only; both themes through the existing token set. No new colours, no new scale values.

## Screens touched

- `/app` (`home-screen.tsx`): the graph step gains `.home-scan` — an ordered list of two stages carrying `data-stage` / `data-stage-state` (`idle · queued · running · ready · failed · local`), the commit under scan, the failure reason verbatim when the queue failed a job (WORK_SPEC §4.5), and the rescan affordance in four states (`available` button, `busy` disabled button, `never-scanned` hint, `local` hint). The outcome of a rescan or an unscheduled backfill arrives in the query string and renders once as a status line; nothing about the progress is derived from the URL.
- `/app/map` (`map-screen.tsx`): the empty state reads `data-map-empty="scanning"` with the repository's name and a link back to the progress when a repository is connected and has no nodes yet; `data-map-empty="connect"` otherwise.
- Copy: `lib/strings/home.ts` (`HOME.scan.*`, `journey.graph.notScheduled`, updated `scanning` copy — a push is no longer the only way to start a scan), `lib/strings/map.ts` (`empty.scanning*`). Two CLI command names (`alrescha serve --local`, `alrescha push`) joined `CONVENTIONAL_ENGLISH_TERMS` as identifiers shown verbatim.
- Styles: `styles/screens/home.css` — stage list, state chips, error line, the button form of `.home-step-cta`.

## Model

`lib/home/journey.ts` — `buildScanProgress(repository, jobs)`: the newest job of each kind decides a stage while it is queued, running or failed; otherwise the repository row does (`last_scanned_commit_sha`, `last_analyzed_commit_sha`). A repository with no installation reads `analysis: local` (the hosted worker never analyses it — todo 17). The loader adds one query: the newest repository's last 20 jobs through RLS, the same read the commit cards make.

## Verification

- `apps/web/lib/home/journey.test.ts` — 8 new cases for the stage builder (pair queued, unscheduled connect, structure-ready/analysis-pending split, current analysis, failed scan with reason and rescan availability before/after a first landing, newest-job precedence, local repository, failed analysis).
- `tests/e2e/onboarding-progress.spec.ts` — the seeded walk through every state the screen can show, and the local-push path to `/app/map` nodes > 0.
- `tests/e2e/connect-backfill-live.spec.ts` — the live path (real GitHub App, real worker), gated on the machine's credentials; records T2FV to `.omo/evidence/phase4/todo-16/t2fv-live.json`.
- Results are in `.omo/evidence/phase4/todo-16.md` (2026-09-12 section).
