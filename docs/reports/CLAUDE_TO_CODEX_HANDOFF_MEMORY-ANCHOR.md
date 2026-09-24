# Claude → 배포 Codex 인계 — 에이전트 기억이 스캔을 멈추게 하던 결함

작성 2026-09-24 KST · 증거 [`.omo/evidence/phase4/memory-anchor-removal-2026-09-24.md`](../../.omo/evidence/phase4/memory-anchor-removal-2026-09-24.md) · [OQ-073](../../spec/OPEN_QUESTIONS.md)

**상태: LOCAL_VERIFIED.** DB 마이그레이션 1건만 있다. 웹·워커·MCP 도구·카탈로그 변경은 없다. 운영 DB에는 적용하지 않았다.

## 1. 기준과 작업 공간

| 항목              | 값                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기준              | main `d8ade83`(PR #31)                                                                                                                                          |
| 브랜치 / worktree | `fix/memory-anchor-rescan` / `C:/Users/axz14/Desktop/Project/Arr/claude-work`                                                                                   |
| 새 마이그레이션   | `supabase/migrations/202609240002_memory_survives_anchor_removal.sql`                                                                                           |
| 관련 PR           | #33(OQ-028, `202609240001`)과 독립. 둘 다 `tests/helpers/database.ts`의 `ALL_MIGRATIONS` 끝에 한 줄씩 더하므로, 나중에 머지하는 쪽에서 두 줄을 모두 남기면 된다 |

## 2. 무엇이 바뀌었나

에이전트 기억(`memory_block_entries`)과 단언(`agent_assertions`)의 노드 참조가 `on delete cascade`였다. 그런데 같은 테이블에 모든 삭제를 거절하는 트리거가 있다. 스캔이 그 노드를 지우면 스캔 트랜잭션 전체가 실패하고, 재시도마다 같은 경로를 다시 지우므로 영구 실패였다. 대상 노드는 삭제되거나 이름이 바뀐 파일, 키가 바뀐 결정 기록, 사라진 제목·심볼·라우트·디렉터리·DB 객체다.

- 노드 참조 FK 3개를 없앴다. 기억 행은 쓴 그대로 남는다(삭제·재작성·무효화 없음).
- 쓰기 시점 보장(같은 테넌트에 노드 존재)은 BEFORE INSERT 트리거로 옮겼다. 기억 앵커도 이제 테넌트 범위로 검사한다. 이전에는 직접 insert로 다른 워크스페이스 노드를 앵커로 걸 수 있었다.
- 앵커를 잃은 기억을 읽기에서 어떻게 보일지는 RE-05로 넘겼다(OQ-073). 지도와 MCP 읽기는 이미 견딘다.

## 3. 검증 (로컬, 커밋 CI 아님)

- `tests/agent-memory-anchor-removal.test.ts` 6케이스. main에서는 5개가 실패한다(스캔 4건 `agent memory rows are never deleted`, 직접 insert 테넌트 검사 1건). 수정 후 6/6 통과. 기존 `tests/agent-memory.test.ts` 9/9 통과.
- lint·typecheck·prettier·`git diff --check` PASS. 전체 vitest **213 files · 1,996 passed · 1 skipped**.
- 미실행: `tests/e2e/agent-memory.spec.ts`(로컬 Supabase Docker 필요).

## 4. 운영 적용 절차 (사용자 승인 후)

1. 적용 전 읽기 전용 확인. 이미 이 결함에 걸린 스캔이 있는지와 기억 행 수를 본다.

   ```sql
   select id, repository_id, kind, status, left(last_error, 120) as last_error, completed_at
   from public.jobs
   where last_error ilike '%agent memory rows are never deleted%'
   order by created_at desc
   limit 20;

   select
     (select count(*) from public.memory_block_entries) as memory_rows,
     (select count(*) from public.agent_assertions) as assertion_rows;
   ```

   첫 질의가 행을 돌려주면 그 저장소의 스캔이 멈춰 있는 것이다. 적용 후 다음 정상 스캔(또는 사용자 승인된 `다시 스캔` 1회)으로 회복되는지 본다.

2. 제약 이름을 확인한다. 기대값은 아래 3개이며 운영에도 같은 이름이어야 한다. 이름이 다르면 마이그레이션이 실패하므로 적용하지 말고 Claude에게 돌려준다.

   ```sql
   select conname from pg_constraint
   where conrelid in ('public.memory_block_entries'::regclass, 'public.agent_assertions'::regclass)
     and conname in ('memory_block_entries_anchor_node_id_fkey',
                     'agent_assertions_source_tenant_fk',
                     'agent_assertions_target_tenant_fk');
   ```

3. 운영자의 `.env.migrate`로 `pnpm db:migrate`를 실행한다. #33이 먼저 머지·적용되지 않았다면 `202609240001`과 함께 두 건이 적용된다. 두 건은 서로 독립이다.
4. 2번 질의를 다시 실행한다(기대값 0행). `select tgname from pg_trigger where tgname in ('memory_block_entries_anchor_in_tenant','agent_assertions_nodes_in_tenant');`는 2행이 기대값이다.
5. 읽기 스모크: `/app/map` 1회. MCP 기억 도구 호출은 토큰 발급이 필요하므로 사용자 승인 범위 밖이면 생략한다.

웹 머지와 마이그레이션 적용은 서로 의존하지 않는다. 워커 재배포는 필요 없다.

## 5. 롤백

down 마이그레이션은 없다. 되돌릴 때는 트리거 2개와 함수 2개를 지우고 FK 3개를 원래 정의로 다시 만든다. 단, 적용 뒤 앵커를 잃은 행이 생겼다면 FK 재생성은 실패한다. 그 행들이 바로 이 수정이 보존한 이력이므로, 되돌리기 전에 사용자와 결정한다.

```sql
drop trigger memory_block_entries_anchor_in_tenant on public.memory_block_entries;
drop trigger agent_assertions_nodes_in_tenant on public.agent_assertions;
drop function public.require_memory_anchor_in_tenant();
drop function public.require_assertion_nodes_in_tenant();
alter table public.memory_block_entries add constraint memory_block_entries_anchor_node_id_fkey
  foreign key (anchor_node_id) references public.graph_nodes(id) on delete cascade;
alter table public.agent_assertions add constraint agent_assertions_source_tenant_fk
  foreign key (workspace_id, repository_id, source_node_id)
  references public.graph_nodes(workspace_id, repository_id, id) on delete cascade;
alter table public.agent_assertions add constraint agent_assertions_target_tenant_fk
  foreign key (workspace_id, repository_id, target_node_id)
  references public.graph_nodes(workspace_id, repository_id, id) on delete cascade;
```
