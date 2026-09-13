# PR #16 production live-glow and HUD verification

Codex, 2026-09-13 UTC. Tested PR tip `e652064`, deployed merge `5b8942a`.

Applied `202609130001_access_events_channel_policy.sql` and confirmed the single `access_events_channel_member_read` policy before merging PR #16. Vercel succeeded; `/` 200 and MCP GET 405. Fly v20 and environment settings remain unchanged.

On the pilot repository's production `/app/map`, the channel reached `live` and displayed `실시간 수신 중`. With the user's approval, issued one temporary `mcp:read` token through Settings → MCP. One `search_index` call succeeded, changed `data-glow-active` from 0 to 5 without a reload, and added the `search_index / AGENTS.md` feed row. Glow later returned to 0. Revoked the token immediately afterward through the product; read-only DB confirmation found exactly one event. Credits stayed 18.

HUD: 480 open Findings, 16% implementation coverage (21/131, basis `measured`), last scan `5b8942a` with elapsed time. The three risk paths and their order/levels match the inspection widget: `spec/BUILD_PLAN_PHASE4.md`, `spec/OPEN_QUESTIONS.md`, `.omo/evidence/phase2b/adr-015-assurance-boundary.md`. Both surfaces rank 678 files. Risk execution coverage is explicitly unmeasured; implementation coverage comes from `implements` edges.

Desktop QA confirmed the production page identity, rendered graph/HUD, and received feed row. No framework error overlay, console errors, or console warnings on map or inspection. Screenshots were inspected; transient glow was verified through the live DOM attribute, not assumed from a still image.

Operations: queue 0, new failed jobs 0, historical 15 failures WARN, other checks OK. Lint/typecheck PASS; 192 test files, 1,769 passed, 1 skipped. No application code edits or enrich execution. Existing enrich observation documents are preserved in the same documentation commit.

No required implementation follow-up. OQ-069 awaits a user decision; OQ-066/067/068 remain outside this rollout.

Full timestamps, migration/deployment evidence, token lifecycle, and health output: [production record](../../../.omo/evidence/phase4/pr16-production-rollout-2026-09-13.md).
