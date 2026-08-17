# 연구 보고: Obsidian식 그래프 대시보드 + 에이전트용 그래프 지식 + 토큰 효율 (2026-08-14)

> RESEARCH_AGENDA §1·§2 대응 조사 결과 (리서치 에이전트, 웹 1차 출처 검증). 요약 결론:
>
> 1. **렌더 스택 확정 근거**: Obsidian 본가 = d3-force 계열 시뮬레이션 + Pixi.js(WebGL) 렌더 분리, LOD는 "라벨 페이드"의 단순 2단계, CPU 한계 ~1만 노드. → **Arr 추천: graphology + d3-force(Web Worker) + Pixi.js v8**, 발광은 위치 버퍼와 분리된 glowIntensity 셰이더 레이어 (리레이아웃 없음).
> 2. **에이전트의 그래프 활용은 조건부로 강력**: 멀티홉·관계형 질의에서 +10.5%p(LocAgent, ACL 2025)·비용 -86%, 단 단순 조회까지 그래프로 보내면 오히려 손해 → **질의 라우팅** 필수. Arr의 도메인(요구사항↔코드↔테스트 추적)이 바로 그래프가 이기는 영역.
> 3. **MCP 그래프 툴 스케치**: `search_nodes` / `get_neighbors` / `trace_path` / `get_node_content` / `impact_of` — ID-first, 본문은 2단계.
> 4. **토큰 효율 Top 5**: ID-first 계층 로딩 · 프롬프트 캐싱 · 툴 정의 지연 로드 · 그래프 라우팅 · compaction-safe 세션 — 각각 A/B 측정안 포함.

---

# Arr 리서치 리포트: Obsidian식 그래프 대시보드 + AI 에이전트용 그래프 지식

작성일: 2026-08-14. 웹 검색으로 1차 소스를 확인했으며, 검증 불가 항목은 "미검증"으로 표기.

## 1. Obsidian Graph View의 구현 방식

### 렌더러 기술

- **Pixi.js (WebGL) 렌더링**이 핵심. Obsidian CTO(Silver)가 공식 포럼에서 확인: 초기 d3.js(SVG)로는 수천 노트에서 성능 부족 → Pixi.js(WebGL) 전환. (https://forum.obsidian.md/t/what-is-the-tech-stack-currently/833/5)
- 힘 시뮬레이션은 d3-force 계열 유지 + 렌더만 WebGL 분리 구조로 추정 (내부 구현 비공개 — 미검증).

### 조정 가능한 힘 파라미터 (공식 도움말)

- Center force(중앙 인력) · Repel force(반발) · Link force(링크 인력) · Link distance(링크 거리) — 전형적 d3-force 구성. (https://help.obsidian.md/plugins/graph)

### LOD 동작

- **Text fade threshold**: 줌 레벨 기준 라벨 페이드 단일 슬라이더. 정교한 클러스터링이 아니라 "라벨 페이드 + 연결수 비례 노드 크기"의 **단순 2단계 LOD**가 Obsidian 특유의 별자리 미학을 만듦.

### 성능 한계

- 실용 한계 ~1만 노트 (5만 노트에서 심한 랙 보고). 커뮤니티 플러그인은 물리엔진 Web Worker 분리(Advanced Graph View, 1만+ 노드 50fps)·Rust+WASM Barnes-Hut(obsidian-3d-graph, 5만+ 60fps 주장 — 미검증)로 돌파.

### 참고 오픈소스

Quartz 5(웹 그래프 뷰) · Juggl(Cytoscape) · d3-force+Pixi 최소 예제(Observable) · mkdocs-obsidian-interactive-graph.

**핵심 교훈**: ① 시뮬레이션·렌더 분리 ② 물리는 Worker ③ LOD는 라벨 페이드로 충분 ④ CPU 한계 ~1만 노드.

## 2. 대규모 그래프 시각화 베스트 프랙티스 (500–5,000 노드)

### 렌더러 한계

SVG ~500 노드 · Canvas 2D ~2–5천(글로우 비쌈) · WebGL 수만+ (2025 학술 비교: https://pmc.ncbi.nlm.nih.gov/articles/PMC12061801/)

### 라이브러리 비교

| 라이브러리        | 레이아웃                              | 렌더         | 특징                                                  |
| ----------------- | ------------------------------------- | ------------ | ----------------------------------------------------- |
| Sigma.js v4       | graphology + ForceAtlas2(Worker/WASM) | WebGL        | 라벨 그리드 셀렉션 성숙, @react-sigma                 |
| cosmos.gl         | GPU 셰이더 힘 계산                    | WebGL        | 수십만 노드, MIT                                      |
| react-force-graph | d3-force(CPU)                         | Canvas/WebGL | 도입 쉬움, ~5천 노드                                  |
| React Flow        | 수동                                  | DOM/SVG      | 힘 그래프 부적합 — **Arr 대시보드 그래프에는 부적합** |

- d3-force: 링크 거리 제어 직관적, Obsidian 감성(스프링). ForceAtlas2: 대규모 군집 표현. 5천 이하는 둘 다 Worker 실시간 가능.

### 라벨 디클러터링 (사실상 표준 = Sigma 방식)

화면 그리드 셀당 최상위 라벨 1개만, 픽셀 크기 미달 노드는 라벨 생략 (`label_grid_cell_size`, `label_density`, `label_rendered_size_threshold`).

### 리레이아웃 없는 실시간 발광

레이아웃 갱신과 시각 상태 갱신 완전 분리 — per-node `glowIntensity` attribute만 GPU 버퍼 부분 업데이트 + 시간 유니폼으로 셰이더 펄스. Pixi면 additive blending 글로우 스프라이트가 저비용 대안.

### Next.js 추천 스택 (결론)

**1순위: graphology + d3-force(Web Worker) + Pixi.js v8 + dynamic import(ssr:false).**
근거: Obsidian 본가 계열이라 감성 재현 직접적, 5천 노드에 GPU 레이아웃 불필요, 글로우 셰이더 자유도 최고. **차선**: 개발 속도 우선 시 Sigma.js + @react-sigma. 5만+ 확장 확실 시 cosmos.gl.

## 3. AI 에이전트에게 그래프 구조가 도움이 되는가

### 긍정 (독립 학술)

- **LocAgent (ACL 2025)**: 코드 그래프 + `SearchEntity`/`TraverseGraph`/`RetrieveEntity` 툴 → 파일 로컬라이제이션 92.7%(그래프 無 대비 **+10.5%p**), 파인튜닝 32B로 SOTA급을 **-86% 비용**에, 이슈 해결 Pass@10 +12%. (https://arxiv.org/abs/2503.09089)
- **CodexGraph (NAACL 2025)**: Neo4j+Cypher 코드 그래프 — BM25·임베딩 상회. (https://aclanthology.org/2025.naacl-long.7/)
- **CGM**: 그래프 통합 모델 SWE-bench Lite 43.0%. **GraphRAG-Bench (ICLR 2026)**: 태스크 유형별 체계 평가 벤치 등장.

### 부정·조건부 (중요)

- 단순 조회는 그래프가 손해: recall↑(84.3% vs 71.8%)이지만 relevance 급락(38.5% vs 62.9%) 사례. 단일 홉은 벡터/grep 우세, **멀티홉·관계형에서만 그래프 역전**(Recall@5 73.4%→87.8%) → **질의 라우팅/하이브리드가 권장**. (https://arxiv.org/pdf/2510.10114)

### 벤더 주장 (미검증)

codebase-memory-mcp ~120x 토큰 절감 등 — 자체 벤치마크, 독립 평가 부재.

**결론**: 멀티홉(호출 체인·영향 분석·요구사항↔테스트 추적)에서 그래프 툴은 정확도·토큰 모두 이득 (독립 연구 뒷받침). 전 질의 그래프 강제는 금지 — grep/검색과 병행 라우팅. Arr의 가치제안과 정확히 부합.

## 4. 컨텍스트 효율화 최신 기법 (2026 중반)

- **Anthropic**: just-in-time 검색(식별자 먼저) · compaction · 구조적 노트 · 서브에이전트 요약 회수 · **Tool Search(defer_loading)** — 툴 정의 온디맨드 로드로 토큰 85% 절감 + 툴 선택 정확도 +8.6%p (https://www.anthropic.com/engineering/advanced-tool-use) · **Code Execution with MCP** — 150K→2K 토큰(98.7%) 사례.
- **OpenAI**: **서버사이드 compaction** (2026-02, `context_management.compact_threshold`) — 스트림 내 자동 압축. (https://developers.openai.com/api/docs/guides/compaction)
- **Google**: Gemini context caching (캐시 토큰 90% 할인 + 스토리지 과금).
- 실무 스택: 정적 프리픽스 캐싱 → 툴 지연 로드 → JIT 계층 검색 → 자동 compaction → 서브에이전트 요약.

## 5. Arr 적용 제안

### ① 렌더 스택 + 인터랙션 스펙

스택: graphology + d3-force(Worker) + Pixi.js v8. **줌 LOD 3단계**: Far(라벨 0~허브만, 발광 점) / Mid(그리드 라벨 셀렉션 + text fade 슬라이더) / Near(전 라벨 + 상태 뱃지). **클러스터링**: 3천 노드 이하 원본 렌더(Obsidian 미학), 3천+ Far 줌에서만 폴더/모듈 슈퍼노드 접기(레이아웃 재계산 없음). **뉴런 글로우**: glowIntensity attribute + 지수 감쇠(~1.5s) + 이웃 엣지 additive 전파, 이벤트 100ms 코얼레싱.

### ② MCP 그래프 툴 (관계형 전용 + 기존 검색 병행)

| 툴                 | 입력                                     | 반환                                        |
| ------------------ | ---------------------------------------- | ------------------------------------------- |
| `search_nodes`     | query, types?, limit                     | 노드 ID+1줄 요약 (본문 없음)                |
| `get_neighbors`    | node_id, edge_types?, direction, depth≤2 | 이웃 ID+관계+요약                           |
| `trace_path`       | from_id, to_id, edge_types?              | 최단 경로 (요구사항→코드→테스트 추적)       |
| `get_node_content` | node_id, range?                          | 본문 (명시 요청 시, truncation 기본)        |
| `impact_of`        | node_id                                  | 역방향 의존 폐쇄 (변경 영향 — 보증 킬러 툴) |

원칙: 범용 쿼리 언어 대신 의도 명확한 최소 툴셋, ID-first, defer_loading 대응. 에이전트의 그래프 읽기가 곧 발광 이벤트.

### ③ 토큰 효율 Top 5 + A/B 측정

| #   | 기법                         | 기대 효과                     | 측정                      |
| --- | ---------------------------- | ----------------------------- | ------------------------- |
| 1   | ID-first 계층 로딩           | 입력 토큰 3–10x↓              | 전문 vs ID+요약 조건 비교 |
| 2   | 프롬프트 캐싱(cache_control) | 비용 최대 90%↓                | 전후 청구 비교            |
| 3   | 툴 정의 지연 로드            | 첫 턴 수만 토큰 제거, 오호출↓ | 전체 vs 지연 로드         |
| 4   | 그래프 라우팅(멀티홉만)      | 멀티홉 +10%p대                | grep/graph/라우팅 3조건   |
| 5   | compaction-safe 장기 세션    | 완주율↑                       | 30+턴 유/무 비교          |

공통 지표 5축 고정: 정답률 / 토큰(입·출) / 툴콜 / 지연 / $비용.

### 주요 출처

Obsidian 포럼(공식 스택 확인)·공식 도움말 / Sigma.js v4·cosmos.gl·렌더러 비교 논문(PMC12061801) / LocAgent·CodexGraph·CGM·GraphRAG-Bench·LinearRAG(부정 근거) / Anthropic context engineering·advanced tool use / OpenAI compaction 가이드 / MCP code-first 재현.
