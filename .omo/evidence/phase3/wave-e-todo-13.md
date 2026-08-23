# Phase 3 Wave E todo 13 — 앱 홈·온보딩 그래프 중심 재편 (2026-08-23)

## `/app` — 실데이터 워크스페이스 홈 신설

- 데모 대시보드 뷰모델을 렌더하던 `/app`을 **저장 행에서만 파생되는 온보딩 한 줄기**로 교체: ① 레포 연결(`/app/connect/github`) → ② 지식그래프 생성(노드 0이면 "첫 스캔 대기" + commit 분석 링크) → ③ 첫 그래프 뷰(`/app/map`) + MCP 토큰 발급(`/app/settings/mcp`). 그래프가 서면 히어로에 요약 카드(노드·연결·에이전트 기록 수 + 마지막 스캔 SHA + 그래프 열기 CTA).
- 스텝 판정은 순수 함수 `buildWorkspaceJourney`(`apps/web/lib/home/journey.ts`) — 로더와 분리(맵·커밋 로더와 같은 분할). 로컬 인제스트 레포(설치 행 없음, ADR-015)도 연결로 인정, 설치 회수는 경고만(데이터 보존 — WORK_SPEC §4.5).
- 데모 폴백 없음: 빈 워크스페이스는 연결 CTA, 픽스처는 절대 안 섞임(Wave A 원칙 계승).

## `/` — 공개 데모 개요 그래프 승격

- 지식그래프 존을 히어로로: 전폭(grid-column 1/-1) + 미니맵 확대. 카피를 그래프 중심으로("문서·요구사항·코드·테스트가 하나의 살아있는 그래프로 연결됩니다"). 어휘는 Phase 2D 개편안 유지(내비 4그룹·AI 지시문 검사 등 무변경, 추가만).
- 온보딩 데모(`/onboarding`) 카피도 그래프 어휘로: "증명 축 구성 중"→"지식그래프 구성 중", CTA "지식그래프 열기".

## korean-homepage-uncommitted.patch 판정

**원패치 폐기, 의도만 이식.** 패치는 구 specproof 트리(딴 파일 구성 + 바이너리 evidence PNG + Korean-first 스위프 이전의 테스트 개서)를 대상으로 해 현재 트리에 적용 불가·불필요. 실질 의도 2건 — `<html lang="ko">`·한국어 메타데이터 — 를 `apps/web/app/layout.tsx`에 직접 적용(title "Arr · 살아있는 지식그래프"). 나머지 내용은 Phase 2A Korean-first 스위프가 이미 상회 달성.

## 수용 기준 검증

- **온보딩 경로 Playwright** `tests/e2e/app-home.spec.ts` 2건: ⑴ 빈 워크스페이스 = 연결 스텝 active·나머지 pending·그래프 카드 없음 ⑵ 실 시딩(`apply_repository_scan`) → 연결·그래프 done → **그래프 열기 클릭 → `/app/map` 실 스테이지 렌더** → 설정 폼에서 실 토큰 발급 → 여정 완료(`활성 토큰 1개`). 스크린샷은 e2e가 생성(`wave-e-todo-13/home-{empty,journey-done}.png`).
- **두 테마 axe**: `/app`은 `AUTHENTICATED_SCREENS` 소속이라 `a11y-contrast`(axe AA)·`screens-theme`(테마 재도색) 스위프에 자동 편입 — 신규 홈으로 두 테마 모두 green. 첫 실행에서 pending 스텝의 `opacity:.72` 감광이 AA 미달(3.67:1)로 걸려 **불투명도 대신 점선 테두리**로 교체(§2 "faint가 바닥" 규칙 준수 사례).
- **korean-strings**: `lib/strings/home.ts` 신설 + 모듈 등재, `home-screen.tsx` CONVERTED_SCREENS 등록, 관례 영어에 `import` 1건 추가.
- 단위: `journey.test.ts` 6건(빈/연결/스캔 후/토큰 완료·회수 무시/설치 회수 경고/로컬 인제스트).

## 게이트

lint · typecheck · vitest **798/799**(1 skip = win32 심링크) · Playwright **119/119** · scope **PASS**.
