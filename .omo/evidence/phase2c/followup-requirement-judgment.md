# 후속 — 요구사항 중의성 판단 표면 (2026-09-02)

WORK_SPEC §14의 판단 종류 3종 중 마지막으로 남아 있던 `requirement-disambiguation`의 enqueue 표면. 판단 kind 중 유일하게 대상이 finding이 아닌 **요구사항**이다.

## 설계 (`202609020002_requirement_judgment_enqueue.sql`)

`enqueue_judgment_job`과 같은 뼈대(security definer·service_role 전용·`next_retry_idempotency_key` 재시도 세대)에 두 가지 의도적 차이:

- **중립 기준선**: 요구사항에는 결정론 confidence·severity가 없지만 strict 판단 요청은 둘을 요구한다 → `currentConfidence 0.5`, `currentSeverity 'low'`로 전송. `apply_successful_judgment`는 `findings`만 갱신하므로 요구사항 행은 **바뀌지 않고**, `judgments` 행(verdict + explanation)이 곧 산출물이다.
- **컨텍스트**: 요구사항 문장(그래프 메타데이터 — 원본 코드 본문 아님) + 출처(아티팩트 경로·span·상태). 각 항목 4,000자 절단.
- 자격: `status = 'active'`만(superseded/withdrawn 거부). run은 `requirement-judgment:<id>` manual run, 키 `requirement-judgment:<id>`(terminal 뒤 `:r1`…). credits 10 / byok 0.

## 표면

`/app/inspection`에 두 번째 판정 패널 "요구사항 중의성 판정": 활성 요구사항 최근 8건(출처 경로 + 문장 발췌 120자) — 상태별로 처리 중 / **판정 결과**(중의적·명확·요구사항 아님 + 설명 발췌 160자, `judgments`에서 대상별 최신) / 이전 시도 실패 — 다시 요청 / AI 판정. `requirements`·`jobs`는 멤버 grant가 없어 owner 확인 후 admin 클라이언트로 워크스페이스 한정 조회, `judgments`는 멤버 정책이 있어 세션 클라이언트. 액션 `requestRequirementJudgment`(BYOK 우선 프로바이더 해석 → rpc).

워커 변경 없음 — 판단 핸들러·프로바이더는 kind에 무관하며, 결과는 `record_successful_judgment`로 저장된다.

## 검증

- `tests/judgment-coaching-enqueue.test.ts` +3: strict 페이로드 키 집합·kind·중립 기준선·컨텍스트에 출처 경로와 문장 포함(비용 10), 비활성 요구사항 거부, 재시도 세대 `requirement-judgment:<id>:r1`.
- 게이트 수치는 커밋 메시지 참조.

## 프로덕션 반영 결과 (2026-09-02)

- `2bd9aaf` push → Vercel success(패널 라이브), `202609020002` 적용 — `enqueue_requirement_judgment_job` 존재 실측. 워커 변경 없음.
- **스모크 불가 — 대상 0건.** 프로덕션 `requirements`는 0행, `graph_nodes`에 requirement kind 0(artifact 499·rationale 86). 원인은 표면이 아니라 파이프라인: 요구사항은 analyze에서 `extractRequirements`로 일시 추출돼 finding 생성에만 쓰이고 어디서도 영속화되지 않는다(쓰는 코드 부재, 테스트 시드만). → **OQ-023** 등록. 표면의 동작은 DB 테스트 3종이 증명하며, 영속화가 들어오는 즉시 프로덕션에서도 살아난다.
- 부수 확인: 같은 시간대 push 2건(`3413c9f`·`2bd9aaf`)의 scan·analyze가 rename된 저장소에서 정상 완주.

## 프로덕션 반영 절차

① 프로덕션 DB에 `202609020002` 적용(`.env.migrate`) ② push(Vercel — 패널). 워커 재배포 불필요. 스모크: 활성 요구사항 하나에 **AI 판정** → `judgments`에 `requirement-disambiguation` 행(verdict·explanation) 생성, 패널에 결과 표시.
