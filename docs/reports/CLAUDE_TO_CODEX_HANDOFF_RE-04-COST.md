# Claude → 배포 Codex 인계 — RE-04 검색 비용·한국어 품질 (원래 RE-04)

작성 2026-09-24 KST · 증거 [`.omo/evidence/research-re-04-search-cost.md`](../../.omo/evidence/research-re-04-search-cost.md) · 측정 [`re-04-search-cost.probe.mjs`](re-04-search-cost.probe.mjs)

**상태: LOCAL_VERIFIED.** 웹 전용이다(마이그레이션·워커·새 도구·카탈로그 변경 없음). 푸시·PR·배포 없음. 수치는 전부 로컬 재구성(파일럿 = 이 레포, `488c0c4` 트리를 운영 SQL로 PGlite에 투영, PostgREST `max_rows` 1,000 흉내)이며 **운영 지연이 아니다.**

**현재(2026-09-25):** PR #35로 머지(`1fd143d`, R1 수정 `df89846` 포함)·웹 배포(main `9f253e4`). §5의 운영 읽기 검증은 아직 하지 않았다.

## 1. SHA와 작업 공간

| 항목              | 값                                                                             |
| ----------------- | ------------------------------------------------------------------------------ |
| 기준              | `488c0c4f3da765ee90c2cdd7b72ec8020d77bc9e` (main 정확, 웹 production)          |
| 브랜치 / worktree | `research/re-04-search-cost` / `C:/Users/axz14/Desktop/Project/Arr/re-04-cost` |
| `8aeec4d`         | PostgREST 행 한도를 넘어 읽기 — 잘린 읽기를 complete라 부르지 않음             |
| `5c50036`         | read basis를 테이블 읽기와 함께 요청(모든 도구 순차 −1)                        |
| `1928cd4`         | 검색 순위를 색인 이웃 캐시로, 검색은 edge를 읽지 않음                          |
| `60a01f1`         | 읽기에 이미 실린 section 제목(ADR/OQ/G/MT)을 검색이 매칭                       |
| `3ed705e`         | 파일 경로 질문은 search로, 없는 도구 이름 제거(설정 안내문·routeQuery)         |
| `20dee3e`         | 측정 probe와 에뮬레이터                                                        |
| 푸시 / PR         | **없음** — 승인 없는 push 금지                                                 |

공유 루트는 `5d0c709` 그대로이고 편집한 공유 파일은 `RESEARCH_WORKBOARD.md` 하나다. checkout/reset/stash/clean·`git add .` 없음.

## 2. 무엇이 바뀌었나 — 동작이 바뀌는 것 4가지

1. **행 한도 결함 수정(정확성).** PostgREST는 `max_rows`(Supabase 기본·`supabase/config.toml` = 1,000)보다 많은 행을 말없이 자른다. 공통 읽기는 2,001행을 요청해 "더 있음"을 알아내려 했지만 1,000에서 끊기면 그 신호가 오지 않고, coverage는 `complete`였다. 파일럿(약 1,010 파일)에서는 **id 순으로 가장 새 파일 약 10개가 검색에서 빠진다.** 지도가 2,000을 요청하고도 운영에서 정확히 1,000개를 그린 것(09-23·09-24)이 정황 증거다(운영 설정 자체는 미확인). 이제 첫 페이지에서 exact count를 받고 마지막 id 뒤로 이어 읽는다. 1,000행 이하 테이블은 요청 1개 그대로.
2. **검색 순위 입력 변경.** 연결성 보너스(같은 등급 안의 재정렬, ≤50점)가 edge 대신 **색인 항목의 이웃 캐시**를 걷는다. 그래서 `search_index`는 edge를 읽지 않는다(`loadWorkspace(..., { edges: false })`, coverage에 `edges`가 0행에서 멈춤으로 표시). 파일럿 질문 80개 중 76개 순위 동일, 4개는 한 칸 차이(2개 위·2개 아래). 그래프 도구(`get_neighbors`·`impact_of`·`trace_path`·`get_artifact`)는 여전히 edge를 읽는다.
3. **검색 응답에 `sections` 필드 추가(additive).** 한국어 결정 기록 제목이 매칭되면 그 문서가 title-heading 등급으로 잡히고, 결과에 `sections: [{token, heading, nodeId}]`가 붙는다. 매칭이 없으면 필드도 없다. outputSchema가 없어 카탈로그 비용 0.
4. **`/app/settings/mcp` 안내문 한 줄.** 사용자가 CLAUDE.md/AGENTS.md에 붙이는 안내가 `search_nodes`·`get_node_content`(todo 22에서 합쳐져 없는 도구)를 가르쳤다 → `search_index`·`get_artifact`로. UI 컴포넌트는 그대로.

`routeQuery`의 경로 질문 수정은 databrain 벤치마크의 routed arm만 쓴다(hosted 아님, 벤치 미실행).

## 3. 측정 — `488c0c4` → `20dee3e`, 같은 데이터

| 호출                                           | 순차 깊이 |    요청 |             바이트 | 로컬 wall p50 | 요청당 100ms 가정 |
| ---------------------------------------------- | --------: | ------: | -----------------: | ------------: | ----------------: |
| `search_index` (export 이름)                   | 8 → **5** | 21 → 20 | 4.74 → **1.17 MB** |   180 → 65 ms |    1,013 → 597 ms |
| `search_index` (일반 단어)                     | 7 → **4** | 20 → 19 | 4.69 → **1.12 MB** |   179 → 65 ms |      908 → 486 ms |
| `get_artifact` / `get_neighbors` / `impact_of` | 7 → **6** |      +3 |             +48 KB |       +~20 ms |           −~90 ms |

그래프 도구는 한도에 잘리던 10행과 count를 더 읽어 로컬 wall이 조금 늘었고 깊이는 1 줄었다. 운영에서는 여기에 인증 2왕복이 앞에 붙는다.

| 품질(각 40문항)       | hit@1   | hit@20  | MRR           | 결과 0개 |
| --------------------- | ------- | ------- | ------------- | -------- |
| 식별자                | 34 → 32 | 40 → 40 | 0.925 → 0.900 | 0 → 0    |
| 파일 이름             | 34 → 35 | 39 → 40 | 0.890 → 0.916 | 1 → 0    |
| 한국어 문서 제목      | 0 → 2   | 0 → 3   | 0 → 0.052     | 40 → 21  |
| 한국어 결정 기록 제목 | 0 → 40  | 0 → 40  | 0 → 1.000     | 40 → 0   |

마지막 행은 매칭 대상인 제목에서 뽑은 질문이라 "그 제목들이 검색되기 시작했다"는 뜻이다.

## 4. 실행한 명령·결과 (`20dee3e`, 격리 worktree — 커밋 CI 아님)

| 명령                                                                             | 결과                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm lint`                                                                      | clean                                                        |
| `pnpm typecheck`                                                                 | root + 6 projects clean                                      |
| `pnpm test`                                                                      | **216 files / 2,007 passed / 1 skipped** (= 1,984 + 신규 23) |
| scope boundaries                                                                 | PASS, 12 boundaries / 390 files                              |
| 카탈로그                                                                         | 21툴 / 3,141 / ratchet 3,150 — 불변                          |
| `node --import tsx docs/reports/re-04-search-cost.probe.mjs [--code <checkout>]` | §3 수치                                                      |

**기존 테스트 변경 1건:** connectivity rerank 테스트는 단언을 그대로 두고, "b가 seed 이웃에 있다"를 순위가 실제로 읽는 이웃 캐시로 fixture에 옮겼다. 순위가 edge 유무와 무관하다는 테스트를 새로 추가했다. 모든 신규 테스트는 수정 전 실패를 먼저 확인했다.

## 5. 배포 Codex에게 — 남은 검증 (전부 읽기 전용)

**배포 범위:** 웹만. 마이그레이션·워커 없음, **full 재스캔 금지**. push·PR·merge(=Vercel 배포)와 임시 read 토큰 1개 발급·폐기는 사용자 승인 사항. 롤백은 해당 커밋 revert(각각 독립적으로 되돌릴 수 있다. 순위 입력 변경은 `1928cd4`).

0. **(선택, 배포 전, 토큰 불필요) 운영 `max_rows` 확인.** Supabase 대시보드 → Project Settings → API → Max rows 값(읽기만). 1,000이면 결함 1이 운영에 있다는 확인이다.
1. **(선택, 배포 전) 행 한도 A/B — 현재 운영 `488c0c4`.** `search_index({ "query": "readInBatches" })`. 이 export는 09-24에 추가된 `apps/web/lib/supabase/id-batches.ts`에만 있다. 가장 새 파일이라 id 순 1,000행 밖에 있을 것으로 **예측**한다. 결과에 이 파일이 없으면 결함 1이 확정된다. 있으면 한도가 더 크거나 행 수가 다른 것이므로 기록만 한다.
2. **배포 후 같은 토큰으로:**
   - 초기 읽기 14종(09-24 10:43 실행과 같은 목록) — 통과·경과 ms. 검색은 이전 6.1–13.3 s와 비교.
   - `search_index({ "query": "readInBatches" })` → `apps/web/lib/supabase/id-batches.ts`가 있어야 함(결함 1 수정).
   - `search_index({ "query": "정확도 주장" })` → `spec/DECISIONS-ADR.md`, `sections`에 `ADR-012`. `{ "query": "캔버스 노드" }` → `spec/OPEN_QUESTIONS.md`, `sections`에 `OQ-006`. 한국어 결정 기록 검색 확인.
   - `search_index` 응답의 `coverage.result`가 `complete`인지(edge를 읽지 않아도 검색 coverage에는 들어가지 않는다).
   - `get_neighbors`·`impact_of`(파일·symbol-id) 통과 — 그래프 도구 동작 불변 확인. `impact_of`의 `lower-bound`는 정상.
   - 카탈로그 21툴 / 3,141.
   - `/app/settings/mcp` 안내문 3번 줄이 `search_index` → `get_neighbors` / `trace_path` … `get_artifact`인지.
3. 실패는 태그의 status·code·라벨만 기록(RE-04 search 인계의 분류기 그대로).

토큰은 사용자 승인 범위에서 발급하고 즉시 폐기. 응답 본문·payload·자격증명·프롬프트는 기록하지 않는다.

## 6. 이번에 하지 않은 것 — 다음 후보

| 후보                                           | 측정·근거                                                           | 필요한 것                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **문서 제목 색인**(한국어 제목 검색의 본 수정) | 로컬 시뮬레이션: 한국어 제목 hit@5 39/40, hit@20 40/40; 식별자 불변 | 워커(스캔 계획에 H1–H2) + 마이그레이션(`apply_repository_scan`이 headings 기록) + 재스캔 — 사용자 승인 |
| 그래프 도구의 edge 비용(4.7 MB, 순차 4왕복)    | edge RPC가 행 예산을 2,000으로 서버에서 자름                        | 마이그레이션(페이지 확대·`contains` 제외·필요 컬럼만) 또는 도구별 대상 읽기 설계                       |
| 인증 2왕복 → 1                                 | 모든 호출 깊이 −1                                                   | 인증 경로라 별도 보안 리뷰                                                                             |
| 지도 로더의 1,000행 한도                       | 같은 원인, `workspace-map.ts`                                       | 별도 작업(칩 생성됨), UI 담당 확인                                                                     |
| 설정 안내문의 흐름                             | 4단계 강제 호출로 공유 흐름(todo 22, 강제 ≤2)과 다름                | UI·제품 결정 — 이번엔 없는 도구 이름만 고침                                                            |
| 운영 단계별 시간                               | 운영 지연의 실제 구성은 모름                                        | 응답 본문 없는 `Server-Timing` 헤더 계측 제안(배포 필요)                                               |
| 한국어–영어 alias                              | 미평가                                                              | 제목 색인 이후, 제품 어휘 결정                                                                         |

## 7. 다음에 실행할 첫 명령

```bash
git -C C:/Users/axz14/Desktop/Project/Arr/re-04-cost log --stat 488c0c4..HEAD
```

읽기 리뷰 순서: `apps/web/lib/supabase/row-pages.ts` → `apps/web/lib/mcp/supabase-store.ts`(`#pages`·basis·`edges: false`) → `packages/mcp/src/data-brain.ts`(`connectivityBonus`·section 매칭) → `packages/mcp/src/hosted.ts`(`search_index`) → `tests/workspace-read-row-cap.test.ts` → `tests/search-sections.test.ts`.
