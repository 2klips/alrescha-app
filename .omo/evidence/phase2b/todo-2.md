# todo 2 — 커밋별 분석 카드 (2026-08-17)

**범위:** BUILD_PLAN_PHASE2B Wave 1 todo 2. push 파이프라인의 결과를 Vercel 배포 카드처럼 — 커밋별 상태·소요 시간·발견 델타·Receipt 링크·실패 사유, 목록+상세.

## 1. 구조 (Phase 2A `/progress` 관용구 준수)

| 층 | 파일 | 역할 |
|---|---|---|
| 순수 빌더 | `packages/core/src/runs/analysis-cards.ts` | `buildCommitAnalysisCards` — run+jobs+receipts → 카드. 결정론, 의존성 0 |
| 데모 픽스처 | `apps/web/lib/commits/fixtures.ts` | 4개 상태 전부 + 완료 카드 2장(receipt 데모 픽스처 `receipt-current`/`-previous`에 연결) |
| Supabase 로더 | `apps/web/lib/commits/commit-cards-report.ts` | snake_case 행 → 빌더 입력, `loadWorkspaceCommitCards` (라우트 연결은 인증 화면군과 함께 — /progress와 동일한 단계화) |
| 라우트 | `apps/web/app/commits/page.tsx` | 공개 데모 라우트 `/commits`, `?run=` 딥링크 선택, `?state=empty` 데모 상태 |
| 뷰 | `apps/web/app/commits/commit-cards.tsx` | 서버 렌더 순수 컴포넌트, 목록(rail)+상세 |
| 카피 | `apps/web/lib/strings/commits.ts` | `COMMITS` — 한국어 우선, `push` 용어 추가(`terms.ts`) |

## 2. 핵심 설계 결정

- **상태는 `jobs`에서 유도한다.** `runs.status`는 프로덕션에서 `pending`을 벗어나지 않는다(신규 **OQ-014**로 기록). 전이 규칙: 전부 queued→`pending` / 하나라도 failed·cancelled→`failed` / 전부 succeeded→`completed` / 그 외→`analyzing`.
- **소요 시간 = min(claimed_at)→max(completed_at), 종결 상태에서만.** 진행 중 카드는 "now"가 필요하므로 측정하지 않는다 — null은 null로 렌더("소요 시간 없음"), 수치 날조 금지 원칙.
- **델타 = receipt `summary.findings`(opened/resolved/open_total, WORK_SPEC §13).** run_id 매칭 우선, run_id 없는 receipt만 commit_sha 폴백. 형식이 어긋나면 null(테스트 고정).
- **실패 사유 = `jobs.last_error` 원문 그대로.** React 이스케이프로 마크업 주입이 해석되지 않음을 테스트로 증명.

## 3. 수용 기준 ↔ 테스트

| 수용 기준 | 테스트 |
|---|---|
| 상태 전이(대기→분석중→완료/실패) | `tests/commit-analysis-cards.test.ts` — 전이 6케이스(+무잡 run, cancelled, 역전/불량 타임스탬프) |
| 델타 계산 | 같은 파일 delta 3케이스 + `commit-cards-report.test.ts`의 `receiptFindings` 불량 summary 4케이스 |
| 실패 사유 그대로 표시 | 빌더 verbatim 테스트 + 컴포넌트 verbatim/이스케이프 테스트 + e2e에서 `worker lease expired` 문자열 일치 |
| Playwright 카드 목록 여정 | `tests/e2e/commit-cards.spec.ts` — 목록 5장·상태 4종 노출 → 실패 카드 상세(사유 원문) → 완료 카드 상세(+3/-1, 열린 7건, Receipt 링크 클릭→`/receipts?receipt=receipt-current` 도착) → pending 무날조 → empty 상태 |

스크린샷: `todo-2/commit-cards-list.png`, `todo-2/commit-cards-failed-detail.png` (이 디렉터리).

## 4. 게이트

- vitest **506/506** (69 파일 — 신규 3파일: 빌더 12, 로더 6, 컴포넌트 6)
- Playwright **56/56** — 신규 여정 3 + `/commits` 두 테마 순회(`screens-theme`), `global-setup` ROUTES 등록
- eslint `--max-warnings=0` 무결점 · typecheck(web/worker/core/mcp) 무결점
- 하드코드 hex 0 (신규 CSS는 전부 토큰), 한국어 우선 정책 통과(`korean-strings` — COMMITS 모듈·화면 2종 등록)

## 5. 남긴 것

- Supabase 로더의 라우트 연결(인증 세션 필요)은 /progress·/app/stats와 같은 단계 — Supabase 준비물이 붙는 시점에 일괄.
- `runs.status` 죽은 컬럼 문제는 **OQ-014**로 이관(기획 판단 필요).
