# OQ-028 — RLS가 켜진 곳은 반드시 forced (2026-09-03 작성, 2026-09-24 재기준)

배포 체크리스트 실측(`followup-deployment-checklist.md` "발견한 이탈")이 남긴 관행 이탈을 ⑴번 안(관행에 맞추는 마이그레이션 추가)으로 닫는다.

## 경위

2026-09-03에 세 테이블을 고치는 커밋(`3bfd26f`, 마이그레이션 `202609030002`)을 만들었지만 PR로 올라가지 않은 채 세션 워크트리에 남았다. 2026-09-24 세션 정리 중 발견해 `keep/oq-028-force-rls`로 보존했고, 최신 main(`d8ade83`) 위로 다시 옮겼다. 옮기면서 같은 테스트가 **새로 생긴 누락 8건**을 잡았다. 관행을 강제하는 테스트가 main에 없었기 때문에 그사이 추가된 테이블들이 같은 실수를 반복한 것이다.

## 문제

`enable row level security`만 쓰고 짝이 되는 `force` 줄을 빠뜨린 테이블이 11개다.

| 테이블 | 원본 마이그레이션 |
| --- | --- |
| `rationales` | `202608170003_rationale_nodes.sql` |
| `concepts` | `202608240002_concept_graph.sql` |
| `module_summaries` | `202608240003_module_summaries.sql` |
| `directories` | `202609050002_directory_nodes.sql` |
| `routes` | `202609050005_route_nodes.sql` |
| `db_objects` | `202609060001_database_objects.sql` |
| `sections` | `202609060002_section_nodes.sql` |
| `workspace_screen_views` | `202609060008_screen_views.sql` |
| `doc_pages` | `202609060010_doc_pages.sql` |
| `symbols`, `symbol_edges` | `202609210001_symbol_nodes.sql` |

교차 테넌트 노출은 아니다. `force`는 **테이블 소유자에게** RLS를 적용하는 스위치이고, 앱 경로는 `authenticated`(정책 적용) 또는 `service_role`(forced 여부와 무관하게 bypass)로 접근한다. 잃는 것은 현재의 읽기가 아니라 **불변식**이다. 소유자 롤로 무엇이든 연결되는 순간(마이그레이션·수동 조회·`security definer`가 아닌 향후 함수) 이 테이블들만 정책을 무시한다.

## 변경

- `supabase/migrations/202609240001_force_rls_remaining_tables.sql`: 11개 테이블에 `force row level security`를 켠다. 원래 번호 `202609030002`는 그 뒤 main에 적용된 마이그레이션보다 앞서 정렬되므로 오늘 날짜로 다시 매겼다. `migrate.ts`는 장부에 없는 파일을 이름순으로 적용하므로 옛 번호로도 적용은 됐겠지만, 순서가 뒤섞이지 않게 했다.
- `tests/helpers/database.ts`: `FORCE_RLS_REMAINING_TABLES_MIGRATION`을 `ALL_MIGRATIONS` 끝에 등록했다.
- 적용된 마이그레이션은 **손대지 않았다**. `scripts/migrate.ts`가 파일 sha256을 `private_migrations.schema_migrations` 장부와 비교해 "Applied migration checksum changed"로 거절하기 때문이다. `force row level security`는 멱등이라 재적용해도 무해하다.

쓰기 경로에는 영향이 없고, 운영에서 이미 확인된 사실이다. 새 8개 가운데 7개는 `apply_repository_scan`이나 `apply_doc_page_skeletons`/`apply_doc_page_prose`(security definer)가 쓴다. 이 함수들은 같은 트랜잭션에서 `202608100002` 이후 계속 forced였던 `graph_nodes`·`artifacts`에도 쓴다. `workspace_screen_views`는 `touch_screen_view`(security invoker)가 `authenticated`로 쓰므로 소유자가 아니다.

## 테스트 (`tests/force-row-level-security.test.ts`, 3케이스)

테이블 이름을 나열하는 대신 **관행 자체를 강제**한다. 이탈을 고치는 테스트는 다음 이탈을 잡지 못한다(이번 8건이 그 증거다).

1. `public`에 RLS는 켜졌으나 forced가 아닌 테이블이 **하나도 없다**(`pg_class`, `relkind in ('r','p')`). 이후 어떤 테이블이 `enable`만 쓰면 여기서 **이름과 함께** 실패한다.
2. `public`의 모든 테이블에 RLS가 켜져 있다. ①이 "RLS가 꺼져 있어서" 조용히 통과하는 공허한 성공을 막는 짝 단정이다. forced 개수 하한 43(2026-09-03 프로덕션 실측치)도 함께 본다.
3. 마이그레이션 재적용이 무해하다(연속 2회 `exec`).

**카탈로그 단정인 이유**: `force`가 바꾸는 것은 소유자에 대한 RLS 적용이고, PGlite에서 테이블 소유자는 superuser다. superuser는 forced 여부와 무관하게 RLS를 bypass하므로 행동 차이는 이 하네스에서 관측할 수 없다. 관측 가능한 것은 플래그이므로 플래그를 본다.

## 실효 확인 (PGlite, main `d8ade83` + 이 변경)

```
without: public=52 rls=52 forced=41 unforced=["concepts","db_objects","directories","doc_pages","module_summaries","rationales","routes","sections","symbol_edges","symbols","workspace_screen_views"]
with:    public=52 rls=52 forced=52 unforced=[]
```

2026-09-03 프로덕션 실측치는 43/40(같은 3건)이었다. 그 뒤 추가된 테이블 9개 가운데 8개가 미forced다.

## 프로덕션 반영: 2026-09-25 적용

PR #33 머지(`2535385`) 뒤 배포 Codex가 2026-09-25 21:09 KST에 main `b1a40b0`의 LF 원본을 워커 안에 스테이징해 migrator 1회로 적용했다(exit 0, #34의 `202609240002`와 함께). 적용 직전 forced 41/52·미강제 11개(아래 목록과 일치), 사후 forced 52/52·미강제 0·장부 체크섬 일치. 기록: 공유 루트의 미커밋 `.omo/evidence/phase4/pr33-34-production-migration-2026-09-25.md`.

아래는 적용 전에 적은 절차다.

### 적용 전 절차 (기록)

프로덕션 DB 적용은 운영자의 `.env.migrate`가 필요하므로 이 작업에서는 하지 않았다. 절차: `.env.migrate`로 `pnpm db:migrate` 실행 → `202609240001` 1건 적용 → 아래 확인 질의로 미forced 0건을 재실측한다.

```sql
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p')
  and c.relrowsecurity and not c.relforcerowsecurity
order by 1;
```

적용 전 기대값은 위 11개이고 적용 후 기대값은 0행이다. 롤백이 필요하면 해당 테이블에 `alter table … no force row level security`를 실행한다(down 마이그레이션 없음). 적용 전까지 앱 경로에는 영향이 없다.
