# Task 1 evidence — monorepo bootstrap

Date: 2026-08-09

## Delivered

- pnpm workspace: `apps/web`, `packages/core`, `packages/mcp`
- Next.js App Router shell with a tested custom not-found surface
- strict shared TypeScript config, ESLint, Prettier, Vitest, Playwright, tsup
- repo-native `AGENTS.md` plus `CLAUDE.md` wrapper
- staged environment-variable contract in `.env.example`

## Production dependency rationale

- `next`: required web application framework selected by ADR-007.
- `react`, `react-dom`: required Next.js UI runtime.
- No production dependencies were added to `packages/core` or `packages/mcp`.

## Acceptance evidence

| Command | Result |
| --- | --- |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass; all three workspace packages checked |
| `pnpm test` | pass; 2 tests |
| `pnpm exec playwright test --list` | pass; 2 Chromium scenarios listed |
| `pnpm exec playwright test` | pass; app shell and unknown-route scenarios |

`pnpm dev` was exercised by Playwright's managed web server at `http://127.0.0.1:3000`.

