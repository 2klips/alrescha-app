# Claude → Codex 배포 인수인계: 큐잉된 GitHub 읽기의 403 (PR #8 후속)

작성: 2026-09-12 · 대상: Alrescha 배포를 담당하는 Codex
상태: **배포 완료, UI 수용 기준 미충족 — PR #9 merge `5cb4379`, `202609120003` 적용, Fly v18. 새 pair는 둘 다 1회·0크레딧으로 succeeded, 저장소 SHA 일치, 새 실패 0건(기존 14 WARN). 홈은 기존 LostArk 실패를 계속 표시하므로 저장소 선택/첫 backfill 복구를 Claude lane에 인계한다. 이번 실행의 403 종류·큐 연기는 미관측.** 상세: [프로덕션 롤아웃 기록](../../.omo/evidence/phase4/pr9-production-rollout-2026-09-12.md).
브랜치: `claude/github-read-throttle` (`main@35c88d4` 기준) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/github-read-throttle-2026-09-12.md`](../../.omo/evidence/phase4/github-read-throttle-2026-09-12.md) — 원인 분석, red/green 테스트, 게이트, 검증 절차, 롤백 지점이 전부 거기 있다. 이 문서는 그 요약이다.

## 1. 입증한 것과 입증하지 않은 것

코드로 입증한 사실 네 가지:

1. `finish_job`의 재시도 백오프는 `2^attempt`초(2초, 4초)라 세 attempt가 10초 안에 끝났다. 어떤 GitHub 제한도 그 안에 풀리지 않는다.
2. `GitHubRequestError`는 status와 경로만 보존했다. `retry-after`·`x-ratelimit-*` 헤더를 읽지 않았으므로 `last_error`로는 primary/secondary/권한 거부를 구분할 수 없었다.
3. full scan은 첫 403 뒤에도 남은 본문 요청 전부(1,170개 중 남은 것)를 8개 동시로 계속 보냈다 — 세 attempt 모두.
4. 토큰은 판별 요인이 아니다. 재시작 뒤 새 토큰으로 tree는 200, 몇 초 뒤 같은 토큰의 contents는 403이었고, 운영자의 단일 요청은 몇 분 뒤 200이었다. 시간·요청량에 의존하는 실패다.

입증하지 않은 것: primary인지 secondary인지. 기록에 헤더가 없어 결정할 수 없고, 이번 변경은 그것을 **결정 가능하게** 만든다 — 배포 뒤 첫 throttled 잡의 `last_error`와 워커 로그가 종류를 적는다. "secondary rate limit"이라고 단정하지 않는다.

## 2. 변경 파일과 동작

| 파일                                                                                                                       | 동작                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/worker/src/github-repository-source.ts`                                                                              | 403/429를 헤더로 분류(`primary-rate-limit` / `secondary-rate-limit` / `rate-limited` / `forbidden` / `other`), `retryAt`·rate-limit 카운터를 에러에 보존, 본문은 secondary 문장 판별에만 쓰고 버림. 소스 인스턴스당 하나의 gate: 첫 throttled 응답이 pause(힌트 + 최대 5초 jitter)를 열고, 진행 중이던 요청은 그 pause를 공유하며, 90초 이내면 잡 안에서 기다린 뒤 재요청, 그보다 길거나 연속 4번째 pause면 gate를 닫아 이후 요청은 네트워크 없이 즉시 실패. scan과 analyze는 캐시된 같은 소스를 쓰므로 gate도 공유. |
| `apps/worker/src/worker.ts`                                                                                                | 실패가 `retryAt`을 가지면 `retryDelaySeconds`(현재부터의 초 + 1, 상한 3600)를 `queue.finish`의 다섯 번째 인자로 전달하고 로그에 `— retry deferred Ns`를 덧붙임. 없으면 종전과 동일한 4인자 호출.                                                                                                                                                                                                                                                                                                                     |
| `apps/worker/src/queue.ts`                                                                                                 | `finish`에 선택 인자 `retryDelaySeconds`. 5인자 `finish_job`이 없으면(`42883`) 4인자로 폴백 — 배포 순서가 뒤바뀌어도 잡이 리스에 걸려 있지 않게.                                                                                                                                                                                                                                                                                                                                                                     |
| `supabase/migrations/202609120003_finish_job_retry_delay.sql` (신규)                                                       | 4인자 `finish_job`을 drop하고 `retry_delay_seconds integer default null`을 가진 5인자로 재생성. 재시도 시 `available_at = now() + greatest(2^attempt초, least(delay, 3600)초)`. 성공·종결 분기는 이전 본문 그대로. grant/revoke 재발급. 4인자 호출은 그대로 동작하므로 v17이 이 함수 위에서 돈다.                                                                                                                                                                                                                    |
| `tests/helpers/database.ts`                                                                                                | `FINISH_JOB_RETRY_DELAY_MIGRATION` 등록.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `apps/worker/src/{github-repository-source,worker}.test.ts`, `tests/{finish-job-retry-delay,github-read-throttle}.test.ts` | red → green. e2e(PGlite + 실제 큐 함수 + 실제 소스/스토어 + 홈 진행 모델): 60초 secondary는 기다린 뒤 pair 완료·`last_scanned = last_analyzed`·`구조 완료 · 분석 완료 · 다시 스캔`; 1800초 primary는 attempt 1에서 `available_at ≈ +1801s`로 연기되고 그동안 클레임되지 않으며 창이 지나면 같은 잡이 완료; 힌트 없는 `403 forbidden`은 세 attempt 소진 후 실패하되 화면의 이유가 종류를 말함.                                                                                                                        |
| `docs/DEPLOYMENT_RUNBOOK.md` §10.1                                                                                         | `last_error`의 403 분류 어휘와 "연기된 queued 잡은 재큐잉하지 않는다" 안내.                                                                                                                                                                                                                                                                                                                                                                                                                                          |

보존한 계약: 404만 transient(`readTransientSource`), scan/analyze 0크레딧·idempotency, `describeFailure`의 cause 부기, `reap_stale_jobs` 불변, `permanentFailureWarn=5`·`PERMANENT_FAILURE_WINDOW_DAYS=7` 불변.

## 3. 테스트·게이트 (브랜치 팁)

| 게이트                                    | 결과                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| red (구현 3파일 stash 후 새 테스트 실행)  | 3 files failed · 8 failed / 13 passed — e2e 3건 전부 실패, 큐 지연은 1.998초(옛 백오프) |
| `pnpm lint`                               | clean                                                                                   |
| `pnpm typecheck`                          | 루트 + 전 워크스페이스 clean                                                            |
| `pnpm test`                               | 185 files, 1,693 passed, 1 skipped (PR #8 시점 182 / 1,662)                             |
| Prettier `--check` (변경·추가 `.ts` 전부) | clean                                                                                   |
| `scripts/verify-scope-boundaries.ts`      | PASS, 12 boundaries, 360 files                                                          |
| `git diff --check`                        | clean                                                                                   |

## 4. 배포 필요 사항

- **마이그레이션 1건** (`202609120003`) — 필요.
- **워커 재배포** — 필요. `WORKER_WORKSPACE_IDS` unset 유지.
- **웹 배포** — 불필요(웹 코드 무변경; `main` 머지로 Vercel이 자동 배포하더라도 기능 변화 없음).
- **환경변수** — 없음.

**순서: 마이그레이션 → 워커.** 절차와 확인 SQL은 근거 문서 "Rollout" 절의 1–7단계 그대로다. 핵심만:

1. Fly 워커 안에서 원장 최신이 `202609120002_backfill_analyze_pair.sql`인지 확인 → `pnpm db:migrate` → `Applied: 202609120003_finish_job_retry_delay.sql` 한 줄.
2. `pg_get_function_identity_arguments`로 `finish_job`이 5인자 한 행뿐인지 확인.
3. `flyctl deploy --remote-only`. release·image 기록.
4. **새 pair**를 만든다. 기존 LostArk backfill·alrescha-app rescan의 같은-head 키는 이미 terminal 잡을 가리키므로 새 head(푸시 또는 아직 없는 저장소의 backfill)나 다른 rescan mode를 쓴다.
5. `flyctl logs`에서 `attempt N failed: GitHub repository request failed: 403 <kind>; retry after Ns … — retry deferred Ns` 줄의 `<kind>`가 열린 질문의 답이다. 잡 안에서 소화된 pause는 실패 줄을 남기지 않고 잡 시간만 길어진다.
6. 수용 기준: pair 둘 다 `succeeded`·`credit_cost = 0`, 저장소 행 `last_scanned_commit_sha = last_analyzed_commit_sha` true, 홈에 `구조 스캔 완료 · 분석 완료`와 `다시 스캔`. `queued`이고 `available_at`이 수백 초 뒤면 연기가 동작 중인 것 — 기다린다.
7. `pnpm ops:health`: 2026-09-12의 14건은 창이 지날 때까지 WARN이 유지되며, 수용 기준은 이 pair가 거기에 더해지지 않는 것.

## 5. 롤백 지점

- 워커: v17 `arr-worker:deployment-01M2AQ256FT6E1W3QJYTASMBEK`. 마이그레이션은 그대로 둔다 — v17은 5인자 함수 위에서 4인자 호출로 정상 동작한다.
- 함수 자체를 되돌려야 하면 5인자를 drop하고 `202608170001`의 4인자 본문과 grant를 담은 **새** 마이그레이션을 추가한다. 적용된 파일은 수정하지 않는다.

## 6. 예상과 다른 점

- 원인은 여전히 이름이 없다. 의도적이다 — 기록에 헤더가 없고, 다음 throttled 잡이 이름을 적는다.
- 고정 pacer는 넣지 않았다. GitHub 문서의 secondary 예산(900 points/분)에 대한 추측이 되기 때문이며, 로그에 `secondary-rate-limit`이 full scan에서 반복되면 그때 측정을 근거로 pacer 또는 `SCAN_FETCH_CONCURRENCY` 하향을 검토한다.
- `GitHubCiEvidenceSource`는 gate를 공유하지 않는다(요청 수 소수, 실패는 이미 "증거 없음"으로 흡수). todo 20의 소스 팩토리 분리와 함께 간다.
- 테스트 작성 중 발견한 두 가지: Crockford ULID에는 `U`가 없다(`runs_id_ulid`); 워커는 실제 시계로 연기를 계산하므로 e2e의 가짜 시계는 실제 시각에서 시작해 sleep으로만 움직인다.

## PR

- <https://github.com/2klips/alrescha-app/pull/9> — 커밋 `8ac512e` 한 건(구현·테스트·마이그레이션·문서). 머지 후 머지 커밋에서 마이그레이션과 워커 빌드를 뜬다.
