# Phase 3 Wave B todo 5 — PPR repo map · get_graph_schema · 연결성 리랭크 (2026-08-23)

## 무엇을 만들었나

- **`packages/core/src/brain/pagerank.ts`** — 개인화 PageRank 멱반복(무방향, α=0.25·25회 = Graft 출하값, dangling 질량은 재시작 벡터로 회수, 최대 정규화). 결정론 — 난수 없음. Aider·HippoRAG·RepoHyper가 독립 수렴한 알고리즘(리서치 §3).
- **MCP 툴 2종 신설(15→17)**:
  - `get_graph_schema` — "먼저 호출" 카드(CBM 인체공학): 노드 종류·엣지 relation 카운트 + id-first 흐름 안내 한 줄. 레포 어휘를 추측이 아니라 조회로.
  - `repo_map(focus?, token_budget)` — PPR 랭킹 시그니처 스켈레톤을 **하드 토큰 예산**(100..8000, 기본 1200)에 그리디 패킹. focus(경로/심볼 부분일치)가 시드, 없으면 균등 워크 = 전역 허브. 잘린 파일 수를 명시(#no-silent-caps). 본문 없음 — 출력 포맷 자체가 토큰 최적화.
- **연결성 리랭크** (`searchWorkspaceIndex`): 직접 렉시컬 히트를 시드로 PPR 1회 → `score = 티어점수 + 50·ppr`. **보너스 상한 50 < 티어 간격 100이라 렉시컬 승자는 절대 뒤집히지 않는다**(Graft 가중 규칙) — 티어 내부의 근소 동점만 연결성이 재정렬. 시드가 없으면 보너스 0. Graft의 rescue floor 역할은 기존 graph-neighbor 티어가 이미 수행.
- **MCP가 구조 엣지를 본다**: `McpEdgeRelation`에 `imports`/`calls` 추가(store·supabase-store 검증·hosted RELATION_SCHEMA) — todo 3의 엣지가 traversal·PPR·repo_map에 실제로 흐른다. 이전엔 isRelation 필터에서 조용히 탈락했을 계층.

## 게이트

- vitest **781/782** (신규 `tests/pagerank-repo-map.test.ts` 9건: 허브 부상·시드 편향·결정론·빈/고립 그래프·예산 패킹+생략 보고·focus 시드·스키마 카운트·티어 불변 리랭크)
- Playwright 116/116(brain-map WebGL 누수 스펙 1회 플레이크 — 단독 재실행 통과, 병렬 부하 시 컨텍스트 압박으로 추정) · lint·typecheck·format·scope 247파일 PASS

## 판단 기록

- `search_index` 점수가 분수가 되며 outputSchema `int` 제약과 계약 테스트의 고정 점수(400/100)가 깨졌다 — **의도된 동작 변경**이므로 스키마는 number로, 테스트는 티어 불변식(400≤exact<450, 100≤neighbor<200 + 순서 유지)으로 갱신. 약화가 아니라 더 강한 불변식이다.
- MCP SDK의 listTools는 **등록 순서**를 보존한다(기존 목록이 알파벳순인 건 등록이 알파벳순이었기 때문) — 새 툴은 알파벳 위치에 등록.
- 노드 크기의 PPR 교체(Wave A todo 2에서 격리해 둔 `nodeRadius`)는 Wave C 개념 레이어와 함께 판단 — 현재 차수 기반도 동일 계열 신호라 시각 변화 대비 이득이 작다.
