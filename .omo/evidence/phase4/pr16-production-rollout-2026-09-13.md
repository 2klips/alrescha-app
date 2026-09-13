# PR #16 production rollout — live access-event glow and real-data HUD

Status: **Complete — migration applied before the merge; Vercel deployed; one production `search_index` call reached the live map without a refresh. The temporary read-only token was revoked.**

Observed by Codex on 2026-09-13 UTC. Scope: deployment and production verification only; no application code edits. Pilot repository: `2klips/alrescha-app`.

## Migration before web

The existing Fly v20 worker supplied its production `DATABASE_URL` internally. The exact migration runner, package scripts, and migration files from the PR tip were staged in `/app/pr16-rollout`; `pnpm --silent db:migrate` used the worker's installed dependencies. Credentials were neither printed nor copied into evidence.

| Check | Result |
| --- | --- |
| Preflight, 13:21:53.337Z | Latest ledger: `202609120004_first_scan_retry.sql`, applied `2026-09-12T13:41:31.507Z`; `realtime.messages` exists, policies: 0 |
| Migration command | Exit 0; `Applied: 202609130001_access_events_channel_policy.sql` |
| Applied at | `2026-09-13T13:23:55.536Z` |
| Policy check, 13:23:59.388Z | Exactly one row: `access_events_channel_member_read` |
| Ledger check, 13:24:03.053Z | Latest: `202609130001_access_events_channel_policy.sql` |

The two existing-ledger NOTICE lines were harmless. The migration adds the authorized read policy; no application data was manually changed.

Read-only policy check:

```sql
select policyname
from pg_policies
where schemaname = 'realtime' and tablename = 'messages';
```

## Merge and deployment

- [PR #16](https://github.com/2klips/alrescha-app/pull/16) merged at **2026-09-13T13:24:40Z**, after the policy was confirmed.
- Merge commit: **`5b8942a4859acf6f28edb993213434b13bbd7056`**. All three original commits are preserved: `f3de893`, `46826da`, `e652064`; no squash.
- Local `main` fast-forwarded to the merge. Its tree matches PR tip `e652064`.
- [Vercel deployment](https://vercel.com/2klips-projects/arr-app-web/28q1SJnagYsT3T5UaZfLwrhCauSs): **success**, observed status timestamp **13:25:10Z**. Production `/` returned **200**; `GET /api/mcp` returned **405**.
- Fly remains **v20**, image **`arr-worker:deployment-01M2D9ZJRM2J4J61QMTZ4EGTT6`**. Active machine `48e7e62f574d58` is started, standby `48ed969dc49238` is stopped; their update times remain 11:56:42Z and 11:56:38Z. No worker deployment or environment-variable change.

## One-call live verification

The existing product token was revoked and no usable token was available in the checked configuration. The user explicitly approved issuing one `mcp:read` token, making one `search_index` call, then revoking it. Settings → MCP issued **`PR16 live-glow verification 2026-09-13`** once. Its secret stayed in process memory and was not written to a file or tool output.

| Observation | Result |
| --- | --- |
| Token created | `2026-09-13T13:27:54.152644Z`; scopes: `mcp:read` only |
| Browser before call | Production `/app/map`; header `2klips/alrescha-app`, commit `5b8942a`; `main[data-live-channel="live"]`; badge `실시간 수신 중`; `data-glow-active="0"`; empty feed |
| Call started / response complete | `13:34:32.805Z` / `13:34:39.246Z` |
| Tool call | Exactly one `search_index`, query `AGENTS.md`, `include_excerpt: false`, limit 5; HTTP 200, no RPC or tool error |
| Browser after call | Same map tab, no navigation or reload: `data-glow-active="5"`; feed row `search_index` / `AGENTS.md`; channel still `live` |
| Later observation | Glow returned to `0`; feed row remained visible; channel remained `live` |
| Token revoked | Product cancellation at **`2026-09-13T13:34:57.278Z`**, UI showed `취소됨`; secret cleared from memory |
| Read-only event confirmation, 13:36:34.664Z | Exactly **1** `search_index` access event for this token, occurred at **13:34:37.970Z**, target count **5** |
| Credits | **18 → 18**, net cost **0** |

Protocol preparation: an initial legacy-style `initialize` probe returned HTTP 400, as expected for this modern stateless endpoint. A `server/discover` request using the installed SDK's documented per-request envelope and method headers returned HTTP 200 and supported version `2026-07-28`. Only the subsequent `tools/call` invoked `search_index`; it was not repeated. No response bodies or access-event payloads are retained here.

## HUD and inspection comparison

Desktop production browser at the same merge head:

| HUD | Observed value / basis |
| --- | --- |
| 미해소 Findings | **480**; `open 상태만 셉니다`; source: stored Findings rows |
| 구현 커버리지 | **16%**, **21 / 131 요구사항**; `data-basis="measured"`; source: requirement → code `implements` edges |
| 마지막 스캔 | **`5b8942a`**, **3분 전** on the initial page snapshot; source: successful scan job / local push run |
| 위험 상위 | **678** ranked files; the same top three paths, order, and levels as `/app/inspection` → `먼저 볼 파일` |

| Rank | File | Map / inspection |
| --- | --- | --- |
| 1 | `spec/BUILD_PLAN_PHASE4.md` | 높음 / 높음 |
| 2 | `spec/OPEN_QUESTIONS.md` | 높음 / 높음 |
| 3 | `.omo/evidence/phase2b/adr-015-assurance-boundary.md` | 주의 / 주의 |

Inspection shows top 10 of 678; the map shows the first three. Both report execution coverage as unmeasured in the risk surface. This is a separate signal from the measured implementation coverage based on `implements` edges.

Read-only repository confirmation at 13:36:34.664Z: both `last_scanned_commit_sha` and `last_analyzed_commit_sha` equal `5b8942a4859acf6f28edb993213434b13bbd7056`.

Browser QA: expected production URL and Alrescha title, rendered graph/HUD, no framework error overlay; console warnings **0** and errors **0** on both map and inspection. Desktop screenshots were visually inspected; the later screenshot shows the received feed row. Transient glow is established by the observed `data-glow-active` change, not by a claim that the screenshot captured its peak.

## Operations and gates

Final `pnpm --silent ops:health` in the unchanged worker runtime:

```text
OK    access-event-retention — No access event is past its workspace retention window.
OK    audit-write-coverage — Every one of 151 scan job(s) has its audit row.
OK    stale-leases — No job is holding an expired lease.
OK    credit-reservations — Every credit reservation settled or refunded.
OK    queue-depth — 0 job(s) queued or running (warn above 25).
WARN  permanent-failures — 15 job(s) failed permanently in the last 7 days — attempts exhausted or rejected (warn above 5; older failures no longer count).
OK    webhook-delivery-freshness — Newest accepted delivery is 0.2h old (warn above 24h).
status: warn
```

Exit 1 is the existing WARN status. Read-only query: **0** new failed jobs created since the deployment preflight at 13:21:53Z. No enrich, rescan, or picker re-selection was executed.

PR-tree gates rerun by Codex: `pnpm lint` PASS; `pnpm typecheck` PASS (root and workspaces); `pnpm test` **192 files / 1,769 passed / 1 skipped**. The merge tree is identical to the tested PR tree. Subsequent edits are documentation only; final documentation diff/format checks are recorded with the commit workflow.

## Preservation and next scope

The rollout documentation commit also preserves the two pre-existing Codex edits, without rerunning enrich:

- `.omo/evidence/phase4/pr14-production-rollout-2026-09-13.md`
- `docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-13-enrich-archive.md`

The PR #16 handoff status, this record, the dated frontend log, and its worklog entry accompany them. Unrelated launch/brand files remain untouched. No extra deployment or PR is required for this verification.

**No required follow-up implementation.** OQ-069 (revoked-token snapshot refresh) remains a user decision. OQ-066/067/068 are outside this task. Anthropic credit replenishment does not authorize another enrich run; that still requires separate user approval.

Rollback remains the previous Vercel deployment. The read policy may remain; removal, if requested, must use a new migration rather than editing the applied file. No rollback was needed.
