# Task 4 evidence — auth and solo-workspace tenancy

Date: 2026-08-10

## Delivered

- Supabase SSR browser/server/admin clients, GitHub OAuth entry/callback, auth-session proxy, and protected personal-workspace page.
- `auth.users` trigger that provisions exactly one personal workspace and owner membership for each user.
- Database-enforced RLS and least-privilege grants for workspaces, repositories, findings, receipts, MCP tokens, and credit ledger rows.
- Server-side repository authorization returning 401 for unauthenticated access, 403 for cross-workspace access, and safe repository DTOs for members.
- Team-ready workspace/member schema without invite or team UI.

## Acceptance evidence

| Command | Result |
| --- | --- |
| `pnpm test -- auth-tenancy auth-route` | pass; 15 database and route authorization tests |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass across root and all workspace packages |
| `pnpm test` | pass; 34 tests in 6 files |

The database suite runs the migration from scratch in an isolated PostgreSQL-compatible PGlite instance. It proves automatic solo-workspace provisioning, valid ULIDs, read isolation for all six tenant-owned resources, and blocked cross-tenant inserts, updates, and deletes. Route tests prove 401/403 behavior and verify that unauthorized requests do not expose repository data.

## Deferred environment-only QA

Live Supabase OAuth signup and browser redirect QA require a configured Supabase project, GitHub OAuth credentials, and Playwright browser environment. This environment has none of those credentials and no local Supabase CLI/Docker runtime. The server-side callback, provisioning trigger, protected route, and direct cross-workspace API denial are covered by deterministic tests; live-provider smoke QA remains for deployment setup.
