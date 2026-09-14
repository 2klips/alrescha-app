# Claude → Codex 인수인계: todo 25 — graph-surface v3 사전등록·실행 (프로덕션 형태 스토어)

작성: 2026-09-14 · 대상: Alrescha 배포를 담당하는 Codex
상태: **머지만 — 배포·검증 없음.** 벤치 하네스·사전등록·결과·감사 스크립트·문서만 바뀐다. 웹 화면·워커·마이그레이션·환경변수 무변경, 사이트 문구 무변경.
브랜치: `phase4/wave-e-todo-25` (`main@ecc68d5` 기준) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/todo-25.md`](../../.omo/evidence/phase4/todo-25.md), 결과 [`benchmarks/graph-surface/results.v3.md`](../../benchmarks/graph-surface/results.v3.md) · [`results.v3-relational.md`](../../benchmarks/graph-surface/results.v3-relational.md) · [`results.v3-auxiliary.md`](../../benchmarks/graph-surface/results.v3-auxiliary.md).

## 1. 왜

v1·v2는 출하되지 않는 표면을 쟀다 — 하네스가 본문을 붙여 만든 워크스페이스와 손으로 쓴 툴 정의. 프로덕션 아티팩트는 enrich 전에 본문이 없고(OQ-039), R5 §4.5 ⒀이 그 모순을 이름 붙였다. v3는 제품 그대로를 잰다: 실스캔을 `alrescha serve --local`과 같은 코드로 투영한 요약 전용 스토어, hosted 서버가 `tools/list`로 답하는 카탈로그(다이제스트 잠금), 설치 지시 블록. 질문·채점·그리드는 v1과 바이트 동일.

## 2. 결과 한 줄

**NOT MET.** 예산을 설치하면 턴이 늘고(+0.375/시행, pooled) 품질은 같다(PASS율 0.688 = 0.688). 모델별로 부호가 갈린다(luna +1.04턴, sonnet −0.29턴). 부속: `log_progress` 채택 0/48, 관계형 4문항은 턴 +0.375·PASS +6.3pp, 위험 상위 10 정밀도 0.4(대리 라벨, CI 없는 층만). 판정과 무관하게 전부 게시했고 사이트 문구는 손대지 않았다(ADR-012).

## 3. 변경 파일과 동작

| 파일                                                                                                          | 동작                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/graph-surface-benchmark/product-surface.ts` (신규)                                                   | 실스캔 → `buildLocalWorkspace`(본문 0, `assertBodilessWorkspace`), hosted 엔드포인트 + SDK 클라이언트로 `tools/list`·`tools/call`, 카탈로그 SHA-256, 시행별 스토어 관측. |
| `scripts/graph-surface-benchmark/{manifest,loop,report,tools}.ts`                                             | `graph-surface-v3` 스키마(카탈로그 다이제스트·군 집합 검증·인라인 질문), 호출별 cache creation/read·툴 이름 기록, 턴 비증가 판정·cache 열, JSON-schema 툴 파라미터.      |
| `scripts/graph-surface-benchmark/{auxiliary,risk-precision,audit}.ts` (신규)                                  | 부속 ①②③ 집계, ⑤ 위험 정밀도 라벨링(결정론 규칙), graph-surface 릴리스 F5 감사.                                                                                          |
| `scripts/bench-graph-surface.ts`, `scripts/bench-graph-surface-auxiliary.ts` (신규)                           | v3 실행 경로(시행마다 자기 스토어, 스모크 옵션은 릴리스 이름 거부), 부속 리포트 러너(`pnpm bench:graph-surface:auxiliary`).                                              |
| `scripts/verify-benchmark-report.ts`                                                                          | `benchmarks/graph-surface/` 감사 추가 — 잠금·그리드·시행 정합·판정 재계산·v3 마크다운 재렌더 일치. 기존 databrain 감사 무변경.                                           |
| `packages/mcp/src/workspace-risk.ts`                                                                          | `workspaceRiskMap` 분리(추가만, `workspaceRiskEntries`는 그 위에서 같은 답).                                                                                             |
| `benchmarks/graph-surface/preregistration.v3*.json`, `results.{dry-run.,}v3*.{json,md}`, `results.v3.smoke.*` | 사전등록 3건(주·관계형·부속), 드라이런·실행·스모크 결과.                                                                                                                 |
| `tests/graph-surface-v3.test.ts`                                                                              | 16건.                                                                                                                                                                    |
| `spec/BUILD_PLAN_PHASE4.md`, `spec/OPEN_QUESTIONS.md`, `AGENTS.md`                                            | 체크박스·완결 노트, OQ-070(동결 질문의 정답 문자열이 개명으로 낡음)·OQ-071(강제 첫 호출·본문 없는 포인터의 턴 비용), 인계 링크.                                          |

## 4. 테스트·게이트 (브랜치 팁)

- `pnpm lint` clean · `pnpm typecheck` clean · `pnpm test` 195 files / 1,815 passed / 1 skipped · `scripts/verify-scope-boundaries.ts` PASS · `git diff --check` clean.
- `node --import tsx scripts/verify-benchmark-report.ts`: `PASS efficacy benchmark: 600/600 …` + `PASS graph-surface benchmark: v1 96/96, v2 96/96, v3 96/96, v3-relational 32/32 (0 failed each)`.
- 실행 실패 0(주 96·관계형 32·스모크 8). Playwright 미실행 — 웹 무변경.

## 5. 배포 필요 사항

- **마이그레이션** — 없음. **웹 배포** — 머지 시 Vercel이 돌지만 화면 변경 없음(확인만). **워커** — 없음. **환경변수** — 없음. **사이트 문구** — 없음(NOT MET).

**절차: 머지만.**

1. PR을 merge commit으로 머지. Vercel 배포가 성공하면 끝(화면 확인 불필요 — `apps/web` 소스 무변경).
2. 검증(크레딧 0): `node --import tsx scripts/verify-benchmark-report.ts`가 위 두 PASS 줄을 내는지 1회.
3. `pnpm ops:health`: 변화 없음이 정상.
4. **벤치를 다시 돌리지 않는다** — 크레딧을 쓰고, 사전등록된 결과는 이미 게시됐다.

## 6. 롤백 지점

- 코드 revert만. 데이터·인프라 변경 없음.

## 7. 예상과 다른 점

- 동결 질문 2문항의 정답 문자열(`arr.dev/receipt/v1`, `ARR:BEGIN`)이 개명 이후 코퍼스에 없다 — 양 군이 같은 상한(2/3)에 걸려 비교는 유효하나 절대 PASS율은 v2와 비교 불가(OQ-070).
- 그래프군의 제품 툴 사용은 강제 `search_index` 2회가 대부분이고 그 답이 `excerpt: ""`라 파일 읽기로 이어진다 — +0.375턴의 정체(OQ-071).
- `log_progress` 채택 0/48: 질문형 시행에는 "작업 단위 종료"가 없다. 코딩 세션 수치가 아니다.

## PR

- https://github.com/2klips/alrescha-app/pull/18 — 커밋 2건: `feat(bench): preregister graph-surface v3 against the production-shaped store`(`c172b6b`, 잠금), `feat(bench): run graph-surface v3 against the production-shaped store`(실행·게시). 머지만 필요하다(§5).
