# Phase 3 Wave C — 실기 기록: 파일럿 레포 실 enrich 완주 (2026-08-24~25)

대상: 실기 파일럿 워크스페이스(2klips/LostArk_Scheduler, 실 GitHub 설치), 모델 `claude-sonnet-5`(플랫폼 키·credits 모드). 세션 중 실제 푸시가 계속 들어와 파일 수가 370→373으로 움직였다 — 살아있는 레포 그대로.

## 결과

- **파일 산문 요약 372/373** (`summaryBlobSha = source_blob_sha`, 전부 `inferred`). 남은 1건은 세션 종료 직전 푸시로 생긴 신규 pending — 다음 잡이 집는다.
- **개념 그래프 169노드** (`system`/`api`/`concept` 혼합) + **폐쇄 동사 엣지 233개**: uses 91 · depends_on 65 · part_of 50 · validates 12 · produces 9 · configures 4 · implements 2. 개방 동사 0 — clean 패스가 어휘를 지켰다. 상위 개념: "Authentication Middleware"(멤버 24), "Database Connection & Models"(20), "API Response Helpers"(17) — 사람이 레포를 설명할 때 쓸 이름들이다.
- 19개 합성 배치 중 **1개만 게이트**(재시도 후에도 구조 위반 → 폐기, 부분 커버리지로 정직 서빙).
- **원장(전 과정)**: `grant 10 → reserve/refund(1차 거부) → reserve/settle(2차: 요약 316) → reserve/refund(4차) → reserve/refund(5차) → reserve/settle(6차: 개념)`. **성공 2회만 과금(2크레딧), 실패 3회 전액 환불** — 하드룰 7이 실기 원장에서 그대로 보인다.

## 실기가 고친 설계 6건 (전부 회귀 테스트로 고정)

1. **요약 검증 실패 = 잡 전체 reject → 배치 블로킹**: 84번째 파일이 소스 라인을 축자 인용(검증기 적중) → 그 뒤 알파벳 순서 전부 차단. → 파일 단위 게이트로 재설계.
2. **Anthropic 산문-JSON 미준수 37건 + 500토큰 잘림 11건**: 시스템 프롬프트 JSON 요구는 실물에서 깨진다. → 요약·모듈도 **강제 tool-use**(`tool_choice` 고정) + 예산 700.
3. **장황 요약 4건이 1500자 상한에 영구 스킵**: → 문장 경계 소프트 트림(두 상한 통합).
4. **전량 스킵 가드가 개념 단계를 차단**(신규 푸시 2파일이 모두 스킵 → "delivered nothing"): → 가드를 잡 스코프로 이동 — 개념 레이어가 전진하면 잡은 성공, 아무것도 전달 못 했을 때만 실패(schema_invalid면 환불).
5. **멱등 키가 실패 잡을 동결**: 같은 pending 상태 재인큐가 failed 잡을 반환만 함. → `requeue_enrich_job_if_terminal`(failed/cancelled → queued·attempt 0).
6. **배치 1개의 구조 위반이 19배치 전체를 reject**: → 배치 단위 재시도 1회 + 게이트, 전 배치 실패 시에만 reject·환불.

## 비용

실측 usage 미계측(워커가 usage를 아직 수집 안 함 — 벤치 하네스만 수집). 크레딧 원장 기준 과금 2크레딧. Anthropic 콘솔 실지출은 추정 $2–4 범위(373 요약 + 19+α 합성 배치, 사전 추정과 일치) — 정밀 수치는 콘솔 대시보드가 정본.

## 남김

- pending 1건(마지막 푸시분)은 큐에 대기 중 — 다음 워커 실행이 처리.
- `explain_module` 실 MCP 호출 스모크는 미실행(단위·DB·계약 테스트로 커버) — 다음 세션에서 인수 e2e(agent-memory)에 편입 후보.
