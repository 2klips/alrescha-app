# Phase 4 · Wave B · todo 15 — the wire that was never plugged in

**Date:** 2026-09-13 · **Scope:**
`supabase/migrations/202609130001_access_events_channel_policy.sql`,
`apps/web/lib/realtime/{access-events,supabase-bridge}.ts`,
`apps/web/app/ui/workspace-realtime-bridge.ts`,
`apps/web/lib/mcp/supabase-store.ts`,
`apps/web/lib/inspection/inspection-report.ts`,
`apps/web/lib/map/workspace-map.ts`,
`apps/web/app/app/(shell)/map/map-screen.tsx`,
`apps/web/lib/dashboard/{graph-model,demo-harness}.ts`,
`apps/web/app/ui/{dashboard-screen,overview-screen}.tsx`,
`apps/web/lib/overview/view-model.ts`,
`apps/web/lib/strings/{map,dashboard,overview}.ts`,
`apps/web/app/styles/screens/map-hud.css`,
`tests/{realtime-bridge,realtime-channel-policy,dashboard-demo-metrics,workspace-map}.test.ts`,
`tests/e2e/{live-glow,dashboard-hud,dashboard,pilot-flow}.spec.ts`,
`tests/helpers/database.ts`, `spec/OPEN_QUESTIONS.md` (OQ-069).

D10 in one sentence: the hosted MCP server has broadcast one `access_event`
per tool call since Phase 2A, the map has listened to a `window` bus since
Phase 2A, and **nothing connected the two** — the only thing that ever fed
the bus was the demo page's replay button. A signed-in user watching
`/app/map` while their agent read the graph saw nothing move. The plan
calls the glow the signature experience; until today it was a demo.

## 1. Who may listen — the policy

A Realtime topic is public unless the channel is joined as *private*, and a
public topic is readable by anyone holding the publishable key and a
workspace id. An access event names the nodes an agent just read, so the
channel is private, and a private join is authorised by a `select` policy on
`realtime.messages` evaluated as the caller with `realtime.topic()` set to
the requested topic. The new migration adds exactly one policy:

- `for select to authenticated`, broadcast frames only;
- topic must be `workspace:<id>:access-events`;
- `public.is_workspace_member(<id>)` — the same function every tenant
  table's read policy already uses, so channel membership *is* table
  membership.

There is deliberately **no insert policy**: a signed-in member can listen
and cannot publish. Realtime's table grant permits inserts (Supabase ships
it that way), so the absence of a policy is what refuses a forged frame —
`tests/realtime-channel-policy.test.ts` asserts the refusal is an RLS error,
not a privilege error, which is the difference between "blocked by design"
and "blocked by accident".

**Guarded.** `realtime.messages` exists on Supabase and nowhere else. The
unit-test database (PGlite) has no `realtime` schema, and a plain Postgres
restore would not either. The migration checks `to_regclass` and records
itself as a no-op on such a database rather than failing the ledger for a
table the product does not own. The policy test installs a stub of the
platform table — same columns, same grants, same `topic()` shape — and
applies the migration over it, then asserts member/non-member/other-topic
outcomes and the no-op path. The first version of the file carried its own
`begin;`/`commit;`; the migrate script wraps every file in a transaction
already, so the inner pair ended the outer one early. Removed, and the
local ledger row re-applied cleanly (checksums are verified).

**Measured over the real server** (`tests/e2e/live-glow.spec.ts`, local
Supabase Realtime v2.129.0): the owner's JWT joins `SUBSCRIBED`; another
workspace's member holding the owner's workspace id gets `CHANNEL_ERROR`;
and that member's own open map, live on its own channel, shows glow `0`
and an empty feed after the owner's agent calls `search_index` and the
`access_events` row has landed.

## 2. The bridge

`lib/realtime/supabase-bridge.ts` is written against a channel *shape*
(`on`/`subscribe`/`unsubscribe`), not the SDK, so the decisions that matter
run in vitest with a scripted channel:

- **Field whitelist.** `parseBroadcastAccessEvent` copies six named fields
  — id, ISO time, target node ids, token id, tool, workspace id — and
  drops everything else by construction. A frame carrying `prompt`,
  `text`, `responseChars` or any future field cannot reach the page; a
  frame missing or mistyping any of the six is dropped whole. This is
  ADR-004 ("no prompt bodies on the glow stream") enforced at the
  *receiving* end as well as the sending one.
- **Tenant and token.** The topic is already scoped by name and by policy;
  a frame naming another workspace is dropped anyway, and so is a token the
  page was told is revoked. `reduceAccessEventBatch` repeats both checks —
  there is no path to a lit node that skips them.
- **Reconnect is the bridge's, not the socket's.** The client reconnects a
  dropped socket, but a channel that ends in `CHANNEL_ERROR`/`TIMED_OUT`
  stays ended, and an expired session token between two joins is exactly
  that. Every non-final end opens a *fresh* channel after 1s, 2s, 4s …
  capped at 30s; the counter resets on join; a stale channel's late status
  is ignored; `stop()` cancels the pending retry and treats its own
  `CLOSED` as final. 11 unit tests pin these.
- **The join is a fact the page shows.** `main[data-live-channel]` carries
  the bridge's status and the feed badge says it in words (`채널 연결 중 ·
  실시간 수신 중 · 재연결 중`). A badge that said "Live" before the join
  landed would be a claim the page could not back — and the browser spec
  waits on `live` before making the tool call it expects to see.

**The one thing the probe had to teach.** The first live run joined fine
and saw nothing. `publishAccessEvent` published on the *public* topic; the
browser joined the *private* one; Realtime keeps the two apart. A Node
probe (private subscriber; one public `httpSend`, one private) received
exactly the private frame. The server now publishes with
`config.private = true`, the store test asserts it, and the glow test
passes: a real `search_index` over the product MCP endpoint, with a token
the settings form issued, lights the open map in the same document (a
window marker set before the call is still there after the glow), the feed
lists the call under `src/session.ts`, and the lit set empties on its own.

## 3. HUD chips — from rows, with sources

`WorkspaceMapModel.hud` is built by `buildWorkspaceMapHud`, pure, from
rows the loader reads:

| chip | value | basis / detail | source line |
| --- | --- | --- | --- |
| 미해소 Findings | `findings.status = 'open'` count | — | 저장된 Findings 행 |
| 구현 커버리지 | active requirements with ≥1 `implements` edge | `measured` / `no-links` / `no-data`, the progress ledger's three-way basis — never 0% for "never linked" | 요구사항 → 코드 implements 엣지 |
| 마지막 스캔 | `repositories.last_scanned_commit_sha` (7) | age of that commit's completion: a succeeded `scan` job (run's commit embedded) or a local push's completed run; `완료 시각 없음` when none matches | 성공한 스캔 잡 · 로컬 push 실행 |
| 위험 상위 | top 3 of the risk map, in its order, ring per band | ranked count; `커버리지 미측정` when the map says so | 위험 지도 — 저장된 엣지·Findings·공변경 |

Two rules kept the numbers honest:

- **Coverage is a count, so it is not a capped page.** The map's edge
  queries have per-family budgets (OQ-038); a coverage read through them
  would report a repository as *less* covered the larger it grew. The HUD
  reads every `implements` edge in a query of its own.
- **Risk is the inspection screen's map, from its rows.** The risk queries
  and the row→input mapping were extracted from `inspection-report.ts`
  into `riskRowQueries` / `riskMapFromRows` / `loadWorkspaceRiskMap`, and
  the inspection loader now consumes the same builders. Two loaders
  reading two limits would have ranked different files on two screens of
  the same product.

**"HUD 값이 로더 출처와 일치" is an equality, not a plausibility check.**
The browser spec seeds a scan, a local-push run 90 minutes old, two open
findings and one resolved, a requirement node and an `implements` edge,
then calls `loadWorkspaceMap` itself through the service role and asserts
the screen equals that model chip by chip: open findings, coverage basis
and percent, the commit and its age, the ranked count and the top paths in
order. A ranked row focuses its node like a hub row.

## 4. Demo constants, removed

`buildDashboardViewModel` carried `{ unresolved: 4, implementation: 84,
tests: 71, tokenCost: 1840 }` and the evidence panel carried matching prose
("missing-test 2 · stale-doc 1 · unproven-claim 1", "bad0551 GitHub
Actions 리포트") — numbers no fixture produced. `deriveDashboardMetrics`
now reads the unclustered fixture: badges summed (**5**, and 5 nodes),
requirements with an unbroken `implements` edge (**3/4 → 75%**), code with
a `verified` `tests` edge (**2/4 → 50%**; `null` in the no-CI state — the
old `0` was a measurement the fixture never made, and the chip now says
`측정 안 됨` rather than `0%`), and the always-loaded tokens from the demo
harness's own cost table (**80**, the root `AGENTS.md` at 4 chars/token —
the `/harness` demo and the `/map` demo now say the same number because
they call the same builder over the same fixture rows, moved to
`lib/dashboard/demo-harness.ts`). The evidence lines are functions of the
metrics, and the browser specs compute the expected text through the same
functions. Demo-route assertions are kept, not weakened: every chip still
opens its provenance, and the panel still carries the headline and the
source line. `/` (overview) renders `측정 안 됨` for a null percentage.

## 5. Verification

- Unit: `tests/realtime-bridge.test.ts` 11, `tests/realtime-channel-policy.test.ts` 6,
  `tests/workspace-map.test.ts` +5 (HUD), `tests/dashboard-demo-metrics.test.ts` 6,
  `apps/web/lib/mcp/supabase-store.test.ts` (private topic asserted).
  Full `pnpm test`: 192 files / 1,769 passed / 1 skipped.
- Browser: `tests/e2e/live-glow.spec.ts` 3/3 (glow without reload 27s ·
  cross-tenant join refused + other map dark 22.6s · HUD equality);
  full `npx playwright test`: 158 passed / 1 skipped / 0 failed.
- `pnpm lint`, `pnpm typecheck` (root + workspaces), `scripts/verify-scope-boundaries.ts`
  PASS (12 boundaries, 367 files), `git diff --check` clean.
- Local DB: `202609130001` applied through `scripts/migrate.ts`; policy
  present on `realtime.messages`.

## 6. Not done, and why

- **Revocation after page load is a snapshot** — the bridge and the reducer
  filter with the token set the loader read. A token revoked mid-session
  cannot make new calls, so no new frames arrive; only frames published in
  the seconds before the revocation could still light the open page.
  Recorded as **OQ-069** with three options; default is to keep the
  snapshot rather than add a second channel and a second policy for it.
- **The demo's evidence prose is thinner than before.** "missing-test 2 ·
  stale-doc 1" was invented; the fixture graph has badge counts and no
  finding kinds, so the panel now says how many nodes carry a badge. A
  richer demo needs richer fixture data, not richer copy.
- **Freshness is computed at load.** The age is the server's reading when
  the page was built, formatted in the coarsest honest unit; a page left
  open does not tick. The same is true of every other chip.
- **`GraphNode.risk` is still not fed on the live map** (todo 12's note).
  The HUD ranks from the same map the inspection screen draws, but the
  canvas rings on `/app/map` still wait for the loader to carry `risk`
  onto nodes — a separate, small change that this todo did not fold in.
