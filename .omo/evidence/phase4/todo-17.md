# Phase 4 · Wave C · todo 17 — a local repository, served where its files are

**Date:** 2026-09-06 · **Scope:** `packages/mcp/src/local-workspace.ts` (new),
`packages/mcp/src/local-serve.ts` (new), `packages/mcp/src/{hosted,store,index}.ts`,
`packages/cli/src/{serve.ts (new),alrescha.ts,messages.ts,package.json}`,
`apps/web/lib/mcp/supabase-store.ts`, `apps/worker/src/run-local.ts`,
`supabase/migrations/202609060007_local_repository_rescan.sql` (new),
`tests/local-serve.test.ts` (new), `packages/{mcp,cli}/src/*.test.ts` (new),
`tests/backfill-and-rescan.test.ts`.

## OQ-030, decided

A repository ingested with `alrescha push` gets a graph on the server and
never gets an analysis: the worker mints an installation token to read
bodies, and a local repository has no installation. The three candidates were
a local serving mode, letting the hosted worker analyse it, or leaving it as
a graph-only bridge.

**⑵ is rejected.** Analysing a local repository server-side means uploading
file bodies. Hard rule ③ forbids it and ADR-015 §6 already settled the same
question for receipts. The bodies are not going to the analysis, so the
analysis goes to the bodies.

**⑴ is adopted.** `alrescha serve --local [directory]` scans in place,
projects the plan into an in-memory workspace and serves it over stdio MCP.
No server, no token, no network — the whole path is one process reading one
directory.

## The risk in that, and what holds it

The server turns a scan plan into nodes, edges and index entries in ~830
lines of SQL. The local path has to produce the same graph in TypeScript,
which is a **second implementation of a rule that already exists** — the
exact shape that has gone wrong here repeatedly: four hand-copied
vocabularies had fallen behind by the time step S2 found them, and one of
them was dropping 436 edges silently.

So the projection is not trusted, it is compared. `tests/local-serve.test.ts`
runs the same plan through `public.apply_repository_scan` on real PostgreSQL
and through `buildLocalWorkspace`, then asserts they agree — for both layout
fixtures — on:

- every edge, keyed by what names its endpoints (`artifact:<path>`,
  `directory:<path>`, `route:<url>`, `db_object:<name>`, `section:<token>`,
  `rationale:<sourceKey>`), with its relation, family and tier;
- **what was left out**, by relation and count, with the same reason string
  (`contains` is excluded from both readers on purpose — the omission reason
  now lives in `store.ts` and both readers call it, rather than one of them
  carrying a copy);
- every index entry: path, type, title, symbols, tags, search key and
  neighbour set;
- every route (URL, tier, methods), database object (name, kind, declaring
  file and line) and section (token, heading, home).

Two divergences the comparison caught, both fixed toward the SQL:

- **Route ordering and layout containment.** A layout serves every URL
  beneath it *by path*, not by URL — a route group's layout has the same URL
  as the root one.
- **The neighbour cache is smaller than the graph.** The SQL fills
  `index_entries.neighbor_ids` immediately after the document links and
  *before* it derives directories, routes, database objects and sections, so
  a stored neighbour set names files and rationales and nothing else. The
  projection now counts the same three writers. Filling more would have
  looked like an improvement and been a divergence; it is recorded as
  **OQ-057** instead.

## The tool surface is the hosted one

`createMcpServerFor` exports the factory `createHostedMcpEndpoint` already
used, so stdio and HTTP register the same 23 tools from the same code. A tool
that existed on one transport only would make "which transport am I on"
something an agent has to reason about.

**Read scopes only.** The write tools record workspace memory — progress,
notes, assertions — and this store dies with the process. The principal
carries `mcp:read`, so a write is refused with the scope it needs rather than
accepted into something that will vanish.

**stdout is the wire.** Every human-facing line goes to stderr; the CLI test
asserts `console.log` is never called on the serve path.

## The decision, made executable

Deciding that the hosted worker never analyses a local repository leaves a
live gap that todo 16 opened: `request_rescan` would happily enqueue a scan
for a local-ingest repository, and the worker then failed it three times with
a message about installation tokens. `enqueue_repository_rescan` now refuses
before a job exists and names where the work happens. The worker's own error
message says the same thing, for a job queued before this migration.

`tests/backfill-and-rescan.test.ts` gained the refusal, and its fixture
repository is now GitHub-connected — the only state the hosted scan path can
serve. Nothing was loosened: every existing assertion stands, on a correct
precondition.

## Verification

`pnpm lint`, `pnpm typecheck` (root and all six workspaces),
`node --import tsx scripts/verify-scope-boundaries.ts`, `npx vitest run`
— numbers in the session report.

**A real client, against the real command.** `StdioClientTransport` spawning
`node --import tsx packages/cli/src/alrescha.ts serve --local
fixtures/drifted-demo`, and a hand-driven JSON-RPC client over the same
process:

```
initialize -> alrescha            tools -> 23 tools
search_index("session") -> src/session.ts, rank exact,
  neighborIds [docs/adr/ADR-001-session-timeout.md, tests/session.test.ts]
stdout lines: 3   (three JSON-RPC responses; all prose on stderr)
```

The startup lines, on stderr:

```
로컬 서빙 · …/fixtures/drifted-demo
이 경로는 아무것도 전송하지 않습니다 — 서버·토큰 없이 이 머신 안에서만 읽습니다.
준비됨 · 파일 15개 · 관계 5개 · 건너뜀 0개
읽기 전용 — …쓰기 도구는 거절됩니다.
그래프 전용 — Findings·Receipt·요약은 없습니다…
```

## Not verified here

- **BYOK enrich is not built.** OQ-030 ⑴ describes calling a provider
  directly when a key is present, reusing the prose validator. The provider
  clients live in `apps/worker/src/ai-providers.ts` (724 lines, with the key
  envelope and the credit lifecycle around them); moving them into a package
  the CLI can use is its own change with its own risk to the hosted path, and
  bundling it here would have made the equivalence work harder to review.
  The served graph is deterministic and complete; every file's prose reports
  `missing`, which is the honest state and the one every reader already
  handles. This is the one part of the OQ-030 candidate left undone.
- **The built binary does not run standalone.** `packages/cli/dist/alrescha.js`
  leaves `@alrescha/core` and `@alrescha/mcp` external, and both export
  TypeScript. That was already true of `push` before this todo — `serve` is
  run the same way it is: `node --import tsx packages/cli/src/alrescha.ts`.
  Publishing a runnable `alrescha` binary is a packaging job nobody has
  scheduled.
- **The 2025 handshake is accepted here and refused on HTTP** (OQ-058).
  Measured, not assumed: the SDK's own `StdioClientTransport` opens with the
  2025 `initialize`, so `legacy: "reject"` would refuse the reference client.
  Nothing about the surface differs — the same factory serves both eras, and
  no session, sampling or logging capability exists.
- **The worker source factory is still GitHub-only.** The plan (todo 16) asks
  for per-kind lazy creation so a DB-only deterministic job runs on a CLI
  repository. That job still does not exist — scan, analyze and enrich all
  need bodies — and after this todo the hosted worker cannot receive a job
  for a local repository at all. The split waits for todo 20's `docskeleton`,
  which is the first kind that reads only stored rows and whose acceptance
  already names it.
- **No e2e.** Docker is unavailable on this machine, so every Playwright spec
  Waves A/A′/C touched still owes a run.
- **The projection assumes a full scan into an empty store**, which is what
  `serve --local` always does. It is not a general replacement for
  `apply_repository_scan`: the deletes, the todo identity migration and the
  survive-if-unscanned rules exist to reconcile with stored rows, and there
  are none here. The equivalence test scans into an empty database for the
  same reason.
