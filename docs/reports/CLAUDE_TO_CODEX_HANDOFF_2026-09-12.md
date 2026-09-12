# Claude → Codex 배포 인수인계: containment 조인 마이그레이션 (PR #4)

작성: 2026-09-12 · 대상: Alrescha 배포를 담당하는 Codex
상태: **완료 (2026-09-12 08:45 UTC).** 프로덕션 DB를 `202609110015_containment_join_shape.sql`까지 적용했고, `apply_repository_scan` 신규 shape를 확인했다. `arr-worker` v15를 `main` `a1a38ce`에서 재배포했고, 1,170-blob 저장소의 full/incremental 재스캔과 contains 집합 유지를 확인했다. 실행 증거: [`.omo/evidence/perf/containment-production-2026-09-12.md`](../../.omo/evidence/perf/containment-production-2026-09-12.md).

## 1. 지금 할 일

사용자 요청: "마이그레이션 적용이랑 배포는 Codex한테 넘겨줘" (2026-09-12)

1. 프로덕션 Supabase에 `supabase/migrations/202609110015_containment_join_shape.sql`을 적용한다 (§4). `pnpm db:migrate`는 미적용 마이그레이션 **전량**을 순서대로 적용하므로, 실행 전에 원장을 먼저 확인한다.
2. 적용 결과를 SQL로 확인하고, 933파일 이상 저장소의 재스캔이 완료되는지 본다 (§5).
3. `arr-worker`(Fly) 재배포 필요 여부를 판단하고 필요하면 배포한다 (§6). 루트 체크아웃은 `a3eb25e`로 올려 두었다.
4. `arr-app-web`(Vercel)은 `main` 푸시로 이미 자동 배포됐다 — 확인만 한다 (§6).
5. 적용·배포 기록을 `.omo/evidence/`에 남기고 이 문서의 상태 줄을 갱신한다 (§8).

이 문서는 담당을 바꾸지 않는다. 배포는 기존 합의대로 Codex, 구현·테스트·PR은 Claude다.

## 2. 무엇이 `main`에 들어갔나

- PR #4 — <https://github.com/2klips/alrescha-app/pull/4> · 머지 커밋 `a3eb25e` (2026-09-11 15:03 UTC) · 직전 `main`은 `269c1de`(PR #2 머지).
- `1af1c6a` fix(db): bound the containment join so apply_repository_scan cannot hang — 마이그레이션 신규 + `tests/directory-nodes.test.ts`(+33) + `tests/helpers/database.ts`(`ALL_MIGRATIONS` 등록, +3)
- `2d0ccee` test(scan): gate the error-ordering test too — `tests/scan-fetch-concurrency.test.ts`만
- **`apps/`, `packages/`, `scripts/` 변경 없음.** 배포 관점의 실질 변경은 DB 함수 하나의 본문이다.

## 3. 마이그레이션의 내용과 성질

- `create or replace function public.apply_repository_scan(target_workspace_id text, target_repository_id text, plan jsonb) returns integer` 재선언. 시그니처 동일, 테이블·인덱스·데이터 변경 없음. `scripts/migrate.ts`가 트랜잭션 안에서 적용한다.
- 문제: containment 엣지 단계가 다섯 관계를 한 문장에서 조인했고, 그중 `graph_nodes` 두 번은 직전 문장이 쓴 id의 존재 확인용이었다. 통계가 없는 테이블(PGlite 테스트 전부, autovacuum 전의 새 Supabase 프로젝트)에서는 planner가 `graph_nodes`에서 조인을 시작해 노드 쌍마다 `regexp_replace` 부모 경로 분기를 다시 계산했다. 이 저장소 스캔 기준 약 19억 row 방문이고, 933파일에서 `tests/graph-density.test.ts`가 돌아오지 않았다.
- 수정: 자식 → 부모 경로 쌍을 `scan_containment` temp table(`on commit drop`)에 한 번 계산하고, `directories.id`·`artifacts.id`가 이미 `graph_nodes`의 FK이므로 두 조인을 제거했다. planner가 어떤 계획을 고르든 비싼 계획이 없도록 "통계가 아니라 형태로" 고친 것이라 ANALYZE 상태와 무관하다.
- 커밋 `1af1c6a`의 측정치(테스트 환경 PGlite, 이 저장소 스캔): 엣지 집합 동일(932파일에서 1,083쌍), 해당 단계 7.8 s → 0.3 s, 939파일 apply 행 → 4.5 s. 프로덕션 Postgres는 통계가 있어 옛 형태로도 행이 안 보였을 수 있다 — 그래도 적용 이유는 유효하다(통계가 없는 순간이 있고, 형태 자체가 O(n²) 후보를 없앤다).
- 호출자(시그니처 불변, 호출 코드 변경 없음): `apps/worker/src/repository-scan-store.ts`, `apps/web/lib/ingest/supabase-local-ingest-store.ts`, `packages/mcp/src/local-workspace.ts`, `scripts/measure-graph-density.ts`.
- 직전 정의: `supabase/migrations/202609060005_repository_revision.sql`. 되돌려야 하면 그 파일이나 `202609110015`를 **수정하지 말고**(적용된 파일의 체크섬을 원장이 검사한다) 이전 본문을 담은 새 마이그레이션을 추가한다 — 런북 §10.4의 원칙 그대로다.

## 4. 적용 절차

런북 `docs/DEPLOYMENT_RUNBOOK.md` §3의 방법이다. 레포 루트에서 실행한다.

1. 원장 확인. 내가 아는 것은 로컬 상태뿐이고 **프로덕션에 어디까지 적용됐는지는 모른다.** `202609060001`–`202609060012`(2026-09-06, 12개)가 아직이면 이번 실행이 그것들도 같이 적용한다. Phase 4 코드가 요구하는 스키마이므로 언젠가는 가야 하지만, 한꺼번에 간다는 것을 알고 실행한다.

   ```sql
   select name, applied_at
   from private_migrations.schema_migrations
   order by name desc
   limit 20;
   ```

2. 적용.

   ```bash
   DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<REF>.supabase.co:5432/postgres" pnpm db:migrate
   ```

   출력은 `Applied: …202609110015_containment_join_shape.sql` 또는 (이미 적용된 경우) `Database already current.` 이다. 마이그레이션마다 개별 트랜잭션이고, `pg_advisory_lock(hashtext('alrescha_migrations'))`로 동시 실행을 막는다. `supabase_migrations.schema_migrations`가 있으면 거기에도 기록한다.

3. 함수 본문 확인 — 새 형태에만 있는 temp table 이름으로 구분한다 (옛 정의에는 `scan_containment`가 없다).

   ```sql
   select proname, prosrc like '%scan_containment%' as new_shape
   from pg_proc
   where proname = 'apply_repository_scan'
     and pronamespace = 'public'::regnamespace;
   ```

   `new_shape = true` 한 행이어야 한다.

## 5. 기능 확인

- `pnpm ops:health` (`DATABASE_URL` 필요, 읽기 전용) — 런북 §10.1의 신호가 적용 전과 같은지.
- 933파일 이상 저장소(이 저장소 `2klips/alrescha-app`이 커밋 시점 939파일)를 기존 재스캔 경로로 다시 스캔하고 **완료 여부와 소요 시간**을 기록한다. 이것이 이 변경의 실제 수용 기준이다. 옛 형태에서는 이 크기에서 함수가 돌아오지 않았거나 수 초 이상 걸렸다.
- 엣지 집합이 변하지 않았는지: 재스캔 전후로 `public.edges`에서 `relation = 'contains'`인 행 수를 같은 `repository_id`로 비교한다 (커밋 기준 집합 동일).

## 6. 배포

- **Vercel `arr-app-web`**: `main` 푸시로 자동 배포됐다. `a3eb25e`의 커밋 상태는 `Vercel = success`. 이번 PR은 웹 코드를 바꾸지 않았으므로 기능 변화는 없다. 마이그레이션 적용 전까지 프로덕션 웹·워커는 옛 함수를 호출한다 — 동작은 하지만 큰 저장소에서 느리거나 멈출 수 있다. 순서는 **마이그레이션 먼저**다.
- **Fly `arr-worker`** (`fly.toml`: app `arr-worker`, region `nrt`): 이번 PR로는 재배포가 필요 없다(워커 코드 무변경). 다만 저장소에서 찾을 수 있는 마지막 배포 기록은 `.omo/evidence/perf/deploy.md`(2026-09-03, `75b0538`)이고, 그 이후 `apps/worker`·`packages/core`·`packages/mcp`에 67파일, `apps/web`에 74파일이 바뀌었다(PR #3 Phase 4). 그 사이 배포가 있었는지는 Codex 기록으로 판단한다. 필요하면 루트에서 `flyctl deploy --remote-only`.
- 루트 체크아웃 `C:/Users/axz14/Desktop/Project/Arr/app`은 `main @ a3eb25e`(= `origin/main`)로 fast-forward 해 두었다. 추적 파일은 clean, untracked는 `.claude/launch.json`과 `docs/brand/*`(브랜드 자산, 이번 일과 무관)뿐이다. `flyctl deploy`는 루트 작업 트리를 빌드 컨텍스트로 올리므로 배포 전 `git status`로 이 상태가 유지되는지 한 번 더 본다.

## 7. 이미 끝난 검증 (머지 전, 브랜치 팁 = 머지 결과 트리)

| 게이트                                      | 결과                               |
| ------------------------------------------- | ---------------------------------- |
| `pnpm format:check`                         | clean                              |
| `pnpm lint` (`--max-warnings=0`)            | clean                              |
| `pnpm typecheck` (루트 + 워크스페이스 전부) | clean                              |
| `pnpm exec vitest run`                      | 180 files, 1,630 passed, 1 skipped |
| `pnpm test:e2e`                             | **미실행**                         |

- PGlite 테스트는 `ALL_MIGRATIONS`(새 마이그레이션 포함)를 적용한 뒤 돈다. `tests/directory-nodes.test.ts`의 1,600파일/180폴더 트리가 회귀 게이트이고, 커밋 메시지 기준으로 마이그레이션 없이는 원래 증상(행)을 그대로 재현한다.
- CI는 Vercel 배포뿐이라 초록 체크는 테스트 통과가 아니다. 위 표가 근거다.

## 8. 하지 말아야 할 것 / 작업 후 보고

- 적용된 마이그레이션 파일 수정 금지 — `Applied migration checksum changed`로 멈추는 안전장치다.
- 데이터 손실을 동반한 롤백 금지 — 앞으로 고치는 마이그레이션을 쓴다.
- 루트의 untracked 파일을 커밋하지 않는다.
- 보고: 적용된 마이그레이션 목록과 시각, §4-3 확인 결과, §5 재스캔 소요 시간, 배포 여부와 커밋을 `.omo/evidence/`에 남기고 이 문서 상단 상태 줄을 갱신한다.
