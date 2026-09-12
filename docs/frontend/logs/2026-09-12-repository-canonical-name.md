# A renamed repository keeps its canonical name (PR #10 follow-up)

## Objective and acceptance

Close the acceptance the PR #10 production rollout could not claim
(`.omo/evidence/phase4/pr10-production-rollout-2026-09-12.md`): selecting
GitHub repository id `1328886745` through the picker wrote the picker's
stale label `2klips/arr-app` over the canonical `2klips/alrescha-app` on the
home and the header. Acceptance: after a rename, the picker, the home, the
header and the `repositories` row agree on GitHub's current name for the
same id; repeated selection creates no second row; a failed or mismatched
lookup damages nothing and is not reported as a refresh; tenant isolation
and PR #10's selection, retry and zero-credit contracts hold.

## Starting state and isolation

- Start SHA: `80a99cb` (`origin/main` after PR #10), branch
  `claude/repository-canonical-name`.
- No screen, string, route or migration changed. Desktop web only, as
  before.

## What the cause was

`github_available_repositories` is written once, by the OAuth callback, and
never refreshed (the App does not subscribe to `repository` or
`installation_repositories`). The 2026-09-01 rename was repaired in
`repositories` by name (`202609010001`) and not in the inventory; the
picker lists the inventory; `connectSelectedRepository` copied the
inventory's name into `repositories` on every selection; and the webhook
store matched deliveries on the name too, so pushes to the renamed
repository stopped queueing once the row was renamed back.

## Model

- `lib/github/api.ts` — `fetchRepositoryById`: GitHub's current record for
  the id the installation token was scoped to; refuses an answer about
  another id; returns reasons, never throws.
- `lib/github/repository-identity.ts` — `reconcileConnectedRepository`:
  refreshes the inventory row and stores the record when GitHub answered;
  otherwise marks the selection on the existing row without touching its
  name (a first connect stores the inventory's values). The connect result
  and the `repository_selected` audit row say which happened.
- `lib/github/onboarding-store.ts` — `saveSelectedRepository` writes only
  through `(workspace_id, github_repository_id)`; a `23505` on the confirmed
  name (another row already has it) keeps the row's name and says so.
- `lib/github/webhook-store.ts` — a delivery is matched on workspace,
  installation and GitHub id; no longer on the name it carries.

## Screens touched

None. The header (`context-strip.tsx`) and the home read the same row as
before; they now read the name GitHub has.

## Verification

- `apps/web/lib/github/repository-identity.test.ts` (9),
  `apps/web/lib/github/webhook-store.test.ts` (2), `tests/github-api.test.ts`
  (+3): red against the previous code, then green.
- `tests/e2e/connect-backfill-live.spec.ts`: the inventory row is seeded
  under a stale label; the real picker click must leave the `repositories`
  row and the inventory row at GitHub's name and the header naming it.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `verify-scope-boundaries`,
  Prettier on every changed file, `git diff --check`.
- Results, the rollout and what is left:
  `.omo/evidence/phase4/repository-canonical-name-2026-09-12.md`.
