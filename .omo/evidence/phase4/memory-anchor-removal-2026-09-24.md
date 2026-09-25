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
3. UPDATE 보호를 행 전체로 넓힌다(아래 "리뷰 R1"). `allow_only_invalidation()`을 다시 정의해 `invalidated_at`·`invalidated_by` 외 모든 컬럼을 불변으로 한다. 노드 존재는 검사하지 않는다. 처음 올린 `947b0da`는 "기존 `*_invalidate_only` 트리거가 무효화 도장 외의 update를 거절하므로 참조가 바뀔 수 없다"고 가정했는데, 이 가정이 틀렸다.

택하지 않은 것:

- `on delete set null`: 이력을 고쳐 쓰고(무효화된 행은 update 자체가 거절된다), 파일에 대한 기억을 워크스페이스 전체 기억으로 바꾼다.
- 앵커 삭제 시 자동 무효화: 되돌릴 수 없고, 사용자가 지운 기억과 구분되지 않는다. 읽기 의미는 RE-05가 정한다.

읽기 쪽은 이미 견딘다. `apps/web/lib/map/workspace-map.ts`는 끝점이 로드된 노드 집합에 없는 단언을 버리고, `apps/web/lib/mcp/supabase-store.ts`의 기억 읽기는 앵커 경로를 찾지 못하면 `anchorPath: null`로 둔다. 둘 다 읽기 상한 때문에 원래 필요했던 처리다.

## 리뷰 R1 (배포 Codex, 2026-09-24) — 무효화 UPDATE로 노드 참조를 옮길 수 있었다

리뷰 기록은 공유 루트의 `.omo/evidence/phase4/pr33-34-migration-review-2026-09-24.md`(배포 Codex, 이 브랜치에는 없음)에 있다. `202608230004`의 `allow_only_invalidation()`은 `invalidated_at`을 새로 채우도록 요구하지만 불변 비교는 `id`·`workspace_id`·`token_id`·`user_id`·`valid_from`·`ingested_at` 6개뿐이다. FK가 있을 때는 FK가 노드 컬럼을 막았다. `947b0da`가 FK를 없애자 `invalidated_at`과 함께 `anchor_node_id`·`source_node_id`·`target_node_id`·`repository_id`를 바꾸는 UPDATE가 통과했다. 없는 id나 다른 테넌트의 실제 노드로도 바꿀 수 있었다. 리뷰는 service_role 직접 UPDATE로 적용 전(FK 오류 `23503`)과 적용 후(허용)를 재현했다. MCP 함수가 이런 UPDATE를 만든다는 주장은 아니다. 내용 컬럼(`text`·`entry_key`·`relation`·`reason`)은 원래부터 보호되지 않았다.

수정(같은 미적용 `202609240002` 안): `allow_only_invalidation()`을 `create or replace`로 다시 정의한다. 세 검사의 순서와 문구는 그대로 두고, 세 번째 비교만 `(to_jsonb(new) - 'invalidated_at' - 'invalidated_by') is distinct from (to_jsonb(old) - …)`로 바꿔 행 전체에 적용한다. 앞으로 컬럼이 늘어도 자동으로 보호된다. UPDATE에서 노드 존재를 검사하지 않으므로, 스캔이 앵커를 지운 뒤에도 순수 무효화는 된다. 적용된 `202608230004` 파일은 손대지 않았다. 이 함수는 두 테이블의 `*_invalidate_only` 트리거만 쓴다.

회귀 테스트(`tests/agent-memory-anchor-removal.test.ts`에 3건 추가):

- 기억 무효화와 함께 앵커를 없는 id·다른 테넌트 노드·같은 테넌트의 다른 노드·null로, 또는 `text`·`entry_key`를 바꾸는 UPDATE 6가지: 모두 `invalidation must not rewrite history`로 거절되고 행이 그대로다.
- 단언 무효화와 함께 target(다른 테넌트 노드·없는 id), source(같은 테넌트의 다른 노드), repository(같은 워크스페이스의 두 번째 저장소·다른 테넌트 저장소), `relation`·`reason`을 바꾸는 UPDATE 7가지: 모두 거절되고 행이 그대로다.
- 순수 무효화: 노드 삭제 전(도장만, 도장+`invalidated_by`)과 스캔이 `src/a.ts`를 지운 뒤(기억·단언 각각) 모두 통과한다. 참조 컬럼은 그대로이고, 무효화된 행의 재무효화는 여전히 `immutable`로 거절된다.

수정 전(`947b0da`의 마이그레이션)으로 같은 파일을 돌리면 새 테스트 중 거절 2건이 실패한다(UPDATE가 통과함). 순수 무효화 테스트는 수정 전후 모두 통과한다. 리뷰의 재현 스크립트 `pr34-update-guard-repro-2026-09-24.mjs`를 이 worktree에 실행하면 적용 후 `accepted === true` 단정이 `actual: false`로 실패한다. 즉 그 UPDATE가 이제 거절된다.

관찰(OQ-073에 추가): DB 수준의 순수 무효화와 달리, MCP 쓰기 함수 `write_memory_entry`의 삭제 모드는 앵커 노드 존재를 먼저 확인한다. 그래서 앵커를 잃은 기억을 MCP로 지우면 `unknown_node`가 돌아오고 행은 활성으로 남는다(로컬 PGlite 임시 probe, 커밋하지 않음). 기존 함수 동작이며 RE-05에서 정할 몫이다.

## 검증 (로컬, 격리 worktree `../claude-work`, 커밋 CI 아님)

- `tests/agent-memory-anchor-removal.test.ts` 9/9, 기존 `tests/agent-memory.test.ts` 9/9 통과.
- lint·typecheck·`git diff --check`·prettier(변경 파일) PASS.
- 전체 vitest **213 files · 1,999 passed · 1 skipped**(R1 수정 후; 처음 `947b0da`는 1,996).
- 미실행: `tests/e2e/agent-memory.spec.ts`(로컬 Supabase Docker 필요). 운영 DB 조회·적용 없음(운영 사전 조회는 배포 Codex 리뷰 기록 참조: 해당 오류 잡 0건, 기억·단언 0/0).
- 운영 적용(2026-09-25): PR #34 머지(`b1a40b0`) 뒤 배포 Codex가 21:09 KST에 적용했다. 사후 대상 FK 0·신규 트리거 2·`allow_only_invalidation` 교체 true·기억/단언 행 0/0 보존·장부 70/pending 0. 기록: 공유 루트의 미커밋 `.omo/evidence/phase4/pr33-34-production-migration-2026-09-25.md`.

## 관찰 (이번 범위 밖)

기억 테이블은 `workspace_id`·`token_id`로도 `on delete cascade`를 건다. 워크스페이스나 MCP 토큰 **행**을 지우면 같은 트리거에 막힌다. 현재 경로에는 영향이 없다. 토큰은 `revoked_at`(`202608100006_hosted_mcp.sql`)으로 폐기하고, 마이그레이션·앱·패키지 어디에도 `mcp_tokens`나 `workspaces` 행을 지우는 코드가 없다(2026-09-24 grep). 그런 삭제 경로가 생기면 같은 방식으로 다시 봐야 한다.
