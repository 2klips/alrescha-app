# Phase 3 Wave D todo 11 — 지시 블록 설치기 + MVP 인수 e2e (2026-08-23)

## 설치기

- `apps/web/lib/mcp/instruction-blocks.ts` — 에이전트별(claude→CLAUDE.md, codex→AGENTS.md, cursor→.cursor/rules/arr.mdc, generic) 스니펫 생성기. 내용: **grep보다 그래프 먼저**(get_graph_schema → repo_map → search_nodes/traversal → memory_read) + **끝나기 전 기록**(memory_write·assert_link·record_ruled_out). Graft의 generated/human 마커로 구획해 재생성이 자기 영역만 교체. 스니펫은 에이전트 소비물이라 영어, UI 라벨은 한국어(SETTINGS.mcp.instructions).
- `/app/settings/mcp`에 설치기 카드 + MCP 연결 설정 JSON(요청 Host 기준 엔드포인트, 토큰 자리 표시자) + 복사 버튼.

## MVP 인수 e2e (`tests/e2e/agent-memory.spec.ts`) — 계획의 수용 시나리오 그대로

실 설정 폼에서 MCP 토큰 발급 → **실 HTTP**로 MCP 세션(2026-07-28 핀) → `get_graph_schema`(레포명 확인) → `repo_map(focus)`(session.ts 부상) → `memory_write`(added) → `memory_read`(1건) → `assert_link`(added) → `/app/map`에서 **에이전트가 그린 uses 점선 엣지** + 활동 피드에 assert_link·memory_write 노출. 전 구간 실물(폼·HTTP·DB·화면).

## 발견

- MCP 클라이언트 기본 프로토콜(2025-11-25)은 서버 핀(2026-07-28)에 거부됨 — 클라이언트도 핀 필요(pilot-flow 선례).
- **`index_entries`는 스캔 파이프라인이 채우지 않는다** — `search_nodes`/`search_index`가 실스캔 워크스페이스에서 빈 결과. 데모/픽스처와 벤치는 사전 구축된 index_entries를 쓰므로 여태 안 보였던 공백. 인수 e2e는 아티팩트 행으로 우회했지만, **실사용 검색이 서려면 스캔이 index_entries를 생성해야 한다** → Wave C(enrich)에서 요약과 함께 채우는 것이 자연스러운 자리. OPEN_QUESTIONS 등재 대신 BUILD_PLAN Wave C todo 6 수용 기준에 반영할 사항으로 기록.

## 게이트

todo 9·10과 동일 세트 green (vitest 791/792 · Playwright 117/117 · scope PASS).
