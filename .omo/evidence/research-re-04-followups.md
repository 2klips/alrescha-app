# RE-04 운영 읽기 후속 검토 — 근거 (2026-09-25, Claude)

입력: 배포 Codex의 운영 읽기 기록 `.omo/evidence/phase4/re04-production-verification-2026-09-25.md`(공유 루트의 미커밋 파일)와 같은 폴더의 `re04-production-*.json`. 이 문서는 그 기록이 남긴 네 항목(검색 partial, OQ 검색 23.961 s, `memory_read` coverage 부재, 최초 홈 500)을 코드와 Vercel 로그 메타데이터로 다시 본 결과다. 인계는 [`CLAUDE_TO_CODEX_HANDOFF_RE-04-FOLLOWUPS.md`](../../docs/reports/CLAUDE_TO_CODEX_HANDOFF_RE-04-FOLLOWUPS.md).

운영에 쓴 것은 Vercel CLI(기존 인증) 로그 조회와 `vercel inspect`뿐이다. 운영 DB·MCP·토큰·워커·배포는 건드리지 않았다. 로그 본문은 홈 500 한 건의 오류 첫 줄만 읽었고, 그 외에는 시각·경로·상태·source 메타데이터만 봤다. Vercel MCP 커넥터는 `2klips-projects` 범위에 403(재인증 필요)이라 쓰지 않았다.

## 1. 검색 `partial` — 원인 확인

- `apps/web/lib/mcp/supabase-store.ts` `loadWorkspace`는 `graph_nodes`를 `kind <> 'symbol'`로 읽고, 결과는 `labels`(id → label) 하나로만 쓴다. `labels`의 사용처는 `artifactData`의 `title`·`summary` 대체값 두 곳뿐이다(`metadata.title`·최신 요약이 없을 때).
- 검색(`searchWorkspaceIndexPage`)의 후보·순위·발췌는 `index_entries`·`sections`·`memory_block_entries`와 artifact `content`(최신 요약만, label 아님)에서 나온다. `graph_nodes` 행은 검색 결과에 한 글자도 들어가지 않는다. 그런데 `SEARCH_INDEX_TABLES`에 `graph_nodes`가 있어, 이 읽기가 잘리면 검색이 `partial`이 된다.
- 운영 7074b74 집계(Codex): 비심볼 `graph_nodes` 2,537, `artifacts` 1,550, `index_entries` 1,550, `sections` 93, 유효 `memory_block_entries` 0. 예산 `MCP_WORKSPACE_READ_LIMIT` = 2,000. 따라서 10회 검색 전부의 `partial`은 **검색이 읽지 않는 행(요구사항·finding·section·디렉터리 등 987행)이 예산을 채운 결과**다.
- 스캔 SQL은 파일 노드를 `label = artifact->>'path'`로만 넣는다(`supabase/migrations/*`의 `insert into public.graph_nodes ... 'artifact', artifact->>'path'` 16곳). label을 갱신하는 코드는 requirement·evidence·rationale·concept 노드뿐이다. 그래서 파일 label이 잘려도 대체값(경로)과 같은 값이라, 운영에서 드러난 영향은 거짓 `partial`과 요청 한 번뿐이었다.
- 요청 사슬: `readByIdPages`(서버 cap 1,000, 예산+1 = 2,001행) 기준 비심볼 2,537행은 1,000·1,000·1행 **3회**, 파일 노드 1,550행은 1,000·550행 **2회**. `artifacts`·`index_entries`도 2회라, 수정 뒤 작업공간 읽기의 가장 긴 페이지 사슬이 3 → 2가 된다(계산. 운영 시간은 측정하지 않았다).

## 2. `memory_read` — coverage 부재와 읽기 범위

- `packages/mcp/src/hosted.ts`의 `memory_read`는 `readWorkspace()`(엣지 포함 전체 읽기)를 부른 뒤 `workspace.memoryEntries`만 쓴다. 엣지는 `read_edge_page` RPC를 최대 `MCP_EDGE_MAX_PAGES` = 4회 **순차로** 부른다(페이지당 2,000행). 검색은 이미 `{ edges: false }`다.
- 응답에 `coverage`가 없다. `truncated`는 `limit`이 자른 수일 뿐, 읽기 예산이 테이블을 잘랐는지는 말하지 않는다. 읽기는 id 오름차순(ULID ≈ 생성 순)으로 예산만큼 가져오므로, 잘리면 **가장 새 항목이 빠지고** 응답은 남은 것 중 최신을 앞세운다.
- 운영 호출 시각: `memory_read`는 14:01:06.224Z에 시작해 16.763 s. 같은 창의 14:01:08.273/.295Z에 지도 `/api/map/inspect`·`/api/map/symbols`가 서버에서 돌았다(Codex의 barrel 선택). 엣지를 읽는 다른 도구(`get_neighbors`·`impact_of`)는 같은 날 4.268–5.891 s였다.

## 3. OQ 검색 23.961 s — 원인 미확정, 좁힌 범위

Vercel 요청 로그(요청 시작 시각)의 `POST /api/mcp` 21건이 Codex의 호출 순서·경과와 1:1로 맞는다(연속 시작 시각의 차 = 앞 호출 경과, 오차 수 ms). 첫 두 건(13:59:16.608·18.213)은 도구 호출 전 요청, 13:59:20.850이 1번 검색이다.

| 관측 | 값 |
| --- | --- |
| OQ 검색(`"캔버스 노드"`) 요청 | 14:00:42.264Z 시작 → 다음 요청 14:01:06.224Z (23.96 s) |
| 그 창의 다른 웹 요청 | **0건** (페이지·API·웹훅 모두) |
| 지도 API 두 건 | 14:01:08.273Z·.295Z — OQ 검색이 끝난 뒤, `memory_read` 도중 |
| 마지막 웹훅 | 13:47:21Z(202). 13:47:30–14:27Z 사이 웹훅 0건 |
| 같은 날 한국어 ADR 검색(`"정확도 주장"`) | 3.693 s |

코드상 검색 계산은 질의에 거의 무관하다. PageRank는 O(25 × (노드 + 엣지))로 seed 수와 무관하고, 한국어 질의는 영문 심볼 이름과 겹치지 않아 파일 심볼 읽기(`loadFileSymbols`)를 부르지 않는다. 작업공간 읽기는 모든 검색이 같다(`edges: false`). 그래서 20 s 차이는 계산이 아니라 **그 호출의 I/O 경로**에서 생겼다고 본다. 무엇이었는지는 이 자료로 가를 수 없다.

구조적으로 이런 꼬리를 키우는 요인 두 가지를 확인했다(원인 단정 아님).

1. **함수와 DB가 다른 대륙이다.** `vercel inspect dpl_Gbt8DQTq…`: 함수 `λ index … [iad1]`(미국 동부). DB는 `mzowdsczwaesmfbxzjzw`, ap-northeast-2(서울) — `docs/DEPLOYMENT_CHECKLIST.md`. 호출마다 인증·리비전 전후·페이지 사슬 등 순차 왕복이 여러 번 태평양을 건넌다. RTT는 측정하지 않았다. 이 사실은 저장소 문서 어디에도 없었다(`iad1`·`icn1`·"함수 리전" 검색 0건).
2. **postgrest-js 2.112.2의 기본 재시도.** `node_modules/.pnpm/@supabase+postgrest-js@2.112.2/.../dist/index.cjs`: `GET`·`HEAD`·`OPTIONS` 요청이 네트워크 오류나 `503`·`520`을 받으면 1 s·2 s·4 s(또는 `Retry-After`)를 쉬고 최대 3회 다시 보낸다(`X-Retry-Count` 헤더). 성공하면 응답은 200이고 흔적이 없다. 작업공간 읽기의 테이블 페이지는 모두 GET이다(RPC는 POST라 제외).

## 4. 최초 홈 500 — 위치 확인, 원인 미확정

`vercel logs --request-id 8cjkt-1790344447527-8469528df040`의 오류 첫 줄:

```
Error: Personal workspace is unavailable.
    at h (.next/server/chunks/ssr/apps_web_app_app_(shell)_page_tsx_….js)
```

- 던진 곳: `apps/web/lib/home/journey.ts` `loadWorkspaceJourney`의 `workspaces … .single()` 결과 검사. `getCurrentUserId()`는 사용자 id를 돌려줬다(아니면 로그인으로 redirect). 즉 인증 클레임은 유효했고, 바로 다음 PostgREST 조회가 오류 또는 0행이었다. 코드가 `workspaceResult.error`를 버려서 네트워크(`status 0`)·토큰(`401`)·RLS로 숨은 행(`406 PGRST116`)·게이트웨이(`5xx`)를 로그로 가를 수 없었다.
- 시각: 배포 `dpl_Gbt8DQTq…` 생성 13:37:28Z. 이 배포가 받은 요청은 웹훅 9건(13:38:31–13:47:21Z) 뒤 **6분 46초 무요청**, 그다음이 13:54:07.527Z의 `GET /app` 500. 13:54:13Z `HEAD /app` 204, 13:54:39Z `GET /app` 200, 이후 요청 전부 200.
- 반복 여부: 날짜별 `--status-code 500` 조회(09-19–09-25)에서 500은 이 1건. 로그는 09-23부터 남아 있음을 확인했다(그 이전 날짜의 0건은 보존 기간 밖일 수 있다).

## 5. 이 브랜치의 검증

- 수정 전 red: `tests/workspace-read-row-cap.test.ts` 새 두 테스트가 main에서 `[{ limit: 2000, table: "graph_nodes" }]`와 label 대신 경로(`.agents/skills/review-auth/SKILL.md`)로 실패. `packages/mcp/src/hosted.test.ts` 새 두 테스트가 `coverage` `undefined`, `edges` `[undefined]`로 실패. 홈 테스트는 태그 없는 옛 문장으로 실패(정규식 불일치).
- 수정 후: 관련 파일 통과, 전체 결과는 인계 §3.
