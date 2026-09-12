# Claude → Codex 배포 인수인계: 홈의 현재 저장소 규칙과 첫 스캔 재시도 (PR #9 후속)

작성: 2026-09-12 · 대상: Alrescha 배포를 담당하는 Codex
상태: **배포·복구 검증 완료, 저장소 이름 동기화 후속 필요 — `202609120004` 적용 후 PR #10 merge `80a99cb`와 웹 배포 완료, 워커 v18 유지. Picker 선택에 따라 홈·헤더가 함께 바뀌고 완료 단계·다시 스캔을 확인했다. LostArk `:r1` pair는 모두 1회·0크레딧 succeeded, SHA 일치, 기존 실패 행 보존, 새 실패 0건(기존 14 WARN). 다만 picker의 옛 `2klips/arr-app` 이름이 재선택 시 저장소 행에도 복사돼 canonical 이름 검증은 미충족이며 Claude lane 후속이다. 403 종류·연기는 미관측.** 상세: [프로덕션 롤아웃 기록](../../.omo/evidence/phase4/pr10-production-rollout-2026-09-12.md).
브랜치: `claude/home-current-repository` (`main@5cb4379` 기준) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/home-current-repository-first-scan-retry-2026-09-12.md`](../../.omo/evidence/phase4/home-current-repository-first-scan-retry-2026-09-12.md) — 계약 조사, red/green, 게이트, 검증 절차, 롤백 지점이 전부 거기 있다. 이 문서는 그 요약이다.

## 1. 무엇이 문제였나

- "현재 저장소"는 어디에도 저장되지 않는다. 홈·헤더·맵·enrich 액션은 **생성이 가장 최근인** 행을, 인덱스 PR 액션은 **선택이 가장 최근인** 행(`selected_at`, 연결 화면에서 고를 때마다 갱신)을 각자 골랐다. 프로덕션에서는 나중에 생성된 `LostArk_Scheduler`의 실패한 첫 backfill이, `alrescha-app`의 성공한 pair를 가렸다.
- 실패한 첫 backfill은 돌아올 길이 없었다. 같은 head의 backfill 키는 `enqueue_job`이 상태와 무관하게 기존(죽은) 잡을 돌려주고, rescan은 `last_scanned_commit_sha`가 null이면 `never-scanned`로 거부한다. 재연결은 "scheduled"라고 말하면서 아무것도 돌리지 않았다.
- 같은 이유로, 영구 실패한 rescan pair도 버튼을 다시 눌러 되살릴 수 없었다.

## 2. 변경 파일과 동작

| 파일                                                                                                                                                                            | 동작                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/lib/shell/current-repository.ts` (신규)                                                                                                                               | `currentRepository(rows)`: 마지막으로 **선택한** 저장소가 앞선다. 선택된 적 없는 로컬 push 저장소는 생성 시각으로 센다. 동률·이상값은 호출자 순서 유지.                                                                                                                                                                                                                                                                                                                          |
| `apps/web/lib/home/journey.ts`, `lib/shell/context.ts`, `lib/map/workspace-map.ts`, `app/(shell)/settings/{ai,mcp}/actions.ts`                                                  | 모두 같은 함수로 저장소를 고른다(조회에 `created_at,selected_at` 추가). 홈 모델에 `repositoryCount`·`repositorySwitchHref`(현재 installation의 picker 경로). `buildScanProgress`는 첫 스캔이 영구 실패했고 head를 알면 `rescan: "retry"`.                                                                                                                                                                                                                                        |
| `apps/web/app/app/(shell)/home-screen.tsx`, `actions.ts`, `page.tsx`, `lib/strings/home.ts`                                                                                     | 같은 폼·같은 액션에 `첫 스캔 다시 시도` 라벨과 `first-scan` 결과 문구. 저장소가 둘 이상이면 연결 단계 아래 한 줄(`연결된 레포 N개 — 홈과 헤더는 마지막으로 선택한 레포를 보여줍니다.` + `다른 레포 선택` 링크).                                                                                                                                                                                                                                                                  |
| `supabase/migrations/202609120004_first_scan_retry.sql` (신규)                                                                                                                  | `enqueue_backfill_scan`·`enqueue_repository_rescan`을 같은 시그니처·반환 형태로 재정의. pair의 두 키를 `next_retry_idempotency_key`로 발급해 terminal pair는 새 세대(`:r1`)·새 run(`<trigger>:r1`)으로 재시도, live pair는 그대로 하나. 실패한 것만 재시도(성공한 scan은 유지, 실패한 analyze만 새로). never-scanned지만 scan 잡이 있으면 그 head로 첫 스캔을 다시 큐잉하고 `reason: 'first-scan-retry'`. 실패 행은 건드리지 않는다. `retry_generation_of(text)` 보조 함수 추가. |
| `tests/helpers/database.ts`                                                                                                                                                     | `FIRST_SCAN_RETRY_MIGRATION` 등록.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `apps/web/lib/shell/current-repository.test.ts`(4), `journey.test.ts`(+3), `tests/backfill-and-rescan.test.ts`(+6), `tests/e2e/onboarding-progress.spec.ts`(+1 테스트, +1 단계) | red(구현 stash 시 10건 실패) → green.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `docs/frontend/logs/2026-09-12-home-current-repository-first-scan-retry.md`, `WORKLOG.md`, `spec/OPEN_QUESTIONS.md` OQ-042                                                      | 프론트 로그와 임시 규칙 기록. 선택기·`/app/[repo]` 결정은 그대로 열려 있다.                                                                                                                                                                                                                                                                                                                                                                                                      |

보존한 계약: 실패 행의 status/attempt_count/last_error/completed_at 불변(ops:health 집계 유지), scan/analyze 0크레딧, 테넌트 격리(다른 workspace 저장소 거부), null sha 거부, 로컬 저장소 거부 문구, `never-scanned` 문구, 맵 그래프는 workspace 전체.

## 3. 테스트·게이트 (브랜치 팁)

| 게이트                                                   | 결과                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| red (마이그레이션·등록·journey.ts stash)                 | 2 files failed · 10 failed / 28 passed                      |
| `pnpm lint`                                              | clean                                                       |
| `pnpm typecheck`                                         | 루트 + 전 워크스페이스 clean                                |
| `pnpm test`                                              | 186 files, 1,706 passed, 1 skipped (PR #9 시점 185 / 1,693) |
| Prettier `--check` (변경·추가 파일 전부)                 | clean                                                       |
| `scripts/verify-scope-boundaries.ts`                     | PASS, 12 boundaries, 362 files                              |
| `git diff --check`                                       | clean                                                       |
| Playwright `onboarding-progress.spec.ts` (로컬 Supabase) | 근거 문서 "Playwright" 절                                   |

## 4. 배포 필요 사항

- **마이그레이션 1건** (`202609120004`) — 필요.
- **웹 배포** — 필요(머지로 Vercel 자동 배포).
- **워커 재배포** — 불필요(워커 코드 무변경, 두 함수는 워커가 호출하지 않는다).
- **환경변수** — 없음.

**순서: 마이그레이션 → 웹(머지).** 두 함수의 시그니처·반환 형태가 같아 기존 웹은 새 함수 위에서 그대로 동작한다. 새 웹이 옛 함수를 만나면 버튼은 보이되 클릭 결과가 `never-scanned`로 돌아온다 — 정직하지만 복구는 아니므로 마이그레이션을 먼저 적용한다. 절차·확인 SQL은 근거 문서 "Rollout" 절 1–6단계. 핵심:

1. Fly 워커 안에서 원장 최신이 `202609120003`인지 확인 → `pnpm db:migrate` → `Applied: 202609120004_first_scan_retry.sql`.
2. `pg_proc`에서 `enqueue_backfill_scan`·`enqueue_repository_rescan`의 본문이 `next_retry_idempotency_key`를 포함하는지 확인(2행 true), `retry_generation_of` 존재.
3. PR 머지 → Vercel 배포 → `/` 200, `/api/mcp` GET 405.
4. **선택 검증**: 파일럿 워크스페이스 홈은 여전히 `LostArk_Scheduler`(선택 시각 11:49:56Z가 더 늦다)를 보여주되 `연결된 레포 2개` 줄과 `다른 레포 선택` 링크가 있다. 링크로 picker에 가서 `2klips/alrescha-app`을 고르면 `selected_at`이 갱신되고 backfill은 같은 head라 idempotent. 기대: 홈·헤더가 `alrescha-app`, `구조 스캔 완료 · 분석 완료`, `다시 스캔`.
5. **복구 검증**: picker에서 `LostArk_Scheduler`를 다시 고르거나 그 홈에서 `첫 스캔 다시 시도`. `backfill:<repo>:<head>:r1` pair가 run `backfill:<head>:r1`에 0크레딧으로 생기고, 실패 행 2개는 `failed`·attempt 3·last_error 그대로. 워커 로그에서 v18의 403 분류 줄을 본다. 수용: 새 잡 둘 다 succeeded, 저장소 sha 두 칼럼 일치, 홈 완료·완료·다시 스캔.
6. `pnpm ops:health`: 기존 14건 WARN 유지, 새 pair가 더하지 않는 것이 기준.

## 5. 롤백 지점

- 웹: Vercel Instant Rollback(직전 `5cb4379` 배포). 마이그레이션은 그대로 둔다 — 이전 웹도 같은 시그니처로 호출하고 같은 형태를 읽는다.
- 함수를 되돌려야 하면 `202609120002`의 본문을 담은 **새** 마이그레이션을 추가한다. 적용된 파일은 수정하지 않는다.

## 6. 예상과 다른 점

- URL 연결 폼은 이미 연결된 저장소를 재선택하지 않는다(`already_connected`에서 멈춤). picker가 재선택 경로이며 홈이 그리로 링크한다.
- 재시도는 head를 다시 읽지 않고 실패한 잡이 들고 있던 head로 스캔한다. 최신 head가 필요하면 picker 재선택(연결 경로가 head를 읽는다).
- e2e 스택은 로컬 docker Supabase를 쓰며 `202609120003`·`202609120004`가 미적용 상태였다. 로컬에만 `pnpm db:migrate`를 적용했다. 프로덕션은 건드리지 않았다.
- 이번 변경에서 403 종류(primary/secondary)는 여전히 미관측이며, pacer·`SCAN_FETCH_CONCURRENCY`는 바꾸지 않았다.

## PR

- <https://github.com/2klips/alrescha-app/pull/10> — 커밋 2건: `c1ba617`(Codex의 PR #9 롤아웃 기록, 작업 트리에 남아 있던 그대로), `d984614`(구현·테스트·마이그레이션·문서). 머지 후 머지 커밋이 Vercel에 배포된다.
