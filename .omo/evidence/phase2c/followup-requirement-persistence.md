# 후속 — 요구사항 영속화 (OQ-023 ⑴, 2026-09-02)

요구사항 중의성 판단 표면 스모크에서 드러난 파이프라인 공백을 닫는다: 요구사항은 analyze에서 `extractRequirements`로 일시 추출돼 finding 생성에만 쓰이고 어디서도 저장되지 않아, 프로덕션의 `requirements`·requirement 그래프 노드가 0건이었다(맵 요구사항 레이어·MCP 요구사항·판정 패널 전부 빈 상태).

## 설계

- **위치**: `analyze` 핸들러(`apps/worker/src/analysis-job.ts`) — `prepareAssuranceContexts`가 이미 문서별 `requirements`를 들고 있으므로 finding 조정 직전에 `store.reconcileRequirements`로 영속화. scan이 아니라 analyze인 이유: 추출 로직이 이곳에 있고 finding과 같은 실행에서 정합성이 맞는다.
- **정체성**: 요구사항에는 런 간 식별자가 없다 → `deterministicUlid(ws|repo|경로|REQ코드 ?? 문장)`(sha256 → Crockford base32 26자, 선두 0; `apps/worker/src/deterministic-id.ts`). 재분석이 같은 행으로 수렴하고, 문장이 바뀌면 새 요구사항이 되며 옛것은 superseded — 그 변화의 정직한 해석. 시간 정렬 ULID가 아님을 주석에 명시.
- **저장**: `PostgresAnalysisStore.reconcileRequirements` — 트랜잭션 안에서 `graph_nodes`(kind requirement, label = REQ코드 또는 80자 발췌) upsert → `requirements`(source_artifact_id = 스캔이 만든 아티팩트 노드 id, statement, source_span = {path, startLine, endLine, origin}, status active) upsert → 현재 집합에 없는 active 행은 **superseded**(삭제 아님 — 판정·엣지의 대상 보존). 문장은 스펙 문서 텍스트(그래프 메타데이터)라 원본 코드 본문 금지 규칙과 무관. 새 SQL 함수·마이그레이션 불필요(service_role 권한, 기존 FK·체크가 무결성을 강제).
- 엣지는 추가하지 않음 — 맵은 `source_artifact_id`로 요구사항을 아티팩트 경로에 붙인다(`workspace-map.ts`의 `requirementPath`).

## 검증

- `apps/worker/src/analysis-job.test.ts` +1: 스펙의 REQ-AUTH-001 태스크가 `node-spec` 출처·span 5행·origin task·ULID형 id로 영속화되고 재실행 시 같은 id.
- `apps/worker/src/deterministic-id.test.ts`: 안정성·형식·시드 민감도.
- `tests/requirements-persistence.test.ts`(신규 pglite 셔밍 `tests/helpers/pglite-sql.ts`로 **실제 스토어 클래스**를 실제 마이그레이션 위에서 구동): 노드+행 동시 upsert·재분석 수렴·span에 origin 보존 / 사라진 요구사항 superseded → 재등장 시 active 복귀 / 출처 아티팩트 부재 시 FK 거부.
- 게이트 수치는 커밋 메시지 참조.

## 프로덕션 반영 절차

워커 재배포(v11)만 필요 — 마이그레이션 없음. 배포 후 다음 push의 analyze가 `requirements`를 채우고, 그 순간 `/app/inspection` 요구사항 판정 패널·맵 요구사항 레이어·MCP 요구사항 데이터가 동시에 살아난다. 스모크: 패널의 활성 요구사항에 **AI 판정** → `judgments`에 `requirement-disambiguation` 행.
