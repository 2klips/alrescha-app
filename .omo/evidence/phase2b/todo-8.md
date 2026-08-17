# todo 8 — 통합 점검 뷰 (2026-08-17)

**범위:** BUILD_PLAN_PHASE2B Wave 3 todo 8, ADR-009 아젠다 ⑥(점검 대시보드), ADR-009-4(보안 점검 = 수집만).

## 1. 구조 (/progress·/commits 관용구)

| 층 | 파일 | 역할 |
|---|---|---|
| npm audit 파서 | `packages/core/src/inspection/dependency-audit.ts` | `npm audit --json`(auditReportVersion 2) → 심각도 정렬 advisories + **엔트리에서 재계산한 counts**. 불량 입력은 null(0 날조 금지). **순수 함수 — fs·프로세스·네트워크 없음** |
| 대시보드 빌더 | `packages/core/src/inspection/dashboard.ts` | 위젯 6종(진척·열린 문제·문서 점검·드리프트 위험·의존성 감사·배제 이력) 합성. 전 위젯 공통 계약: `sourceLabel` + 데이터 없으면 `insufficient-evidence` |
| 데모 픽스처 | `apps/web/lib/inspection/fixtures.ts` | busy(전 위젯 활성, 반복 가설 포함) / empty |
| 화면 | `apps/web/app/inspection/{page,inspection-view}.tsx` | 공개 데모 라우트 `/inspection`, 위젯 그리드 |
| 카피 | `apps/web/lib/strings/inspection.ts` | 한국어 우선. `terms.ts`에 npm audit·append-only·moderate·info·major·patch 추가 |

## 2. 설계 결정

- **드리프트 위험 = 발견 중 문서 위험군**(`unproven-claim`·`stale-doc`·`contradicting-instructions`)의 결정론 필터 — 새 판정 없음, 출처는 기존 보증 엔진.
- **문서 신선도**: head commit과 `lastSeenCommitSha` 일치 → 현행 / 불일치 → 이전 commit 기준 / stale-doc 발견에 걸림 → 드리프트 의심. 요약은 입력에 있으면 **무조건 `inferred` 라벨로 감싸서만** 노출(빌더 타입이 `grade: "inferred"` 리터럴).
- **의존성 감사는 수집(ingest)이지 스캔이 아니다** — 파서는 이미 생산된 JSON의 순수 변환. 화면 카피에도 명시("Arr는 코드를 스캔하지 않습니다").
- **배제 이력은 append-only** — 정렬만 하고 중복 제거·절단 없음. 같은 가설이 두 번 기록되면 두 번 보인다(그게 목적).

## 3. 수용 기준 ↔ 테스트

| 수용 기준 | 테스트 |
|---|---|
| 위젯별 출처 라벨 | 컴포넌트: `출처:` 라인 6개 전수 + e2e에서 위젯 6종 각각의 `.inspection-source` 확인 |
| 요약이 `inferred`로 표시 | 빌더(요약은 grade:"inferred"로만 래핑, 없으면 null) + 컴포넌트(inferred 배지 + "요약 없음 — 판단 실행 전") + e2e |
| 의존성 감사 파서 테스트 | `tests/dependency-audit.test.ts` — v2 정상(제목·URL·fix major/patch/none·counts 재계산·심각도 정렬), 빈 보고서=0건(부재 아님), 불량 5종(null·문자열·v1·필드 누락·미지 심각도)→null |
| 데이터 없을 때 "증거 부족" | 빌더(전 위젯 insufficient-evidence) + 컴포넌트(문구 6회, `0%`·`0 / 0` 부재) + e2e(empty 상태) |
| 자체 스캐너 부재 scope 테스트 | ⑴ `tests/dependency-audit.test.ts`의 스코프 증명 — inspection 모듈 소스에 `node:fs`·`child_process`·`execSync`·`spawn(`·`node:http(s)`·`fetch(` 부재 ⑵ 스코프 스캐너 자체 검사 `PASS 200 files`(`skill-security-scanning` 경계 유지) |

추가: 빌더 테스트 — open만 집계·심각도 정렬, 드리프트 위험 필터, 신선도 3종, append-only(반복 가설 2건 생존·최신순), 0/0 todo는 null%(0% 날조 금지), 감사 JSON 통과/불량 경로.

## 4. 게이트

- vitest **565/566**(77 파일, 1 skip = win32 심링크) — 신규 파서 10·빌더 8·컴포넌트 6
- Playwright **60/60** (신규 여정 3 + `/inspection` 두 테마 순회 포함). 스크린샷: `todo-8/inspection-{busy,empty}.png`
- eslint·typecheck 무결점 · 스코프 스캐너 PASS · korean-strings(INSPECTION 모듈·화면 2종 등록)

## 5. 남긴 것 (후속 배선)

- 실데이터 로더 미작성 — 문서 요약을 만드는 **판단 잡**(크레딧 과금)과 npm audit **업로드 경로**(CI 아티팩트 인제스트)가 선행돼야 하며, 그때 Supabase 로더와 함께 배선. 현재 화면은 데모 픽스처(다른 공개 화면과 동일 단계).
- 배제 이력의 수집 경로(MCP `log_progress` 확장 또는 전용 툴)는 Wave 2 MCP 작업과 함께 결정.
