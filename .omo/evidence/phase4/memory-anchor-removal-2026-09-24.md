# 에이전트 기억이 스캔을 멈추게 하던 결함 (2026-09-24)

세션 정리 중 보존한 Data Brain 작업(`keep/dbr-wip-2026-09-12`)을 main과 대조하면서 DBR-6.1의 지적이 main에도 해당하는지 확인했다. 해당했고, 재현 후 수정했다. 읽기 의미는 [OQ-073](../../../spec/OPEN_QUESTIONS.md)으로 RE-05에 넘긴다.

## 결함

`202608230004_agent_memory.sql`은 `memory_block_entries`와 `agent_assertions`를 추가 전용으로 만들었다. BEFORE DELETE 트리거가 service_role을 포함한 모든 삭제를 거절한다. 그런데 같은 파일이 노드 참조를 `on delete cascade` FK로 걸었다.

| 제약 | 정의 |
| --- | --- |
| `memory_block_entries_anchor_node_id_fkey` | `(anchor_node_id) → graph_nodes(id) on delete cascade` |
| `agent_assertions_source_tenant_fk` | `(workspace_id, repository_id, source_node_id) → graph_nodes(…) on delete cascade` |
| `agent_assertions_target_tenant_fk` | `(workspace_id, repository_id, target_node_id) → graph_nodes(…) on delete cascade` |

`apply_repository_scan`은 원본이 사라진 노드를 지운다. 대상은 삭제되거나 이름이 바뀐 파일, 키가 바뀐 결정 기록, 사라진 제목·심볼·라우트·디렉터리·DB 객체다. 지워지는 노드에 기억이나 단언이 걸려 있으면 연쇄 삭제가 트리거에 걸려 스캔 트랜잭션 전체가 롤백된다. 재시도는 같은 경로를 다시 지우므로 **영구 실패**다. 무효화된 이력 행도 똑같이 막는다.

부수 결함: 기억 앵커 FK는 `graph_nodes(id)`만 참조해 테넌트 범위가 아니었다. `write_memory_entry`는 워크스페이스를 확인하지만, 함수를 거치지 않은 직접 insert는 다른 워크스페이스의 노드에 앵커를 걸 수 있었다.

## 재현 (main `d8ade83`, 수정 전)

`tests/agent-memory-anchor-removal.test.ts` 6케이스 중 5개 실패:

- 기억 앵커 파일 삭제 스캔, 이력 행만 남은 앵커 삭제 스캔, 단언 양 끝 삭제 스캔, 이름 변경(삭제+추가) 스캔: 4건 모두 `error: agent memory rows are never deleted; invalidate them instead`.
- 직접 insert 테넌트 검사: 다른 워크스페이스 노드를 앵커로 한 기억 insert가 **성공**했다(`promise resolved … instead of rejecting`).
- "기억 행은 여전히 삭제되지 않는다"는 수정 전에도 통과(기대대로).

## 수정

`supabase/migrations/202609240002_memory_survives_anchor_removal.sql`:

1. 위 FK 3개를 없앤다. 행은 쓴 그대로 남는다. 삭제·재작성·무효화는 없다.
2. 쓰기 시점 보장은 BEFORE INSERT 트리거 두 개로 옮긴다. 기억 앵커는 같은 워크스페이스, 단언 양 끝은 같은 워크스페이스·저장소에 노드가 있어야 한다(`errcode 23503`). 이제 기억 앵커도 테넌트 범위로 검사한다.
3. UPDATE는 트리거가 필요 없다. 기존 `*_invalidate_only` 트리거가 무효화 도장 외의 모든 update를 거절하므로 참조가 바뀔 수 없다.

택하지 않은 것:

- `on delete set null`: 이력을 고쳐 쓰고(무효화된 행은 update 자체가 거절된다), 파일에 대한 기억을 워크스페이스 전체 기억으로 바꾼다.
- 앵커 삭제 시 자동 무효화: 되돌릴 수 없고, 사용자가 지운 기억과 구분되지 않는다. 읽기 의미는 RE-05가 정한다.

읽기 쪽은 이미 견딘다. `apps/web/lib/map/workspace-map.ts`는 끝점이 로드된 노드 집합에 없는 단언을 버리고, `apps/web/lib/mcp/supabase-store.ts`의 기억 읽기는 앵커 경로를 찾지 못하면 `anchorPath: null`로 둔다. 둘 다 읽기 상한 때문에 원래 필요했던 처리다.

## 검증 (로컬, 격리 worktree `../claude-work`, 커밋 CI 아님)

- 새 테스트 6/6, 기존 `tests/agent-memory.test.ts` 9/9 통과.
- lint·typecheck·`git diff --check`·prettier(변경 파일) PASS.
- 전체 vitest **213 files · 1,996 passed · 1 skipped**.
- 미실행: `tests/e2e/agent-memory.spec.ts`(로컬 Supabase Docker 필요). 운영 DB 조회·적용 없음.

## 관찰 (이번 범위 밖)

기억 테이블은 `workspace_id`·`token_id`로도 `on delete cascade`를 건다. 워크스페이스나 MCP 토큰 **행**을 지우면 같은 트리거에 막힌다. 현재 경로에는 영향이 없다. 토큰은 `revoked_at`(`202608100006_hosted_mcp.sql`)으로 폐기하고, 마이그레이션·앱·패키지 어디에도 `mcp_tokens`나 `workspaces` 행을 지우는 코드가 없다(2026-09-24 grep). 그런 삭제 경로가 생기면 같은 방식으로 다시 봐야 한다.
