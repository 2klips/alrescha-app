# 후속 — 실패 후 재시도 경로 + 코칭 원문의 런타임 조회 (2026-09-02)

judge·coach 스모크가 남긴 설계 공백을 사용자 지시로 닫았다.

## 문제

- `enqueue_job`은 같은 멱등 키에 대해 잡 상태와 무관하게 기존 잡 id를 돌려준다. `judgment:<finding>` / `coaching:<record>` 키가 terminal failure(`failed`/`cancelled`) 뒤에도 그대로라, 버튼을 다시 눌러도 죽은 잡이 반환됐다 — 워커가 내는 "크레딧 충전 후 다시 시도하세요" 메시지를 UI로 이행할 방법이 없었다.
- 실패한 행을 제자리에서 재큐하면 `reserve:<job>`/`settle:<job>` 원장 키와 충돌한다(예약은 `on conflict … do update` 멱등 → 이미 환불된 예약을 재사용 → 모델 호출이 **무료로** 실행). 요청·클레임 사이에 원문 동의가 철회돼도 큐 행의 `promptText` 사본은 그대로였다(ADR-011).

## 설계 (`202609020001_retry_after_terminal_failure.sql`)

- `next_retry_idempotency_key(workspace, base)`: 최근 세대가 `failed`/`cancelled`면 `<base>:r<N>`(N = 누적 terminal 수)로 **새 세대 키**를 발급 → 새 잡, 새 `reserve:<newjob>`/`settle:<newjob>`. queued/running/succeeded면 그 키를 그대로 돌려 기존 잡을 반환 — 살아 있는 시도는 한 번에 하나, **성공한 판정은 조용히 재실행되지 않음**.
- `enqueue_judgment_job`·`enqueue_coaching_job`이 이 키를 쓴다. 코칭 페이로드에서 `promptText` 제거 — 큐 행은 `promptRecordId`만 지칭.
- 워커 `coaching-job.ts`: `store.loadPromptText(record)`로 **런타임 조회**(원문 없음/철회 → 프로바이더 호출 전에 실패, 무비용). `PostgresCoachingJobStore.loadPromptText`는 `prompt_capture_consents`(미철회·raw on)와 조인해 철회를 존중한다.
- UI: `/app/inspection`·`/app/team` 패널이 대상별 최근 잡 상태를 표시 — 처리 중 / 판정 완료·채점 완료 / **이전 시도 실패 — 다시 요청**(버튼) / 첫 요청. jobs 테이블은 authenticated 권한이 없어(멤버 grant·RLS 정책 부재 확인) owner 확인 후 admin 클라이언트로 워크스페이스 한정 조회; 코칭 잡 행에 원문이 없어 노출 없음.

## 검증

- `tests/judgment-coaching-enqueue.test.ts` 9종(+2): terminal 뒤 세대 키 `:r1`·`:r2` 발급, 살아 있는 시도·성공은 기존 id 반환(judge 잡 총 3개로 상한), 코칭 재시도 잡이 `claim_next_job`으로 클레임되고 `reserve:<retry>` **단독** 예약(이전 실패 잡의 키와 무충돌), 페이로드 키 집합 `{billingMode, promptRecordId, provider}`.
- `apps/worker/src/coaching-job.test.ts`: 원문 런타임 조회, 원문 부재(철회) 시 프로바이더 미호출.
- 로컬 Supabase에 재적용 후 `enqueue_coaching_job` 정의에 `promptText` 부재 확인.

## 프로덕션 실증 (2026-09-02 12:54 UTC, 워커 v10 `deployment-01M1H28MGBSQVYWBZTTQV2H6R0`)

기록 #1(3/3 실패했던 `…0001`)의 패널 버튼이 "이전 시도 실패 — 다시 요청"으로 바뀐 상태에서 클릭:

- 새 잡 `01M1H2Y893…`, 키 **`coaching:01M2SMKEC0ACHPR0MPT0000001:r1`**, `succeeded` attempt 1, 7초(12:54:10 → 12:54:17). 페이로드에 `promptText` **없음**(`payload ? 'promptText' = false`) — 원문은 `loadPromptText`로 런타임 조회.
- 기록 #1 `prompt_records.rubric` 채움(inferred, 6축, 제안 3개) → 패널은 "채점 완료".
- 원장: **`reserve:01M1H2Y893…` −1 → `settle:01M1H2Y893…` 0** — 실패 잡 `01M1GZZP57…`의 `reserve/refund` 행은 그대로. 새 세대 잡이 자기 키로 예약·정산했으므로 재큐 방식이 가졌던 "환불된 예약 재사용 → 무료 실행" 구멍이 닫혔음이 실측됨. 잔액 29 → 28.

## 프로덕션 반영 절차

① 프로덕션 DB에 `202609020001` 적용(`.env.migrate` 절차) ② push(Vercel — 상태 표시 UI) ③ 워커 재배포(v10 — 런타임 원문 조회). ②·③ 이전에 ①만 적용된 상태에서도 기존 워커(v9)는 페이로드의 `promptText`를 요구하므로 **①→③ 순서 뒤에 코칭 재요청**을 해야 한다. 재스모크: `/app/team`에서 실패한 기록 #1의 **다시 요청** → `coaching:<record>:r1` 잡 성공 확인.
