# Task 5 evidence — typed evidence-graph domain

Date: 2026-08-10

## Delivered

- Ordered Postgres migrations for GitHub installations, repositories, graph nodes, artifacts, requirements, evidence, edges, findings, receipts, runs, jobs, credit ledger, MCP tokens, index entries, and access events.
- Composite tenant foreign keys, indexed foreign-key/query paths, forced RLS, and member-read/service-write grants.
- NOT NULL provenance and bounded confidence at SQL and Zod layers for edges and findings.
- Strict Zod schemas with branded stable ULIDs for all requested domain records.
- Checksum-protected `pnpm db:migrate` runner with advisory locking and transactional migration application.
- Mini evidence graph seed in the acceptance suite. Persistent artifacts omit raw code bodies; access events retain token/tool/node ids/timestamp without prompt text.

## Acceptance evidence

| Command | Result |
| --- | --- |
| `pnpm test -- domain-model` | pass; 7 migration/domain/negative tests |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass across root and all workspace packages |
| `pnpm test` | pass; 41 tests in 7 files |

The migration-from-scratch suite executes both ordered SQL migrations in isolated PostgreSQL, then verifies the requested tables, forced RLS, representative indexes and composite foreign keys. It builds an artifact → requirement → evidence graph. Missing edge provenance fails both Zod parsing and a SQL NOT NULL constraint. A cross-workspace repository/node insert fails its tenant composite foreign key.

## Deferred environment-only verification

The production runner's live `DATABASE_URL` connection was not invoked because this workspace has no local Postgres/Supabase service or deployment credentials. The same ordered migration files execute from scratch in the database acceptance suite; live connection/TLS smoke verification remains deployment setup work.
