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
