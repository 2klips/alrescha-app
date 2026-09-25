# Claude → 배포 Codex 인계 — OQ-028 force row level security (11개 테이블)

작성 2026-09-24 KST · 증거 [`.omo/evidence/phase2c/oq-028-force-rls.md`](../../.omo/evidence/phase2c/oq-028-force-rls.md)

**상태: LOCAL_VERIFIED.** DB 마이그레이션 1건만 있다. 웹·워커·MCP 도구·카탈로그 변경은 없다. 운영 DB에는 적용하지 않았다.

## 1. 기준과 작업 공간

| 항목              | 값                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| 기준              | main `d8ade83`(PR #31)                                                                                      |
| 브랜치 / worktree | `fix/oq-028-force-rls` / `C:/Users/axz14/Desktop/Project/Arr/claude-work`                                   |
| 새 마이그레이션   | `supabase/migrations/202609240001_force_rls_remaining_tables.sql`                                           |
| 원래 작성분       | `3bfd26f`(2026-09-03, `202609030002`, 3개 테이블). 머지되지 않아 로컬 `keep/oq-028-force-rls`에 보존돼 있다 |

진행 중인 RE-04 브랜치(`research/re-04-*`)에는 마이그레이션이 없다. `tests/helpers/database.ts`·`spec/OPEN_QUESTIONS.md`도 건드리지 않으므로 겹치는 파일이 없다.

## 2. 무엇이 바뀌었나

`enable row level security`만 쓰고 `force`를 빠뜨린 테이블 11개에 `force row level security`를 켠다. 9월 3일에 찾은 3개(`rationales`·`concepts`·`module_summaries`)에, 그 뒤 새로 생긴 8개(`directories`·`routes`·`db_objects`·`sections`·`workspace_screen_views`·`doc_pages`·`symbols`·`symbol_edges`)를 더한 것이다. 적용된 마이그레이션은 손대지 않았다(`migrate.ts`의 체크섬 검사). 멱등이라 재적용해도 무해하다.

**앱 동작은 바뀌지 않는다.** 앱은 `authenticated`(정책 적용) 또는 `service_role`(bypass)로 읽는다. 쓰기는 security definer 함수(`apply_repository_scan`·`apply_doc_page_skeletons`·`apply_doc_page_prose`)가 하는데, 이 함수들은 같은 트랜잭션에서 이미 forced인 `graph_nodes`·`artifacts`에도 쓴다. `workspace_screen_views`는 security invoker 함수가 `authenticated`로 쓴다.

## 3. 검증 (로컬)

- `tests/force-row-level-security.test.ts` 3케이스. 테이블 이름을 나열하지 않고 "RLS가 켜진 모든 `public` 테이블은 forced"라는 관행 자체를 단정한다. 새 마이그레이션을 빼면 이 테스트가 11개 이름과 함께 실패한다.
- PGlite 실측: 마이그레이션 없이 `public` 52개 중 forced 41개, 포함하면 52/52.
- lint·typecheck·`git diff --check`·prettier(변경 파일) PASS.
- 전체 vitest: **213 files · 1,993 passed · 1 skipped**(격리 worktree, 커밋 CI 아님). main CI(212 files)보다 이 테스트 파일 1개가 늘었다.

## 4. 운영 적용 절차 (사용자 승인 후)

1. 적용 전 확인 질의를 실행한다. 기대값은 위 11개 이름이다(9월 3일 이후 운영에만 생긴 차이가 있으면 여기서 드러난다).

   ```sql
   select c.relname
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p')
     and c.relrowsecurity and not c.relforcerowsecurity
   order by 1;
   ```

2. 운영자의 `.env.migrate`로 `pnpm db:migrate`를 실행한다. `Applied: 202609240001_force_rls_remaining_tables.sql` 1건이 기대값이다.
3. 같은 질의를 다시 실행한다. 기대값은 0행이다.
4. 읽기 스모크: `/app/map` 1회(노드·심볼 헤일로 표시), `/app/docs` 1회. 운영 쓰기(재스캔)는 하지 않는다. 다음 정상 스캔이 곧 쓰기 확인이 된다.

순서: 마이그레이션 적용과 웹 머지는 서로 의존하지 않는다. 머지로 바뀌는 것은 마이그레이션 파일·테스트·문서뿐이라 Vercel 배포 결과가 달라지지 않는다. 워커 재배포는 필요 없다.

## 5. 롤백

down 마이그레이션은 없다. 필요하면 해당 테이블에 `alter table public.<table> no force row level security;`를 실행한다. 장부 행은 남는다.
