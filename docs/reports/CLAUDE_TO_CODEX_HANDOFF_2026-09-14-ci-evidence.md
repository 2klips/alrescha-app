# Claude → Codex 배포 인수인계: todo 18 파일럿 실기 — CI 증거의 단위를 테스트 파일로, 이 레포의 CI 워크플로

작성: 2026-09-14 · 대상: Alrescha 배포를 담당하는 Codex
상태: **배포 대기 — 워커 재배포 + 실기 1회.** 마이그레이션·환경변수·웹 변경 없음(core 변경은 워커만 호출). 사용자 지시로 머지·배포는 보류 중이며, 이 문서는 그 뒤에 쓰는 절차다.
브랜치: `phase4/wave-c-todo-18-live` (`phase4/wave-d-todo-20` 위에 쌓임 → PR #19 → #20 → #21 순으로 먼저 머지되어야 한다) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/todo-18.md`](../../.omo/evidence/phase4/todo-18.md) ("2026-09-14" 절), [OQ-072](../../spec/OPEN_QUESTIONS.md).

## 1. 왜

todo 18의 남은 항목은 "파일럿 레포 실기 1회"였고, 2026-09-12 노트는 두 조건이 트리 밖에 있다고 적었다: 리포트를 올리는 CI, 그리고 테스트 이름의 `REQ-` 코드. 두 번째는 트리 밖이 아니라 파서의 규칙이었다 — 코드가 없는 파일은 CI가 돌려도 행이 안 생겼다. 이 PR은 그 규칙을 바꾸고(파일이 증거, 코드는 파일이 지지하는 것) 이 레포에 CI를 둔다. 프로덕션 워커가 새 규칙을 돌리기 전에는 아티팩트가 있어도 0행이 맞으므로, 실기는 **재배포 뒤의 절차**다.

## 2. 변경 파일과 동작

| 파일                                                                                   | 동작                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/evidence/ci-reports.ts`                                             | `ingestCiTestReports` → `testFiles`: 파일당 항목, 이름의 `REQ-` 코드는 `requirementIds` 속성. 파일 `verified` = 그 파일을 부른 모든 리포트가 commit 일치·통과·check run 성공이고 케이스 전부 통과. `<skipped/>`·`pending`·`todo`·`disabled`는 **그 파일만** `unknown`("Mapped test case was skipped.") — 종전엔 런 전체 실패. |
| `apps/worker/src/ci-evidence.ts`                                                       | commit당 해석된 경로당 `test` 행 하나(id `ci-test\|sha\|path`), `tests` 엣지 → 파일, 코드마다 `supports` 엣지 → 이 분석이 쓴 요구사항 노드. 두 리포트가 같은 파일을 다르게 표기하면 한 행(둘 다 동의할 때만 verified). metadata `requirementCodes`(복수).                                                                   |
| `apps/worker/src/analysis-job.ts`, `packages/core/src/index.ts`                        | 필드명·타입 이름(`CiTestFileEvidence`).                                                                                                                                                                                                                                                                                    |
| `.github/workflows/ci.yml` (신규), `.gitignore`                                        | push·pull_request마다 frozen-lockfile install → lint → typecheck → 단위 테스트(JUnit) → `reports/vitest-junit.xml`을 `vitest-junit` 아티팩트로 업로드(`if: always()`, 보존 90일). `permissions: contents: read`, 시크릿 없음. build·e2e는 로컬.                                                                              |
| 테스트                                                                                 | `tests/ci-evidence.test.ts` 9(코드 없는 파일·skip 격리·이 레포 아티팩트 형태 포함), `tests/ci-evidence-persistence.test.ts` 6(PGlite), `analysis-job.test.ts` +1, `tests/ci-workflow.test.ts` 5(워크플로 형태 핀), `map-verified.spec.ts` 라이브 재통과.                                                                    |

SQL·웹·의존성 무변경. 녹화 픽스처의 행·엣지 수는 종전과 같다.

## 3. 테스트·게이트 (브랜치 팁)

- `pnpm lint` clean · `pnpm typecheck` clean(root + 6 workspaces) · `pnpm test` 203 files / 1,874 passed / 1 skipped · `scripts/verify-scope-boundaries.ts` PASS · `git diff --check` clean.
- Playwright: `map-verified.spec.ts` 1/1(라이브 — 증거 전 verified 0, 증거 후 정확히 두 노드).
- **이 브랜치의 첫 push가 새 워크플로를 처음 돌린다.** GitHub Actions 탭에서 `CI / gate`의 결론과 `vitest-junit` 아티팩트를 확인한다. 실패하면(러너 환경 차이) 그 자체가 정보다 — 머지 전에 Claude Code로 돌려보낸다.

## 4. 배포 필요 사항

- **마이그레이션** — 없음. **웹 배포** — 없음(머지 시 Vercel이 돌겠지만 화면 변화 없음). **워커** — **필요**(Fly `arr-worker` 재배포: 새 파서와 records가 analyze 안에 있다). **환경변수** — 없음. **GitHub App** — 변경 없음(`actions:read`·`checks:read`·`workflow_run` 구독은 이미 핀됨).

**절차: PR #19 → #20 → #21 → 이 PR 순 merge commit 머지 → 루트 체크아웃을 `main`으로 fast-forward한 뒤 `flyctl deploy` → 실기.**

머지 자체가 `main`에 push이므로 CI가 돌고 `workflow_run` 웹훅이 analyze를 큐잉하는데, 그 시점의 워커는 **옛 규칙**이라 `ci evidence` 줄이 안 찍히는 게 정상이다. 재배포 뒤:

1. `/app`(또는 MCP `request_rescan`)에서 `2klips/alrescha-app` **다시 스캔 1회** — CI가 이미 돈 head에서. incremental이면 충분하다(증거 수집은 mode와 무관).
2. 워커 로그: `ci evidence N row(s), M supporting` — N은 스위트의 테스트 파일 수 근처(200 안팎), M은 skip이 있는 파일 하나를 뺀 수. `ci evidence`가 아예 없으면 아티팩트를 못 찾은 것 — Actions 탭에서 그 sha의 `vitest-junit`이 있는지, 만료(90일) 안인지 본다.
3. `/app/map`: 테스트 파일 노드들이 `verified`(인스펙터 배지), `src/` 파일은 전부 `inferred`(ADR-001 — import된 코드는 승격 안 됨). 스크린샷 1장과 로그 줄을 `.omo/evidence/phase4/todo-18/`·evidence 노트에 남기면 todo 18 체크박스가 닫힌다(그 갱신은 Claude Code 인계로).
4. `pnpm ops:health`: analyze failed 증가 없음.

## 5. 롤백 지점

- 워커: 이전 Fly 릴리스로. 이미 쓰인 파일 단위 행은 옛 워커의 다음 analyze가 **통째로 치운다**(`metadata->>'source'='ci'` 스윕) — 데이터 잔류 없음.
- 워크플로: `.github/workflows/ci.yml` 삭제 커밋. 아티팩트는 GitHub 쪽 보존 기간에 따라 남는다.

## 6. 예상과 다른 점

- `verified`는 **테스트 파일**에만 붙는다. 요구사항 노드는 이 레포에 `REQ-` 코드가 없으므로 계속 `inferred`(OQ-064) — 결함이 아니라 측정.
- `main` 보호 규칙(필수 체크)은 이 PR 밖(OQ-026) — 게이트가 보고는 하되 막지는 않는다.

## PR

- https://github.com/2klips/alrescha-app/pull/22 — base `phase4/wave-d-todo-20`. 커밋 3건: `feat(worker): grade CI evidence per test file, with requirement codes as edges rather than the gate`(`e70b576`), `ci: run the gate on GitHub Actions and upload the Vitest JUnit report as an artifact`(`092fd45`), 문서(`712e9cd`). PR #19 → #20 → #21 다음에 머지. 브랜치의 첫 CI 실행 결과는 이 문서의 "게이트 수치" 아래에 적는다.

## 게이트 수치

- `pnpm test` 203 files / 1,874 passed / 1 skipped (브랜치 팁, 2026-09-14).
