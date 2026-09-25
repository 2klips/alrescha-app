# Claude → 배포 Codex 인계 — RE-04 첫 `search_index` 실패 분류와 심볼 읽기 수정

작성 2026-09-24 KST · 근거 배포 Codex 운영 기록(공유 루트 `.omo/evidence/phase4/re04-b01-rollout-2026-09-23.md`, `re04-b01-edge-plan-2026-09-23.json`) · 증거 [`.omo/evidence/research-re-04-search-failure.md`](../../.omo/evidence/research-re-04-search-failure.md) · 재현 [`re-04-search-failure.probe.mjs`](re-04-search-failure.probe.mjs)

**상태: LOCAL_VERIFIED.** 가장 유력한 원인(F1)을 운영 없이 재현했고 고쳤다. **운영에서 원인이 확정된 것은 아니다** — 실패 응답을 보관하지 않았으므로 확정은 §7의 A/B나 배포 후 재검증이 한다. 푸시·PR·배포 없음.

**현재(2026-09-25):** PR #30으로 머지·배포(웹 `488c0c4`). 배포 Codex의 운영 확인으로 RE-00 RELEASED, RE-02·RE-03 PROD_VERIFIED(2026-09-24). F1은 운영에서 확정되지 않은 채로 남았다.

## 1. SHA와 작업 공간

| 항목      | 값                                                                        |
| --------- | ------------------------------------------------------------------------- |
| 기준      | `47b32d2b793cd251cec0b09e9645b1f3d8ea16f1` (main 정확, Vercel production) |
| 수정      | `faa151a` — search 심볼 읽기 축소 + id 목록 분할 + 오류 태그              |
| 브랜치    | `research/re-04-search-failure`                                           |
| worktree  | `C:/Users/axz14/Desktop/Project/Arr/re-04-search`                         |
| 푸시 / PR | **없음** — 승인 없는 push 금지                                            |

공유 루트는 `5d0c709` 그대로이고 편집한 공유 파일은 `RESEARCH_WORKBOARD.md` 하나다. UI·테스트·brand·launch·연구 문서·타인 변경·`:3030`은 건드리지 않았다. checkout/reset/stash/clean·`git add .` 없음.

## 2. 변경 파일 (기준 대비 12개, +1,138 / −106)

| 파일                                       | 역할                                                                      | blob       |
| ------------------------------------------ | ------------------------------------------------------------------------- | ---------- |
| `apps/web/lib/mcp/supabase-store.ts`       | `loadFileSymbols` 신규, 이웃 읽기 분할, `queryError` 태그                 | `2b1c796a` |
| `apps/web/lib/supabase/id-batches.ts`      | 신규 — 60개 단위 분할·동시 4·병합 규칙                                    | `98c33a4b` |
| `apps/web/lib/map/symbol-layer.ts`         | 지도 헤일로 edge 요청 분할                                                | `29cc48be` |
| `packages/mcp/src/store.ts`                | `McpStore.loadFileSymbols`, 공통 규칙 `selectFileSymbols`, in-memory 구현 | `1d51830d` |
| `packages/mcp/src/hosted.ts`               | `symbolHitsFor`가 이웃 대신 `loadFileSymbols` 사용                        | `6be0ed6e` |
| `packages/mcp/src/index.ts`                | export 2개                                                                | `7effffa8` |
| `apps/web/lib/mcp/symbol-read-url.test.ts` | 신규 — 실제 supabase-js + PostgREST 에뮬레이터                            | `4663d847` |
| `apps/web/lib/supabase/id-batches.test.ts` | 신규                                                                      | `ab1abae3` |
| `apps/web/lib/mcp/supabase-store.test.ts`  | 요청 형태·분할·태그 5건                                                   | `fe55da01` |
| `packages/mcp/src/symbol-layer.test.ts`    | `selectFileSymbols` 3건                                                   | `0273fd3d` |
| `packages/mcp/src/hosted.test.ts`          | search가 이웃을 읽지 않음 1건                                             | `962d9bfc` |
| `tests/search-accuracy.test.ts`            | 기존 RE-02 spy 대상만 교체(§6)                                            | `170f1328` |

마이그레이션·새 도구·카탈로그 변경 없음(21툴 / 3,141).

## 3. 분류 — 기록된 사실 위에서

다섯 호출 모두 같은 공통 읽기를 쓴다. 그 뒤 **DB를 다시 읽는 것은 `search_index`뿐이다**: `symbolHitsFor` → `loadSymbolNeighborhood(히트 파일)`. `get_neighbors`·`impact_of`는 공통 읽기가 모르는 id일 때만 심볼 레이어를 읽는데 파일 id는 알고 있으므로 읽지 않는다(기록의 "symbol node 0"과 일치). `get_artifact`는 읽지 않는다.

| #   | 후보                                                    | 드러나는 모습                                                        | 판정                                                                                                                       |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| F1  | search의 `symbol_edges` 요청 URL이 게이트웨이 한도 초과 | `MCP symbol edge query failed: URI too long` — 코드도 timeout도 없음 | **가장 유력** — 인계서가 권장한 질의 형태로 로컬 재현, 운영 미관측                                                         |
| F2  | 공통 읽기 statement timeout                             | `canceling statement due to statement timeout`                       | 낮음 — 분류기가 인식하고, 같은 읽기가 46초 안에 4번 통과                                                                   |
| F3  | 게이트웨이 5xx·네트워크                                 | `TypeError: fetch failed`, HTML 본문                                 | **배제 못 함** — postgrest-js가 GET을 503/520/네트워크에서 1·2·4초 간격 최대 3회 재시도하므로 소요 시간으로 F1과 구분 불가 |
| F4  | 출력 스키마 검증                                        | `Output validation error`                                            | 배제 — `search_index`에는 outputSchema가 없음                                                                              |
| F5  | 플랫폼 timeout                                          | HTTP 504                                                             | 배제 — HTTP 200 + tool result                                                                                              |
| F6  | 클라이언트 abort                                        | `AbortError`                                                         | 배제 — MCP 경로에 timeout·signal 없음                                                                                      |
| F7  | 운영 데이터에서 순위 코드 예외                          | `TypeError`                                                          | 배제 못 함, 증거 없음                                                                                                      |
| F8  | edge RPC 후속 cursor·fence                              | `MCP edge page query failed`                                         | search 고유가 아님 — 같은 공통 읽기가 같은 46초에 4번 통과                                                                 |
| F9  | `revision_of`·`read_repository_basis`                   | —                                                                    | 배제 — 둘 다 예외를 던지지 않음                                                                                            |

## 4. F1 재현 — 운영 없이

파일럿이 이 레포이므로 probe는 로컬 full 스캔 → SQL과 동등성 테스트된 로컬 투영 → 실제 `searchWorkspaceIndexPage` → `symbolHitsFor`의 파일 선택 → **실제 postgrest-js 빌더의 URL 길이**를 잰다. 요청은 보내지 않는다.

`47b32d2` 트리: artifacts 1,005, 심볼 2,597(운영 full 후 2,589). barrel `packages/core/src/index.ts` 485개, `packages/mcp/src/index.ts` 135개.

| 질의                                    | 심볼 일치 파일 | 읽은 심볼 | edge 요청 URL |
| --------------------------------------- | -------------: | --------: | ------------: |
| `createHostedMcpEndpoint` (인계서 형태) |              2 |       143 |     **8,568** |
| `searchWorkspaceIndexPage`              |              2 |       161 |     **9,612** |
| `SupabaseMcpStore`                      |              1 |         1 |           332 |
| `search`                                |              1 |        26 |         1,782 |
| `store`                                 |             14 |       167 |     **9,960** |
| `edge`                                  |             15 |       979 |    **57,056** |
| `auth`                                  |              7 |       590 |    **34,494** |

export 이름 하나가 8,000을 넘는 이유는 `packages/mcp/src/index.ts`가 그 이름을 다시 export하고, 그 barrel의 135개가 통째로 들어가기 때문이다. Supabase는 URL 한도를 **공개하지 않는다**. postgrest-js 2.112.2는 8,000자부터 경고하고, 800개 `in`에서 `URI too long`이 난 공개 보고가 있다([postgrest-js#423](https://github.com/supabase/postgrest-js/issues/423)). 굵은 행 중 어느 것이 실제로 실패했는지는 모른다.

## 5. 수정 (`faa151a`)

1. **검색은 히트가 보여 주는 것만 읽는다.** `loadFileSymbols`: 히트 파일 자기 심볼, 워크스페이스 한정, edge·hop 없음. 파일 60개당 요청 1개(검색 페이지는 최대 100). 두 store가 같은 규칙 `selectFileSymbols`를 쓴다.
2. **심볼 레이어의 모든 id 목록을 분할한다.** 이웃 읽기와 지도 헤일로가 60개씩, 동시 4개로 묻고, 순서·limit가 있는 단일 쿼리의 답과 **정확히 같게** 병합한다(`firstRowsById`). 파일이 얼마나 크든 요청 하나가 4KB를 넘지 않는다.
3. **실패한 읽기가 스스로를 밝힌다.** 모든 store 오류가 HTTP 상태와 PostgREST/SQLSTATE 코드로 시작한다: `[HTTP 414] MCP file symbol query failed: URI too long`. 첫 `: ` 앞은 기록해도 되는 분류, 뒤는 upstream 본문이다.

probe 재측정: search는 질의당 `symbols` 요청 **1개**(290–696자), 이웃·헤일로의 edge 요청은 최대 **3,754자**(심볼 60개당 1개).

## 6. 실행한 명령·결과

환경: Windows 11, Node 24, pnpm, worktree에서 `pnpm install --frozen-lockfile` 후. 2026-09-24.

| 명령                                                            | 결과                                     |
| --------------------------------------------------------------- | ---------------------------------------- |
| `pnpm lint`                                                     | clean                                    |
| `pnpm typecheck`                                                | root + 6 projects clean                  |
| `pnpm test` (`faa151a`)                                         | **212 files / 1,984 passed / 1 skipped** |
| `node --import tsx scripts/verify-scope-boundaries.ts`          | PASS — 12 boundaries, 389 files          |
| 카탈로그 (`change-brief-contract.probe.mjs`)                    | 21툴 / 3,141 / ratchet 3,150             |
| `node --import tsx docs/reports/re-04-search-failure.probe.mjs` | §4·§5 수치                               |

1,984 = 1,965(기준 로컬) + 신규 19. **격리 worktree의 작업트리 실행이며 커밋 CI가 아니다.**

**기존 테스트 1건 변경:** RE-02의 "reads the layer for the files it answers with"는 지연 읽기를 `loadSymbolNeighborhood` spy로 보고 있었다. 읽기가 `loadFileSymbols`로 옮겨 가서 spy 대상만 바꿨고, 단언한 id(`["yn20"]`)는 그대로다. 이웃 읽기가 호출되지 않는다는 단언을 추가했다(강화).

**레드 확인:** 소스 5개만 `47b32d2`로 되돌리면 14건 실패(신규 13 + 위 RE-02 1), 복원하면 전부 통과. 양쪽 통과는 독립 모듈인 분할 helper 테스트와, 옛 요청이 거절됨을 보이는 특성 테스트다.

## 7. 배포 Codex에게 — 남은 검증 (전부 읽기 전용)

**배포 범위:** 웹만. 마이그레이션 없음, 워커 재배포 불필요, **full 재스캔 금지**. 푸시·PR·머지(=Vercel 배포)는 사용자 승인 사항. 롤백은 `faa151a` revert.

**분류기에 추가할 것:** 실패 메시지는 `^\[HTTP (\d{1,3})(?: (PGRST\d{3}|[0-9A-Z]{5}))?\] ([^:]+):`로 시작한다. **status·code·라벨만** 기록하고 첫 `: ` 뒤는 기록하지 않는다. `414` → URL 초과(어느 읽기인지는 라벨), `500 57014` → 해당 읽기의 statement timeout, `0` → 전송 실패, `5xx` → 게이트웨이.

0. **(선택, 배포 전) 원인 확정 A/B — 현재 운영 `47b32d2`.** 사용자 승인 범위의 read 토큰으로 `search_index`를 두 번: `{ "query": "SupabaseMcpStore" }`(예측 332자 → 통과해야 함), `{ "query": "createHostedMcpEndpoint" }`(예측 8,568자). 뒤쪽만 실패하고 메시지 첫 `: ` 앞이 `MCP symbol edge query failed`이면 **F1 확정**. 둘 다 통과하면 게이트웨이 한도가 8,568보다 크다는 뜻이다. 이 경우 F1은 긴 질의(`edge` 57,056자)에서만 성립하고, F3·F7이 다시 후보가 된다. 이 단계를 건너뛰고 바로 배포해도 수정은 유효하다.
1. **웹 배포 후 같은 다섯 읽기 + `search_index({ "query": "createHostedMcpEndpoint" })`.** 통과해야 하고, 히트의 `symbols`에 `nodeId`·`span`이 있어야 한다. 실패하면 위 태그만 기록해 돌려준다.
2. **RE-00 symbol-id 읽기.** 1번 히트의 `symbols[0].nodeId`로 `get_neighbors`·`impact_of` → `found: true`, 소유 파일 `declares`(+있으면 `extends`). 분할된 이웃 읽기를 지나는 경로다.
3. **지도 barrel 헤일로.** `/app/map`에서 `packages/core/src/index.ts`를 Near까지. 수정 전에는 edge 요청이 약 28KB라 거절됐을 것으로 **예측**한다(미검증). 수정 후에는 도형이 보여야 한다. hosted.ts(8개)는 이미 PASS.
4. **RE-02 매트릭스**(domain/limit/truncated/coverage/punctuation), **RE-03** `ids` 제외와 briefTokens/hop 상세 — 같은 토큰으로.
5. **RE-00 닫기:** 1·2번 통과 + Near(이미 PASS)면 닫을 수 있다. 판정은 배포 Codex가 한다. 파일럿 edge 11,833 > 8,000이므로 `lower-bound`는 정상이다.

토큰은 사용자 승인 범위에서 발급하고 즉시 폐기한다. 응답 본문·payload·자격증명·프롬프트는 기록하지 않는다.

## 8. 남은 문제·미검증

- **실패한 요청 자체** — 질의·응답·상태가 보관되지 않았다. F1이 유력하지만 F3·F7은 배제되지 않았다(§7-0이 가른다).
- Supabase의 실제 URL 한도.
- 공통 읽기가 호출당 5.9–9.0초 걸린다. 이번 범위가 아니며 원래 RE-04 비용 작업의 첫 대상이다.
- 지도 `symbols` 요청의 파일 60개 초과 분할은 하지 않았다. 클라이언트는 파일 1개씩 묻고, 라우트 상한 200개일 때 약 6KB다.

## 9. 원래 RE-04(검색 비용·한국어)는 아직 시작하지 않았다

지시대로 **복구 확인 후** 시작한다. 복구 확인 = §7-1·2 통과. 넘겨받을 단서 두 개:

- **비용:** 공통 읽기 5.9–9.0초/호출. edge 첫 페이지는 123ms였으므로 나머지 구간(요청 수·전송량·디코딩)을 단계별로 재는 것부터 시작한다.
- **한국어:** 로컬 재현에서 `검색`의 히트가 0이다. 이 레포에는 `검색`이 들어간 마크다운 제목이 7개 있다(예: `# Claude → Codex 인계 — RE-02 검색 정확성·상한`). 토큰화는 한글을 유지하고(`\p{L}`) 순위도 `includes` 기반이므로 원인은 **색인 대상**에 있다. 로컬 투영에서 `doc` 항목의 제목은 파일명이고 **headings가 0개**라 한국어 제목이 아예 검색되지 않는다. SQL 쪽도 같은지는 확인하지 않았다.

그 밖의 관찰(범위 밖, 미수정): `/app/commits`가 run 50개의 `receipts.summary`를 select한다. B-01이 MCP 읽기에서 뺀 것과 같은 컬럼이다.

## 10. 다음에 실행할 첫 명령

```bash
git -C C:/Users/axz14/Desktop/Project/Arr/re-04-search log --stat 47b32d2..HEAD
```

읽기 리뷰 순서: `apps/web/lib/supabase/id-batches.ts` → `apps/web/lib/mcp/supabase-store.ts`(`queryError`·`loadSymbolNeighborhood`·`loadFileSymbols`) → `packages/mcp/src/store.ts`(`selectFileSymbols`) → `hosted.ts`의 `symbolHitsFor` → `apps/web/lib/map/symbol-layer.ts` → `symbol-read-url.test.ts`.
