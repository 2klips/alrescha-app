# Phase 2D 잔여 일괄 적용 (2026-08-17)

todos 2·3·6 + 라이트 질감(`2303627`), todo 4 + MCP facet(`이번 커밋`).

- **라우트 전환**: `/` = 그룹 사이드바(4그룹+테마 토글) + 4존 대시보드, 그래프는 `/map`, `/overview` 리다이렉트. e2e는 경로만 이전(단언 보존).
- **어휘**: 지시문 린트→AI 지시문 검사, 하네스 자산→에이전트 지시문, 증거 라이브러리→저장된 증거, 점검→프로젝트 점검. "AI"를 관례 영어에 등재.
- **라이트 질감 토큰**: tokens.css 단일 팔레트 원칙 유지(--radius-card 14px/0px, --card-shadow). theme-toggle 테스트가 globals.css 팔레트 정의를 거부해 tokens.css로 이동.
- **facet 엔진(todo 4)**: `deriveArtifactFacets(path, classification)` — domain(frontend/backend/shared/unclassified)·page(Next 라우트)·unit(code/doc/test/file). 저장 병합 대신 **읽기 시점 유도**(저장 필드에서 결정론 유도 → 사본 드리프트 불가, ADR-013 동등성 자명). 미분류는 unclassified — 발명 금지. 테스트 5건.
- **MCP(todo 5 일부)**: `search_nodes`에 `domain_filter` 선택 인자(하위 호환 — 기존 계약 테스트 무변경 통과 + 신규 케이스).
- **남음(todo 5 잔여)**: /map 캔버스 facet 그룹 모드·필터 칩.

게이트: vitest 677/678 · Playwright 69/69 · lint·typecheck·format green.
