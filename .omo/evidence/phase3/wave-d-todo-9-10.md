# Phase 3 Wave D todo 9·10 — bi-temporal 에이전트 기록 + 메모리 블록 (2026-08-23)

> 9·10은 한 스키마(202608230004)·한 스토어 표면이라 1커밋으로 처리 — todo당 1커밋 규약의 의도(작업 단위 추적)는 이 evidence 분리로 지킨다.

## todo 9 — agent_assertions (bi-temporal, `agent_asserted` 티어)

- 테이블 `agent_assertions`: 폐쇄 7동사(part_of·uses·depends_on·produces·configures·validates·implements), reason 필수, token/user provenance, `valid_from`/`ingested_at`/`invalidated_at`/`invalidated_by`.
- **물리적 불변**: DELETE는 트리거가 무조건 거부, UPDATE는 "invalidated_at 1회 설정 + 나머지 컬럼 동결"만 허용 — service_role조차 역사를 다시 못 쓴다(`ruled_out_attempts` 선례 확장).
- **결정론 재조정** `record_agent_assertion`(rpc, service_role 전용, 원자적): 같은 활성 쌍 + 같은 relation → noop / 다른 relation → 새 행 삽입 후 구 행 무효화(superseded, `invalidated_by` 역참조) / 워크스페이스 밖 노드 → unknown_node. **크레딧 0** — 재조정이 자연 키 SQL이라 AI 호출이 없다.
- **시간여행**: `valid_from <= t and (invalidated_at is null or invalidated_at > t)`로 "t 시점에 믿던 것" 질의 — PGlite 테스트로 두 쓰기 사이 시점 판정 증명.
- 맵 배선: 활성 assertion → `agent_asserted` 티어 표시 엣지(점선+accent, Wave A todo 2의 렌더 분기가 이미 대기 중이었음). 표시 relation 어휘에 7동사 편입.

## todo 10 — memory_block_entries (크기 제한 + Mem0 재조정)

- 노드(또는 워크스페이스) 앵커 × 블록 이름(gotchas·conventions·decisions) × entry_key(슬러그) 단위. 본문 ≤500자.
- `write_memory_entry`(rpc): 같은 키+같은 텍스트 → noop / 다른 텍스트 → 무효화+삽입(updated) / remove → 무효화 / 신규인데 활성 12개 → **rejected_cap — 순환이 아니라 거부**(증류 압력, MemGPT 크기 캡). 동일 bi-temporal 트리거.
- **검색 노출**: 활성 엔트리가 `McpWorkspaceData.memoryEntries`로 실려 `search_index` 결과에 type `memory`(path-symbol 티어, 앵커 경로가 path)로 등장 — 이전 에이전트가 증류한 것이 다음 에이전트의 기존 검색 경로에서 나온다.
- MCP 툴: `assert_link`·`memory_write`(mcp:write)·`memory_read`(read) — **20툴**. 두 스토어(InMemory·Supabase)가 같은 재조정 계약.

## 게이트

- vitest **791/792** (신규 `tests/agent-memory.test.ts` 9건: added→noop→superseded 역사 보존·시간여행·삭제/개서 물리 거부·테넌트 격리+unknown_node·메모리 5분기+캡·InMemory 미러·검색 노출·설치기)
- Playwright 117/117 · lint·typecheck·format·scope 250파일 PASS · 로컬 Supabase 적용
