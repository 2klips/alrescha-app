# AGENTS.md — Alrescha

This repository implements Alrescha (formerly Arr; AI development assurance SaaS). Full product spec lives in `spec/`.

## Active frontend track

- Product name is `Alrescha`. Treat `Arr`, `SpecProof`, and `Alresca` as legacy names to migrate deliberately.
- Canonical IDs: `alrescha`, `@alrescha/*`, `ALRESCHA_*`, `alrescha://`, `.alrescha/`. Legacy `arr` aliases are removed; do not add new ones.
- Implementation repository: `2klips/alrescha-app`. Retained deployment IDs: `arr-app-web.vercel.app`, `arr-worker`, and the production receipt predicate URI.
- Before frontend work, read `docs/frontend/README.md` and its linked active plan.
- Desktop web only for this track. Mobile-specific design and acceptance work is deferred.
- Record every frontend task in `docs/frontend/logs/` and update `docs/frontend/WORKLOG.md`.

## Before doing anything

Read in this exact order:

1. `spec/IMPLEMENTATION_GUIDE.md` — repo rules, prerequisite phases, decided defaults, session protocol
2. `spec/WORK_SPEC.md` — normative spec (intent, 10 guardrails, screens, data model, rules, MCP contract)
3. `spec/BUILD_PLAN.md` — 22 todos with waves, dependencies, acceptance criteria

Conflict priority: `spec/DECISIONS-ADR.md` = WORK_SPEC > BUILD_PLAN > IMPLEMENTATION_GUIDE.

## Hard rules (machine-enforced later, honor them from commit one)

- `verified` only with execution evidence; AI reasoning is always `inferred`.
- Every graph edge/finding carries provenance (source span or explicit reason).
- Never persist raw source-code bodies; transient analysis fetches only.
- Only repo-write path: the advisory minimal-index PR proposal.
- Never inline doc bodies into AGENTS.md/CLAUDE.md.
- MCP 2026-07-28 stateless only — no Sampling/Roots/Logging/sessions.
- No charge on failed/schema-invalid AI outputs; idempotent billing.
- No efficiency numbers without measurement; state assumptions.
- Never weaken tests to make them pass.
- Progress logging: one structured call per task unit (≤150 tokens target).

## Working agreement

- One wave (or 2–3 todos) per session. A todo is done only when its acceptance criteria pass as tests.
- Update BUILD_PLAN checkboxes + `.omo/evidence/` per todo; one conventional commit per todo.
- Blocked on external credentials? Mock it, mark it, move on; request prerequisites by phase (see GUIDE §2).
- Spec ambiguity? Record in `spec/OPEN_QUESTIONS.md`, proceed with a sensible default. Do not edit other `spec/` files.
- End every session with lint/typecheck/test green and a report (done / deferred / open questions / next scope).

## 사용자 요청: Claude → Codex 배포 인수인계 (2026-09-12)

Codex는 배포 작업 전에 [인수인계 문서](docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-12.md)를 읽는다.
PR #4의 `202609110015_containment_join_shape.sql` 프로덕션 적용과 `arr-worker` 재배포 판단이 넘어가 있다. 적용·배포 후 그 문서의 상태 줄을 갱신한다.
PR #8 후속(큐잉된 GitHub 읽기의 403)은 [별도 인수인계](docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-12-github-throttle.md)로 넘어가 있다: `202609120003` 적용 → 워커 재배포 순서, 검증 절차, 롤백 지점.
PR #9 후속(홈의 현재 저장소 규칙, 첫 스캔 재시도)은 [별도 인수인계](docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-12-home-selection.md)로 넘어가 있다: `202609120004` 적용 → 웹 머지 순서, 선택·복구 검증 절차, 롤백 지점.
PR #10 후속(이름이 바뀐 저장소의 canonical 이름, 웹훅 id 매칭)은 [별도 인수인계](docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-12-repository-name.md)로 넘어가 있다: 웹 머지만, picker 재선택으로 검증, 롤백 지점.
PR #11 후속(전체 스캔·analyze의 GitHub 읽기를 아카이브 한 번으로 — primary-rate-limit 근거)은 [별도 인수인계](docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-12-scan-archive.md)로 넘어가 있다: 워커 재배포만, 워커 로그의 `archive:` 줄로 검증, `SCAN_ARCHIVE_FETCH=off` 롤백 스위치.
OQ-067 ⑴(enrich 잡의 아카이브 읽기)은 [별도 인수인계](docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-13-enrich-archive.md)로 넘어가 있다: 워커 재배포만, 확인은 다음 enrich 실행의 `enrich @sha N bodies (archive: …)` 줄로 — 확인만을 위해 enrich를 돌리지 않는다.
Phase 4 todo 15·24(라이브 발광 브리지 + HUD 실데이터, todo 24 브라우저 수용 기준)는 [별도 인수인계](docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-13-live-glow.md)로 넘어가 있다: `202609130001` 적용 → 웹 머지 순서, `/app/map`에서 `search_index` 1회로 발광 검증, 롤백 지점.
Phase 4 todo 13 남은 다섯(레이아웃 워밍·`/app/map` 힘 패널·Obsidian 옵션·도메인 앵커·style/config 레이어)은 [별도 인수인계](docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-13-map-panel.md)로 넘어가 있다: 웹 머지만, `/app/map`에서 필터·패널·핀·warm 마운트로 검증, 롤백 지점.
Phase 4 todo 25(graph-surface v3 — 프로덕션 형태 스토어 위 설치된 예산 벤치, 판정 NOT MET 게시)는 [별도 인수인계](docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-14-graph-surface-v3.md)로 넘어가 있다: 머지만(배포·검증·사이트 문구 없음), `verify-benchmark-report.ts` PASS 1회로 확인, 벤치 재실행 금지.

### 사용자 보고 선호 (2026-09-12)

배포·프로덕션 검증 결과를 보고할 때에는 사용자가 다시 요청하지 않아도 Claude Code에 바로 붙여 넣을 인계 프롬프트를 마지막 응답에 함께 제공한다. 완료 상태, 남은 문제, 근거 문서, 다음 작업 범위, 보존할 미커밋 파일, 금지 사항을 포함한다. 후속 구현이 필요 없으면 그 사실을 명시하고 새 작업을 임의로 만들지 않는다.
