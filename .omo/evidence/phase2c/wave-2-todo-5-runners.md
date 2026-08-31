# Wave 2 todo 5 잔여 — judge·coach 러너 + pack 판정 (2026-08-31)

todo 5의 마지막 잔여("judge·coach 러너 등록 · pack 핸들러")를 닫았다. 사실 대조에서 세 kind의 실상이 서로 달랐다:

## judge — 등록만 하면 됐다 (그대로 등록)

핸들러(`createJudgmentJobHandler`)·스토어(`PostgresJudgmentJobStore`)·SQL 함수(`apply_successful_judgment`/`record_invalid_judgment`)·프로바이더(BYOK 포함)가 전부 있었고 러너 테이블만 `notImplemented`였다. `run-local.ts`에 기존 스택 그대로 배선. AI 키 묶음(BYOK master key + 플랫폼 키)은 `aiKeyConfig()`로 추출해 enrich·judge·coach가 공유한다.

## coach — "등록"이 아니라 스택 절반이 없었다 (신설)

핸들러와 스토어 **인터페이스**는 있었지만 (1) 코칭 프로바이더 클래스, (2) 로더, (3) Postgres 스토어, (4) 결과 저장처가 전부 부재였다. 신설:

- `OpenAiCoachingProvider`/`AnthropicCoachingProvider`(`ai-providers.ts`) — 판정 프로바이더와 같은 HTTP 골격. 결정론 플로어는 핸들러 소유이며, 프롬프트에는 `rubricCeilings(signals)`를 **고지**만 한다(상한 초과 출력은 클램프가 아니라 무과금 거부 — `validateCoachingOutput`).
- `CoachingProviderLoader`(`provider-loader.ts`) — 판정·enrich와 동일한 키 해석(BYOK 복호 / 플랫폼 키).
- `PostgresCoachingJobStore`(`postgres-coaching-store.ts`) + `202608310001_prompt_coaching.sql`:
  - 유효 rubric → `prompt_records.rubric` (202608170005가 이 용도로 예약해 둔 컬럼; 팀 표면이 읽는 곳). `apply_prompt_coaching`은 스키마 수준에서 `grade='inferred'`가 아니면 거부 — "AI 출력은 항상 inferred" 하드룰의 DB 에코.
  - 무효 출력 → `prompt_coaching_attempts` append-only 로그(`record_invalid_prompt_coaching`, `(job, attempt)` 멱등) — 판정의 `judgment_attempts` 패턴 미러, 과금 없음.
  - RLS SELECT는 202608300001의 initplan 형태로 작성. 함수는 service_role 전용 grant.

## pack — 구현할 정의가 없었다 (OQ-021 예약)

'pack'은 Phase 1부터 화이트리스트에 있었지만 enqueue하는 코드·소비 스펙·테스트가 저장소 어디에도 없다. WORK_SPEC §12는 컨텍스트 팩을 온디맨드·읽기 전용 MCP 선택으로 확정했다(`request_context_pack` — READ_ONLY, 영속 쓰기 없음). 없는 의미를 발명하는 대신 **OQ-021**로 등록하고, 러너 테이블에는 `reservedPackHandler`를 둔다 — 클레임된 pack 잡은 OQ를 가리키며 큰 소리로 실패한다(조용한 스킵 금지). 기본 후보는 kind 회수(새 마이그레이션으로 화이트리스트 축소).

## 검증

- 신규 실DB 테스트 `tests/prompt-coaching-database.test.ts`(ALL_MIGRATIONS, **service_role로 함수 호출** — grant 누락이 프로덕션이 아니라 여기서 죽도록): 유효 rubric 착지 / `grade≠inferred` 거부 / 타 워크스페이스 레코드 거부 / attempt 멱등 / RLS 테넌트 격리(당사자 1·외부인 0). ADR-011 이중 옵트인(워크스페이스 활성 + 본인 동의)을 시드가 그대로 재현.
- `apps/worker/src/reserved-jobs.test.ts`: pack 잡 클레임 시 OQ-021 포인터로 실패.
- 로컬 스택에 `npx supabase migration up`으로 신규 마이그레이션 적용(밀려 있던 202608260001~202608300002도 이때 따라 적용됨 — 로컬 스택은 CLI 이력, 프로덕션은 `scripts/migrate.ts` 이력으로 관리가 갈린다는 것도 이번에 확인).
- 게이트(커밋 시점 실측): vitest **941 passed / 1 skipped** · Playwright e2e **120 passed**(로컬 스택) · lint/typecheck clean · scope 12경계 288파일 PASS · adr-guardrails PASS.

## 프로덕션 반영 메모

이 변경은 워커 이미지에만 영향(웹 무관). 프로덕션 워커에 반영하려면 `flyctl deploy --remote-only` + **프로덕션 DB에 202608310001 적용**(`pnpm db:migrate`, 세션 풀러 경유)이 필요하다. 현재 프로덕션에서 judge·coach를 enqueue하는 표면은 없으므로 배포 전까지도 동작 차이는 없다.
