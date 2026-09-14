# PR #17 production verification — todo 13 map panel

Status: **Deployed; the five requested behaviors and the demo preset passed. Reload-dependent checks passed after retrying one HTTP 500. The timeout's underlying cause remains unconfirmed.**

Codex performed this rollout on **2026-09-14 UTC / KST**. The filename retains the September 13 date explicitly requested in the handoff. Scope: web merge and production verification; no application code edits.

## Merge and deployment

- [PR #17](https://github.com/2klips/alrescha-app/pull/17): merged at **2026-09-14T06:21:56Z** (**15:21:56 KST**).
- Merge SHA: **`4c540973cb4995b3874a215a265976dbea5f298f`**.
- Both original commits preserved: `ff622d8e60439bbfacd94fdf91e97355e57292d9` and `56233a4471a91c74a4b9a0ad56b90d1c8b81d0f6`; merge commit, no squash.
- Base `c0d8aea` was already on `origin/main` at preflight. Local `main` fast-forwarded to the merge; its tree matches the tested PR tip `56233a4`.
- Vercel production status changed to **success at 2026-09-14T06:22:26Z** (**15:22:26 KST**).
- [Deployment details](https://vercel.com/2klips-projects/arr-app-web/7TLeBhdnDYG6k49Xva8kvf36dqRi), deployment ID `dpl_7TLeBhdnDYG6k49Xva8kvf36dqRi`.
- Production: [workspace map](https://arr-app-web.vercel.app/app/map), [demo map](https://arr-app-web.vercel.app/map). Root HTTP **200**, MCP GET **405**.
- Fly remains **v20**. No migration, worker deployment, environment-variable change, or manual production data change.

## Requested production checks

Chrome desktop, existing pilot workspace owner session, `2klips/alrescha-app`, header commit **`4c54097`**. All controls were operated through the product UI. No token issuance, MCP tool call, enrich, rescan, or picker re-selection was needed.

| Item                                   | Result                                      | Direct observation                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⑴ Search preserves layout              | **PASS**                                    | Typed `graph`: canvas nodes **1,000 → 84**, layout nodes stayed **1,000**, `data-settled="true"`. Compared the 30 surviving DOM hit targets present in both snapshots: maximum x/y movement **0 / 0 px**. Clearing the query restored 1,000 visible nodes.                               |
| ⑵ Panel and link-distance persistence  | **PASS after retry**                        | `레이아웃 설정` opened with nine sliders. Changed `링크 거리` **90 → 140**. After the reload recovery described below, reopening the panel still showed **140**.                                                                                                                         |
| ⑶ Seven layers and unavailable reasons | **PASS**                                    | All seven were offered. `concept`, `contains`, `section` were disabled, `data-layer-available="false"`, title **`이 Graph에는 해당 노드가 없습니다`**. `co_changed`, `config`, `doc`, `style` were enabled and available.                                                                |
| ⑷ Pin persists through reload          | **PASS after retry**                        | Selected `spec/BUILD_PLAN_PHASE4.md`, clicked `이 노드 고정`: `data-pinned-count="1"` and target `data-pinned="true"`. The recovered load had both values before any new selection.                                                                                                      |
| ⑸ Warm start                           | **PASS on the next successful stage mount** | First mount: `data-warm-start="false"`. After settling, the first reload failed before mounting a stage; the product's Reload retry mounted with **`data-warm-start="true"`**, **1,000** layout nodes and the saved pin. The failed HTTP load is not counted as a successful warm mount. |

The workspace has actual stylesheets, so its `style` control is correctly enabled. The local test fixture's disabled-style expectation was not copied blindly to production.

## Reload failure and recovery

The first intentional `/app/map` reload displayed **“This page couldn’t load”**, **“A server error occurred. Reload to try again.”**, error digest **`3952576280`**. Clicking that error screen's **Reload** button once restored the map. Settings and pin data survived, and the stage mounted warm.

The scoped Vercel production error query confirmed one matching record:

| Field               | Observed                                                                         |
| ------------------- | -------------------------------------------------------------------------------- |
| Timestamp           | **2026-09-14T06:25:13.006Z**                                                     |
| Route               | `/app/map`                                                                       |
| HTTP status         | **500**                                                                          |
| Digest              | `3952576280`, matching the browser                                               |
| Safe classification | Error log contains **`timeout`**; no more specific timeout class was established |

The browser console accumulated **1 error / 0 warnings** for the workspace map; the demo had **0 errors / 0 warnings**. Final map rendering was healthy, with the correct repository/commit and `data-warm-start="true"`; desktop screenshots were visually inspected. Raw runtime messages, response bodies, and payloads were not copied into the record.

This records a recovered production error, not a claim that all requests were clean or that the timeout has been fixed. No rollback was performed after the map recovered and persistence checks passed. There is insufficient evidence to attribute the timeout to PR #17 or prescribe a code fix; retain the timestamp/digest for a separately scoped investigation if needed.

## Demo preset and cleanup

On `/map`, the same panel opened. Initial link distance **90**, arrows **off**, presets **0**.

1. Set link distance **180** and arrows **on**; saved **`PR17 검증`** exactly once.
2. Clicked `기본값 복원`: distance **90**, arrows **off**, saved preset still present.
3. Reloaded the demo, reopened the panel, and applied that preset exactly once: distance **180**, arrows **on**.
4. Removed only the verification preset and restored defaults: distance **90**, arrows **off**, presets **0**.

The workspace verification pin was removed through `고정 해제`; final `data-pinned-count="0"`. Its link distance was restored to the original **90** and its search query was cleared. No pre-existing preset or pin was removed. The normal per-commit warm-layout record remains in browser storage.

## Operations

`pnpm --silent ops:health` ran in the unchanged Fly worker runtime using its production connection internally:

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 160 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 15 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.1h old (warn above 24h).
status: warn
```

Exit 1 represents the existing WARN. A read-only query at **06:32:13.684Z** confirmed **0 new failed jobs** created since the merge and pilot credit balance **18**. Verification used browser-local presentation controls and incurred **0 credits**.

## Gates and handoff

- Codex reran `pnpm lint` and `pnpm typecheck`: PASS.
- `pnpm test`: **194 files / 1,796 passed / 1 skipped**, 110.47 seconds.
- Scope check: **12 boundaries / 371 files / 0 forbidden paths**.
- The tested PR tree and merged production tree match. Only rollout documentation was edited afterward.
- This log, the WORKLOG entry, and the handoff status are preserved together in a local documentation commit; no extra push, PR, or deployment is part of this report.
- User-owned `.claude/launch.json` and untracked `docs/brand/` files remain untouched.

**No required follow-up implementation is established by the feature checks.** Preserve the one recovered HTTP 500/timeout observation for Claude Code. OQ-066/067/068, zoom hitch, and canvas edge hit-testing remain outside this task. Do not start another implementation or production action without its own scope.
