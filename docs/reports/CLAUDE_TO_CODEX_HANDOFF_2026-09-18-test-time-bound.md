# Claude → Codex 배포 인수인계: 테스트 스위트의 시간 상한 명시 — 머지만

작성: 2026-09-18 · 대상: Alrescha 배포를 담당하는 Codex
상태: **머지 대기.** 배포·마이그레이션·환경변수 변경 없음. 머지 시 Vercel·CI·파일럿 자동 스캔은 평소대로 돈다(화면 변화 없음, 0크레딧).
브랜치: `phase4/test-time-bound` (base `main` `683a0d6`) · PR: 본문 하단 "PR" 항목.
근거 문서: [`test-time-bound.md`](../../.omo/evidence/phase4/test-time-bound.md).

## 1. 왜

같은 종류의 CI 실패가 한 주에 두 번 났다 — 실제 마이그레이션을 올리는 PGlite 테스트가 GitHub 러너에서 vitest 기본 상한 5초를 넘기고(5.09s·5.04s), 재실행에서는 통과. 러너에서 마이그레이션된 DB 하나가 4–5초이고, 1,879케이스 중 260건이 3초 이상이다(run 35341039386 아티팩트 실측). 재실행 한 번이 비용의 전부가 아니다: 2026-09-14 증거 규칙은 리포트가 통째로 통과해야 파일을 verified로 보므로, 실패한 attempt의 아티팩트가 재실행 전까지 파일럿의 verified 203개를 전부 `unknown`으로 내렸다(Codex 관측 `supporting 0` → 203).

## 2. 변경 파일과 동작

| 파일                        | 동작                                                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest.config.ts`          | `testTimeout`·`hookTimeout`을 **60,000ms**로 명시. 스위트가 스스로 적어 둔 상한 값 중 가장 흔한 값(`60_000` 35곳). 더 큰 상한을 스스로 적은 테스트(`databrain-benchmark` 120s)는 그대로. 다른 설정 불변. |
| `tests/test-bounds.test.ts` | 신규 핀 2건: 설정이 두 상한을 명시한다, 그리고 아무것도 적지 않은 테스트가 실제로 그 상한 아래서 돈다(`task.timeout`). 기본값으로 되돌리면 실패.                                                         |

**단언 변경 없음.** 이 저장소의 속도 주장은 타임아웃이 아니라 테스트 안의 경과시간 단언에 있고(`directory-nodes`·`github-read-throttle`·밀도 게이트), 전부 그대로다. 타임아웃은 멈춘 테스트를 잡는 상한이다.

왜 헬퍼가 아니라 설정인가: `tests/helpers/database.ts`는 Playwright 스펙(`tests/e2e/pilot-flow.spec.ts`)도 import하므로 vitest 워커 안에서만 존재하는 `vi.setConfig`를 거기 둘 수 없다. 설정이 모든 파일에 닿는 유일한 한 곳이다.

## 3. 테스트·게이트 (브랜치 팁)

- `pnpm lint` clean · 루트 `tsc --noEmit` clean · `verify-scope-boundaries.ts` PASS · `git diff --check` clean · prettier clean.
- 전체 `pnpm test` 204 files / 1,880 passed / 1 skipped (신규 핀 파일 +1, 케이스 +2).

## 4. 배포 필요 사항

- **마이그레이션** — 없음. **워커** — 없음(테스트 설정만). **환경변수** — 없음.
- **웹 배포** — 머지 시 Vercel 자동(번들 변화 없음).
- **절차: PR을 merge commit으로 머지 → main CI success 확인 → 끝.** 수동 스캔 없음. 자동 scan/analyze는 푸시 웹훅으로 평소대로 돌고 0크레딧이다.

검증(전부 읽기 전용): main CI가 attempt 1에서 success면 된다. 타임아웃으로 실패하면 이번 변경이 닿지 않은 경우이므로 실패 테스트 이름과 소요 시간을 인계한다(재실행 요청은 Codex 판단).

## 5. 롤백 지점

- `vitest.config.ts`의 두 줄을 되돌리는 커밋. 데이터·배포 영향 없음. 되돌리면 핀 테스트가 실패하므로 같이 지운다.

## 6. 예상과 다른 점

- 지난주 개별 테스트에 적은 `{ timeout: 60_000 }` 셋은 그대로 둔다(전역값과 같고, 지우는 건 churn).
- 이 일이 드러낸 규칙 질문 — 실패한 런 안에서 통과한 파일을 verified로 둘 것인가 — 는 OQ-072 옆의 제품 결정이며 여기서 열지 않았다.

## PR

- https://github.com/2klips/alrescha-app/pull/24 — base `main`. 커밋 1건: `test: state one time bound for the suite instead of leaving vitest at its 5s default`(`0c51cf6`) + 이 링크 커밋.

## 게이트 수치

- `pnpm test` 204 files / 1,880 passed / 1 skipped, 119s (브랜치 팁, 2026-09-18) · `pnpm lint` clean · 루트 `tsc --noEmit` clean · `verify-scope-boundaries.ts` PASS(12 boundaries, 382 files) · `git diff --check` clean.
