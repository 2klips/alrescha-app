# 후속 — judge·coach 프로덕션 스모크와 그 수정 (2026-09-02)

enqueue 표면 반영 직후 사용자 지시로 프로덕션에서 실모델 스모크를 실행. 스모크가 프로바이더 결함을 잡아냈고 같은 세션에서 수정했다.

## 전제 시드 (사용자 실행, 멱등)

프로덕션 워크스페이스 `01M11Q24…`는 크레딧 원장이 비어 있고 캡처·동의·프롬프트 기록이 0건이라 두 버튼 모두 실패할 상태였다. 시드 4건: 관리자 grant 50(WORK_SPEC §14 "관리자 수동 충전", Free 50) · 캡처 on · owner 원문 동의 · owner 프롬프트 기록 1건(`01M2SMKEC0ACHPR0MPT0000001`). `set_prompt_capture`/`set_prompt_consent`는 `auth.uid()`를 읽어 풀러 연결에선 못 쓰므로 DB 테스트처럼 직접 insert.

## 실측 결과 (읽기 전용 쿼리 + 워커 로그)

- **judge 2/2 succeeded** (finding 두 개 클릭). `01M1BV95…` verdict confirmed(conf 0.78, medium), `01M11RD3CB…` verdict ambiguous(conf 0.35, low) — provider anthropic / claude-sonnet-5, grade inferred. 원장: reserve −10 ×2 → settle ×2(환불 없음 = 과금). finding 반영은 `apply_successful_judgment` 설계대로 — `confidence = greatest(기존, 판정)`(0.98 유지), severity는 판정값(ambiguous 건 medium→low).
  - **단, attempt 2·3회** — 첫 시도들이 재시도됐고 사유는 로그에 없었다(`job → retrying`만 출력, 성공 시 `last_error` 소거).
- **coach 3/3 failed** → 무과금 환불(reserve −1, refund +1) — 하드룰 "실패 출력 무과금" 실증. `last_error`: **`Anthropic judgment response was incomplete.`** attempt 1은 100초 걸렸다.
- 잔액 50 → 30 (판단 2건 과금, 코칭 환불).

## 원인

Anthropic 판단·코칭 프로바이더가 **prose-JSON 계약**(`max_tokens: 800`, `stop_reason === "end_turn"` 필수)이었다. 코칭 응답(한국어 제안 3개 + 루브릭)은 800토큰을 넘겨 `end_turn`에 도달하지 못했고, 판단도 같은 이유로 확률적으로 실패했다. enrich 프로바이더는 이미 같은 문제("prose로 감싼 출력 37건, 500토큰 잘림 11건")로 **강제 tool-call**로 전환한 선례가 있었다.

부수 발견 2건:
1. 워커가 재시도 사유를 로그에 남기지 않아 원인 추적이 `last_error` 스냅샷 타이밍에 의존했다.
2. 핸들러가 모델 호출 전후에만 heartbeat하므로 100초 호출이 30초 lease를 넘겼다 — 워크스페이스가 하나라 루프 0만 일해서 이번엔 중복 클레임이 없었지만, 같은 워크스페이스를 여러 루프가 보면 `reap_stale_jobs`가 재큐해 **과금 모델 호출이 중복**될 수 있는 구조였다(멱등 과금 하드룰의 위험 지점).

## 수정 (`apps/worker`)

- `ai-providers.ts`: Anthropic 판단·코칭 프로바이더를 **forced tool use**(`record_judgment`/`record_coaching`, 기존 JSON 스키마를 `input_schema`로)로 전환, `anthropicToolInput` 재사용(잘림은 `max_tokens`를 이름 붙여 실패). max_tokens 1,000/1,500. 더 이상 쓰이지 않는 prose 추출기 제거(“judgment response…” 오해 문구도 함께 소멸). OpenAI 경로는 이미 strict json_schema라 유지.
- `worker.ts`: 핸들러 실행 중 **10초 간격 lease 갱신**(`HEARTBEAT_INTERVAL_MS`) + 실패 사유를 `log`로 출력(`<worker> <kind> <job> attempt <n> failed: <message>`); `drain-loop.ts`가 로그 싱크를 전달.
- 테스트: Anthropic 판단 tool_use 계약·max_tokens 잘림 명명, Anthropic 코칭 tool_use + 상한(axisCeilings) 동봉, 워커 실패 사유 로깅, 100초 핸들러 동안 heartbeat ≥9회·완료 후 0회(fake timers). 워커 패키지 60/60.

## 재스모크 절차

워커 재배포 후: 시드 재실행(기록 #2 `…0000002` 추가 — 실패한 코칭 잡의 `coaching:<record>` 멱등 키가 재요청을 막고, 재큐는 예약 멱등 키 `reserve:<job>`과 얽혀 과금 정합성이 불명확하므로 새 기록이 깨끗한 경로) → `/app/team`에서 기록 #2 **코칭 요청** → (선택) 세 번째 finding **AI 확정**으로 재시도 없이 1회 성공하는지 확인.
