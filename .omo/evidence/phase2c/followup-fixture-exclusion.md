# 후속 — 테스트 픽스처 디렉터리를 스캔 범위에서 제외 (2026-09-02)

요구사항 영속화 실측(113건)에서 `fixtures/drifted-demo/**`의 합성 MUST 문장 90여 건이 이 저장소의 요구사항으로 유입된 것을 발견 → 사용자 지시로 스캐너에서 제외.

## 설계

- `classifyArtifactPath`(`packages/core/src/ingest/repository-scanner.ts`)의 첫 규칙: 경로 세그먼트에 `fixtures` · `__fixtures__` · `testdata`가 있으면 `null`(아티팩트 아님). **세그먼트 단위 매칭** — `fixture-notes/spec.md`·`spec/fixtures.md`는 여전히 spec. 분류가 null이면 스캔 루프가 파일을 건너뛰고 `observedPaths`에 넣지 않으므로, 이미 저장된 픽스처 아티팩트는 다음 스캔의 `removedPaths`로 잡혀 `apply_repository_scan`이 `graph_nodes`를 삭제한다(artifacts→requirements FK cascade). 즉 **다음 push 한 번으로 프로덕션의 픽스처 유래 아티팩트·요구사항이 정리**된다.
- 정리 방식 주의: 이 경로의 요구사항은 superseded가 아니라 **아티팩트 삭제에 따라 cascade 삭제**된다(출처 문서가 저장소 관점에서 사라진 것이므로 정합). `judgments.target_id`는 FK가 없어 스모크에서 판정한 픽스처 요구사항의 판정 행은 남되 대상이 없어 패널에서 사라진다.
- 테스트 영향 없음: 픽스처를 쓰는 테스트들은 `fixtures/drifted-demo`를 스캔 **루트**로 열어 내부 경로에 `fixtures/` 접두가 없고, 온보딩 e2e의 "fixtures/drifted-demo" 텍스트는 데모 레포 라벨(스캔 경로 아님).

## 검증

- `tests/repository-scanner.test.ts` +1: 픽스처 경로 5종 null(rule·spec·AGENTS.md·`__fixtures__`·`testdata` 코드), 유사 이름 2종은 기존 분류 유지.
- 게이트 수치는 커밋 메시지 참조. 프로덕션 실측은 아래 절에 추가.

## 배포 (2026-09-02 13:58 UTC)

- 워커 **v12** `deployment-01M1H6JAS7SNT66R73JG6GTG0P`(롤백 v11 `…M1H4QND7…`). `fdf9abf`의 scan은 v11이 처리 — 이 커밋의 push가 v12에서 첫 제외 스캔을 트리거한다(결과는 아래 실측 절에 추가).

## 프로덕션 실측 (2026-09-02, push `8fc7c00` → v12 scan 14:00:19 · analyze 14:01:41, 모두 succeeded)

| 항목 | 전 | 후 |
| --- | ---: | ---: |
| `artifacts` (`path like 'fixtures/%'`) | 14 | **0** |
| `artifacts` 전체 | 503 | 489 |
| `requirements` active | 113 | **99** |
| `graph_nodes` kind=requirement | 113 | 113 → **결함** |
| requirement-disambiguation 판정 중 대상 없음 | – | 1 (스모크 판정, 예상대로 잔존) |

- 남은 99건의 출처는 전부 이 저장소 문서(BUILD_PLAN 계열 86 · IMPLEMENTATION_GUIDE 8 · WORK_SPEC 2 · ADR 2 …). 스캔 로그 `scan @8fc7c00 → 17 rows` = 삭제 14 + 변경 3.
- **발견한 결함**: `requirements.id → graph_nodes` 와 `requirements.source_artifact_id → artifacts` 는 cascade지만 **`graph_nodes` 쪽으로는 아무것도 cascade하지 않아**, 아티팩트 노드 삭제 시 요구사항 행만 사라지고 요구사항 **노드 14건이 고아로 남았다**(그래프 API·맵에서 라벨만 있는 노드로 노출될 수 있음).
- 수정: `PostgresAnalysisStore.reconcileRequirements` 트랜잭션 끝에 같은 (workspace, repository)의 `kind='requirement'` 노드 중 `requirements` 행이 없는 것을 삭제하는 스윕 추가(엣지는 FK cascade). 마이그레이션 불필요 — 다음 analyze 한 번으로 프로덕션 고아 14건이 정리된다. 테스트 `tests/requirements-persistence.test.ts` +1(아티팩트 노드 삭제 → 고아 재현 → 스윕 확인).
