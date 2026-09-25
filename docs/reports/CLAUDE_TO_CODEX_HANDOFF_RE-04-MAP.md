# Claude → 배포 Codex 인계 — RE-04 지도 행 한도 (지도 로더·HUD 위험·심볼 헤일로·모듈 카드)

작성 2026-09-24 KST · 증거 [`.omo/evidence/research-re-04-map-row-cap.md`](../../.omo/evidence/research-re-04-map-row-cap.md) · 측정 [`re-04-map-row-cap.probe.mjs`](re-04-map-row-cap.probe.mjs)

**상태: LOCAL_VERIFIED.** 웹 전용이다(마이그레이션·워커·MCP 도구·카탈로그 변경 없음). 푸시·PR·배포 없음. 수치는 전부 로컬 재구성(파일럿 = 이 레포, `488c0c4` 트리를 운영 SQL로 PGlite에 투영, PostgREST `max_rows` 1,000 흉내, 로그인한 소유자로 row security 적용)이며 **운영 지연이 아니다.**

**현재(2026-09-25):** PR #36으로 머지(`353a512`)·웹 배포(main `9f253e4`). §5의 운영 읽기 검증은 아직 하지 않았다.

## 1. SHA와 작업 공간

| 항목              | 값                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| 기준              | `1aa7bd0` — `research/re-04-search-cost` 끝(로컬·미푸시). 그 아래는 main `488c0c4` 정확                 |
| 브랜치 / worktree | `research/re-04-map-row-cap` / `C:/Users/axz14/Desktop/Project/Arr/re-04-map`                           |
| `834ea60`         | PostgREST 에뮬레이터가 지도의 요청 모양을 읽음(`.single()`, `not.`, to-one embed, `authenticated` 세션) |
| `1324dd9`         | 지도의 모든 읽기를 행 한도 너머로 — 예산·잘림 보고 유지                                                 |
| `a21ef5d`         | 측정 probe와 증거                                                                                       |
| 이 커밋           | 이 인계·frontend 로그·WORKLOG 한 줄                                                                     |
| 푸시 / PR         | **없음** — 승인 없는 push 금지                                                                          |

**스택이다.** RE-04 cost의 `8aeec4d`(`readByIdPages`)와 `20dee3e`(에뮬레이터)를 쓰므로 그 브랜치 위에 쌓았다. 머지 순서는 **RE-04 cost 먼저, 이 브랜치 다음**(PR을 연다면 base를 `research/re-04-search-cost`로). RE-04 cost가 리뷰에서 다시 쓰이면 이 브랜치를 그 위로 옮긴다.

작업 중 RE-04 cost 브랜치에 `df89846`(search section 읽기가 끝까지 못 갔으면 partial로 표시, `packages/mcp/src/data-brain.ts`·`tests/search-sections.test.ts`)이 올라왔다. 이 브랜치와 겹치는 파일이 없고 그 테스트는 에뮬레이터를 쓰지 않으며, `git merge-tree --write-tree research/re-04-search-cost HEAD`가 충돌 없이 끝나서 다시 쌓지 않았다(merge-base `1aa7bd0`). 두 브랜치를 합친 트리로는 테스트를 돌리지 않았다.

공유 루트(`app`, `5d0c709`)는 건드리지 않았다 — checkout/reset/stash/clean·`git add .` 없음, `RESEARCH_WORKBOARD.md`도 편집하지 않았다(§7의 claim 줄을 보드에 붙일지는 사용자 결정).

## 2. 무엇이 바뀌었나

PostgREST는 `max_rows`(Supabase 기본·`supabase/config.toml` = 1,000)보다 많은 행을 말없이 자른다. 지도 화면의 읽기 넷이 한 요청에 그보다 많이 요청했다.

1. **`loadWorkspaceMap`(`/app/map`).** 노드·파일·위성 2,000, 엣지 family별 최대 6,000을 한 요청씩 → 운영에서 정확히 1,000개를 그렸다(09-23·09-24). 이제 예산이 1,000을 넘거나 없는 읽기는 전부 페이지로 읽는다: 첫 페이지에 exact count, 이후 마지막 id 뒤로, **테넌트 조건은 모든 페이지에.** 허브(100–400)·피드·스캔 완료(20)는 한도 안이라 요청 1개 그대로.
   - `graph_nodes`·`artifacts`는 `(created_at, id)` → **`id` 순**. 파일의 id가 곧 노드 id라 두 페이지가 행 단위로 맞는다(R4 §3.7, 구성상 보장). id는 쓰는 순간 `clock_timestamp()`로 찍는 ULID라 예산이 고르는 "가장 오래된 2,000개"는 같다(동시 작성자·같은 밀리초 경계만 예외). 테스트: 2,100 파일·두 트랜잭션에서 남긴 2,000개 = `(created_at, id)` 순 첫 2,000개, `unknown` 0.
   - `file_co_changes`는 id가 없고 예산이 강한 쌍부터 남기므로 **위치(offset) 페이지**, `change_count desc` + 테이블 키로 전순서.
   - `repositories`는 id 페이지 후 최신 생성 순으로 되돌림(`currentRepository`의 동점 규칙).
2. **HUD 위험 칩(`riskRowQueries`, `/app/inspection`과 공유).** 예산 없는 읽기 넷(파일·`calls`/`imports`/`tests` 엣지·finding·`ci` evidence)이 1,000에서 잘려 위험 순위가 한 페이지로 계산됐다 → 페이지. co-change 상위 500·최신 audit 1은 그대로. **인스펙션 화면의 위험 위젯도 같이 고쳐진다.**
3. **심볼 헤일로(`/api/map/symbols`).** 예산+1(5,001 심볼·배치당 20,001 엣지)로 "예산 초과"를 알리는데, 1,000에서 끊기면 그 한 행이 오지 않아 **잘림 보고가 영영 나가지 않았다.** 심볼은 헤일로 자신의 순서(경로·줄·이름·id)로 위치 페이지, 엣지는 배치별 id 페이지. 예산과 `truncated` 보고는 그대로.
4. **인스펙터 모듈 카드(`/api/map/inspect`).** 저장소 파일 2,000·`imports`/`calls` 엣지 6,000을 한 요청씩 → 파일럿 1,010 파일·2,616 엣지가 1,000씩으로 계산됐다. 읽기를 `apps/web/lib/map/module-rows.ts`(`readModuleCardInputs`)로 옮겨 페이지로. 라우트는 핸들러만 남음.

공통 부품: `apps/web/lib/supabase/row-pages.ts`(RE-04)의 루프를 `readByPositionPages`와 공유(`readByIdPages` 동작 불변, 요청에 `offset` 추가), 새 `apps/web/lib/supabase/table-pages.ts`(`readRowsById`·`readRowsByPosition`). 첫 페이지는 예전과 같은 요청이다.

## 3. 측정 — `1aa7bd0` → 이 브랜치, 같은 데이터(파일럿 `488c0c4`)

|                                          |                 이전 |                           이후 |
| ---------------------------------------- | -------------------: | -----------------------------: |
| 그린 노드(저장 1,588)                    |            **1,000** |                          1,588 |
| 그린 엣지(무한도 8,097)                  |                1,867 |                          8,097 |
| 파일 수(`counts.artifacts`)              |                1,000 |                          1,010 |
| HUD 위험 순위 파일(무한도 622)           |                  614 |                            622 |
| 페이지가 직렬화하는 모델 JSON            |               868 KB |                   **3,054 KB** |
| 요청 / 행 / 바이트                       | 35 / 8,872 / 2.46 MB |          46 / 15,488 / 4.43 MB |
| 순차 요청 사슬                           |                    2 |                          **5** |
| 모듈 카드 행(저장 1,010 파일·2,616 엣지) |        1,000 / 1,000 | 1,010 / 2,616 (요청 6, 사슬 3) |
| 가장 큰 헤일로(485 심볼)                 | 485, 요청 10, 사슬 4 |                           불변 |

사슬은 요청마다 1,000 ms를 더해 잰 값(가정, 깊이는 코드의 성질). +3은 위험 맵의 `calls`/`imports`/`tests` 엣지(약 3,300행)를 끝까지 4페이지로 읽는 몫이다. 로컬 wall은 약 100 → 190 ms(한 노트북, 상대값). "이전" 모듈 카드 행은 구성상 값이다(라우트 안의 읽기라 probe가 부를 수 없었다).

## 4. 실행한 명령·결과 (격리 worktree — 커밋 CI 아님)

| 명령                                                                                | 결과                                                                                         |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                                         | clean                                                                                        |
| `pnpm typecheck`                                                                    | root + 6 projects clean                                                                      |
| `pnpm test`                                                                         | **219 files / 2,026 passed / 1 skipped** (기준 `1aa7bd0`: 216 / 2,007 / 1, 차이는 신규 19건) |
| `node --import tsx docs/reports/re-04-map-row-cap.probe.mjs [--code ../re-04-cost]` | §3 수치                                                                                      |

기존 테스트의 단언은 하나도 바꾸지 않았다. 모든 신규 테스트는 수정 전 실패를 먼저 확인했다(증거 "Red before the fix").

## 5. 배포 Codex에게 — 남은 검증 (전부 읽기 전용)

**배포 범위:** 웹만. 마이그레이션·워커 없음, **full 재스캔 금지**. push·PR·merge(=Vercel 배포)는 사용자 승인 사항. RE-04 cost가 먼저 나가야 한다(§1).

0. **(선택, 배포 전, 토큰 불필요) 운영 `max_rows` 확인.** Supabase 대시보드 → Project Settings → API → Max rows(읽기만). RE-04 cost 인계 0번과 같은 확인이다.
1. **배포 후 `/app/map`:** `data-layout-nodes`가 **1000이 아니어야 한다** — 운영 파일럿의 비심볼 노드 수(로컬 `488c0c4` 기준 1,588, 데이터 commit에 따라 다름, 2,000 이하). 첫 로드 시간을 이전 기록과 비교해 기록(순차 +3 예상).
2. HUD: 위험 칩의 순위 파일 수가 늘 수 있다(로컬 614 → 622). coverage 칩은 파일럿에 requirement가 있으면 분모·분자가 달라질 수 있다.
3. 파일 선택: `/api/map/inspect` 200·모듈 카드 표시, 배럴(`packages/core/src/index.ts`) 헤일로 `/api/map/symbols` 200·`data-symbol-count` 불변(485는 로컬 수치).
4. 브라우저에서 1,588 노드·8,097 엣지 그리기가 느려지는지 눈으로 확인(프레임 측정은 이번에 하지 않았다).
5. 실패는 상태·경로·라벨만 기록. 응답 본문·자격증명은 남기지 않는다. 롤백은 `1324dd9` revert(단독으로 되돌릴 수 있다; `834ea60`·`a21ef5d`는 테스트·문서뿐).

## 6. 이번에 하지 않은 것 — 다음 후보

| 후보                         | 근거                                                                                                  | 필요한 것                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 위험 엣지 읽기의 사슬 줄이기 | 사슬 2 → 5의 +3이 이 한 읽기                                                                          | count 후 병렬 위치 페이지, 또는 예산 도입 — HUD 위험 담당 판단 |
| 지도 페이로드                | 모델 JSON 0.87 → 3.05 MB(설계된 예산 안)                                                              | UI 담당: 브라우저 측정, 필요하면 예산 재검토                   |
| 다른 화면의 예산 없는 읽기   | `/app/inspection` 문서·todos, `/app/progress` requirement·`implements`·todos, 홈 토큰이 아직 요청 1개 | 같은 부품으로 별도 작업(파일럿은 아마 1,000 미만)              |
| MCP store `#pages` 통합      | `readRowsById`와 같은 일                                                                              | RE-04 cost 머지 후                                             |

## 7. 보드에 붙일 줄 (사용자가 원하면)

```text
claim: task=RE-04/map-row-cap owner=Claude branch/worktree=research/re-04-map-row-cap @ ../re-04-map base_sha=1aa7bd0 (research/re-04-search-cost tip, on main 488c0c4) files=apps/web/lib/map/{workspace-map,symbol-layer,module-rows}.ts, apps/web/app/api/map/inspect/route.ts, apps/web/lib/inspection/inspection-report.ts, apps/web/lib/supabase/{row-pages,table-pages}{,.test}.ts, tests/{workspace-map-row-cap,postgrest-pglite}.test.ts, tests/helpers/postgrest-pglite.ts, docs/reports/{re-04-map-row-cap.probe.mjs,CLAUDE_TO_CODEX_HANDOFF_RE-04-MAP.md}, docs/frontend/{logs/2026-09-24-map-row-cap.md,WORKLOG.md}, .omo/evidence/research-re-04-map-row-cap.md started_at=2026-09-24 KST
handoff: implementation_sha=1324dd9 emulator=834ea60 docs=a21ef5d,+handoff tests=219 files/2,026 passed/1 skipped · 격리 worktree(커밋 CI 아님) measured(로컬 재구성, max_rows 1000)=지도 노드 1,000→1,588·엣지 1,867→8,097·파일 1,000→1,010·위험 614→622, 요청 35→46·사슬 2→5·모델 JSON 0.87→3.05MB, 모듈 카드 1,000/1,000→1,010/2,616 unverified=운영 max_rows·운영 지연·브라우저 프레임 next_owner=배포 Codex(RE-04 cost 다음 웹 배포 → /app/map data-layout-nodes≠1000)
```

## 8. 다음에 실행할 첫 명령

```bash
git -C C:/Users/axz14/Desktop/Project/Arr/re-04-map log --stat 1aa7bd0..HEAD
```

읽기 리뷰 순서: `apps/web/lib/supabase/row-pages.ts` → `table-pages.ts` → `apps/web/lib/map/workspace-map.ts`(`loadWorkspaceMap`) → `apps/web/lib/inspection/inspection-report.ts`(`riskRowQueries`) → `symbol-layer.ts` → `module-rows.ts` → `tests/workspace-map-row-cap.test.ts`.
