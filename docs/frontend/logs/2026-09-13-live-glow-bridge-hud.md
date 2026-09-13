# Live glow bridge and real-data HUD on `/app/map` (Phase 4 Wave B todo 15)

## Objective and acceptance

Close D10: the browser never subscribed to the workspace's Realtime
channel, so the map's glow only ever came from the demo replay, and the
HUD's numbers were typed-in constants. Acceptance (from
`spec/BUILD_PLAN_PHASE4.md`): a real MCP `search_index` call lights the
open map without a reload (Playwright, local Supabase Realtime); a
cross-tenant join is refused; HUD values equal the loader's own reading of
the stored rows. Todo 24's remaining browser criteria were closed in the
same session (see the evidence file).

## Starting state and isolation

- Start SHA: `26b0d1d` (`origin/main` after PR #15), branch
  `phase4/todo-24-15`.
- Desktop web only. One new migration (a `select` policy on
  `realtime.messages`, guarded), no dependency changes.
- Two files modified concurrently by Codex in the same checkout
  (`.omo/evidence/phase4/pr14-production-rollout-2026-09-13.md`,
  `docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-13-enrich-archive.md`)
  were left untouched and uncommitted.

## What changed

- `supabase/migrations/202609130001_access_events_channel_policy.sql` —
  members of `<id>` may `select` broadcast frames on
  `workspace:<id>:access-events`; nobody may insert. No-op where
  `realtime.messages` does not exist (PGlite).
- `apps/web/lib/realtime/access-events.ts` — `parseBroadcastAccessEvent`
  (six-field whitelist), `accessEventTargetPath`, `workspaceAccessChannel`.
- `apps/web/lib/realtime/supabase-bridge.ts` — private-channel bridge with
  tenant/revoked filters and exponential-backoff rejoin, testable without
  a socket.
- `apps/web/app/ui/workspace-realtime-bridge.ts` — the hook; status is
  exposed as `main[data-live-channel]` and as words beside "Live".
- `apps/web/lib/mcp/supabase-store.ts` — publishes on the private topic
  (a public publish never reaches a private subscriber — measured).
- `apps/web/lib/map/workspace-map.ts` — `WorkspaceMapModel.hud`
  (coverage with basis, last scan and age, risk top 3, open findings);
  `apps/web/lib/inspection/inspection-report.ts` — risk queries and
  mapping shared with the inspection loader.
- `apps/web/app/app/(shell)/map/map-screen.tsx` — HUD chips with source
  lines, the risk list, channel status; `map-hud.css` styles from tokens.
- `apps/web/lib/dashboard/graph-model.ts` — demo metrics derived from the
  fixture (`deriveDashboardMetrics`); `demo-harness.ts` shares the demo
  instruction rows with `/harness`; `dashboard-screen.tsx` renders `측정
안 됨` for a metric without a basis; evidence copy in
  `lib/strings/dashboard.ts` is a function of the metrics.

## Screens touched

`/app/map` (rail: three HUD chips, risk top-3 list, channel status by the
feed), `/map` (chip numbers now derived; no-CI state shows `측정 안 됨`),
`/` overview (null percentages render as `측정 안 됨`), `/harness` (same
table, rows moved to a shared module).

## Verification

- Unit: `tests/realtime-bridge.test.ts` (11), `tests/realtime-channel-policy.test.ts`
  (6), `tests/dashboard-demo-metrics.test.ts` (6), `tests/workspace-map.test.ts`
  (+5), `apps/web/lib/mcp/supabase-store.test.ts`. Full `pnpm test`: 192 files / 1,769 passed / 1 skipped.
- Browser: `tests/e2e/live-glow.spec.ts` 3/3; `tests/e2e/instruction-cost.spec.ts`
  8/8 (todo 24: two-theme axe 0 violations ×4, real-repository ±10%); full
  Playwright suite: 158 passed / 1 skipped / 0 failed.
- `pnpm lint`, `pnpm typecheck`, `scripts/verify-scope-boundaries.ts` PASS,
  `git diff --check` clean.

## Left open

OQ-069 (revoked-token set is a load-time snapshot), canvas risk rings on
the live map (loader does not yet carry `GraphNode.risk`), freshness does
not tick while the page stays open. Details in
`.omo/evidence/phase4/todo-15.md`.
