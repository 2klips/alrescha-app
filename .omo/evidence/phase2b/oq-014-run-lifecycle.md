# OQ-014 — run 라이프사이클 writer (2026-08-17)

**판정:** 선택지 ⑴ 채택(사용자 승인) — 잡 큐 함수가 부모 run의 상태를 함께 전이시킨다. `runs.status`를 스키마의 약속대로 살린다.

## 1. 마이그레이션 `202608170001_run_lifecycle.sql`

새 헬퍼 2개 + 기존 큐 함수 5종 `create or replace`(동일 시그니처 — 기존 grant 보존):

| 함수 | 추가된 전이 |
|---|---|
| `mark_run_running(run_id)` *(신규)* | run을 `running`으로, `started_at`은 `coalesce`로 **1회만** 기록. `pending`/`running` 밖이면 no-op |
| `settle_run_after_job(run_id)` *(신규)* | run 행 `for update` 잠금 → 잡 집계 → 미종결 잡 있으면 no-op, 전부 종결이면 `failed > cancelled > succeeded` 우선순위로 판정 + `completed_at` |
| `claim_next_job` | 클레임 성공 시 `mark_run_running` |
| `finish_job` | 성공/최종 실패 분기에서 settle. **재시도 requeue 분기는 settle 안 함**(run은 `running` 유지) |
| `reject_job` (007 정의 대체) | 항상 종결이므로 settle |
| `reap_stale_jobs` | 시도 소진 분기에서만 settle |
| `cancel_job` | settle — 전 잡 취소 시 run이 `cancelled`가 되어 해지 경로의 기존 의미와 일치 |

## 2. 동시성·의미 보존 논거

- **동시 종결 직렬화:** 두 잡이 같은 순간 끝나면 둘 다 `settle_run_after_job`에서 run 행 잠금을 요구한다. 나중 트랜잭션은 대기 후 새 스냅샷으로 집계하므로 먼저 커밋된 잡 상태를 본다 — "둘 다 상대를 미종결로 보고 아무도 못 닫는" 경합이 불가능.
- **데드락 없음:** 모든 경로가 잡 행 → run 행 순서로 잠근다(역순 잠금 경로 없음).
- **해지 의미 보존:** `202608100009`의 설치 해지는 잡들을 `cancel_job`으로 취소한 뒤 run들을 `cancelled`로 일괄 갱신한다. settle의 `cancelled` 분기가 같은 결론을 먼저 내리므로 결과가 동일하고, 일괄 갱신은 잡 없는 run을 계속 커버한다.
- **부활 금지:** settle·mark 모두 `status in ('pending','running')` 가드 — 해지로 `cancelled`된 run은 잔여 잡이 늦게 끝나도 되살아나지 않는다(테스트 고정).
- **이중 장부 유지:** 커밋 카드(todo 2)의 잡 기반 상태 유도는 그대로 둔다 — DB 전이와 유도값이 어긋나면 그 자체가 회귀 신호다.

## 3. 테스트 — `tests/run-lifecycle.test.ts` (PGlite, 전체 마이그레이션 체인 12개 적용)

8케이스, 전부 프로덕션 SQL 함수만으로 run을 구동(부활 가드 테스트의 해지 시뮬레이션 제외):

1. 첫 claim → `running` + `started_at`, 두 번째 claim이 `started_at`을 옮기지 않음
2. 마지막 잡 성공 시에만 `succeeded` + `completed_at` — **pilot-report가 조회하는 정확한 shape(`status='succeeded' and started_at/completed_at not null`)가 프로덕션 경로에서 처음으로 충족됨**
3. 시도 소진 실패 → run `failed`
4. 재시도 requeue → run `running` 유지, `completed_at` 없음
5. `reject_job` → run `failed`
6. 전 잡 취소 → run `cancelled` (부분 취소 시점엔 미종결 no-op 확인)
7. failed가 cancelled보다 우선
8. 해지로 `cancelled`된 run은 잔여 잡 성공에도 부활하지 않음

## 4. 게이트

- vitest **514/514** (70 파일) — 신규 8 + 인접 큐/크레딧/해지 스위트(`job-lifecycle-credit-reconciliation`·`release-hardening`·`ai-judgment-database`) 무회귀
- eslint `--max-warnings=0` · typecheck 무결점
- Playwright 미실행 — 웹 코드 무변경, e2e는 자체 마이그레이션 목록을 고정 사용(신규 파일 미적용)이라 영향 없음. `scripts/migrate.ts`는 디렉터리 스캔이므로 프로덕션 적용은 자동.

## 5. 파생 효과

- `/app/stats` 파일럿 통계의 "스캔 소요 시간"이 실데이터에서 채워질 수 있게 됐다(이전에는 구조적으로 공집합).
- `/commits` 실데이터 로더가 이후 `runs.status`를 직접 신뢰하는 최적화가 가능해졌다(현행 잡 유도도 계속 유효).
