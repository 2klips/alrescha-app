# Claude → 배포 Codex 인계 — 에이전트 기억이 스캔을 멈추게 하던 결함

작성 2026-09-24 KST, 리뷰 R1 반영 2026-09-25 · 증거 [`.omo/evidence/phase4/memory-anchor-removal-2026-09-24.md`](../../.omo/evidence/phase4/memory-anchor-removal-2026-09-24.md) · [OQ-073](../../spec/OPEN_QUESTIONS.md)

**상태: LOCAL_VERIFIED (R1 수정 포함).** DB 마이그레이션 1건만 있다. 웹·워커·MCP 도구·카탈로그 변경은 없다. 운영 DB에는 적용하지 않았다. R1 수정 커밋은 로컬에만 있고, PR #34에 올리는 push는 사용자 승인 대기다.

## 1. 기준과 작업 공간

| 항목              | 값                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기준              | main `d8ade83`(PR #31)                                                                                                                                                                                                                |
| 브랜치 / worktree | `fix/memory-anchor-rescan` / `C:/Users/axz14/Desktop/Project/Arr/claude-work`                                                                                                                                                         |
| 처음 올린 head    | `947b0da`(PR #34, CI 4/4 SUCCESS) — 배포 Codex 리뷰 **REVIEW_FIX_REQUIRED(R1)**                                                                                                                                                       |
| R1 수정           | 이 문서 바로 앞 커밋 `fix(db): keep every column but the invalidation stamp fixed …`. 커밋만 추가했고 rebase·amend는 하지 않았다                                                                                                      |
| 마이그레이션      | `supabase/migrations/202609240002_memory_survives_anchor_removal.sql`(미적용, 같은 파일을 수정)                                                                                                                                       |
| 관련 PR           | #33(OQ-028, `202609240001`, READY_FOR_APPROVAL)과 독립. `tests/helpers/database.ts`의 상수 선언과 `ALL_MIGRATIONS` 끝 두 곳에서 충돌하므로, 나중에 머지하는 쪽에서 두 상수·두 줄을 모두 `202609240001` → `202609240002` 순서로 남긴다 |

## 2. 무엇이 바뀌었나

에이전트 기억(`memory_block_entries`)과 단언(`agent_assertions`)의 노드 참조가 `on delete cascade`였다. 그런데 같은 테이블에 모든 삭제를 거절하는 트리거가 있다. 스캔이 그 노드를 지우면 스캔 트랜잭션 전체가 실패하고, 재시도마다 같은 경로를 다시 지우므로 영구 실패였다.

- 노드 참조 FK 3개를 없앴다. 기억 행은 쓴 그대로 남는다(삭제·재작성·무효화 없음).
- 쓰기 시점 보장(같은 테넌트에 노드 존재)은 BEFORE INSERT 트리거로 옮겼다. 기억 앵커도 이제 테넌트 범위로 검사한다.
- **R1:** FK가 없어지자 기존 UPDATE 보호(`allow_only_invalidation`, 6개 컬럼만 비교)로는 무효화 UPDATE에 참조 변경을 끼워 넣을 수 있었다. 같은 마이그레이션에서 이 함수를 다시 정의해 **`invalidated_at`·`invalidated_by` 외 모든 컬럼을 불변**으로 했다. 세 검사의 순서와 문구는 그대로다. 노드 존재는 UPDATE에서 검사하지 않으므로, 앵커를 잃은 행의 순수 무효화는 계속 된다. 적용된 `202608230004`는 수정하지 않았다.
- 앵커를 잃은 기억을 읽을 때의 의미와 MCP로 지우는 방법은 RE-05로 넘겼다(OQ-073). 현재 `write_memory_entry`의 삭제 모드는 그런 기억에 `unknown_node`를 돌려준다.

## 3. 검증 (로컬, 커밋 CI 아님)

- `tests/agent-memory-anchor-removal.test.ts` 9건:
  - 스캔 4건 + 직접 insert 테넌트 검사 1건: main에서 실패, 수정 후 통과.
  - R1 거절 2건(기억 6가지·단언 7가지 UPDATE): `947b0da`의 마이그레이션으로는 실패(UPDATE가 통과), 수정 후 통과.
  - 순수 무효화 1건(노드 삭제 전·후): 수정 전후 모두 통과.
  - 삭제 금지 1건: 기존 동작 유지.
- 기존 `tests/agent-memory.test.ts` 9/9 통과. supersede·삭제 모드 무효화 경로가 바뀌지 않았다.
- 리뷰 재현 스크립트 `pr34-update-guard-repro-2026-09-24.mjs`를 이 worktree에 실행하면 적용 후 `accepted === true` 단정이 `actual: false`로 실패한다. 즉 그 UPDATE가 이제 거절된다.
- lint·typecheck·prettier·`git diff --check` PASS. 전체 vitest **213 files · 1,999 passed · 1 skipped**.
- 미실행: `tests/e2e/agent-memory.spec.ts`(로컬 Supabase Docker 필요), 새 head의 커밋 CI(push 전).

## 4. 운영 적용 절차 (사용자 승인 후)

운영 사전 조회는 리뷰 때 이미 했다(2026-09-25 00:00–00:01 KST, 읽기 전용): 해당 오류 잡 0건, 기억/단언 0/0, 대상 FK 3개 존재, 신규 트리거 0개, 장부에 `202609240001`·`202609240002` 없음. 적용 직전에 아래를 다시 확인한다.

1. 대상 FK 3개가 그대로인지 확인한다(기대값 3행). 이름이 다르면 마이그레이션이 실패하므로 적용하지 말고 Claude에게 돌려준다.

   ```sql
   select conname from pg_constraint
   where conrelid in ('public.memory_block_entries'::regclass, 'public.agent_assertions'::regclass)
     and conname in ('memory_block_entries_anchor_node_id_fkey',
                     'agent_assertions_source_tenant_fk',
                     'agent_assertions_target_tenant_fk');
   ```

2. 기억/단언 행 수를 기록한다(적용 후 보존 확인용).

   ```sql
   select
     (select count(*) from public.memory_block_entries) as memory_rows,
     (select count(*) from public.agent_assertions) as assertion_rows;
   ```

3. `pnpm db:migrate`는 `DATABASE_URL`만 읽는다(`scripts/migrate.ts:156`, `.env.migrate`를 자동으로 읽지 않음). 운영자가 승인된 방법으로 운영 DB URL을 넣고 실행한다. 장부에 없는 파일을 이름순으로 모두 적용하므로, **#33만 승인됐다면 #34가 들어 있는 트리에서 실행하지 않는다.**
4. 적용 후: 1번 질의 0행. 신규 트리거 2개(`select tgname from pg_trigger where tgname in ('memory_block_entries_anchor_in_tenant','agent_assertions_nodes_in_tenant');`). 함수 교체 확인(`select position('to_jsonb(new)' in prosrc) > 0 from pg_proc where proname = 'allow_only_invalidation';` → `true`). 2번의 행 수가 같아야 한다.
5. 읽기 스모크: `/app/map` 1회. MCP 기억 도구 호출은 토큰 발급이 필요하므로 사용자 승인 범위 밖이면 생략한다.

웹 머지와 마이그레이션 적용은 서로 의존하지 않는다. 워커 재배포는 필요 없다.

## 5. 롤백

down 마이그레이션은 없다. 되돌릴 때는 트리거 2개와 함수 2개를 지우고, `allow_only_invalidation()`을 원래 본문(`202608230004_agent_memory.sql:84–103`)으로 되돌리고, FK 3개를 다시 만든다. 단, 적용 뒤 앵커를 잃은 행이 생겼다면 FK 재생성은 실패한다. 그 행들이 바로 이 수정이 보존한 이력이므로, 되돌리기 전에 사용자와 결정한다. 함수를 원래대로 되돌리는 것은 FK를 다시 만든 **뒤**에만 한다(FK 없이 옛 함수로 돌아가면 R1이 다시 열린다).

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
-- 그다음 202608230004_agent_memory.sql:84–103의 allow_only_invalidation() 정의를 그대로 다시 실행한다.
```

행 전체 불변 함수는 FK와 함께 있어도 해가 없으므로, 롤백할 때 함수는 그대로 두어도 된다.
