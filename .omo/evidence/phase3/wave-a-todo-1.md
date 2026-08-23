# Phase 3 Wave A todo 1 — `/app/map` 실데이터 그래프 뷰 (2026-08-23)

## 무엇을 만들었나

- `apps/web/lib/map/workspace-map.ts` — 순수 빌더(`buildWorkspaceMapModel`) + 얇은 RLS 래퍼(`loadWorkspaceMap`), commits 로더와 같은 구조. `graph_nodes`+위성 테이블(artifacts/rationales/requirements/evidence/edges/findings/access_events/mcp_tokens/repositories)을 렌더 어휘(`GraphData`)로 사상.
- `apps/web/app/app/map/` — 인증 라우트 + `WorkspaceMapScreen`. 기존 렌더 자산(BrainMapStage·FacetBandView·filterGraph·glow) 재사용, 데모 픽스처·데모 메트릭 없음. 빈 워크스페이스는 "레포 연결" 빈 상태(데모 폴백 금지).
- glow는 **실워크스페이스 정책**으로 배선: 서버가 최근 `access_events` 20건을 시드하고, revoked 토큰 id를 정책에 넣어 필터. 라이브 채널 구독은 기존 browser source 재사용.
- 새 문자열 모듈 `lib/strings/map.ts`(WORKSPACE_MAP), korean-strings 스위트 등록.

## 사상 규칙 (정직성)

- 노드: artifact→classification 기준 code/test/document(`deriveBrainArea` 재사용으로 overview와 어휘 일치), requirement→requirement(문장이 라벨), rationale→document(경로 `path:line`), evidence→kind 기준. **finding은 노드가 아니라 소스 노드의 카운트.**
- 등급(ADR-001): open finding → `broken`; 실행 증거(evidence kind test/ci + verdict supports)가 지목한 노드만 `verified`; 나머지 전부 `inferred`. **스캔만 한 워크스페이스는 verified 0개가 정상** — 테스트로 고정.
- 엣지: `contradicts`→broken, 실행 증거 출발 엣지→verified, 그 외 inferred. provenance span 파싱, reason-only는 라인 0(표시 필터가 거름). 확신도 티어(`resolved`/`agent_asserted` 등)는 todo 2에서.
- 클러스터 임계 600(=HIT_TARGET_LIMIT) — 파일럿 370노드는 개별 렌더.

## 발견 2건 (실물과 픽스처의 차이)

1. **`rationales` 테이블에 authenticated GRANT가 없었다** — 202608170003이 select 정책만 만들고 grant를 빠뜨림(블랭킷 grant는 그 시점 테이블만 커버, Wave 1 service_role 함정과 동일 계열). 쓰기는 security definer 함수라 한 번도 안 들켰고, 이 로더가 첫 직접 읽기였다. PGlite 하네스가 즉시 잡음 → `202608230001_rationale_read_grants.sql`.
2. **PGlite 미러 쿼리의 한계 재확인** — 로더의 `.order("updated_at")`(repositories에 없는 컬럼)는 PGlite 테스트가 원리적으로 못 잡는다(내가 미러 SQL을 손으로 쓰므로). 로컬 Supabase 프로브가 잡음 → `created_at`으로 수정. e2e(`workspace-map.spec.ts`)가 이 계층을 상시 커버.

## 게이트

- vitest **751/752** (신규 `tests/workspace-map.test.ts` 9건: 빌더 사상·정직 등급·provenance·카운트·피드·클러스터 임계·dangling 엣지 드랍 + PGlite 실스캔 테넌트 격리)
- Playwright **116/116** (신규 5: app-map 테마 순회+착지 단언, app-map axe AA ×2, `/app/map` 빈 상태·실스캔 렌더 — 시드는 `apply_repository_scan` 단일 경로)
- lint(0 warn)·typecheck·format:check·scope 12경계 242파일 PASS
- 로컬 Supabase에 202608210001·202608230001 적용(`supabase migration up`)
