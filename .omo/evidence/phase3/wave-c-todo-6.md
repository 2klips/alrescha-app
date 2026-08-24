# Phase 3 Wave C todo 6 — `enrich` 잡 ①: 파일 산문 요약 (2026-08-24)

## 무엇을 만들었나

- **여섯 번째 잡 종류 `enrich`** (`202608240001_enrich_pass.sql`) — coach 선례 그대로 `enqueue_job`에 편입, 기존 크레딧 라이프사이클(예약→정산/환불) 상속. 재량 결정: **잡 1회 = 1크레딧**(파일 단위 과금은 새 원장 기계가 필요해 기각), BYOK 0.
- **캐시 인지 인큐 `enqueue_enrich_job`**: pending = `metadata->>'summaryBlobSha' is distinct from source_blob_sha`. **pending 0 → 잡 자체가 안 생김** — "캐시 적중 = 0크레딧"이 원장 수준에서 증명된다. 멱등 키에 pending 다이제스트+프로바이더+과금 모드 포함.
- **핸들러** (`apps/worker/src/enrich-job.ts`): 본문 transient(fetch→클립 24k자→요약→폐기), 검증 통과 산문만 `artifacts.metadata.summary`(+`summaryBlobSha`·`summaryGrade: inferred`)로 저장. **10파일 청크 영속화** — 370파일 배치가 도중에 죽어도 완료분은 캐시로 남는다.
- **산문 검증기** (`packages/core/src/enrich/prose-summary.ts`): {summary} 스키마·길이·문장 수·코드 펜스·단일 문단 + **원본 라인 축자 인용 금지**(≥24자 소스 라인이 요약에 그대로 나타나면 거부). 하드룰 "원본 비저장"의 결정론 집행선.
- 트리거: `/app/settings/ai` "개념 패스 실행" 카드(서버 액션 — BYOK 등록 시 byok, 아니면 credits) + `run-local.ts` 워커 배선(루트 `.env.local`의 플랫폼 키 로드).

## 실기에서 배운 것 (설계 수정 1건)

첫 실행(파일럿 370파일)에서 84번째 파일의 요약이 실제로 소스 라인을 인용해 검증기에 걸렸다 — **검증기가 실물 모델 출력을 잡아낸 것**. 그러나 당초 설계(스키마 위반 = 잡 전체 reject)는 그 파일 뒤 알파벳 순서의 모든 파일을 영원히 막는 결함이었다. 수정: **스키마 위반도 파일 단위 게이트**(무효 출력은 비저장·캐시 키 불변 → 다음 실행이 재시도), 단 **전량 무효면 `schema_invalid`로 reject → 즉시 환불**. 첫 실행의 원장: `reserve -1 → refund +1` — 무과금 규칙이 실기에서 그대로 작동했다. 프롬프트에도 축자 금지 지시 강화.

## Wave D 공백 해소 — index_entries

`apply_repository_scan`이 **결정론 인덱스를 생성**한다: 제목(basename)·경로·심볼·분류 → `search_key`, 코드링크 동기화 후 이웃 캐시(`neighbor_ids`). 마이그레이션이 기존 아티팩트를 백필 — 로컬 파일럿에서 **422행 즉시 생성**. `agent-memory.spec.ts`에 실스캔 워크스페이스 `search_nodes` 단언 추가(Wave D 함정의 회귀 핀).

## 검증

- 단위: `prose-summary.test.ts` 8건(캐시 술어·클립·산문 계약·never-billed 마커), `enrich-job.test.ts` 13건(전체 흐름·게이트·BYOK 불변·청크).
- DB(PGlite): `tests/enrich-pass.test.ts` 5건 — 캐시 인큐/원장 라이프사이클/스킵 게이트 메타데이터/인덱스 생성·이웃·제거 캐스케이드/**마이그레이션 백필**(이전 마이그레이션 세트로 시딩 후 적용).
- 실기: 파일럿 레포(2klips/LostArk_Scheduler) 370파일 실 Anthropic(claude-sonnet-5) 요약 — 결과는 `wave-c-real-run.md`.
