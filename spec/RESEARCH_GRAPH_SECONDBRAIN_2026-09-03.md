# 연구 보고: Graph View "Obsidian 급" · 계층형 Data Brain · 기존 레포 온보딩 · 외부 생태계 융합 (2026-09-03)

> **발주(사용자 지시, 2026-09-03):** ⑴ Graphify 외에 Dataview 등 스타 많은 플러그인·스킬을 조사해 토큰 절약·세컨드 브레인·에이전트용 DB·정확도/속도 향상 관점에서 장점을 흡수하거나 새 방식을 연구 ⑵ Graph View의 성능·디자인·이벤트·애니메이션이 Obsidian graph view 수준이 되게 ⑶ 실레포를 불러오면 "문서끼리만 연결" 또는 알아볼 수 없는 형태 — 문서/backend/frontend/database 대분류 아래 파일↔파일·함수↔함수가 보이는 그래프를 원함, 하네스가 프로젝트를 어떻게 기록하는지 확인 ⑷ MCP가 **이미 완성된 레포**도 파악·정리·문서화해 그래프 뷰로 완성할 수 있어야 함 ⑸ 그 외 완성도를 높일 부분 전부.
>
> **방법:** 코드 전수 감사 3축(렌더 엔진 · 인제스트/데이터 모델 · MCP/CLI, 파일:라인 인용) + 이 세션의 로컬 실측(데모 `/map` 조작, 로컬 Supabase 분포) + 웹 1차 출처 조사(2026-09-03 조회). 실행 계획은 [`BUILD_PLAN_PHASE4.md`](BUILD_PLAN_PHASE4.md). 신규 OQ는 `OPEN_QUESTIONS.md` OQ-029~030.
>
> **요약 결론 5개:**
>
> 1. **"문서끼리만 연결된 그래프"의 원인은 렌더가 아니라 데이터 레이어다.** ⓐ concept·requirement·rationale 노드가 전부 `spec`→`docs` 영역으로 분류된다(`apps/web/lib/dashboard/graph-model.ts:106-114`) — 파일럿 실측 concept 169 + rationale 86이 docs 밴드로 들어가고 concept 엣지 233개 전부가 docs↔docs로 보인다. ⓑ requirement 노드는 엣지를 하나도 갖지 못한다(`apps/worker/src/postgres-analysis-store.ts` — 노드·행만 쓰고 `edges` 미기록). ⓒ 문서→코드 엣지를 쓰는 코드가 없다(`sourceReferences`는 finding으로만 끝남). ⓓ facet이 `apps/web/`·`apps/`·`packages/`만 알고(`packages/core/src/ingest/artifact-facets.ts:44-53`) 그 밖은 `unclassified`→**조용히 `backend`**(`:92`). `database` 도메인은 어휘에 없고, 심볼(함수) 노드는 존재하지 않으며, `README.md`·`docs/*.md`는 아티팩트조차 아니다.
> 2. **Obsidian 대비 조작감 격차는 라이브러리가 아니라 구현 공백이다.** 스택(Pixi v8 + d3-force Worker)은 Obsidian·Quartz와 동일하다. 없는 것: 호버 이웃 강조(엔진에 hover 개념 0), 노드 드래그(`reheat()`는 dead code), 커서 앵커 줌(현재 앵커가 **월드 원점** — 팬 뒤 휠을 굴리면 콘텐츠가 날아감), 스크린 공간 라벨(줌인하면 글자가 커짐), 로드 시 fit-to-view, 진짜 라벨 페이드(팝인/아웃), 뷰포트 컬링, 레이아웃 영속화. 그리고 **필터·검색 키 입력마다 시뮬레이션이 처음부터 재시작**된다. 히트 테스트는 DOM 버튼 600개 캡이라 601번째 노드부터 상호작용 불가.
> 3. **"완성된 레포" 온보딩은 오늘 불가능하다.** 레포 연결 시 스캔이 인큐되지 않는다(`connect-repository.ts`·`onboarding-store.ts`에 enqueue 0건; `enqueue_job('scan')`은 webhook SQL 함수에서만) — 더 이상 푸시가 없는 레포는 영원히 빈 그래프다(WORK_SPEC §4.1-4 미구현). `alrescha push`는 그래프만 채우고 analyze/enrich를 받을 수 없다. 사람이 읽는 문서(위키) 페이지 타입·잡·라우트가 없고, 이미 만들어지는 산문 요약 3종은 웹 UI에 노출 0이다.
> 4. **외부 생태계 판정(2026-09-03 조회):** Graphify 114.2k★(37 grammars, SQL/PostgreSQL 인트로스펙션, PR impact 툴, PreToolUse 훅 strict mode), GitNexus 10k+★(노드 44종 — Folder/Route/Process/Community 포함, 브라우저 WASM tree-sitter), Serena 25.2k★(LSP 심볼 툴), DeepWiki-open 17.9k★(codemap 2-패스·축자 인용 강제), claude-mem ~90k★, superpowers 280.7k★, spec-kit 133k★, beads 17.1k★, Dataview 9.3k★. **채택 패턴:** 계층 노드(Folder→File→Symbol)+`contains`, Route→handler 프로세스, 훅 기반 지시, "위키 = 저장된 산문의 조합", Dataview식 질의 가능한 메타데이터 레이어, Quartz의 hover 트윈·d3-drag 리히트·forceCollide.
> 5. **벤치 경고를 계획에 반영해야 한다.** graph-surface v1·v2 모두 NOT MET(턴 +2.0–2.3, PASS −8.3–−12.5pp)이고, 기법 실측은 id-first를 회수율 −2.78pp로 **off 권고**했는데 지시 블록·5종 그래프 툴은 id-first를 **강제**한다 — 모순(OQ-032). Phase 4의 에이전트 표면은 "그래프 단독"이 아니라 "탐색 라운드 절감 + 파일 폴스루", 벤치는 지시 블록이 설치된 상태(v3)로 재측정한다.

---

## 1. 이 세션의 실측 (2026-09-03)

### 1.1 데모 `/map` 조작 실측 (1440×900, 로컬 dev, 15노드 픽스처)

| 조작            | 관측                                                                                                                         | 판정 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---- |
| 로드            | 레이아웃이 사슬(pearl-string)형으로 늘어짐, 상·하단 노드가 헤더/바닥에 잘림 — fit-to-view 없음                               | ✗    |
| 노드 위 hover   | 시각 변화 없음(이웃 강조·페이드 없음)                                                                                        | ✗    |
| 휠 줌           | 동작하나 앵커가 커서/뷰포트 중심이 아님(§2.3)                                                                                | △    |
| 노드 드래그     | 노드가 아니라 **캔버스 전체가 팬**됨                                                                                         | ✗    |
| `영역별로 묶기` | 프론트엔드/백엔드/문서/테스트 4밴드 정적 뷰로 전환 — 전환 시 엔진 파괴·재생성                                                | △    |
| `레이아웃 설정` | 중앙 인력·반발력·링크 인력·링크 거리·라벨 페이드 5슬라이더(Obsidian과 동형) — 단 **`/app/map`(실데이터)에는 이 패널이 없음** | △    |
| 콘솔            | 에러 0                                                                                                                       | ✓    |

### 1.2 로컬 Supabase 분포 (테스트 시드 포함, 기준 2026-09-03)

| 항목                        | 값                                                                                                                                                   | 의미                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `graph_nodes.kind`          | artifact 607 · concept 169 · (requirement 0 · rationale 0 · symbol 없음)                                                                             | 함수/심볼 노드 부재, 요구사항 미영속(로컬)                              |
| `edges.relation`            | imports 102(1.0) · calls 33(1.0) · uses 91 · depends_on 65 · part_of 50 · validates 12 · produces 9 · configures 4 · implements 2 (concept 계열 0.5) | 구조 엣지 135 vs AI 개념 엣지 233 — 개념 엣지가 전부 docs 밴드에 그려짐 |
| `artifacts.classification`  | code_metadata 461 · agents 37 · adr 36 · skill/todo/spec/cursor_rule 각 18 · claude 1                                                                | 코드가 다수인데 화면은 문서 위주 — 분류 사상 문제(§3.8 ①)               |
| `artifacts.metadata.facets` | 전부 null                                                                                                                                            | facet은 저장 안 함(읽기 시점 유도 — Phase 2D 판단)                      |
| `graph_nodes` 컬럼          | id·workspace_id·repository_id·kind·label 5개                                                                                                         | 경로·도메인·계층 정보가 노드에 없음 → 전부 위성 테이블 조인             |
| `jobs`                      | scan 9 · analyze 9 · enrich 2 성공/3 실패                                                                                                            | enrich는 수동 트리거 전용                                               |

프로덕션 실측(OQ-023 기록): graph_nodes 585 = artifact 499 + rationale 86, spec 17, requirement 0(→ 09-02 영속화 후 99).

---

## 2. 코드 감사 A — 그래프 렌더 엔진 (`apps/web/lib/graph/`, `app/ui/brain-map*.tsx`)

### 2.1 아키텍처(정상 동작 확인분)

- 데이터 흐름: `GraphData` → graphology(Louvain 전용) → Worker `d3-force` tick(33ms × 2틱) → `Float32Array` transfer → 메인 보간(`position-buffer.ts`) → `buildRenderFrame`(순수 CPU 플랜) → Pixi(edges→glow→nodes→labels). 자체 rAF 루프, Pixi ticker off(이중 렌더 방지). MT-4 더티 플래그로 정착 후 idle 0프레임. **견고한 부분:** 마운트/언마운트 위생(WebGL 컨텍스트 누수 e2e), 테마 전환(`MutationObserver`+팔레트 재해석), SSR 경계, 결정론 초기 배치(황금각 나선+시드 PRNG), 글로우 레이어(단일 텍스처 tint, additive).
- 서버가 매 요청 O(n²) 48회 레이아웃(`graph-model.ts:334-387`, `workspace-map.ts:503`)을 돌리지만 워커 첫 프레임에 **전부 버려진다** — perf 리포트 MT-6.

### 2.2 격차 목록 — 영향도 순 (전부 현 스택 안에서 해결 가능)

| #   | 격차                                                                                                                     | 근거                                                                                          | 구현 방향                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **호버 이웃 강조/페이드 부재**                                                                                           | `lib/graph`·`brain-map*.tsx`에 hover 0건                                                      | `FrameInput.hoveredNodeId` 추가 → 기존 `directionalFocus`(`render-frame.ts:345-360`, 이웃 알파 0.22) 재사용, 백엔드에서 알파 지수 보간(Quartz는 TweenJS 200ms) |
| G2  | **줌 앵커가 월드 원점**                                                                                                  | `brain-map.tsx:267-273`이 `scale`만 변경, `camera.xy` 불변                                    | 커서 고정점 공식 `x' = px − (px − x)·(k'/k)`, `deltaMode` 정규화, `ctrlKey` 핀치, 목표 scale ref + rAF 지수 보간                                               |
| G3  | **히트 테스트 DOM 600 캡, 공간 인덱스 없음**                                                                             | `brain-map-stage.tsx:45,76-92`                                                                | `d3-quadtree`(d3-force 전이 의존) 또는 uniform grid로 캔버스 히트, DOM은 접근성 전용(캡 200)                                                                   |
| G4  | **노드 드래그·리히트 부재**                                                                                              | 프로토콜에 pin/unpin 없음(`simulation-protocol.ts:111-120`), `reheat()` 호출처 0              | `pin(slot,x,y)`→`fx/fy`+`alphaTarget(0.3)`, `unpin`→`alphaTarget(0)`; Quartz·force-graph 동일 패턴                                                             |
| G5  | **라벨이 월드 공간(줌하면 커짐), 페이드가 팝인/아웃**                                                                    | `pixi-backend.ts:151-162` fontSize 11이 `world` 자식; 알파 전역 단일값(`render-frame.ts:449`) | `labelLayer`를 stage 직속으로, 스크린 좌표 직접 계산; 알파 = `pixelSize`↔임계 거리 램프 + 프레임 보간; 장기 `BitmapText`                                       |
| G6  | **뷰포트 컬링이 라벨에만**                                                                                               | `render-frame.ts:362,398` 전 노드·엣지 순회                                                   | `lod.ts:86-93 onScreen()` 일반화, 엣지는 선분-뷰포트 교차만                                                                                                    |
| G7  | **매 프레임 Graphics 재테셀레이션**                                                                                      | `pixi-backend.ts:184-224` clear→엣지당 stroke·노드당 fill; 대시는 월드 단위 7 하드코딩        | 노드 = 원 텍스처 `Sprite` 풀(`tint/scale`만), 엣지 = 위치 버퍼만 갱신하는 Mesh 또는 정착 전만 재기록; dash를 스크린 단위로                                     |
| G8  | **필터=새 GraphData → 시뮬레이션 재시작 + PageRank/Louvain 재계산; 레이아웃 영속화 없음**                                | `brain-map.tsx:319-321`, `dashboard-screen.tsx:447-458`, `engine.ts:317-327`                  | 엔진 `setVisibility(Set<id>)` — 프레임에서만 필터; `nodeId→{x,y}`를 워크스페이스 키로 IndexedDB 저장 후 `initialPositions`로 워밍                              |
| G9  | 카메라 스냅(트윈 없음)                                                                                                   | `engine.ts:271-284`                                                                           | 목표/현재 카메라 분리, ease-out, force-graph `zoomToFit(ms,px)`·`centerAt` 동형 API                                                                            |
| G10 | 슈퍼노드 펼치기 UI 없음                                                                                                  | `toggleCommunity()` 호출처 0                                                                  | G3 뒤 클릭 → `toggleCommunity`                                                                                                                                 |
| G11 | `forceCollide` 없음(PageRank 반지름 최대 26 → 허브 겹침)                                                                 | `force-simulation.ts:126-142`                                                                 | Quartz처럼 `forceCollide(r).iterations(3)`; 반지름 배열을 start 메시지에                                                                                       |
| G12 | 상태 배지 미렌더, `settled`·`alpha` 메시지 무시, `setHudLod` 죽은 상태가 100ms마다 전체 리렌더                           | `render-frame.ts:384`, `engine.ts:216-223`, `map-screen.tsx:283,639`                          | 정리                                                                                                                                                           |
| G13 | **`/app/map`에 force 패널 없음**, 빈 상태 판정이 필터 무시, 뷰 토글 시 엔진 파괴                                         | `map-screen.tsx:190,378,170-192`                                                              | 패널 이식, `visibleGraph` 기준 빈 상태, 스테이지 유지                                                                                                          |
| G14 | 렌더러 2종 공존(Pixi vs `/graph`의 SVG `GraphCanvas` — 색 어휘·크기·드래그 지원이 다름), `/graph`는 데모 픽스처 하드코딩 | `graph-detail.tsx:37-38,103`                                                                  | 단일화                                                                                                                                                         |

**성능 판정:** MT-4 이후 CPU 프레임 플랜은 문제가 아니다(3,500노드 p95 1.396ms). 5–10k@60fps의 병목은 **G6(컬링)·G7(재테셀레이션)·G8(재시작)** 세 곳이며 vitest가 볼 수 없는 GPU 조각(G7)은 브라우저 실측 게이트가 필요하다. 워크트리 4벌(`.claude/worktrees/*`)에 `lib/graph` 사본이 있어 검색 오탐 원인.

---

## 3. 코드 감사 B — 인제스트·그래프 데이터 모델 (하네스가 프로젝트를 기록하는 방식)

### 3.1 파이프라인

`push webhook → runs + jobs(scan, analyze)` — `scan`: `scanRepository()` → `apply_repository_scan(jsonb)`(artifacts·graph_nodes·rationale·imports/calls·index_entries) · `analyze`: 본문 일시 조회 → findings + requirements(엣지 없음) · `enrich`: **수동(settings/ai) 전용** → 파일 요약·concept 그래프·모듈 요약. `enrich`는 push로 인큐되지 않는다.

### 3.2 실제 노드 분류 (graph_nodes.kind 화이트리스트 6종 중 프로덕션 writer 4종)

| kind             | 생성                          | 시점        | 비고                                                                                           |
| ---------------- | ----------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| artifact         | `apply_repository_scan`       | scan        | label = path; 하위 분류 `adr/agents/claude/code_metadata/cursor_rule/skill/spec/todo_progress` |
| rationale        | 동 함수 ← `extractRationales` | scan        | `code_metadata`만; 맵에서 `type="document"`로 **고정**(`workspace-map.ts:369-373`)             |
| requirement      | `reconcileRequirements`       | analyze     | 마크다운만; **엣지 0**                                                                         |
| concept          | `apply_concept_graph`         | enrich(LLM) | system/api/concept                                                                             |
| evidence·finding | —                             | —           | writer 없음 / 별도 테이블                                                                      |
| **symbol**       | —                             | —           | **존재하지 않음** — `exported_symbols` jsonb·`index_entries.symbols`에만                       |

### 3.3 실제 엣지 분류 (relation 15종 중 writer 3곳)

| relation                                                 | 방향                                      | tier                       | writer                                                                                                                                                                         |
| -------------------------------------------------------- | ----------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `references`                                             | rationale → artifact                      | resolved                   | scan SQL                                                                                                                                                                       |
| `imports` / `calls`                                      | **파일 → 파일**(심볼은 provenance에 ≤8개) | resolved / reference       | scan SQL ← `code-links.ts`(TS: 모듈 해석·import 바인딩 호출; Python: import만, calls 항상 빈 배열, 루트 기준 해석; **Go: 링크 파서 미연결 → 엣지 0**; 외부 패키지 지정자 무시) |
| 7동사(part_of…implements)                                | concept → concept∣artifact                | inferred 0.5               | enrich SQL                                                                                                                                                                     |
| `co_changed` / agent 주장                                | 읽기 시점 유도(행 없음)                   | reference / agent_asserted | `workspace-map.ts:443-498`                                                                                                                                                     |
| `requires`·`tests`·`supports`·`contradicts`·`supersedes` | —                                         | —                          | **한 번도 쓰이지 않음**                                                                                                                                                        |

### 3.4 분류·facet 규칙

- 분류는 경로·파일명 글롭만(`repository-scanner.ts:157-215`). `README.md`·`docs/architecture.md`·`CONTRIBUTING.md` → null → **아티팩트 아님**(파일럿 실측 `wave-2-todo-5-pilot.md:71`). `.sql .prisma .css .json .yaml .toml .tf .java .rb .rs .php .vue .svelte Dockerfile` → 아티팩트 아님.
- facet: `apps/web/`=frontend, `apps/`·`packages/`=backend, `spec/ docs/ tests/ 루트파일`=shared, 그 외 `unclassified`. `page`는 `apps/web/app/`으로 시작할 때만. `deriveBrainArea`가 `unclassified`를 **backend로 흡수**(`artifact-facets.ts:92`). `database` 도메인 없음. 설정 파일·DB 설정 **없음**(`artifact-facets.ts:3-10` 주석: 읽기 시점 유도, 지어내지 않음 — ADR-013 동등성).

### 3.5 제외·한도·증분

1 MiB 파일 상한, 바이너리 제외, 서브모듈·심링크 제외, 픽스처 디렉터리 제외, 트리 100,000 엔트리, 로컬 플랜 artifacts ≤100k·codeLinks ≤200k. **스캔당 노드 상한 없음**, 읽기 상한 `NODE_LIMIT 2000`·`EDGE_LIMIT 6000`·클러스터 임계 600. 증분: 커밋 동일→no-op, blob sha 동일→fetch 생략, digest 동일→unchanged, 삭제는 노드 삭제+FK 캐스케이드, 스캔 파일의 진출 엣지 delete→재기록. GitHub·CLI 두 경로가 같은 SQL 함수(ADR-013).

### 3.6 enrich 산출물 — "LLM 위키"는 아니다

파일 요약(40–1,500자, 개행·코드펜스·축자 인용 금지 — 하드룰 ③의 구현)·concept 요약(≤600자)·모듈 산문(`module_summaries`, 노드 아님). 노출: MCP `get_artifact/get_node_content/search_index.excerpt`, `explain_module/repo_overview`; 웹 UI에는 **0**(맵 인스펙터는 label/path/findingCount/neighbors만, `map-screen.tsx:659-703`). concept은 MCP `loadWorkspace`가 조회하지 않아 MCP에서 보이지 않는다(`supabase-store.ts:471-525`).

### 3.7 읽기 경로 결함(버그 성격)

`workspace-map.ts:583-587` artifacts 쿼리에 정렬이 없고 `graph_nodes`만 `created_at asc` — 둘 다 `limit 2000`이라 중형 레포에서 페이지가 어긋나면 매칭 실패 코드 노드가 `"document"`로 폴백(`:389`) → docs 밴드 팽창.

### 3.8 진단 — 확신도 순

① concept·requirement·rationale → `spec` → docs (`graph-model.ts:106-114`) ② requirement 엣지 0 ③ 문서→코드 브리지 writer 없음 ④ 심볼 비노드 + `(kind,src,tgt)` 집계라 `utils.ts` 초고차수 헤어볼, 계층 축 없음 ⑤ 비모노레포 레이아웃 → 밴드 2개로 붕괴, database 없음 ⑥ 언어 비대칭(Go 엣지 0, Python calls 0·`backend/` 해석 0, SQL/README 비아티팩트) ⑦ 페이지 어긋남 폴백 ⑧ 기본 `groupByArea=false`, 600 초과 시 `type:grade` 15개 슈퍼노드를 **인접 인덱스 사슬**로 잇는 임의 구조(`graph-model.ts:454-465`) ⑨ enrich 미실행 시 의미 레이어 0.

---

## 4. 코드 감사 C — MCP 22툴 · CLI · 온보딩 · 벤치

### 4.1 표면 요약

22툴(읽기 16 · 메타데이터 쓰기 6, `readOnlyHint` 정확, 레포 변경 툴 0 — 계약 테스트가 강제), 리소스 5종, 프로토콜 `2026-07-28` 핀·legacy reject·`POST /api/mcp`만(SSE/DELETE 없음 = 완전 stateless), Bearer 워크스페이스 토큰(해시 저장), 스코프 `mcp:read/write`, **레이트 리밋 없음**, CORS 없음(서버-투-서버). 과금 툴은 `explain_module`(1크레딧/BYOK 0)만. `record_note`는 읽는 코드가 없는 write-only 데드엔드.

### 4.2 지시 블록(`apps/web/lib/mcp/instruction-blocks.ts:24-37`) vs 최소 인덱스 PR(`minimal-index.ts:45-53`)

지시 블록은 "get_graph_schema → repo_map → search_nodes → get_neighbors/trace_path → get_node_content, 끝날 때 memory_write/assert_link/record_ruled_out"(그래프 우선·id-first)을, 최소 인덱스는 "코딩 전 `request_context_pack`"을 지시한다. **두 워크플로가 다르고 서로를 언급하지 않는다.** 최소 인덱스 PR의 GitHub 콜백 3개는 `throw new Error("GitHub contents:write decision is unresolved.")`(`settings/mcp/actions.ts:206-214`)라 실제 PR은 열리지 않는다(diff 미리보기만).

### 4.3 기존 레포 인제스트 경로 — 첫 스캔 트리거 규명

| 경로                        | 결과                                                                                                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub App 설치 + 레포 연결 | `connect-repository.ts`·`onboarding-store.ts`는 `repositories` upsert + 감사 이벤트만. **스캔 인큐 없음.** `enqueue_job('scan'/'analyze')`는 `ingest_github_webhook_event`(`202608100004:511-520`)에서만 → push/check_run/workflow_run 웹훅이 와야 한다. `installation` 이벤트는 revoke만 처리 |
| `alrescha push` CLI         | `apply_repository_scan` 동일 SQL로 artifacts·graph_nodes·index_entries·imports/calls까지 채움. 그러나 `ensure_local_repository`가 `installation_id`를 넣지 않아 워커 소스 팩토리(`run-local.ts:144-151`, `join github_installations`)가 throw → **analyze·enrich 영원히 불가**                 |
| 수동 "스캔 지금"            | **존재하지 않음.** 유일한 수동 잡은 enrich(`settings/ai/actions.ts:74-123`), 이미 스캔된 아티팩트 전제                                                                                                                                                                                         |

→ 오늘 완성된 레포를 그래프로 만드는 완전한 경로는 **더미 커밋을 푸시해 웹훅을 발화시키는 것**뿐이다.

### 4.4 벤치 판정과 기법 실측

- graph-surface v1(96시행): 파일 탐색 4.479턴/PASS 0.854 vs 그래프 6.5턴/0.771 — NOT MET. v2: 턴 +2.313, PASS −12.5pp. 모델별 갈림: sonnet은 그래프군이 품질 우위·토큰 −25%(0.875 vs 0.833, 537k vs 712k), luna는 턴 캡 소진(정지 문제). **토큰은 이기고 턴·정확도는 진다.**
- 기법 실측(3반복, `techniques.real.md`): id-first −26.84% 토큰·−2.78pp 회수율 → **off**, static-prefix off, lazy-tool-definitions off, compaction-safe-session on(+16.3pp). 제품은 기법 플래그를 소비하지 않으며(전부 off·바이트 불변) 동시에 지시 블록은 id-first를 강제한다.
- v3 후보(미착수): 지시 블록이 **설치된 상태**의 표면을 측정(`followups-2026-08-25.md` §3).

### 4.5 공백(사용자 목표 대비) — 하드룰 준수 설계는 `BUILD_PLAN_PHASE4.md` Wave C·D

연결 시 백필 스캔 없음 · 온디맨드 스캔 툴 없음 · 문서 페이지 노드/잡/라우트 없음 · 웹 UI 산문 0 · concept이 MCP에 비노출 · 로컬 우선 모드 없음(`InMemoryMcpStore`는 export만) · 레포별 설정 없음 · enrich 크레딧 게이트로 첫인상이 빈 화면 · 22툴 정의 비용(OQ-024).

---

## 5. 외부 생태계 조사 (2026-09-03 조회, ★는 조회 시점 GitHub 스타)

### 5.1 랭킹 표

| 프로젝트                          | ★                     | 라이선스       | 분류     | 한 줄                                                           | 채택할 핵심 아이디어                                                                                                                                                                                                                   |
| --------------------------------- | --------------------- | -------------- | -------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| obra/superpowers                  | 280.7k                | MIT            | C 스킬   | 에이전트 스킬 프레임워크·개발 방법론                            | 스킬을 "언제 쓰는가" 트리거로 서술, 훅으로 강제 — 지시 블록 개정 참조                                                                                                                                                                  |
| github/spec-kit                   | 133k(미검증 120–133k) | MIT            | C 스킬   | 스펙 주도 개발 툴킷                                             | `spec → plan → tasks` 파일 규약 — 우리 `spec/`·`todo_progress` 분류의 인식 대상 추가                                                                                                                                                   |
| Graphify-Labs/graphify            | 114.2k                | Apache-2.0/MIT | B KG     | 코드+문서+SQL+PDF → 지식그래프 스킬(v0.9.47, 2026-08-19)        | **SQL 스키마/PostgreSQL 인트로스펙션을 노드로**, `list_prs/get_pr_impact/triage_prs`, **PreToolUse 훅 strict mode**(파일 읽기 차단→그래프 유도), 그래프 병합·크로스 프로젝트                                                           |
| thedotmack/claude-mem             | ~90k(미검증 46–93k)   | —              | C 메모리 | 세션 기록 압축·재주입 플러그인                                  | 세션 종료 시 압축 요약을 **프로젝트 메모리**로 — `memory_write` 자동 호출 훅 스니펫                                                                                                                                                    |
| Caveman(스킬)                     | 68.1k                 | —              | C 토큰   | 출력 토큰 −65% 압축 말투                                        | 우리 툴 출력의 compact 텍스트 기본값 정당화                                                                                                                                                                                            |
| eyaltoledano/claude-task-master   | 28k                   | —              | C 작업   | PRD→태스크 관리 MCP                                             | `todos` 표면과 겹침 — 가져오기 후보                                                                                                                                                                                                    |
| oraios/serena                     | 25.2k                 | MIT            | B 코드툴 | LSP 기반 심볼 툴 MCP(`find_symbol`, `find_referencing_symbols`) | **심볼 단위 툴 어휘** — 우리 심볼 노드 1급화의 툴 설계 참조                                                                                                                                                                            |
| AsyncFuncAI/deepwiki-open         | 17.9k                 | MIT            | B 위키   | 레포 → 위키·다이어그램·codemap                                  | **2-패스 codemap**(스켈레톤+인용 → 산문+mermaid 보강), 인용은 `[lines A-B]` 마커 기반 **축자 스니펫 강제**(우리는 본문 비저장이라 경로+스팬만)                                                                                         |
| steveyegge/beads                  | 17.1k                 | —              | C 메모리 | 에이전트용 이슈 트래커(그래프형 의존)                           | 이슈↔노드 앵커 — `todos`에 `anchor_node_id`                                                                                                                                                                                            |
| Planning-with-files(스킬)         | 17.7k                 | —              | C        | 파일시스템을 영속 메모리로                                      | `.alrescha/` 로컬 파일을 `todo_progress`로 인식(이미 H1)                                                                                                                                                                               |
| zilliztech/claude-context         | 11.8k                 | MIT            | B 검색   | BM25+벡터 하이브리드, AST 청킹, **Merkle 증분**                 | 증분은 blob sha로 충분(기존) — 하이브리드 검색은 비목표(임베딩 2단계)                                                                                                                                                                  |
| abhigyanpatwari/GitNexus          | 10k+                  | —              | B KG     | 제로서버 코드 KG(tree-sitter WASM, LadybugDB)                   | **노드 44종·관계 21종(CONTAINS/DEFINES/HANDLES_ROUTE/MEMBER_OF/STEP_IN_PROCESS)**, Leiden Community 노드, Route→Process 체인, `impact`의 `exact/lower-bound` 신뢰도 라벨, **브라우저 WASM tree-sitter 실사용(~5k 파일)** → OQ-019 근거 |
| blacksmithgu/obsidian-dataview    | 9.3k                  | MIT            | A        | 마크다운 메타데이터 색인 + DQL                                  | **"질의 가능한 메타데이터 레이어"** — frontmatter·inline field를 색인해 TABLE/LIST로 — `query_brain` 확장 모델                                                                                                                         |
| basicmachines-co/basic-memory     | 3.8k                  | AGPL           | A/C      | 마크다운 로컬 지식베이스 MCP                                    | 사람·에이전트 공용 마크다운 노트 — 우리 `doc_page`의 로컬 export 형식 후보                                                                                                                                                             |
| AIDotNet/OpenDeepWiki             | 3.6k                  | MIT            | B 위키   | 레포 → 문서 카탈로그·MCP                                        | 위키 카탈로그(목차) 생성 후 페이지별 생성 — 페이지 스코프 설계 참조                                                                                                                                                                    |
| ElsaTam/obsidian-extended-graph   | —                     | —              | A        | 네이티브 그래프 확장                                            | 노드 모양/이미지, 메타데이터 기반 크기, 다중 뷰 저장·전환, 핀, SVG 내보내기                                                                                                                                                            |
| Juggl / ExcaliBrain / Breadcrumbs | —                     | —              | A        | 로컬·계층 그래프                                                | **계층(부모/자식/형제) 5관계**, Breadcrumbs 타입드 링크 → `contains`·`implements` 방향 문법                                                                                                                                            |
| jackyzha0/quartz(graph)           | —                     | MIT            | D        | Pixi v8 + d3 웹 그래프                                          | §5.4 코드 패턴                                                                                                                                                                                                                         |
| vasturiano/force-graph            | —                     | MIT            | D        | Canvas 힘 그래프                                                | API 어휘(`zoomToFit`, `d3AlphaTarget`, `autoPauseRedraw`, 섀도 캔버스 히트)                                                                                                                                                            |
| pixi-viewport                     | —                     | MIT            | D        | Pixi 카메라 플러그인(drag/pinch/wheel/decelerate/clampZoom)     | v8 호환 미검증 — 직접 구현 권장                                                                                                                                                                                                        |
| Sigma.js v3                       | —                     | MIT            | D        | graphology WebGL 렌더러                                         | `nodeReducer/edgeReducer`로 호버 강조, 라벨 그리드(`labelGridCellSize`·`labelRenderedSizeThreshold`)                                                                                                                                   |

### 5.2 Obsidian Graph View 옵션 전수 (공식 도움말) — 패리티 체크리스트

| 그룹        | 옵션                                                                                        | Arr 현황                                                             |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Filters     | Search files(검색어) · Tags · Attachments · Existing files only · **Orphans**               | 검색·타입·등급 필터 ✓ / orphans 토글 ✗ / 태그 개념 ✗                 |
| Groups      | **검색어 → 색 그룹**(다중)                                                                  | ✗ (색은 타입 고정) — Wave B todo 9                                   |
| Display     | **Arrows**(방향) · **Text fade threshold** · Node size · Link thickness · Animate(타임랩스) | 라벨 페이드 슬라이더 ✓(팝인) / arrows ✗ / node size·link thickness ✗ |
| Forces      | Center · Repel · Link force · Link distance                                                 | ✓(데모만, `/app/map` ✗)                                              |
| Local graph | depth · incoming/outgoing · neighbor links                                                  | `localFocus` 있음, depth 슬라이더 ✗                                  |
| 상호작용    | hover 이웃 강조 · 클릭 열기 · 우클릭 메뉴 · 휠/+- 줌 · 드래그/화살표 이동                   | hover ✗ · 드래그(노드) ✗ · 휠 △                                      |

플러그인이 더한 "좋은 느낌": 핀(Extended Graph), 뷰 프리셋 저장(Extended Graph), 계층 관계 색/방향(Breadcrumbs/ExcaliBrain), 로컬 그래프 depth(Juggl).

### 5.3 코드 KG·위키 생성 — 패턴 카탈로그

| 패턴                                                                                                                | 출처                    | Arr 적용                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **계층 노드** Folder→File→Symbol + `CONTAINS`/`DEFINES`, Community 노드 + `MEMBER_OF`                               | GitNexus                | 폴더 노드·`contains`(결정론, resolved) → 힘장에 트리 구조 부여, 카테고리 그룹핑의 데이터 기반                             |
| Route/Tool 엔트리 → `HANDLES_ROUTE` → `STEP_IN_PROCESS` 체인(프로세스 라벨)                                         | GitNexus                | Next.js route 파일 → import 핸들러(TS resolved), FastAPI 데코레이터(reference 상한)                                       |
| impact 결과에 인식론적 신뢰도(`exact`/`lower-bound`)                                                                | GitNexus                | `impact_of` 응답에 티어 합계 병기(reference 비율)                                                                         |
| SQL 스키마·PG 인트로스펙션·매니페스트를 노드로                                                                      | Graphify v8             | `database` 도메인: `.sql/.prisma/migrations/` 분류 + 테이블명 심볼(정규식, reference)                                     |
| PR impact 툴(`get_pr_impact`)                                                                                       | Graphify                | 우리는 웹훅 diff를 이미 받음 → `detect_changes`형 툴은 Phase 5 후보                                                       |
| PreToolUse 훅 strict mode(파일 읽기 차단 → 그래프)                                                                  | Graphify                | **옵트인 훅 스니펫**만(강제는 벤치 §4.4의 정지 문제를 악화시킬 수 있음)                                                   |
| 위키 2-패스: 스켈레톤(인용 필수) → 산문+mermaid 보강; "컨텍스트에 없는 파일 경로 발명 금지, 부족하면 섹션을 줄여라" | DeepWiki-open           | `doc_page` = **저장된 산문(파일·모듈·concept 요약)의 조합**만 — 본문 재조회 없음 → 하드룰 ③ 자동 준수, 인용은 `path:span` |
| 카탈로그(목차) 먼저 → 페이지별 생성 → 번역·마인드맵                                                                 | OpenDeepWiki            | 페이지 스코프 = repo / module / concept 3종 고정                                                                          |
| 심볼 단위 툴 어휘(`find_symbol`, `find_referencing_symbols`)                                                        | Serena                  | 심볼 노드 1급화 후 `get_neighbors`가 심볼 레벨 지원                                                                       |
| Merkle/blob sha 증분                                                                                                | claude-context / Cursor | 이미 blob sha 캐시 — 유지                                                                                                 |

### 5.4 "Obsidian 감성" 렌더링 기술 체크리스트 (Quartz·force-graph·Pixi v8 1차 출처)

- **hover**: `updateHoverInfo`로 노드·링크 `active` 플래그 → 비활성 알파 0.2, **TweenJS 200ms** 트윈(Quartz). Sigma는 `nodeReducer`. → Arr: `hoveredNodeId` + 백엔드 알파 보간.
- **drag**: d3-drag `start`에서 `simulation.alphaTarget(1).restart()`, `fx/fy = 위치/transform.k`, 릴리즈 500ms 이내면 클릭으로 간주(Quartz). force-graph는 "드래그 시 시뮬레이션 리히트로 주변이 반응". → Arr: pin/unpin 프로토콜, `alphaTarget(0.3)`.
- **zoom**: d3-zoom `scaleExtent [0.25,4]`, transform을 `stage.scale/position`에 직접 적용(Quartz); force-graph `zoomToFit(ms, px)`·`centerAt(x,y,ms)`. → Arr: 커서 고정점 공식 + 트윈.
- **label fade**: `scaleOpacity = max((k−1)/3.75, 0)`(Quartz) — 줌 k의 연속 함수. → Arr: 노드별 픽셀 크기 램프.
- **forces**: `forceManyBody(-100·repel)`, `forceCenter(center)`, `forceLink(distance)`, **`forceCollide(r).iterations(3)`**, 선택 `forceRadial`(Quartz). d3 기본 `alphaDecay 0.0228`, force-graph `velocityDecay 0.4`, `cooldownTime 15s`, `autoPauseRedraw`.
- **Pixi v8**: `preference:"webgpu"`, `autoDensity`, `resolution: devicePixelRatio`(Quartz — 단 Arr는 DPR 변경 미추적); 라벨 Container `isRenderGroup: true`; **Graphics는 100포인트 이하만 배칭 — 대량은 Sprite**, `ParticleContainer`(100k+ 정적 속성), `BitmapText`가 동적 텍스트에 유리, `cullable`은 기본 off(앱 레벨 컬링 권장).
- **hit-test**: force-graph는 섀도 캔버스 고유색 인덱스; Arr는 `d3-quadtree`가 이미 의존 트리에 있음.

### 5.5 Graphify 변화(2026-08 이후) — 경쟁 인식 갱신

v0.9.41(08-12) 정확성·결정론 릴리스, v0.9.47(08-19). v8 플랫폼: 20+ 어시스턴트 always-on, SQL 스키마 인트로스펙션, 설정 파일(`.mcp.json`·매니페스트) 추출, 그래프 병합·글로벌 그래프, stdio+HTTP MCP(팀 공유), PR 트리아지 툴. **여전히 없는 것(우리 해자):** 요구사항↔구현↔테스트 드리프트, 커밋 영수증, 서버 관측 `verified`, 푸시 자동 분석, 라이브 발광, 팀 지표. **우리에게 없는 것:** SQL/설정 노드, PR 임팩트, 훅 강제, 다언어 37 grammars, 사람이 읽는 리포트(`GRAPH_REPORT.md`).

---

## 6. 융합 판정 — 채택 표

| #   | 채택 항목                                                                                                                  | 출처                              | 반영 위치(Phase 4)     | 판정                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------- | ------------------------------------------------- |
| F1  | 폴더 계층 노드 + `contains`, 심볼 노드 + `declares`(계층 LOD로 로드)                                                       | GitNexus, Serena                  | Wave A todo 3 / Wave F | ✅ 채택 / 심볼은 OQ-031 뒤                        |
| F2  | `database` 도메인 + SQL/Prisma/migrations 분류 + 레이아웃 관례 일반화 + `.alrescha.json`                                   | Graphify v8, 사용자 요구          | Wave A todo 4          | ✅                                                |
| F3  | 요구사항→코드 `implements`, 문서→코드 `references` 엣지 실기록                                                             | (내부 진단)                       | Wave A todo 1·2        | ✅ 최우선                                         |
| F4  | hover 트윈·드래그 리히트·커서 줌·collide·스크린 라벨·fit-to-view                                                           | Quartz, force-graph               | Wave B                 | ✅                                                |
| F5  | Obsidian 옵션 패리티(Groups by query, orphans, arrows, local depth, 뷰 프리셋·핀)                                          | Obsidian 도움말, Extended Graph   | Wave B todo 9          | ✅                                                |
| F6  | 연결 시 백필 스캔 + `request_rescan`                                                                                       | (내부 진단, WORK_SPEC §4.1)       | Wave C                 | ✅                                                |
| F7  | `doc_page` 노드 + `docpage` 잡 + `/app/docs` — 저장 산문 조합, 2-패스(구조→보강), 인용 `path:span`                         | DeepWiki-open, OpenDeepWiki       | Wave D                 | ✅ (OQ-033)                                       |
| F8  | Dataview식 질의 레이어(`query_brain` 확장: facet/kind/relation/hasSummary, TABLE 출력)                                     | Dataview                          | Wave D todo 15         | ✅                                                |
| F9  | 지시 블록·최소 인덱스 통일, id-first 완화, 옵트인 훅 스니펫(PreToolUse·SessionEnd→memory_write)                            | Graphify, claude-mem, superpowers | Wave E                 | ✅ (OQ-032)                                       |
| F10 | impact 신뢰도 라벨(`exact/lower-bound`)                                                                                    | GitNexus                          | Wave E                 | ✅ 경량                                           |
| F11 | tree-sitter WASM(브라우저·CLI 동일 바이너리)                                                                               | GitNexus 실사용                   | Wave F, OQ-019 재판정  | 🔶 수요 확인 후                                   |
| F12 | PR impact/triage 툴, 그래프 병합(멀티 레포)                                                                                | Graphify                          | Phase 5 후보           | 🔶                                                |
| —   | 벡터/하이브리드 검색(claude-context), 자체 tree-sitter 네이티브, 훅 strict 강제, 원본 코드 스니펫 저장(DeepWiki 축자 인용) | —                                 | —                      | ❌ 비채택(비목표·ADR-014·벤치 정지 문제·하드룰 ③) |

---

## 7. 가드레일·ADR 충돌 판정

| 항목                                                        | 판정                                                                                                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 하드룰 ③ 원본 코드 비저장 vs 위키 페이지                    | **무충돌** — `doc_page` 본문은 이미 저장된 산문의 조합만, 코드 스니펫 없음, 인용은 `path:span`. `EnrichValidationError`(축자 인용 거부) 상속                               |
| 하드룰 ⑤ 항상-로드 컨텍스트 금지 vs 위키                    | **무충돌** — 웹 라우트·그래프 노드·MCP 주문형 서빙이며 레포 파일로 커밋하지 않음. §1.6 ② "정적 파일에 인라인 금지" 문구와 정합. 스펙 문구 보강은 OQ-033                    |
| 하드룰 ② provenance vs `contains`·`implements`·`references` | 준수 — `contains`는 `{reason:"path containment", tier:"resolved"}`(경로는 결정론 사실), `implements/references`는 문서 span + tier `reference`(≤0.6)                       |
| 하드룰 ① verified vs 문서→코드 링크                         | 정규식/경로 매칭은 절대 `verified` 아님. `tests` 관계로 승격되는 import 엣지는 `executionEvidenceIds` 요구 로직(`workspace-map.ts:338-345`)이 보호 — 테스트로 고정         |
| ADR-013 동등성 vs `.alrescha.json`                          | 레포 **내** 파일이면 두 경로가 같은 커밋에서 같은 설정을 본다 → 유지. DB 설정은 CLI가 못 보므로 기각. "읽기 시점 유도" 원칙과의 관계는 OQ-034(설정을 커밋 sha에 묶어 저장) |
| ADR-014 / OQ-019 vs 심볼·다언어                             | Wave A~E는 tree-sitter 없이 진행(TS resolved, Python/Go/SQL reference 상한). WASM 판정은 Wave F로 분리                                                                     |
| ADR-015 vs 백필 스캔                                        | 무충돌 — scan/analyze는 서버가 GitHub에서 직접 읽음(`enqueue_job`이 credit≠0 거부 → 구조상 0크레딧)                                                                        |
| 하드룰 ⑥ MCP stateless vs `request_rescan`/`request_docs`   | 잡 큐가 상태를 소유(`explain_module`의 pending/ready/stale 선례). 레포 변경 아님 → "레포 변경 툴 금지" 무저촉. `readOnlyHint:false`로 정직 표기                            |
| 하드룰 ⑦ 과금 vs `docpage` 잡                               | `enrich` 라이프사이클 상속(예약→정산/환불, 실패 무과금, BYOK 0), 새 과금 경로 금지                                                                                         |
| ADR-012 vs 효율 주장                                        | Phase 4 문서·사이트에 새 수치 없음. v3 벤치 통과 전 게시 금지 유지                                                                                                         |

---

## 8. 출처

**내부:** `apps/web/lib/graph/*`, `apps/web/app/ui/brain-map*.tsx`, `apps/web/lib/map/workspace-map.ts`, `apps/web/lib/dashboard/graph-model.ts`, `packages/core/src/ingest/{repository-scanner,artifact-facets,code-links,local-ingest}.ts`, `apps/worker/src/{postgres-analysis-store,enrich-job,run-local}.ts`, `packages/mcp/src/*`, `apps/web/lib/mcp/instruction-blocks.ts`, `supabase/migrations/2026081000{02,04}*.sql`·`20260823000{2,4}*.sql`·`20260824000{1,2}*.sql`, `.omo/evidence/perf/midterm-wave-1.md`·`mt-4.md`, `.omo/evidence/phase3/*`, `.omo/evidence/phase2c/wave-2-todo-5-pilot.md`, `benchmarks/graph-surface/results.v{1,2}.md`, `benchmarks/databrain/techniques.real.md`, `spec/OPEN_QUESTIONS.md` OQ-019~024.

**외부(2026-09-03 조회):**

- Obsidian Graph view 도움말 — https://obsidian.md/help/plugins/graph
- Graphify — https://github.com/Graphify-Labs/graphify · https://graphify.com/changelog
- GitNexus ARCHITECTURE — https://github.com/abhigyanpatwari/GitNexus/blob/main/ARCHITECTURE.md · https://blog.pebblous.ai/blog/gitnexus-code-knowledge-graph-2026/en/
- DeepWiki-open — https://github.com/AsyncFuncAI/deepwiki-open · `api/prompts.py`
- OpenDeepWiki — https://github.com/AIDotNet/OpenDeepWiki
- Serena — https://github.com/oraios/serena · claude-context — https://github.com/zilliztech/claude-context (스타: https://rywalker.com/research/code-intelligence-tools)
- Dataview — https://github.com/blacksmithgu/obsidian-dataview
- Extended Graph — https://github.com/ElsaTam/obsidian-extended-graph · Juggl — https://github.com/HEmile/juggl · ExcaliBrain — https://github.com/zsviczian/excalibrain · Breadcrumbs — https://community.obsidian.md/plugins/breadcrumbs
- basic-memory — https://github.com/basicmachines-co/basic-memory · claude-mem — https://github.com/thedotmack/claude-mem (스타 범위: https://www.star-history.com/thedotmack/claude-mem/)
- superpowers — https://www.star-history.com/obra/superpowers/ · spec-kit — https://github.com/github/spec-kit · beads — https://github.com/steveyegge/beads · claude-task-master — https://github.com/eyaltoledano/claude-task-master · 스킬 랭킹 — https://designrevision.com/blog/best-claude-code-skills
- Quartz graph — https://github.com/jackyzha0/quartz/blob/v4/quartz/components/scripts/graph.inline.ts
- force-graph — https://github.com/vasturiano/force-graph/blob/master/README.md
- Pixi v8 성능 — https://pixijs.com/8.x/guides/concepts/performance-tips · https://pixijs.com/blog/particlecontainer-v8
- Sigma.js 커스터마이징 — https://www.sigmajs.org/docs/advanced/customization/
- pixi-viewport — https://viewport.pixijs.io/jsdoc/Viewport.html
- tree-sitter web binding — https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web

미검증 표기: 스타 수는 조회 시점 검색 결과 기반이며 범위로 표기한 항목은 출처 간 불일치.
