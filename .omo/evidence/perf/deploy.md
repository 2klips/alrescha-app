# Perf research mid-term wave 1 — production deploy (2026-09-03)

Commits: `9a4f05a` (e2e fixture name), `7e016c2` (MT-4), `0d73fd6` (MT-10),
`b42520b` (MT-3), `75b0538` (changelog). Rebased onto `233195a`, which had
landed on `main` while this wave was in progress.

## Gates before pushing

Run on the rebased tree, from the worktree:

| gate | result |
| --- | --- |
| `pnpm lint` | clean (`--max-warnings=0`) |
| `pnpm typecheck` | clean across all 6 workspace projects |
| `pnpm exec vitest run` | 139 files, **1040 passed / 1 skipped** |
| `pnpm test:e2e` | **125 passed / 1 skipped**, against a running local Supabase |

Two of those e2e specs were failing on `main` before this wave for an
unrelated reason — they clicked a repository button named `2klips/arr-app`,
which the naming cleanup in `2615910` had renamed to `2klips/alrescha-app`.
Verified failing at `3826fa5` with the wave's changes reverted, then fixed in
`9a4f05a`.

## Web — Vercel

`git push origin HEAD:main` → `233195a..75b0538`.

```
gh api repos/2klips/alrescha-app/commits/75b0538.../status
→ {"state":"success","statuses":[{"context":"Vercel","state":"success"}]}
```

Smoke, `arr-app-web.vercel.app`:

| route | status | total time |
| --- | ---: | ---: |
| `/` | 200 | 0.77 s |
| `/graph?node=req-auth` | 200 | 0.78 s |
| `/receipts` | 200 | 0.56 s |
| `/api/mcp` (GET) | 405 | — |

The 405 is correct: the hosted MCP endpoint is POST-only, so a GET proves the
route is mounted without asserting anything about a session.

## Worker — Fly.io

`flyctl deploy --remote-only` from the **repository root** (where `fly.toml`
is). The root checkout was on `3826fa5`, two commits behind, so it was
fast-forwarded to `75b0538` first — a first deploy attempt was stopped during
the build once that was noticed, because it would have shipped the old
scanner. The fast-forward touched 36 files and none of the ones already
modified in that working tree.

- **v14**, image `arr-worker:deployment-01M1KTYZKH7CM2K3WHGATB5S0D`
  (2026-09-03 14:32 UTC; rollback target v13
  `deployment-01M1H7G6E1AY8DNRX26JVD44HA`).
- Both `nrt` machines rolled; the active one logged
  `worker local-634 draining 1 workspace(s) across 4 loop(s)` at 14:33:05.

## What each item is now exercised by

- **MT-4** (graph frames) and **MT-10** (MCP tool definitions) are live on
  Vercel as of the successful build above.
- **MT-3** (concurrent scan fetch) is **not yet exercised in production by the
  push that shipped it**: the webhook scan for `75b0538` ran at 14:30:13,
  before the v14 rollout at 14:32:55, so it was handled by v13. The first scan
  under v14 is the one triggered by the push that adds this file — result
  recorded below.

`SCAN_FETCH_CONCURRENCY` is unset in production, so the scanner uses its
default of 8. It can be set to `1` on the Fly app to restore the old
sequential behaviour without a deploy, and the plan is identical either way.

## First v14 scan

Push `80e233e` (this file) → webhook → the first scan on v14:

```
2026-09-03T14:34:20Z  scan @80e233e → 3 rows
2026-09-03T14:34:20Z  local-634-0 job → succeeded
```

No errors, no 401s and no 429s in the worker log since the v14 rollout.

What that proves and what it does not: it proves the restructured scanner runs
correctly in production against real GitHub. It does **not** measure the
speed-up, because this is an *incremental* scan — the blob-sha skip resolves
almost every file before any fetch, so there were only a handful of bodies to
request and nothing to overlap. The concurrency win lives in the **first** scan
of a newly connected repository, which cannot be reproduced on an
already-onboarded workspace. The next repository onboarding is where to look
for it, and `jobs.started_at → finished_at` for that scan is the number to
take (measurement programme item 4).
