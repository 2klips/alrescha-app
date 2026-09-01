# Alrescha compatibility identifier migration

**Date:** 2026-09-01

**Agent:** Codex

**Start SHA:** `4568c55`

**Result:** Complete

## Outcome

Active internal identifiers now use Alrescha. Legacy Arr inputs remain narrow read aliases for the current compatibility window; all new writes and generated output are canonical.

| Surface            | Canonical output                                                              | Legacy compatibility                                            |
| ------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Workspace packages | `@alrescha/*`                                                                 | private monorepo packages; no published package consumer        |
| CLI                | `alrescha push`                                                               | `arr` bin points to the same `dist/alrescha.js`                 |
| CLI env            | `ALRESCHA_SERVER_URL`, `ALRESCHA_TOKEN`                                       | `ARR_SERVER_URL`, `ARR_TOKEN` fallback; canonical wins          |
| Web MCP env        | `ALRESCHA_MCP_URL`                                                            | `ARR_MCP_URL` fallback; canonical wins                          |
| MCP                | server/config `alrescha`, `alrescha://`, `ALRESCHA_MCP_TOKEN`                 | clients rediscover canonical resources on connect               |
| Agent files        | Alrescha filenames/markers and `ALRESCHA:BEGIN/END`                           | existing complete `ARR:BEGIN/END` block is replaced in place    |
| Local state        | `.alrescha/`, `alrescha-theme`, `alrescha-sidebar`, `alrescha-graph-panel`    | legacy values read only when canonical value is absent          |
| Receipts           | new tool name `alrescha`                                                      | stored tool name `arr` still validates; predicate URI unchanged |
| Demo/export        | `alrescha/drifted-demo`, `workspace-alrescha-demo`, `alrescha.pilot-stats.v1` | fixture integrity metadata regenerated                          |

## Intentionally retained external IDs

- GitHub: `2klips/arr-app` and planning/marketing repository `2klips/arr`.
- Vercel/Fly: `arr-app-web.vercel.app`, `arr-worker`.
- Receipt predicate: `https://arr-app-web.vercel.app/receipt/v1`; changing it would invalidate stored receipt digests.
- Applied migration filenames/constants and PostgreSQL advisory lock `arr_migrations`; the lock must coordinate mixed-version deployments.
- Historical specs, ADRs, reports, benchmark outputs, and private `.arr-*` CSS selectors.

## Verification

- `pnpm lint` — pass.
- `pnpm typecheck` — pass across all workspace packages.
- `pnpm test` — 133 files passed; 984 tests passed, 1 skipped.
- `pnpm build` — core, CLI, MCP, worker, and Next.js production build pass; CLI emits `dist/alrescha.js`.
- `pnpm exec tsx scripts/verify-scope-boundaries.ts` — pass, 12 boundaries / 297 files / 0 forbidden paths.
- Targeted Chromium: library + release-hardening — 3 passed on isolated port 3100. Port 3000 was occupied by an unrelated local Next.js project, so no process was terminated.
- `git diff --check` — pass.
- Prettier check over all 170 changed task files — pass.
- Repository-wide `pnpm format:check` still reports three untouched pre-existing files: `apps/web/app/app/(shell)/team/page.tsx` and two F6 JSON outputs under `output/playwright/`. They remain outside this migration.

## Remaining

- Remove legacy aliases only in a separately versioned release after consumer/local-state usage is measured.
- Rename real GitHub/Vercel/Fly resources only after the user performs or authorizes those external operations; update immutable receipt policy separately.
