# Phase 3 Wave A todo 2 — 신뢰도·출처 시각 문법 + 방향 포커스 (2026-08-23)

## 무엇을 만들었나

- **신뢰도 티어 어휘** (`EdgeConfidenceTier`, graph-model): `resolved`(결정론 추출·스팬 있음) > `reference`(이름 매칭) > `inferred`(AI 합성) > `agent_asserted`(MCP 기록). **등급(grade)과 분리** — 등급은 "무엇을 증명하나"(색), 티어는 "어떻게 유도됐나"(선 스타일). `GraphEdge.tier`는 선택 필드라 데모 픽스처는 기존 렌더 유지.
- **선 문법** (`edgeStroke`, render-frame): resolved=실선 1.25 / reference=가는 실선 0.7 / inferred=점선 / agent_asserted=점선+accent 색. **broken(드리프트)은 티어 무관 빨간 점선 우선** — 드리프트가 유도 방식보다 위. 모든 시각 결정은 렌더 플랜(순수 객체)에서 단언, Pixi는 숫자만 복사(기존 구조 유지).
- **방향 포커스** (Graft focus UX): `directionalFocus` 켠 상태에서 노드 선택 시 진출 엣지 `--focus-out`(앰버, "의존한다")·진입 엣지 `--focus-in`(틸, "의존받는다"), 비이웃 노드 α 0.22·엣지 α ×0.15·라벨은 이웃만. 엔진 `setDirectionalFocus` — **옵트인이라 데모 대시보드 시각은 불변**(기존 스펙 116건이 그대로 green인 이유). `/app/map`은 상시 켬 + 선택 시 범례 칩 2개 표시 + 스테이지 `data-focus-node`.
- **토큰 2종 신설** `--focus-out`/`--focus-in`(tokens.css 양 테마 + FOCUS_TOKENS + design-tokens.md §3.4). 텍스트 비사용(그래프 스트로크·범례 점 전용)이라 `-text` 자매 불요. hardcoded-hex 게이트·양 테마 해석 테스트 자동 커버.
- **로더 티어 유도** (workspace-map): `provenance.tier` 명시값 우선(Waves B–D가 쓸 전방 호환), 없으면 스팬 → resolved, reason-only → inferred.
- **노드 크기 단일 함수 확인**: `nodeRadius(degree)`가 이미 유일한 크기 결정 지점 — Wave B에서 PPR 점수로 교체 시 이 함수만 바꾸면 된다.

## 게이트

- vitest **759/760** (신규 `tests/graph-focus.test.ts` 7건: 티어별 스트로크·레거시 폴백·broken 우선·accent 페인트·방향 틴트·페이드·라벨 필터·플래그 없을 때 무변화 + workspace-map 티어 유도 2건)
- Playwright **116/116** — workspace-map.spec에 포커스 상호작용 단언 추가(클릭 → `data-focus-node`=클릭한 노드 id + 범례 2칩 가시)
- lint(0 warn)·typecheck·format:check·scope 12경계 PASS

## 판단 기록

- 방향 색은 등급 팔레트 재사용 대신 **신규 토큰** — verified 초록/inferred 앰버에 방향 의미를 겹치면 증거 어휘가 오염된다. 계획 문서가 명시한 앰버/틸 그대로.
- 포커스 모드를 데모 대시보드에도 켜는 것은 보류 — 기존 스펙·성능 측정(500노드 p95)이 현 시각을 기준으로 잠겨 있어, 켜려면 별도 판단으로.
