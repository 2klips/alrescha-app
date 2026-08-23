# arr-app — Phase 3 Work Plan: 지식그래프 중심 재편 — 레포 로드 · KG 구축 · Graph view · 에이전트 기록

> **방향 수정(사용자 지시, 2026-08-23):** 제품의 최우선 축을 지식그래프(Data Brain)로 재편한다. MVP = "GitHub에서 선택한 레포를 로드 → AI로 지식그래프 구축 → Graph view로 확인(+ MCP로 유저의 AI 에이전트가 기록)". 그 다음 홈페이지 전체 리뉴얼, 벤치마킹은 마지막. 근거 조사는 `RESEARCH_KG_FUSION_2026-08-23.md`(codebase-memory-mcp·Graft·논문 융합 판정).
> Governing decisions: `DECISIONS-ADR.md` — ADR-015(로컬 인제스트는 그래프 전용), ADR-014(tree-sitter 미채택 — 단 OQ-019에서 재판정 예약), ADR-013(메타데이터 전용 인제스트), ADR-012(동결 실험 통과 전 정확도 주장 철회), ADR-001(AI 산출물은 전부 `inferred`).
> 충돌 우선순위: ADR = WORK_SPEC > 이 계획 > GUIDE. 드리프트 검증·receipt는 **제거가 아니라 후순위 유지** — 기존 테스트·가드레일은 그대로 green이어야 한다.

## TL;DR (For humans)

Phase 2C 실기 파일럿으로 GitHub install → push → scan → **graph_nodes 370개**까지 실물 완주가 이미 증명됐다. 그러나 ⑴ 그래프 뷰(`/map`)는 아직 픽스처만 렌더하고 ⑵ 그래프에 코드 구조 엣지(import/call)가 없고 ⑶ AI 개념 레이어가 없다. Phase 3는 이 세 구멍을 막아 MVP를 완성한 뒤(Wave A–D), 홈페이지를 지식그래프 중심 메시지로 리뉴얼하고(Wave E), 벤치마킹으로 끝낸다(Wave F). 참고 프로젝트에서 채택하는 것: Graft의 2-패스 빌드(구조는 무료·결정론, AI는 해시 캐시로 변경분만), CBM의 엣지 분류학·툴 인체공학, 논문의 개인화 PageRank 검색과 Mem0/Graphiti식 쓰기 재조정.

**Effort:** XL (6 waves) · **Risk:** Medium — 신규 표면(그래프 뷰 실데이터·enrich 잡)은 기존 가드레일 아래 추가되며, 하드룰(원본 비저장 등)과의 충돌 판정은 리서치 문서 §4에서 완료.

**Decisions locked (do not relitigate):**

- 코드 발췌(Graft의 body_text/crux)는 **저장하지 않는다** — 산문 요약·시그니처·스팬만 메타데이터로 저장, 본문은 transient fetch로만 서빙(하드룰 유지).
- AI 개념 패스는 여섯 번째 잡 종류 `enrich`로 편입 — coach 선례대로 기존 크레딧 라이프사이클 상속, 새 과금 경로 금지.
- 개념 관계 동사는 폐쇄 7종(`part_of·uses·depends_on·produces·configures·validates·implements`) — 모호하면 링크 폐기(Graft 판정 그대로).
- 구조 엣지 신뢰도 2티어: `resolved`(타입/임포트 해석) > `reference`(이름 매칭). AI 합성 엣지는 `inferred`, 에이전트 기록은 `agent_asserted`. 시각화에서 `inferred`/`agent_asserted`는 점선.
- 자체 효율 수치는 벤치 v3 통과 전 게시 금지(ADR-012). 외부 수치는 출처 병기 인용만.
- 순서는 사용자 지시 고정: MVP(A–D) → 홈페이지(E) → 벤치마킹(F). 배포(구 2C Wave 4)는 G4가 열리는 시점에 E 전후로 끼워넣을 수 있다.

---

## 상태 스냅샷 — 이 계획을 처음 받은 에이전트를 위해

**이미 있는 것 (재구현 금지, 확장만):**

- GitHub App install → 레포 선택 → push webhook → scan 잡 → `graph_nodes`/`artifacts` 저장까지 실기 완주(`.omo/evidence/phase2c/wave-2-todo-5-pilot.md`). 스캐너는 `packages/core/src/ingest/repository-scanner.ts` — 심볼(TS 컴파일러 API)·rationale 추출, 증분 diff, 본문 비저장.
- 그래프 렌더 엔진 `apps/web/lib/graph/`(graphology + d3-force Worker + Pixi.js, Louvain, glow) — 단 `/map`은 픽스처 데이터.
- 호스티드 MCP 15툴(`packages/mcp/src/hosted.ts`) — 읽기(search/traverse/trace/impact) + 메타데이터 쓰기(record_note/record_prompt/record_ruled_out/log_progress). `access_events` → 그래프 glow 실시간 배선 존재.
- 잡 큐 + 크레딧 원장(scan/analyze 0크레딧, judge/coach 과금·실패 무과금·BYOK 0크레딧).
- analyze → findings → receipt 파이프라인(후순위 유지 기능, 건드리지 않음).

**게이트:** G1(로컬 Supabase)·G2(GitHub App) **열림**. G3(AI 크레딧) — Wave C·F 필요. G4(배포 계정+도메인) — 배포 시점. OQ-017(GitHub 로그인)은 여전히 open — MVP 데모는 이메일 세션으로 우회 가능하나 공개 전 판정 필요.

**세션 규약(AGENTS.md):** 한 세션에 한 웨이브. todo당 커밋 + `.omo/evidence/phase3/` 기록. 종료 시 lint/typecheck/vitest/Playwright green + `scripts/verify-scope-boundaries.ts` PASS.

### 세션 시작 프롬프트 템플릿 (사용자가 복사해서 사용)

```
arr-app 레포에서 Phase 3을 이어간다.
1. spec/IMPLEMENTATION_GUIDE.md → spec/WORK_SPEC.md → spec/RESEARCH_KG_FUSION_2026-08-23.md → spec/BUILD_PLAN_PHASE3.md를 읽어라.
2. BUILD_PLAN_PHASE3의 체크박스와 git log·.omo/evidence/phase3/으로 진행 상태를 파악하라.
3. 이번 세션 범위: Wave {N}. 게이트가 닫혀 있으면 건너뛰고 보고하라.
4. 각 todo는 수용 기준을 테스트로 통과시켜야 완료다. 완료 시 체크박스 갱신 + evidence 기록 + todo당 1커밋.
```

---

## Wave A — 그래프 뷰 실데이터 배선 _(게이트 없음 — 지금 시작 가능)_

MVP의 "확인" 단계부터 막는다: 파일럿이 만든 실데이터 370노드를 사용자가 실제로 **본 적이 없다**.

- [x] **1. `/app/map` — 실데이터 그래프 뷰** _(2026-08-23 완료 — 발견 2건: rationales authenticated grant 누락 → `202608230001`, 로더 order 컬럼 오류는 PGlite가 원리적으로 못 잡아 로컬 Supabase 프로브+e2e로 커버. `.omo/evidence/phase3/wave-a-todo-1.md`)_
      `apps/web/lib/map/`에 Supabase 로더 신설(`graph_nodes`+`edges` → 렌더 엔진 입력 모델). 기존 `/map`(데모)과 분리된 인증 라우트 `/app/map`. 빈 워크스페이스는 데모 폴백이 아니라 "그래프 없음 — 레포를 연결하세요" 빈 상태. glow(`access_events`)는 실워크스페이스 이벤트로 배선.
      수용 기준: 로더 단위 테스트(실DB 헬퍼, RLS 교차 테넌트 차단), 파일럿 워크스페이스에서 370노드 렌더 스냅샷, 빈 상태 테스트, 두 테마 axe AA 순회 편입, 착지 경로 단언(2C todo 5의 함정 재발 방지).
      Commit: `feat(map): render the live workspace graph`

- [x] **2. 신뢰도·출처 시각 문법** _(2026-08-23 완료 — 티어는 grade와 분리된 선 스타일, broken 우선. 방향 포커스는 옵트인이라 데모 대시보드 불변. `--focus-out`/`--focus-in` 토큰 신설. `.omo/evidence/phase3/wave-a-todo-2.md`)_
      엣지 신뢰도(`resolved`/`reference`/`inferred`/`agent_asserted`)를 렌더 문법으로: 실선/가는 실선/점선/점선+색. Graft식 포커스 모드(노드 클릭 → 진출 엣지 앰버 "의존한다"·진입 틸 "의존받는다", 나머지 페이드)를 기존 엔진에 추가. 노드 크기는 차수(추후 todo 7의 PageRank로 교체 가능한 단일 함수로 격리).
      수용 기준: 신뢰도별 렌더 분기 단위 테스트, 포커스 모드 상호작용 Playwright 1건, 색은 `tokens.css` 팔레트만(hardcoded-hex 린트 통과).
      Commit: `feat(map): encode edge confidence and focus mode`

## Wave B — 구조 그래프 강화 _(게이트 없음)_

Graft 패스 1 상당 — LLM 없이 그래프의 정보 밀도를 올린다. **tree-sitter 도입 없이** 기존 엔진 체인으로(ADR-014 준수; 다언어 확장 필요 시 OQ-019 판정 후).

- [x] **3. import/call 엣지 추출 — 신뢰도 2티어** _(2026-08-23 완료 — TS는 모듈 해석·import 바인딩 호출까지 resolved, 이름 매칭은 단독 소유자만 reference, Python은 import만. Go는 go.mod 해석 필요라 OQ-019와 함께 재검토. `.omo/evidence/phase3/wave-b-todo-3.md`)_
      `repository-scanner.ts`의 TS/JS 엔진(TS 컴파일러 API)에 import 엣지(모듈 해석 = `resolved`)와 call 엣지(체커로 해석되면 `resolved`, 이름 매칭 폴백은 `reference`) 추가. Python/Go 구조 파서는 import만(`reference`). 엣지는 `edges` 테이블에 provenance(소스 스팬)와 함께 — 하드룰 "모든 엣지는 provenance" 준수. 스캔은 여전히 0크레딧·본문 transient.
      수용 기준: 픽스처 레포에서 기대 엣지 스냅샷(티어별), 증분 재스캔 시 변경 파일의 엣지만 교체됨을 증명, `symbolEngine` provenance 유지, 스캔 시간 회귀 가드(파일럿 레포 기준 상한 기록).
      Commit: `feat(ingest): extract import and call edges with confidence tiers`

- [x] **4. 공변경 엣지 (`co_changed`)** _(2026-08-23 완료 — 카운트 테이블 + 읽기 시점 유도(edges 행 없음), inserted 배달만 기록이라 재생 안전, 임계 3회·벌크 50컷. `.omo/evidence/phase3/wave-b-todo-4.md`)_
      웹훅 push가 이미 실어오는 커밋 파일 목록에서 파일 쌍 공변경 카운트를 누적, 임계 이상을 `co_changed` 엣지로(가중치 = 횟수, provenance = 커밋 sha 목록). CBM `FILE_CHANGES_WITH` 상당 — Arr는 서버라 거의 공짜.
      수용 기준: 웹훅 재생 픽스처로 엣지 생성 증명, 임계 미달 비생성, 그래프 뷰에서 토글 가능한 엣지 패밀리로 렌더.
      Commit: `feat(ingest): accumulate co-change edges from push history`

- [x] **5. PPR repo map + 시드 서브그래프 검색** _(2026-08-23 완료 — MCP 17툴(repo_map·get_graph_schema 신설), 연결성 보너스 50 < 티어 간격 100이라 렉시컬 승자 불변, imports/calls가 MCP 계층에 편입. `.omo/evidence/phase3/wave-b-todo-5.md`)_
      `packages/core/src/brain/`에 개인화 PageRank(멱반복, 무방향, α·반복수는 Graft 초깃값 α=0.25·25회에서 시작해 상수로 격리). 신규 MCP 툴 ⑴ `repo_map(focus_symbols?, token_budget)` — 시그니처 스켈레톤을 예산까지 그리디 패킹(Aider 패턴) ⑵ 기존 `search_index`/`query_brain` 랭킹에 PPR 리랭크 결합(렉시컬 승자를 뒤집지 않는 가중 0.5·rescue floor). `get_graph_schema` 툴 신설(노드/엣지 타입·카운트 — "먼저 호출" 문서화). 툴 출력은 compact 텍스트 기본(CBM 패턴).
      수용 기준: PPR 단위 테스트(수렴·시드 편향), repo_map 토큰 예산 준수 테스트, 리랭크 전후 정답셋 순위 비교 픽스처, 툴 계약 테스트(스키마·readOnlyHint), 툴 수 증가에 따른 hosted.ts 계약 테스트 갱신.
      Commit: `feat(mcp): add pagerank repo map and graph schema tools`

## Wave C — AI 개념 패스 _(G3 — AI 크레딧)_

Graft 패스 2 상당 — "AI로 지식그래프를 구축"의 AI 부분. LazyGraphRAG 원칙: 구조는 이미 즉시·무료, AI는 요청 시·캐시.

- [ ] **6. `enrich` 잡 ① — 파일 산문 요약**
      여섯 번째 잡 종류 `enrich`(coach 선례대로 `enqueue_job` 복제 스크립트로 신설, 크레딧 라이프사이클 상속·BYOK 0크레딧). 파일당 3–8문장 산문 요약(temp 0, 입력 클립), **blob 해시 캐시** — 재실행 시 변경 파일만 과금. 요약은 `inferred` 표기로 아티팩트 메타데이터에 저장. 본문은 잡 내 transient(기존 `readSource` 주입 패턴 재사용). 실패 파일은 게이트로 스킵 추적(Graft LlmFailureGate 패턴).
      수용 기준: 해시 캐시 적중 시 0크레딧 증명, 실패 무과금·멱등 과금(기존 judge 테스트 패턴), 요약에 원본 코드 라인이 포함되지 않음을 스코프 스캐너 관점에서 확인(산문만). **추가(Wave D 발견): 스캔·enrich가 `index_entries`를 생성해 실스캔 워크스페이스에서 `search_index`/`search_nodes`가 서야 한다** — 현재 데모·벤치만 사전 구축 인덱스를 쓰고 실경로는 빈 결과다.
      Commit: `feat(worker): summarize changed files through the enrich job`

- [ ] **7. `enrich` 잡 ② — 개념 그래프 합성**
      요약 배치(상한 상수) → **강제 tool-use + 엄격 zod 스키마**로 개념 노드(`system|api|concept`)와 폐쇄 7동사 링크 합성. 무효 관계는 폐기(clean 패스). 개념 노드는 `graph_nodes`에 `inferred`로, 파일 출처 상속으로 신선도 추적. 그래프 뷰에 개념 레이어(구조/개념 토글). 노드 크기 함수를 PPR 점수로 교체.
      수용 기준: 스키마 위반 출력 무과금·재시도, 배치 경계에서 개념 파편화 방지(슬러그 병합 테스트), 재실행 수렴(같은 입력 → 같은 슬러그 upsert), 뷰 토글 Playwright.
      Commit: `feat(worker): synthesize the concept graph from summaries`

- [ ] **8. Lazy 모듈 요약 + `explain_module`**
      렌더 전용이던 Louvain을 데이터 레이어로 승격: import/call 그래프 군집 → 모듈 클러스터. 요약은 **첫 질의 시 생성·캐시, 구성원 해시 변경 시 무효화**(LazyGraphRAG). MCP `explain_module(node)`·`repo_overview()` — grep이 답할 수 없는 "이 레포 아키텍처" 질문 담당.
      수용 기준: lazy 생성·캐시 적중·무효화 3상태 테스트, 크레딧 규칙 상속, 툴 계약 테스트.
      Commit: `feat(brain): serve lazy community summaries`

## Wave D — 에이전트 기록(쓰기) 강화 _(게이트 없음, MVP 마감)_

"유저의 AI 에이전트가 솔루션에 기록"을 1급 기능으로. 참고 프로젝트 둘 다 없는 Arr의 차별점.

- [x] **9. bi-temporal 스키마 + `agent_asserted` 티어** _(2026-08-23 완료 — 삭제·개서 물리 거부 트리거, 결정론 supersede 재조정(0크레딧), 시간여행 질의 증명. `.omo/evidence/phase3/wave-d-todo-9-10.md`)_
      에이전트 기록(노트·엣지 단언)에 `valid_from`/`invalidated_at`/`ingested_at` — 삭제 대신 무효화(Graphiti). 기존 `record_note` 계열을 노드 앵커 기반으로 확장: `assert_link(from, to, relation)`은 `agent_asserted` 엣지 생성(폐쇄 동사만). append-only 성향은 `ruled_out_attempts` 선례(트리거 3중 고정) 재사용.
      수용 기준: 무효화 후 시점 질의(시간여행) 테스트, UPDATE/DELETE 차단 트리거, 신규 테이블 `grant all ... to service_role`(2C Wave 1 함정), 그래프 뷰 점선 렌더.
      Commit: `feat(mcp): record agent assertions with bi-temporal provenance`

- [x] **10. 메모리 블록 + 쓰기 재조정** _(2026-08-23 완료 — ADD/UPDATE/NOOP/무효화 + 캡 12 거부, `search_index`에 type memory로 노출, MCP 20툴. 9와 한 커밋(한 스키마), evidence는 분리)_
      노드에 붙는 크기 제한 명명 블록(`gotchas`/`conventions`/`decisions` — repo/모듈/파일 수준). MCP `memory_read`/`memory_write`. 쓰기 시 Mem0식 **ADD/UPDATE/DELETE(무효화)/NOOP 재조정** — 신규 기록이 상충하는 기존 블록 항목을 upsert하되, 재조정 판단이 AI 호출이면 enrich 크레딧 규칙, 결정론 규칙(동일 키)이면 0크레딧. 크기 캡 초과는 명시 거부(에이전트에게 증류 요구).
      수용 기준: 재조정 4분기 테스트, 캡 거부 계약 테스트, 검색(`search_index`)에 블록 내용 노출, access_event 발행.
      Commit: `feat(mcp): reconcile bounded memory blocks on write`

- [x] **11. 지시 블록 설치기 + 기록 e2e** _(2026-08-23 완료 — MVP 인수 시나리오를 실 HTTP로 완주(토큰 폼→schema→repo_map→memory_write→assert_link→맵 점선+피드). **발견: `index_entries`를 스캔이 채우지 않아 실스캔 워크스페이스에서 search가 빈다** → todo 6 수용 기준에 반영. `.omo/evidence/phase3/wave-d-todo-11.md`)_
      `/app/settings/mcp`에 에이전트별 설정 스니펫 생성기(CLAUDE.md·.cursorrules·codex 등 — "grep 전에 Arr 그래프 툴을 먼저" 지시 블록, CBM 패턴). MVP 인수 시나리오 e2e: 실 MCP 토큰 → `get_graph_schema` → `repo_map` → `memory_write` → 그래프 뷰에서 glow + 점선 노트 확인.
      수용 기준: 스니펫 스냅샷 테스트(에이전트별), e2e 1건이 위 시나리오 완주, 문서화(`docs/`).
      Commit: `feat(settings): generate agent instruction blocks`

## Wave E — 홈페이지 전체 리뉴얼 _(게이트 없음; G4 열리면 배포와 같은 시기 권장)_

- [x] **12. 마케팅 사이트(`site/index.html`) 리뉴얼** _(2026-08-23 완료 — 사이트 레포 `d27aea3`. 히어로 = 신뢰도 문법(실선/점선/점점선)+발광 인라인 그래프, 수치는 외부 인용 3(출처 병기)+자체 토큰 CI 병기만, §3.4 focus 토큰 이식. 두 테마 axe AA 0건. `.omo/evidence/phase3/wave-e-todo-12.md`)_
      메시지를 지식그래프 중심으로 재편: "레포를 연결하면 살아있는 지식그래프 — 당신의 에이전트가 읽고 기록하는 세컨드 브레인". 히어로에 그래프 비주얼(실 렌더 캡처 또는 경량 인라인 데모). 수치는 외부 인용(출처 병기)만, 자체 수치는 −55.97% 토큰 주장(CI 병기)만 유지(ADR-012). `docs/design-tokens.md` 기준으로 앱과 토큰 통일. 한국어 유지.
      수용 기준: 두 테마 렌더·AA 명암비, 주장 문구가 ADR-012 허용 목록과 일치(수동 체크리스트를 evidence에), 스크린샷 4종 갱신.
      Commit: `feat(site): renew the landing around the knowledge graph`

- [x] **13. 앱 홈·온보딩 재편** _(2026-08-23 완료 — `/app` = 저장 행 파생 온보딩 한 줄기(연결→그래프 생성→그래프 뷰+MCP 토큰), `/` 개요는 그래프 존 히어로 승격. 패치는 폐기·의도만 이식(lang=ko+한국어 타이틀). 여정 e2e 2건 + 두 테마 axe 스위프 편입. `.omo/evidence/phase3/wave-e-todo-13.md`)_
      `/`(공개 데모)와 `/app`(실데이터) 개요를 그래프 중심으로: 첫 화면 미니맵 → `/app/map` 승격, 온보딩 플로우 "레포 연결 → 그래프 생성 진행 표시 → 첫 그래프 뷰 + MCP 토큰 발급"을 한 줄기로. `planning/rescued-from-specproof/korean-homepage-uncommitted.patch`(lang=ko·타이틀) 적용 여부를 이 시점에 판정.
      수용 기준: 온보딩 경로 Playwright(연결→그래프→토큰), 어휘는 Phase 2D 개편안 유지, 두 테마 axe.
      Commit: `feat(overview): center onboarding on the graph`

## Wave F — 벤치마킹 _(G3, 마지막 — 사전등록 수정 금지)_

- [ ] **14. 동결 실험 실행(구 2C Wave 3 흡수)**
      벤치 v3 600시행 + VIBE 112시행 + 기법 A/B — 사전등록 그대로. 구간 게이트 판정 → 통과 시에만 정확도 주장 복원(ADR-012 절차).
      수용 기준: 2C Wave 3 todo 6·7과 동일.
      Commit: `feat(bench): run the frozen experiments`

- [ ] **15. Phase 3 신규 표면 벤치(사전등록 후 실행)**
      repo_map·PPR 검색·메모리 블록의 델타를 CBM 논문식 방법론(표준 질문 세트, PASS/PARTIAL/FAIL, 파일 탐색 베이스라인 대비 품질/토큰/툴콜)으로 **먼저 사전등록하고**(`benchmarks/` 신규, 동결 규약 동일) 실행. "에이전트 턴 수 절감"을 1차 지표로.
      수용 기준: 사전등록 파일 다이제스트 잠금 후 실행, 결과 판정과 무관하게 게시, 게시 문구는 ADR-012 규칙.
      Commit: `feat(bench): preregister and run the graph-surface benchmark`

---

## 신규 OPEN_QUESTIONS (이 계획과 함께 등록)

- **OQ-019 — tree-sitter 재판정**: ADR-014는 선택적 네이티브 의존성이 ADR-013 동등성을 깨서 미채택. 그러나 참고 프로젝트·논문 전원이 tree-sitter 기반이고, 다언어 call 엣지는 기존 엔진 체인으로는 한계. WASM 배포(`web-tree-sitter`)면 네이티브 의존성 문제가 사라지는지가 쟁점. Wave B 완료 후 TS/JS 외 언어 수요가 확인되는 시점에 판정.
