# Task 15 evidence — hosted stateless MCP

Date: 2026-08-11

## Delivered

- MCP 2026-07-28 stateless Streamable HTTP endpoint at `POST /api/mcp`, with `server/discover`, private `ttlMs` cache hints, and no session header.
- Per-user SHA-256-hashed bearer tokens with read/write scopes, one-time secret display, list, revocation, expiry checks, and owner-scoped RLS.
- Five resources: overview, artifact inventory, findings, receipt summary, and context packs.
- Seven tools: `search_index`, `query_brain`, `get_artifact`, `request_context_pack`, `get_findings`, `log_progress`, and `record_note`.
- Deterministic index ranking: exact → title/heading → path/symbol → graph neighbor.
- Fire-and-forget minimal `access_events` persisted and broadcast on `workspace:<id>:access-events`; event failure cannot fail a read response.
- Metadata-only index persistence. Token secrets, prompt text, task text, queries, raw code, and excerpts have no event/index persistence columns.
- Settings surface at `/app/settings/mcp`; unauthenticated access redirects to `/auth/login`.

Implementation follows the official [MCP 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) and [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## SDK contract evidence

The official 2026-07-28 SDK client passed 12 hosted-MCP contract cases covering:

- discover output, supported protocol version, private TTL, and absence of Sampling/Roots/Logging;
- all five resource schemas and all seven tool input/output schemas;
- settings-issued token authentication, revocation, scope errors, and tenant denial;
- exact/title-heading/path-symbol/neighbor ranking and type filtering;
- structured graph queries, artifact-neighbor summaries, findings grades, and context packs;
- ADR-006 progress validation, atomic writes, note recording, and non-mutating tool inventory;
- minimal access-event payloads, realtime channel delivery, and logging-failure isolation;
- shared-client cache partitioning and absence of `Mcp-Session-Id`.

## QA scenarios

| Scenario | Result |
| --- | --- |
| Settings-issued token fetches fixture findings | pass; SDK client returns provenance-backed inferred finding |
| Revoked token | pass; SDK client receives `UnauthorizedError` |
| Cross-tenant resource request | pass; only principal workspace URIs/data are visible |
| Missing bearer token | pass; `POST /api/mcp` returns 401 + `WWW-Authenticate` |
| Session/deprecated transport path | pass; `GET /api/mcp` returns 405 and no session header is emitted |
| Auth boundary render | pass; `/app/settings/mcp` redirects 307 to meaningful `/auth/login`; no browser console warning/error |

## Acceptance commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run packages/mcp/src/hosted.test.ts tests/mcp-persistence.test.ts apps/web/app/app/settings/mcp/token-manager.test.tsx` | pass; 16 tests |
| `pnpm test` | pass; 25 files, 124 tests |
| `pnpm lint` | pass; zero warnings |
| `pnpm typecheck` | pass; root and all workspace packages |
| `pnpm build` | pass; MCP package and Next routes `/api/mcp`, `/app/settings/mcp` compiled |
| `pnpm test:e2e` | pass; 11 Chromium scenarios |

Browser QA used the in-app browser at `http://127.0.0.1:3000` with the default desktop viewport. Authenticated token issuance was verified through component, SDK, and Postgres RLS tests because the local browser had no configured Supabase session.
