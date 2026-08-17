# todo 4·5 — MCP 그래프 툴 5종 + 질의 라우팅 (2026-08-17)

**범위:** BUILD_PLAN_PHASE2B Wave 2 전반부. 두 커밋: `feat(mcp): add graph traversal tools`, `feat(brain): route queries by question shape`.

## 1. todo 4 — 그래프 순회 툴

| 파일 | 역할 |
|---|---|
| `packages/mcp/src/graph-tools.ts` | 순수 순회 — 인접 뷰(저장 엣지 + 파생 엣지 `요구사항.sourceArtifactId→요구사항`을 `derived` 표시로), 양방향 BFS 이웃(깊이≤2·관계 필터), 결정론 최단 경로(+graphify식 `explain`), 영향 리포트(직접 의존/피의존/이행 폐쇄), 노드별 저장 콘텐츠, ID-first 검색 |
| `packages/mcp/src/hosted.ts` | 툴 6종 등록(`get_neighbors`·`get_node_content`·`impact_of`·`route_query`·`search_nodes`·`trace_path`) — 전부 READ_ONLY, 알파벳 순 등록(목록 계약), 각 호출 access_event 발행 |
| WORK_SPEC §11 | 신규 툴 계약 추가 동기화 (app+site) |

**역할 중복 정리(계획 요구):** `search_index` = 발췌 포함 텍스트 진입점(불변) / `search_nodes` = 같은 랭킹에서 발췌·제목을 제거한 **ID-first 그래프 진입점**. `get_artifact` = 경로 기반 아티팩트+이웃 / `get_node_content` = 순회 뒤 임의 노드의 **명시적 2단계 본문**(저장된 내용만 — 원본 비저장 불변). `query_brain`(필터 질의)은 순회가 아니므로 그대로.

### 수용 기준 ↔ 테스트

| 수용 기준 | 테스트 |
|---|---|
| 툴별 계약 테스트 | `hosted.test.ts` — SDK 클라이언트로 6툴 전부 호출(목록 순서 13종 갱신 포함), `graph-tools.test.ts` 13케이스 |
| 멀티홉 정답 경로 픽스처 | `graph-tools.test.ts` — 골든 3홉 체인(문서→요구사항→코드→테스트) explain 행 완전 일치 + 동률 경로 결정론 + 깊이 상한. `hosted.test.ts` — 계약 픽스처의 2홉 체인(파생 엣지 경유) SDK 왕복 검증 |
| ID-first 응답에 본문 없음 | 순회 4툴 응답 직렬화에 픽스처 본문 문자열·`excerpt`·`"content"` 키 부재 단언, 본문은 `get_node_content`에서만 |
| 테넌트 격리 | 타 워크스페이스 토큰으로 남의 노드 id 조회 → `found:false`/`node:null` |
| access_event 발행(원문 비저장) | 6툴 각 1이벤트, `route_query`는 대상 0건, 이벤트 직렬화에 질문 원문 부재 |

## 2. todo 5 — 질의 라우팅

- `packages/core/src/brain/query-router.ts` — 결정론 신호 매칭(한/영 8종: 경로·연결·영향·의존·이웃·관계·구간·관계형 부재). 그래프 신호 1개↑ → graph, 아니면 search. 응답 = 경로·매칭 신호·근거·추천 툴·**폴백**(반대 경로+사유).
- MCP `route_query` 툴 — 근거를 응답에 남기고 질문 원문은 어디에도 저장 안 함.
- **라우팅 정확도:** `tests/query-router.test.ts` — 태깅 픽스처 16문항(단순 8·멀티홉 8) **16/16**.
- **오라우팅 폴백:** 라우터가 항상 반대 경로 폴백을 실어주고(전 픽스처 단언), 하네스 routed 군이 그래프 시드 0건이면 실제로 grep으로 폴백(테스트 고정).

### 벤치 3조건 (grep-only / graph-only / routed)

동결 파일 불변 원칙 하에 **schema 3**으로 추가:
- `types.ts` — `ROUTING_ARMS` 튜플 신설(`BENCHMARK_ARMS` 바이트 불변), `BenchmarkManifestV3`, 가설 arm 필드 일반화(문서화된 기본값 유지).
- `manifest.ts` — arms 검증 파라미터화(v1/v2 경로는 결과 객체 불변), schema 3 분기(fixture-only 허용).
- `context.ts` — 군 빌더 3종: grep-only(랭킹 top8 순수 검색), graph-only(`search_nodes`→`get_neighbors`→`get_node_content`), routed(`route_query` 판정에 따라 위임 + 폴백).
- `benchmark.ts` — `hypothesisArmsFor`: v3는 grep-only(기준)↔routed(처치), v1/v2는 기존 checkout↔data-brain **기본값 그대로**.
- `bench-databrain.ts` — schema 2·3 실행 허용(schema 1 동결 유지).
- **동결 증명:** `tests/routing-benchmark.test.ts`가 `tasks.v3.json` 로드 결과의 사전등록 다이제스트(`7a317232…a2c7`)를 회귀로 잠금 — 하네스 리팩터가 동결 매니페스트 파싱을 바꾸면 감사 전에 여기서 실패한다. 기존 벤치 스위트(`databrain-benchmark`·`efficacy-benchmark`) 무회귀.
- 실행용 라우팅 매니페스트(`tasks.routing.json`)는 **과제 설계 확정 시 별도 사전등록** — 지금 만든 것은 하네스 능력 + 검증이며, 사전등록 없는 실행은 하지 않는다(ADR-005 정직성).

## 3. 게이트

- vitest **593/594** (80 파일; 신규 — graph-tools 13, hosted 계약 +4, 라우터 5, 라우팅 벤치 6) · 기존 MCP 계약 11 무회귀
- Playwright **60/60** (pilot-flow가 hosted MCP 엔드포인트 실구동 — 툴 추가 후에도 green)
- eslint·typecheck 무결점 · 스코프 스캐너 PASS(202 files) · v3 벤치 과제 `real-audit-mcp-tool-surface`의 닫힌 후보 목록은 신규 툴을 포함하지 않으므로 채점 불변

## 4. 남긴 것

- **엣지 생산 경로 부재(기존 사실):** 프로덕션에서 `edges`를 쓰는 코드가 아직 없다 — 순회는 저장 엣지+파생 엣지로 동작하며, 스캐너의 엣지 추출은 todo 7(rationale·다언어 심볼) 범위와 함께 다룰 후보.
- 라우팅 실험의 실행 사전등록(`tasks.routing.json` 본편)과 judge/pack 노드의 순회 편입은 후속.
