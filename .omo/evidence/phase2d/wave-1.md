# Phase 2D Wave 1 — 4존 통합 대시보드 `/overview` (2026-08-17)

발주: 사용자 UI 재설계 지시(복잡한 첫 화면·어려운 어휘 → 그래프/할일/에이전트 기록/Data Brain이 나뉜 간단한 대시보드). 계획: `spec/BUILD_PLAN_PHASE2D_UI.md`. 벤치마크 리서치(Stripe·Linear·Vercel 공통 패턴: 사이드바 + KPI 스트립 + 그리드)는 계획 문서에 기록.

## 구현

| 구성 | 내용 |
|---|---|
| KPI 스트립 4장 | 미해소 문제 · 구현 커버리지 · 테스트 커버리지 · 마지막 분석 커밋 — 전부 기존 대시보드/진행 뷰모델에서 파생 |
| 존 ① 그래프 뷰 | 정적 SVG 미니맵(같은 레이아웃 좌표 투영, 렌더러 없음) + 유형 범례 + "전체 그래프 열기" |
| 존 ② 할 일 목록 | 진행 보드 상위 6건, 상태 뱃지·문서 출처. "partial" 픽스처 사용 — "full"은 설계상 전부 done이라 한눈 보기 데모로 부적합(브라우저 실확인에서 발견, 수정) |
| 존 ③ 에이전트 기록 | MCP 액세스 피드 최근 5건(툴·상세·시각) |
| 존 ④ Data Brain | 영역별 노드 수(프론트/백/문서/테스트 — `areaOfPath` 모노레포 규약 유도) + 증거 등급 분포. Wave 3 facet 엔진의 자리 표시 규약과 동일 |

- 데이터 발명 없음: 모든 수치가 각 존이 링크하는 화면의 뷰모델과 동일 소스(단위 테스트가 일치를 단언).
- 색은 전부 토큰(`--node-*`, `--verified-text` 등), 카피는 `lib/strings/overview.ts`(Korean-first 스위프 등록).
- 내비: 양쪽 셸(`dashboard-screen`·`assurance-workspace`)에 "한눈에 보기" 항목 추가. 전면 내비 재편은 Wave 2.

## 검증

- 단위 6건(`view-model.test.ts`): 파생 일치·영역 분할 전수·경로 규약·todo 상한·상태 혼재.
- e2e 3건(`overview.spec.ts` 2 + `screens-theme.spec.ts` overview 등재): 4존 렌더·존별 링크 이동·양 테마 무결점.
- 브라우저 실확인: 4존·KPI 4·미니맵 노드 15·todo 상태 4종 혼재 — DOM 쿼리로 검증.
- 게이트: vitest **672/673**(1 skip = win32 심링크) · Playwright **69/69** · lint·typecheck·format green.
- 스크린샷: `wave-1/overview-dark.png`(e2e가 생성).

## 남김 (계획 Wave 2~4)

내비 4그룹 재편·어휘 단순화, Data Brain facet 엔진(백/프론트·페이지·파일·코드·문서 — core 결정론 유도), 기본 라우트 전환(`/`→overview).
