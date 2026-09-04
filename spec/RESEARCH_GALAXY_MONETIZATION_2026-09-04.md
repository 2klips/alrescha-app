# 연구 보고: "은하수" 그래프 밀도 설계 판정 · 유료 전환 품질 기준 (2026-09-04)

> **발주(사용자 지시, 2026-09-04):** ⑴ 그래프 뷰가 Obsidian graph view의 은하수처럼 **세부적으로 거미줄처럼 빽빽하게** 연결돼야 한다 — 덩어리 문서가 아니라 파일별·디렉터리별·파트별·컴포넌트별·기능별 카테고리로 묶이고 그래프 루프식으로 세분화되어, 레포를 연결하고 그래프 뷰를 봤을 때 은하수가 보이는 느낌. 성능도 따라와야 한다. ⑵ 이 솔루션을 레포에 적용해 바이브 코딩을 진행할 때 **토큰 절약·진행도 판단·위험 부분 판단·todo 체크**가 사용자가 만족하거나 유료 요금제를 들 만큼의 성능과 퀄리티가 나와야 한다 — 이 점도 연구.
>
> **방법(전부 2026-09-04):** ① 설계 패널 — 독립 설계 4안(Obsidian-native · 계층/허브 · 심볼 레벨 · 문서 레이어) → 심판 3인(제품/시각 · 엔지니어링/성능 · 가드레일/에이전트 가치, 각자 코드로 검증) → 합성 1안. ② 웹 조사 5주제(경쟁 가격 · 바이브 코더 고통 · 토큰 절감 증거 · 진행/위험/todo 패턴 · 가격 심리/전환) + 주제별 적대적 사실검증(1차 출처 WebFetch). ③ 기능 감사 4건(토큰·진행·위험·todo, 파일:라인 인용) → 건별 회의적 반박(코드·PGlite 실행 재현) → 완전성 비평. ④ 이 세션 직접 실측 — MCP `tools/list` 페이로드, 이 레포와 사용자의 다른 레포(`../30m`, Next+FastAPI)의 결정론 링크 후보 수. 전작 [`RESEARCH_GRAPH_SECONDBRAIN_2026-09-03.md`](RESEARCH_GRAPH_SECONDBRAIN_2026-09-03.md)(R4)를 전제로 하며 중복 서술은 생략한다. 실행 계획은 [`BUILD_PLAN_PHASE4.md`](BUILD_PLAN_PHASE4.md) v2, 신규 OQ는 `OPEN_QUESTIONS.md` OQ-035~043.
>
> **요약 결론 6개:**
>
> 1. **은하수는 데이터 성질에서 온다.** Obsidian 볼트가 은하처럼 보이는 이유는 ⑴ 모든 파일이 노트 ⑵ 링크가 싸고 많음(노트당 3–8) ⑶ 링크 패밀리가 교차해 사이클을 만들고 MOC·폴더가 군집을 잇기 때문이다. 오늘 Alrescha는 정반대다 — 이 레포 추적 파일의 md 171·sql 41·css 20·config ~45는 아티팩트조차 아니고, 결정론 import만 제대로 풀어도 ~1,036쌍(평균 차수 4.4)이 나오는데 프로덕션 구조 엣지는 ~135다. 심판 3인이 코드로 확정한 원인 5개(§2.2): `@alrescha/*`·`@/` 같은 **비상대 지정자를 버린다**, **변경 없는 파일은 영원히 재링크되지 않는다**, 힘장 링크가 중복·상수 강도(허브 헤어볼), 600 초과 시 `type:grade` 15덩어리 붕괴, 분류가 문서로 몰림. **이 다섯을 고치지 않으면 어떤 노드·엣지를 추가해도 화면에 도달하지 않는다.**
> 2. **설계 판정: "모든 파일은 노트, 모든 결정론 관계는 링크(14패밀리)"를 골격으로, 계층/허브 설계의 실행 규율을 통째로 이식.** 심판 3인 중 2인이 Obsidian-native를 추천했고(은하 인상 9·9·9), 합계는 계층/허브 설계가 106 vs 104로 근소 우위 — 가드레일 규율·ADR-013 구조적 만족·에이전트 표면 오염 차단에서 이겼다. 통합안(§2.4~2.9) 추정 밀도: 이 레포 노드 ~1,260 · 엣지 ~4,000(표시 ~3,100 + 힘장 전용 contains ~890) · 평균 차수 ~6.3 · 고아 ~7% — 전부 0크레딧·결정론. 심볼 노드·생성 문서 레이어는 은하의 원천이 아니라 후속(Wave F·D)이다.
> 3. **시장은 그래프·MCP·위키를 무료로 기대하고, 돈은 "판정"에 낸다.** 로컬 코드 지식그래프·그래프 뷰·MCP는 OSS로 상품화됐다(Graphify 114.6k★ 무료 코어, CodeGraph 69.4k★, GitNexus 47k★, Serena 28.8k★, Repomix 26k★). 좌석당 유료가 성립하는 곳은 PR/머지 시점 판정(CodeRabbit $24–72, Greptile $30+$1/리뷰, Sentry Seer $40/활성 기여자)과 호스팅·자동 재인덱싱·팀 동기화(GitNexus Enterprise $29/seat, cmem Pro $30)다. 컨텍스트/그래프 MCP 단독 호스티드는 솔로 $10–30(중앙값 ~$19). 진행·todo 단독 유료는 없고(Taskmaster·beads 무료, Hamster $40/creator, Vibe Kanban 유료 종료 — 미검증), 위키는 $0(DeepWiki 무료 유지). 개발자 대상 프리미엄 전환 중앙값 ~5%, AI 네이티브 GRR 40%($50 미만 23%).
> 4. **"토큰 절감"은 헤드라인이 될 수 없다.** 벤더 주장 31–88%는 독립 측정에서 25–43%로 깎이고 시간은 늘어난다(ilzam: 토큰 −43%·비용 −25%·시간 2배; kubeblogs Graphify: 1라운드는 더 비쌌고 2·3라운드 5–18%). 우리 증거도 셋으로 갈린다 — databrain v3(검색 컨텍스트 크기, −67% MET) · graph-surface v2(에이전트 루프, 토큰은 −3.5~−25%지만 턴 +2.3·PASS −12.5pp NOT MET) · 설치된 Claude Code 세션 순절감(**미측정**). 이 세션 실측: MCP 툴 정의 22개 = 30,130자(그중 `outputSchema` 62%; 압축 11,429B ≈ 2.9k~4.3k토큰 추정, 실토크나이저 미측정). 사용자가 몸으로 느끼는 지표는 $가 아니라 **5시간/주간 한도 여유**와 **헛도는 수정 루프**다(2026-03 한도 논란, 2026-06 집단소송).
> 5. **4개 기능 감사의 공통 판정: "오늘 그대로는 아니오, 제안 적용 후 번들의 일부로 조건부 예."** 반박·비평이 확정한 사실: 프로덕션 아티팩트에 **본문이 없어 enrich(크레딧) 전에는 MCP가 빈 문자열을 서빙**한다(`get_node_content`·검색 발췌·컨텍스트 팩·todo 체크박스 전부); 요구사항 커버리지는 `implements` writer가 없어 **거짓 0%**; 모든 finding은 영원히 {medium, low}; finding은 문서 노드에만 붙어 코드 위험 링은 도달 불가; todo는 바이트 오프셋 정체성·240자 CHECK 롤백·FK wedge라는 데이터 결함 위에 있다; 에이전트는 todo를 읽을 툴이 없고 지시 블록에 `log_progress`가 없다; 결제 경로·플랜 게이트·레포 단위 스코핑·라이브 발광 브리지가 없다.
> 6. **유료 번들의 최소 정의(비평 종합):** "연결(또는 푸시)마다 갱신되는, 내 레포의 정직한 상태판" = ① 내 코드가 보이는 은하수 그래프(+라이브 발광 브리지, HUD 실데이터) ② 오늘/이번 주 진행 원장(거짓 0% 제거, todo 정체성·FK 수정, `query_brain(kind:'todo')`) ③ 문서 없이도 뜨는 위험 지도(코드 노드 앵커 + `untested-code` + 팬인·공변경, 링 3단계) ④ 이를 살리는 예산 문서(툴 ≤16, 지시 블록 ≤300토큰, 첫 읽기 전 호출 ≤2). 빼는 것: 토큰 절감 카피(v3 통과 전), AI 판정·코칭, doc_page, 영수증 피치, 팀, CI verified, 심볼. **선행 결정 4개**는 사용자 몫이다 — 무료 티어에 무엇을 서빙할지(OQ-039), 가격 티어(OQ-040), 스펙 없는 레포의 요구사항 부트스트랩(OQ-041), 레포 단위 스코핑(OQ-042).

---

## 1. 이 세션의 직접 실측

### 1.1 MCP 툴 정의 페이로드 (`tools/list`, InMemoryMcpStore, 원시 JSON-RPC)

| 항목                                                                 | 값                                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 툴 수                                                                | 22                                                                                                               |
| 전체 카탈로그(name+description+inputSchema+outputSchema+annotations) | **30,130자**                                                                                                     |
| `outputSchema` 제외(클라이언트가 모델에 보내는 형태에 가까움)        | **11,408~11,782자**(압축 / `mcp__alrescha__` 접두 포함)                                                          |
| 가장 큰 툴                                                           | request_context_pack 2,178 · impact_of 2,058 · get_node_content 1,800 · query_brain 1,781 (outputSchema 포함)    |
| 토큰 추정                                                            | 4자/토큰 2.9k~7.5k · 조각 수 휴리스틱 ~4.3k — **실토크나이저(count_tokens) 미측정, 레포 내 토크나이저 사용 0건** |
| 리소스                                                               | 5종, 1,147자                                                                                                     |

의미: `outputSchema`는 MCP에서 선택 항목이며 전체의 62%를 차지한다. 툴 정의를 절반 이하로 줄이는 가장 싼 수단이 여기 있고, 그 다음이 툴 통합(22→≤16)이다. 단 Claude Code는 MCP 툴을 Tool Search로 지연 로드하는 클라이언트라 "매 턴 고정 비용"은 클라이언트별 측정 항목이다(반박 확인).

### 1.2 결정론 링크 후보 — 이 레포(`git ls-files`, 워크트리·output 제외)

| 항목                                   | 값                                                                  |
| -------------------------------------- | ------------------------------------------------------------------- |
| 파일                                   | ts 381 · tsx 93 · md 171 · json 92 · sql 41 · css 20 · 디렉터리 155 |
| 상대 import 문                         | 609 (+ 워크스페이스 `@alrescha/*` 96 = **705**)                     |
| 외부 패키지 import(오늘 무시)          | 560                                                                 |
| 테스트 파일                            | 171                                                                 |
| 마크다운 인라인 경로 언급 / md→md 링크 | **1,158** / 97                                                      |
| export 심볼(대략)                      | 1,261                                                               |
| `create table`                         | 43                                                                  |

설계 패널의 독립 에뮬레이션(TypeScript 컴파일러 API로 실제 해석)과 정합: 해석 가능 파일↔파일 import **1,036쌍**(상대 999 + 별칭 97), doc→file 해석 **973**(경로 존재 731 + basename 단독 소유자 242; 모호 22·미해석 73은 엣지 없음), doc→doc 90, tests 297, contains 885, co_changed(≥3회) 366, queries 149, defines/modifies/FK 280, 테이블 43 + SQL 함수 59.

### 1.3 결정론 링크 후보 — 사용자의 다른 레포 `../30m` (Next.js `frontend/` + FastAPI `backend/` + `db/`)

| 항목                                    | 값                                                           |
| --------------------------------------- | ------------------------------------------------------------ |
| 파일                                    | py 65 · md 24 · tsx 18 · ts 17 · css 9 · sql 5 · 디렉터리 36 |
| TS import(전부 `@/` 별칭)               | 81                                                           |
| Python import / 그중 로컬 `from app.…`  | 319 / 79                                                     |
| FastAPI 라우트 데코레이터               | 10                                                           |
| `create table` · md 경로 언급 · md 링크 | 8 · 37 · 13                                                  |
| 테스트 파일 · TODO.md 체크박스          | 19 · 45                                                      |

**오늘의 스캐너로 이 레포를 넣으면 엣지가 거의 0이다.** `@/` 별칭은 `.`으로 시작하지 않아 버려지고([code-links.ts:274](../packages/core/src/ingest/code-links.ts)), `from app.core.errors`는 레포 루트 기준 `app/core/errors.py`를 찾다 실패한다(실제 경로 `backend/app/core/errors.py`, [code-links.ts:293](../packages/core/src/ingest/code-links.ts)). facet은 `frontend/`·`backend/`·`db/`를 몰라 전부 `unclassified`→`backend`로 흡수된다. 사용자가 "문서끼리만 연결" 또는 "알아볼 수 없는 형태"라고 본 것은 정확히 이 상태다.

---

## 2. 은하수 설계 판정 (설계 패널)

### 2.1 4안 요약과 심판 점수

| 설계                   | 핵심 아이디어                                                                                                                                                  | 이 레포 추정(노드/엣지/차수) | J1  | J2  | J3  | 합      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --- | --- | --- | ------- |
| ① Obsidian-native      | 텍스트 파일 전부 노트화 + 결정론 링크 14패밀리(imports·calls·tests·doc→file·doc→doc·section·contains·co_changed·queries·defines·handles·implements·references) | 1,266 / 5,040 / 8.0          | 36  | 35  | 33  | **104** |
| ② 계층 + 카테고리 허브 | directory(영속)·feature/domain(가상 허브)·route 노드, forceX/Y 도메인 앵커, `unit` 태그, `hierarchyAssignment` 결정론 접힘                                     | 1,150 / 3,500 / 6.1          | 35  | 34  | 37  | **106** |
| ③ 심볼 레벨            | 함수·클래스·컴포넌트·테이블 1급 노드, 3단 로딩(L0 파일 → L1 헤일로 → L2 전체), 시뮬 불참 황금각 헤일로                                                         | 4,010 / 9,000 / 4.5(L0는 ~3) | 29  | 30  | 34  | 93      |
| ④ 생성 문서 레이어     | "페이지 = 기존 노드의 얼굴", module/feature/repo만 doc_page 노드, 결정론 스켈레톤 인용 + 읽기 시점 백링크                                                      | 1,170 / 2,660 / 4.5          | 32  | 31  | 32  | 95      |

축: 은하수 인상 · 가드레일 충실 · 성능 실현성 · 구현 비용(10=저렴) · 에이전트 효용, 각 0–10. J1 제품/시각, J2 엔지니어링/성능, J3 가드레일/에이전트 가치. **①은 "레포를 연결한 직후 0크레딧·enrich 없이 은하 대역(평균 차수 3–8)에 드는 유일한 설계"**로 J1·J2가 추천했고, J3는 ②의 ADR-013 구조적 만족(허브를 SQL이 경로에서 유도 → 플랜 바이트 불변)·PageRank 오염 차단·가상 허브의 정직한 OQ 등록을 이유로 ②를 추천했다. ③은 기본 로드가 "나무"(설계 자인)이고 백엔드 비용이 최대, ④는 enrich 없는 첫 연결에서 "은하는 아니다"(설계 자인).

### 2.2 코드로 확정된 결함 5개 (심판 3인 전원 재확인)

| #   | 결함                                             | 위치                                                                                                                                                                     | 효과                                                            |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| D1  | 비상대 지정자 미해석                             | `packages/core/src/ingest/code-links.ts:274` `if (!specifier.startsWith(".")) return null`                                                                               | `@alrescha/*` 96건/88파일, 전형 Next `@/…` 전부 엣지 0          |
| D2  | 변경 없는 파일은 영원히 재링크되지 않음          | `repository-scanner.ts:642-648, 714-718`(unchanged 슬롯은 parsedLinks 제외) + `202608230002:243-252`(scanned_paths 엣지만 교체) + 워커·CLI가 항상 previousArtifacts 전달 | code-links 도입(08-23) 이전 스캔분이 빈 채 고정 → 프로덕션 ~135 |
| D3  | 힘장 링크 중복·상수 강도                         | `simulation-protocol.ts:219-226`(imports+calls 같은 쌍 2회 push), `force-simulation.ts:126-129`(d3 기본 `1/min(deg)` 정규화를 상수 0.55로 덮음)                          | 배럴(in-degree 108)·strings(70) 허브에 스프링 수십 개 → 헤어볼  |
| D4  | 600 초과 시 `type:grade` 15덩어리 + DOM 히트 600 | `workspace-map.ts:162, 500-503` → `graph-model.ts:433-467` 인접 사슬; `brain-map-stage.tsx:45`                                                                           | 노드가 늘수록 더 뭉개지고 601번째부터 클릭 불가                 |
| D5  | 분류 사상이 문서로 몰림                          | `graph-model.ts:106-114`, `workspace-map.ts:367-373, 389, 583-587`, `artifact-facets.ts:92`, `repository-scanner.ts:157-215`(README/docs/sql/css 비아티팩트)             | 코드가 다수인데 화면은 문서 위주(R4 §3.8 ①)                     |

### 2.3 통합안의 판정 요지

- **골격은 ①, 규율은 ②.** ②에서 이식: `unit` 태그(component/route/action/schema/test/doc/lib — 노드가 아니라 모양·필터·범례), 4종 스프라이트 문법(원/링/다이아몬드/사각), `hierarchyAssignment(level)` 결정론 접힘(far→package ?? depth-2 dir, mid→leaf dir; Louvain은 허브 없는 데이터 폴백), PageRank를 structure+semantic+evidence 패밀리로 한정, `get_neighbors includeHierarchy=false` 기본, 옵트인 도메인 forceX/Y 앵커(강도 ≤0.05, 기본 off), SQL 경로 유도(플랜 바이트 불변 → ADR-013 자명), `measure-graph-density.ts` 게이트. ③에서 이식: `scanRepository({mode:'full'})` 전량 재스캔, `apply_repository_scan` set-based(`jsonb_to_recordset`) 재작성, `search_index` 심볼 히트에 `path:startLine-endLine`, 심볼 헤일로 메커니즘(Wave F 사양), MCP 지연 로드 분리. ④에서 이식: `edges.family` 컬럼, 읽기 시점 백링크, md5(정렬 멤버 디렉터리) 슬러그, 비파일 노드 `path`/`areaHint` 앵커, `run-local.ts` 잡 종류별 지연 생성.
- **반려:** ①의 읽기 상한 5,000/20,000 일괄 상향(OQ-031 선점 → 패밀리별 상한, OQ-038), ①의 `tests` resolved 티어(→ reference 0.6, OQ-036), co_changed GitHub 백필(ADR-013 비대칭 → OQ-035, 판정 전 표시 전용), ②의 가상 `feature`/`domain` 노드(assert_link 불가·id 불안정 → 접힘 키와 색으로만), ③의 심볼 즉시 1급화(Wave F 유지), ④의 산문 인용 엣지를 밀도 원천으로 삼는 것(크레딧 종속).

### 2.4 노드 분류(통합안)

원칙: 텍스트 파일은 전부 노트, 노드 종류는 적게, 나머지 구분은 `unit` 태그. 파일이 아닌 노드는 SQL이 경로에서 유도하거나 플랜에 메타데이터만 싣고, 전부 `path` 앵커를 가져 `deriveBrainArea`가 도메인을 유도한다(R4 §3.8 ① 재발 방지, facet 테스트로 고정).

| kind                    | 생성                                                                                                                                            | 결정론 | 이 레포(추정) | 비고                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------- | ---------------------------------------------------------- |
| artifact code           | 기존 분류; `unit` = code·test·component·route·action·lib(경로 + 이미 영속된 exported_symbols의 PascalCase만)                                    | ✓      | 471           | 본문 비저장 유지                                           |
| artifact doc            | **모든** md/mdx/rst/txt(spec/adr/agents/todo 규칙 우선) + 기본 ignore(output/·coverage/·dist/·lockfile) + `.alrescha.json ignore/layers.hidden` | ✓      | 164           | `.omo/evidence` 91개가 문서 성단을 지배할 수 있음 → OQ-043 |
| artifact schema         | `*.sql/*.prisma/schema.graphql/drizzle/**`, `symbolEngine:'sql-structural'`                                                                     | ✓      | 41            |                                                            |
| artifact style/config   | `*.css/scss`; package.json·tsconfig·yaml·toml·Dockerfile                                                                                        | ✓      | 19 + ~45      | 고아율 높음 → 레이어 토글(Obsidian attachments 동형)       |
| directory               | `apply_repository_scan` v6 SQL 경로 접두사 유도, `role:'package'`(package.json 보유), 고아 스윕, 통과 디렉터리 접기                             | ✓      | ~145          | 패키지 6개가 은하 핵                                       |
| route                   | Next.js `app/**/(page\|layout\|route)` URL — SQL 유도(resolved); FastAPI/Flask 데코레이터 → `plan.routes`(reference)                            | ✓      | ~30           | 사용자의 "부품/화면" 허브                                  |
| db_object               | `schema-links.ts` create table/function/view 정규식 → 이름·소유 마이그레이션 span만                                                             | ✓      | 102           | 사용자의 `database` 대분류가 실제 허브를 가짐              |
| section (선택)          | ID 토큰 헤딩만(`ADR-NNN`·`OQ-NNN`·`G\d+`)                                                                                                       | ✓      | ~60           | 전형 레포 0 — MOC 문서를 절 성단으로 쪼갬                  |
| rationale / requirement | 기존(타입 분리 · `implements` 부여)                                                                                                             | ✓      | 86 / 99       |                                                            |
| concept                 | 기존 enrich(LLM, 1크레딧/BYOK 0)                                                                                                                | ✗      | 169           | 기본 은하 계산 제외, 토글 레이어                           |
| symbol                  | Wave F — near 줌·선택 파일만 부분 로드(헤일로), 기본 로드 0                                                                                     | ✓      | 0             | 가용 1,161~2,800                                           |

`feature`·`domain`은 **노드가 아니다** — domain은 색(facet 6종 frontend·backend·database·docs·tests·기타), feature/module(`deriveModuleClusters`)은 far 줌 접힘 키와 Wave D 페이지 앵커로만.

### 2.5 엣지 패밀리(통합안)

`edges.family` 컬럼(CHECK·인덱스, 기존 행 relation으로 백필)으로 `structure | hierarchy | doc | database | route | statistical | semantic | evidence` 8패밀리를 두고 읽기 상한·힘장·그리기·MCP 기본값을 패밀리 단위로 정한다. 모든 엣지는 span 또는 명시 reason + `tier`.

| relation                            | from → to                                 | family      | tier                                                  | 이 레포                    | 루프                | 힘장 strength/distance · 그리기                      |
| ----------------------------------- | ----------------------------------------- | ----------- | ----------------------------------------------------- | -------------------------- | ------------------- | ---------------------------------------------------- |
| imports                             | code → code                               | structure   | resolved(TS 상대·별칭·배럴 통과) / reference(Py)      | ~1,036                     | ✓                   | 0.55/90 · 항상                                       |
| calls                               | code → code                               | structure   | resolved / reference                                  | ~350                       | ✓                   | imports와 같은 쌍으로 병합                           |
| tests                               | test file → code                          | evidence    | **reference 0.6**(imports 파생, method `test-import`) | ~297                       | ✓                   | 0.45/90 · 항상. `verified` 승격 없음을 테스트로 고정 |
| references (doc→file)               | doc → any file                            | doc         | resolved(경로 존재) / reference(basename 단독 소유자) | ~900(.omo 포함)/~350(제외) | ✓                   | 0.3/120 · mid+                                       |
| references (doc→doc)                | doc → doc                                 | doc         | resolved                                              | ~90                        | ✓                   | 0.3/120                                              |
| references (→section)               | doc·rationale → section                   | doc         | resolved(ID 정확 일치)                                | ~360(선택)                 | ✓                   | near 전용                                            |
| contains                            | directory → dir·file                      | hierarchy   | resolved `{reason:'path containment'}`                | ~885                       | ✓(imports와 삼각형) | 0.3/30 · **layoutOnly**(near α 0.08)                 |
| handles                             | route → file                              | route       | resolved(Next) / reference(FastAPI)                   | ~45                        | ✓                   | 0.45/70                                              |
| queries                             | code → db_object                          | database    | reference 0.6(리터럴, 소유 테이블만)                  | ~149                       | ✓                   | 0.4/100                                              |
| defines / modifies / references(FK) | schema → db_object, db_object → db_object | database    | resolved                                              | ~280                       | ✓                   | 0.45/60                                              |
| implements                          | requirement → code                        | evidence    | reference ≤0.6(Wave A todo 1)                         | ~120                       | △                   | 0.3/120                                              |
| references (rationale→file)         | rationale → code                          | structure   | resolved(기존)                                        | 86                         | ✗                   | 0.6/40                                               |
| co_changed                          | file ↔ file                               | statistical | reference(읽기 시점 유도, 백필은 OQ-035)              | 0(백필 전)                 | ✓                   | 0.1/140 · 토글 전용                                  |
| 7동사(concept)                      | concept → concept·file                    | semantic    | inferred 0.5(기존)                                    | 233                        | ✓                   | 0.3/110 · 토글, far 숨김                             |

파일→domain 링크는 만들지 않는다(차수 300 태양 = 헤어볼). `layoutOnly`·도메인 앵커는 "엣지가 아닌 레이아웃 입력"으로 타입·문서에 격리(OQ-037).

### 2.6 카테고리·허브·루프

- **색 = facet domain**(6종 + style/config 유닛), 관례 밖은 `기타`로 정직 표시(`unclassified→backend` 흡수 제거). 토큰 `node-database·node-other·node-directory·node-route·node-table` 추가.
- **물리 = 허브 노드**: directory(`contains` 힘장 전용)가 파일을 폴더 둘레로 모으고 패키지 6개가 핵; route가 page→layout→lib→strings 체인의 방사형 허브; db_object가 migrations↔queries 링의 허브. 모양 4종.
- **부품·컴포넌트 = `unit` 태그**, **기능 카테고리 = 접힘 키**(`hierarchyAssignment`), **문서 카테고리** = section 성단 + doc→code references.
- **루프 메커니즘**: imports+contains 삼각형(파일 740개 전부가 최소 하나), 배럴 통과·`1/min(deg)`가 허브를 "태양"이 아닌 "밝은 별"로, tests↔subject↔helper 꿰맴, doc→file+doc→doc+section, migration–table–code 다각형, route–layout–route 고리, co_changed(토글). 은하 조건 E/N ≥ 3·허브 차수 30–150·삼각형 밀도 — 통합안 추정 E/N ≈ 3.2(contains 포함), 최대 차수 ~100(정규화 후).
- **PageRank**(`render-frame.ts importanceMap`, `repo-map.ts`)는 structure+semantic+evidence만 — 계층 엣지 885개가 들어가면 화면의 큰 별이 전부 폴더가 되고 `repo_map` 첫 줄이 항상 `apps/web/lib`가 된다. far 라벨은 kind 가중(package > route > directory > 차수), `FAR_HUB_LABEL_LIMIT` 6→12.

### 2.7 로딩·LOD·렌더·비용(요지)

- **읽기**: 파일 레벨 `NODE_LIMIT 2,000` 유지(OQ-031), 허브는 별도 쿼리·별도 상한(directory ≤300·route ≤100·db_object ≤100·section ≤100), 엣지는 패밀리별 상한 병렬 쿼리(structure 6,000·doc 6,000·hierarchy 6,000·database 3,000·route 1,000·statistical 3,000·semantic 3,000). artifacts 정렬 결함 수정. `MAP_CLUSTER_THRESHOLD`·`clusterGraph`·서버 `forceDirectedLayout`(MT-6) 삭제, 좌표 0 송신. `isClustered` 단언은 "3,000 초과 시 계층 할당 접힘"으로 재작성(약화 아님). 컬럼형 RPC는 패밀리별 쿼리 TTFB 측정 뒤에만.
- **LOD 3단 유지, 내용 교체**: far raw ≤3,000·초과 시 `hierarchyAssignment`·허브 라벨 12·contains/co_changed/section/semantic 숨김; mid 파일+structure/doc/database/route, contains α 0.08; near 전부 + 배지 + (Wave F) 헤일로. 필터·토글은 `setVisibility`로 시뮬 재시작 0.
- **힘장**: `LinkPair [i,j,familyCode]`, (min,max) 중복 제거, `.strength(l => familyStrength × 1/min(deg))`, `forceCollide(r).iterations(2)`.
- **렌더**: 스타일 그룹당 1회 stroke, 4종 텍스처 Sprite 풀, positions 리비전에서만 엣지 지오메트리 재기록, 노드·엣지 스크린 AABB 컬링, quadtree 히트(DOM은 접근성 전용 200). 1,260노드는 DOM 캡 600을 넘으므로 **quadtree가 데이터 웨이브의 선행 조건**.
- **비용**: 노드 12종 중 11종·엣지 14패밀리 중 13패밀리가 0크레딧(`enqueue_job`이 scan/analyze credit≠0 거부). 전량 재링크는 GitHub blob 재조회(이 레포 500–800건, 동시성 8, 시간 미측정 → evidence), CLI는 로컬 무료. `apply_repository_scan` 행별 plpgsql 루프(링크당 select 2회)는 set-based로 재작성하고 `/api/ingest/local` HTTP 타임아웃을 수용 기준으로. MCP `loadWorkspace`(상한 없이 전량)는 structure+evidence+semantic만 기본, hierarchy/database/route는 툴 호출 시 부분 쿼리.

### 2.8 밀도 목표와 성능 예산

| 단계                                               | 이 레포 노드/엣지/평균 차수(추정)                                                                                                       | 게이트                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Phase 0 링크 복구(별칭·배럴·재링크·dedup)          | ~656 / ~1,190 / ~3.6 — 프로덕션 ~135 → ~1,100 "첫 성좌"                                                                                 | `measure-graph-density.ts` 실측, 두 경로 플랜 바이트 동등성    |
| Phase 1 Wave A(문서·폴더·도메인)                   | ~1,070 / ~3,200(표시 ~2,300 + contains ~885) / ~5.9(표시 ~4.3), 고아 ~7%                                                                | `tests/graph-density.test.ts` 평균 차수 ≥3·고아 ≤10%·삼각형 >0 |
| Phase 3 Wave A′ 허브(route·db_object·section·unit) | **~1,260 / ~4,000 / ~6.3** — 목표 도달. 전형 800파일 Next+FastAPI ~1,200 / ~3,200 / ~5.3(Python 절반은 reference·calls 0을 배지로 표기) | 동일 + Playwright 두 테마 스크린샷                             |

성능 예산: 메인스레드 프레임 플랜 p95 <16.7ms(vitest, 1,300/4k·5k 컬링 케이스 신설; MT-4 실측 3,500노드 near p95 1.396ms에서 2–3ms 외삽), 워커 틱 p95 <33.3ms(500노드 실측 1.496ms; 1.3k+4k링크+collide 5–10ms 추정·미측정), **브라우저 팬/줌 p95 <16.7ms는 `scripts/bench-graph-browser.ts` 통과 전까지 60fps 미주장**(GPU는 vitest가 볼 수 없다), 정착 후 idle 0프레임 유지, `/app/map` TTFB 회귀 0, 필터·토글 시 워커 `start` 0건, 페이로드 목표 ≤300KB gz. 모든 수치는 §3-8·ADR-012에 따라 실측 전 "추정"으로만.

### 2.9 에이전트에게 주는 것 — 정직하게

"은하수처럼 보이는 것" 자체는 에이전트에게 가치가 없고, graph-surface v1·v2 NOT MET은 이 설계로 뒤집히지 않는다. 실익은 패밀리별로만 나온다: ⑴ 링크 커버리지 회복·배럴 통과가 `get_neighbors`/`trace_path`/`repo_map`의 **정답 자체**를 바꾼다 ⑵ route+`handles`로 `impact_of`가 "어느 화면/엔드포인트에 닿나"를 답한다(파일 그래프로는 원리적 불가) ⑶ `queries/defines`로 "테이블 X를 만지는 코드"가 처음 질의 가능 ⑷ `tests`(reference)로 "이 파일을 덮는 테스트"가 결정론으로 ⑸ 백링크 역방향 조회가 "누가 쓰는가"를 traverse 없이 ⑹ `search_index` 심볼 히트에 span을 실어 `get_node_content` 홉을 없앤다(0마이그레이션). 해로울 수 있는 것은 설계로 막는다 — `families` 필터·`includeHierarchy=false`·결과 캡·`loadWorkspace` 패밀리 분리·새 툴 0.

---

## 3. 상업성 조사 (웹, 적대적 검증 반영)

### 3.1 가격 지형 (2026-09-04 1차 출처 확인분; 미검증은 표기)

| 범주                           | 제품·가격                                                                                                                                                                                                                                                        | 시사점                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 에이전트/IDE 구독(기준 지출)   | Cursor Pro $20/Pro+ $60/Ultra $200/Teams $40·Premium $120 · Claude Pro $20(연 $17)/Max $100·$200 · Copilot Pro $10(크레딧 $10~15)/Pro+ $39 · Augment Standard $20 flat(50석) · Amp $20/$200 · Devin Pro $20/Max $200(공식 페이지 429로 미검증) · Replit Core $20 | **$20은 "두 번째 $20"** — 계산 없이 받아들이는 앵커지만 이미 4개 툴에 $66+ 쓰는 사람의 다섯 번째 |
| 코드 컨텍스트/그래프 MCP 단독  | Symvanta $19(1석·5레포)/$29 · CodeAlive Free/$15/$50 · Nia Free/$15/$50 · Context7 Free/$10 · Repowise Free/$15(미검증)/$60 · Unblocked $19 리뷰 → $29 플랫폼(MCP) · GitNexus Enterprise $29/seat · cmem Pro $30                                                 | 솔로 $10–30, 중앙값 ~$19. MCP 컨텍스트는 "+$10" 가치로 책정(Unblocked)                           |
| PR 리뷰/보증(좌석당 실제 결제) | CodeRabbit $24/$48/$72(연납; blast radius·보안 리뷰는 $72) · Greptile $30/seat + $1/크레딧 · Sentry Seer $40/활성 기여자 · Copilot 리뷰 $0.05~5/건 · Qodo $19–30(2차)                                                                                            | **시장이 좌석당 돈을 내는 유일한 항목**                                                          |
| 메모리                         | Supermemory $19(사용량 ~$20 포함) · Mem0 Hobby 무료/$19/**$249(그래프 메모리 게이트)** · Zep $125 · claude-mem 무료(93.1k★)/cmem Pro $30                                                                                                                         | 그래프 메모리를 $20에 주면 차별화; 무료=로컬+BYOK, 유료=호스티드 관찰자+동기화                   |
| 진행/todo                      | Taskmaster 무료(28k★, 2026-04 이후 정체) · beads 무료(26.8k★) · Hamster Free/$40/creator · SpecStory Free/$25/Team $300 flat · Vibe Kanban 유료 종료·OSS 전환(미검증)                                                                                            | **단독 유료 상품 없음** — 리텐션 기능으로 배치                                                   |
| 위키/문서                      | DeepWiki 표준 생성 무료 유지 · Mintlify Starter 무료(MCP 포함)/Pro $450 · Swimm LOC 견적                                                                                                                                                                         | 위키 기대가 $0                                                                                   |
| 스펙/검증                      | Kiro Pro $20(1,000크레딧, 스펙 정제·태스크 실행에 소모) · Tessl Free 1,000/Team $100 5,000 공유 크레딧 · spec-kit 무료(133k★)                                                                                                                                    | "요구사항↔구현" 검증을 크레딧으로 파는 선례                                                      |

전환·이탈 벤치(1차 출처 확인): 무료→유료 중앙값 8%(ChartMogul 2026, B2B 200개), 개발자 대상 프리미엄 중앙값 ~5%(Lenny, 비개발자의 절반), AI 네이티브 GRR 40%·$50 미만 23%(ChartMogul "AI churn wave", AI-native 표본 ~200개사), ARPA $25 미만 월 MRR 이탈 8.2%. 크레딧 모델은 2026년 표준(Copilot 2026-06 AI Credits 1크레딧=$0.01)이나 예측 가능성 부재가 반발을 부른다(Cursor 2025-06 사과·환불, Greptile $1/리뷰 비판은 소규모 — 17포인트).

### 3.2 바이브 코더가 아파하는 것 vs 돈 내는 것

증거로 매긴 고통 순위: ⑴ **사용량 한도·토큰**(Claude Code 한도 논란 HN 407점, 2026-03 한도 소진 버그, 2026-06 Kahn v. Anthropic 집단소송, Bolt "한 버그에 7–12M 토큰") ⑵ 컨텍스트 손실·세션 간 기억 상실(compact 후 도구 결과 68% 소실 이슈, claude-mem 93.1k★) ⑶ 검증 불신(Sonar: 96% 불신·48%만 검증·38% 리뷰 부담·커밋 코드 42%가 AI; SO 2025 49k명: 신뢰 33%/불신 46%, "거의 맞지만 아닌 답" 66%) ⑷ 회귀·보안(TDAD: 의존성 그래프 제공 시 회귀 6.08%→1.82%; AI 기인 CVE 누적 74건; Replit DB 삭제 사건) ⑸ 진행·todo(GitHub Projects·Claude Code 네이티브로 충족, 담론 미약). **돈은 ①모델 구독과 ②리스크/리뷰에만 흐른다** — 한 팀이 4개 유료 리뷰어를 겹쳐 결제(146 PR, 679건, 93.4% 고유 발견). 메모리·토큰·진행·todo는 무료 OSS 기대치.

Alrescha 4대 가치 중 시장 지불 의사와 맞닿는 것은 **위험 판정**(impact_of + drift + 취약 패턴)이 유일하게 강하고, 토큰 절감은 고통 1위지만 지불은 모델 벤더에게 가며, 진행·todo는 리텐션·온보딩 기능이다. 플랫폼 흡수 리스크: Claude Code는 auto memory·/goal·/usage 기여도·코드 인텔리전스 플러그인을 내장했고 최신 모델에서 TodoWrite를 기본 비활성화했다(v2.1.233+, 체크리스트 툴이 컨텍스트를 잡아먹는다는 이유) — "진행 판단은 에이전트 todo가 아니라 산출물(커밋·테스트)에서 도출"이 방향이다.

### 3.3 토큰 절감 증거의 실체

| 출처                                    | 수치                                                                                                                                  | 판정                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Anthropic Advanced tool use(2025-11-24) | Tool Search로 툴 정의 77K→8.7K(−85%), Opus 4 정확도 49→74%; 5개 서버 58툴 ≈ 55K 토큰                                                  | 확인(1차)                                                         |
| ETH Zurich 2602.11988 v2                | 컨텍스트 파일은 성공률 개선 없이 비용 +20%; 개발자 작성 +2.4%(p=0.21, 비유의)                                                         | 확인, v1 수치 혼용 정정                                           |
| METR 2025-07 / 2026-02                  | 숙련 개발자 −19%(예측 +24%, 인식 +20%); 후속 −18%/−4%, METR 자신이 "하한"이라 명시                                                    | 확인                                                              |
| Cursor semsearch(2025-11-06)            | 오프라인 +12.5%, 온라인 코드 유지율 +0.3%(1,000파일 이상 +2.6%)                                                                       | 확인 — "효과는 있지만 작다"                                       |
| GitNexus DeepSWE(벤더 실행)             | 통과 68.4% vs 37.0%, 해결 태스크당 $0.88 vs $1.79, 시도당 비용 −9.4%                                                                  | 확인, 독립 재현 없음                                              |
| Graft README(벤더)                      | 토큰 −42%·툴콜 −46%(162회, 3회/과제), SWE-bench 50건 33 vs 27(단일 실행, p=0.22 지적)                                                 | 확인; 헤드라인 "4× cheaper"는 표와 불일치                         |
| codebase-memory-mcp 2603.27277          | 토큰 10×↓·툴콜 2.1×↓, **품질 83% vs 92%**                                                                                             | 확인                                                              |
| 독립 측정                               | ilzam: 토큰 −43%·비용 −25%·시간 2배; kubeblogs Graphify: 1라운드 더 비쌈, 2·3라운드 5.4%·17.9%, 에이전트가 grep 46회 vs graphify 18회 | 확인                                                              |
| ContextBench 2602.05892                 | 읽은 컨텍스트의 19.6–43.5% 미사용, 성공과 최고 상관은 "컨텍스트 효율"                                                                 | 확인                                                              |
| 우리: databrain v3                      | −67.39% [63.67, 70.19], +8.69pp — **사람이 쓴 retrievalQuery로 스크립트가 조립한 컨텍스트, 모델 1회 호출, 툴 정의 0**                 | 반박 확인: checkout 군도 스크립트 조립                            |
| 우리: graph-surface v2                  | 시행당 입력 토큰 그래프군이 적음(luna −3.5%, sonnet −24.7%)이나 턴 +2.31·PASS −12.5pp; 하네스 출력 상한이 제품보다 타이트             | 반박 확인: "순절감 음수 개연성"은 과장 — 정직한 표현은 **미측정** |

결론: 방어 가능한 주장은 "토큰 N%"가 아니라 **"수용된 변경당 비용·불필요한 파일 읽기·툴콜 수·한도 여유"**이며, 그것도 사용자 레포에서 페어드 A/B로 측정한 뒤에만(ADR-012). 에이전트가 툴을 안 쓰면 효과는 0이므로 훅·지시문 통합 설계가 그래프 품질보다 중요할 수 있다. 스테일 그래프는 "없는 것보다 나쁘다"(Boris Cherny의 RAG 포기 이유: stale index·권한 복잡성) — 푸시 웹훅 재스캔·노드별 last-indexed·신선도 배너가 테이블 스테이크.

### 3.4 진행·위험·todo의 "좋음" 기준(인접 제품)

- **위험**: CodeRabbit 리뷰 노력도 1–5·Linked Issue Assessment·Triage(Risk level/Security/Blast radius, Team+; blast radius·아키텍처 영향은 $72); Greptile strictness 1–3·저위험 자동 skip; GitNexus impact `Depth 1 (WILL BREAK)`/`Depth 2 (LIKELY AFFECTED)` + 엣지 신뢰도 % + risk_level; Meta RADAR DRS(10% 플래그로 사고 60% 포착, revert 1/3); Prime Video "변경 볼륨은 노이즈, 구조 복잡도가 신호"; LinearB 100/400/800 LOC·파일 10개 초과; Codecov 패치 커버리지; Lovable 게시 시점 스캔(한 줄 요약→critical만 펼침); Devin 🟢🟡🔴 신뢰도(비녹색이면 승인 대기); Sentry Seer fixability 0–1 → 자동화 상한. 솔로에게 리뷰 도구의 1순위 이탈 사유는 **노이즈**.
- **진행**: Linear 에이전트 세션 상태 6종(활동에서 자동 도출) · Copilot coding agent(👀→드래프트 PR→체크리스트 갱신) · Claude Code agent view 상태 · 최신 모델의 체크리스트 툴 비활성 → **자기보고가 아니라 산출물에서 도출**.
- **todo**: 완료율이 아니라 **요구사항 대비 준수도**(Qodo Fully/Partially/Not, CodeRabbit Linked Issue 표, spec-kit `/speckit.analyze` 교차 일관성, beads `bd ready`).

### 3.5 조사 검증에서 나온 정정(문서·사이트 인용 시 적용)

- claude-mem 스타는 72.4K(2026-05 인용)가 아니라 **93.1k**(2026-09-04 API). GitHub API 재확인: Graphify 114,616 · CodeGraph 69,420 · GitNexus 46,991 · Task Master 28,045 · Serena 28,780 · spec-kit 133,418 · beads 26,874 · codebase-memory-mcp 42,034 · Graft 5,482 · Repowise 6,314.
- SO 2025 응답자는 3.3만이 아니라 **49,000+**(공개 2025-07-29). Sonar "장애 44% 감소"는 "장애 보고 가능성 44% 낮음(자기보고·벤더)"로만 인용.
- Greptile 82% vs 44% 검출은 제3자 벤치가 아니라 **Greptile 자체 벤치**. Sentry Seer 자동화 enum 명칭은 DeepWiki(AI 생성) 출처 — 공식 라벨과 다름.
- Cursor Teams는 $40 외 Premium **$120**; Pro 크레딧 구조는 2026-09 현재 "Cursor Models 풀/Other Models 풀"로 바뀜. Windsurf/Devin 가격은 429로 1차 미검증. Lovable Pro/Business 금액은 공식 페이지에 미표시(2차만).
- AI-native GRR 40%의 1차 출처는 Userpilot이 아니라 ChartMogul(Kyle Poyar) 2025-12, AI-native 표본 ~200개사.
- Claude 주간 한도(Pro 40–80h)는 2025-08 시행 값이며 2026-05 한도 조정이 있었다 — "한도 안에서 더 오래" 환산 시 현재 값 필요.

---

## 4. 기능 품질 감사 (4건 + 반박 + 비평)

각 감사는 코드를 읽고 실레포 화면을 재구성했으며, 반박자가 코드·PGlite 실행으로 재검증했다. 아래는 **반박 반영 후**의 사실이다.

### 4.1 토큰 절감

- **오늘의 실체**: 사용자가 보는 유일한 수치는 `/app/stats`의 "선택 n / 전체 덤프 m → k% 감소"인데, ⑴ `request_context_pack` 호출에서만 생기고 지시 블록은 이 툴을 권하지 않으며 ⑵ 프로덕션 아티팩트에 **본문이 없어**(`artifacts`에 content 컬럼 없음, `supabase-store.ts:613-614`가 `metadata.summary ?? ""`) enrich 전에는 모든 후보가 1토큰으로 계산돼 %가 **문서 개수 비율로 퇴화**하고 ⑶ 워크스페이스 단위·30일 보존(기본, 워크스페이스별 설정 가능)이다. 데모 셸의 "상시 로드 token 비용" 표와 "턴당 1,840 tokens" 칩은 픽스처 상수이며 실데이터 화면에 없다(e2e가 문구를 잠금).
- **반박 정정**: `get_node_content`는 "본문 무제한"이 아니라 enrich 요약(≤1,500자) 또는 `""`를 반환한다 — 실레포의 문제는 비대가 아니라 **내용 부재**. `memory_read` 상한은 블록당이 아니라 (anchor, name) 쌍당 12건이고 무필터 조회에 limit이 없다. 지시 블록은 899자(≈225토큰), id-first는 지시 블록·`get_graph_schema.text`·`get_neighbors`/`get_node_content` 툴 설명 세 곳에 박혀 있다. 프로덕션 MCP access event는 **1건**(2026-08-27) — 실사용 데이터가 없다. 툴 호출마다 워크스페이스 11개 테이블을 전량 재조회한다(MT-5) — 첫 병목은 토큰이 아니라 왕복일 수 있다.
- **품질 바**: 실세션 순절감(툴 정의 포함) 과제당 총 입력 ≥20%·CI 하한 >0, PASS Δ 하한 ≥−5pp·턴 Δ ≤+1, 툴 정의 ≤1,500토큰(count_tokens)·툴 ≤14~16, 지시 블록 ≤300토큰·첫 파일 읽기 전 강제 호출 ≤2, 레포별 미터 = 서빙 토큰(실측)·에이전트 보고 usage(옵트인 훅)·팩 예산(추정) 세 컬럼 분리 + 증거 부족 상태, §5.2-③ 상시 로드 표를 `artifacts.size_bytes`·classification으로 실데이터화.
- **판정**: 오늘 아니오. 툴 카탈로그 다이어트·문안 통일·텔레메트리·**프로덕션 형태(요약 전용 스토어)로 구성한 v3** 통과 후에도 단독 결제 사유가 아니라 번들의 보조 근거.

### 4.2 진행도 판단

- **오늘의 실체**: 프로덕션(active 요구사항 99건)에서 "요구사항 커버리지 **0%**"(거짓 — `implements` writer 없음), todo 완료율 "측정 안 됨"(파일명이 todo/progress/status/roadmap/handoff일 때만 파싱; spec/BUILD_PLAN·docs/PLAN.md는 todo가 아님), 타임라인은 `Receipt recorded for <sha7>` 반복(receipt summary에 제목 키 없음; 단 `predicate.coverage`에 결정론 커버리지가 이미 있어 스키마 변경 없이 제목화 가능), 로컬 인제스트 레포는 타임라인이 빔. 에이전트는 `log_progress`를 호출하라는 지시를 받은 적이 없다(지시 블록 BODY에 없음; 최소 인덱스는 `permission_required` 게이트로 PR이 열리지 않고 설정 화면 `<pre>` 수동 복사 경로만 존재).
- **반박 정정**: 113건→99건(픽스처 제외 후). "throw로 막힘"은 오진 — 실제 게이트는 authorization 고정값. spec 체크박스의 fulfilled는 "버려진" 것이 아니라 룰 엔진(missing-implementation·missing-test·implVerified)과 receipt coverage가 소비한다 — 진행 화면이 안 읽을 뿐. write 툴의 access_event 발행은 스펙 규칙이 아니라 비일관(assert_link·memory_write·record_ruled_out은 발행, log_progress·record_note는 미발행). UI 테스트가 거짓 0%를 고정한다(`progress-dashboard.test.tsx:36-41`). 실스캔 e2e 발판이 이미 있다(`local-ingest-card.spec.ts:76`).
- **품질 바**: 거짓 정밀도 0(엣지 0이면 "미측정 — 구현 링크 없음"), implements 정밀도 ≥0.80(사람 라벨), 세션당 `log_progress` 채택 ≥70%(세션 = token_id별 30분 갭), 호출당 ≤150토큰(provider usage로 교체), 다이제스트(오늘/이번 주/마지막 방문 이후) 출처 링크 100%·반영 p95 ≤5s, stale 오탐 ≤20%·blocked 사유 노출 100%, 문서 todo id 보존 ≥95%·이벤트 todo 중복 ≤10%, 코드 못 읽는 사용자 5명 중 4명이 60초 내 3문항 정답.
- **판정**: 오늘 아니오(0%는 신뢰 손실 요인). 제안 적용 후 "드리프트 검증을 매일 열어보게 만드는 리텐션 표면" — 결정론·0크레딧이라 토큰 주장 없이 정직하게 팔 수 있는 번들 요소.

### 4.3 위험 영역 판단

- **오늘의 실체**: 6종 룰 전부 `spec/adr/agents/claude/cursor_rule` 분류 위에서만 발화 → **spec 없는 바이브 레포(파일럿 LostArk_Scheduler 370파일)에서 findings 0**. finding 앵커는 항상 문서 span → 맵 링·findingCount가 문서 노드에만 붙고 코드 노드는 도달 불가. 의존성 감사 위젯은 업로드 경로가 없어 영구 "증거 부족". CI 리포트 인제스트(`ci-reports.ts`, `GitHubCiEvidenceSource`)는 구현됐으나 **미배선** → evidence writer 0 → verified 등급 도달 불가(초록/호박 정체성이 호박 단색). `impact_of`에 tier·bound·영향 테스트/문서 수 없음, 지시 블록이 편집 전 `impact_of`/`get_findings`를 지시하지 않음.
- **반박 정정(더 나쁨)**: 모든 finding은 severity cap으로 **영원히 {medium, low}** — 대시보드 critical/high 정렬·필터는 죽은 경로이고 "심각도 가중" 위험 점수는 무의미. 문서 신선도 "드리프트 의심" 위젯은 stale-doc title이 .md 경로를 담을 수 없어 도달 불가(단위 테스트가 조작 title로 통과). MCP `get_findings`는 프로덕션 provenance를 `{reason}`으로 평탄화해 경로·라인·권장 조치가 사라진다. 판정 10크레딧을 써도 UI는 "판정 완료"만 그리고 verdict(rejected)는 finding 상태에 반영되지 않는다. PageRank는 이미 `importanceMap`이 맵 반지름으로 쓴다(재계산 불필요). `get_findings` 기본 필터 없음(resolved까지 반환). 기존 룰의 오탐 구조(미체크 태스크마다 medium, 산문 스펙의 unproven-claim 대량 발화)는 한 번도 측정되지 않았다.
- **품질 바**: 문서 없는 레포에서도 코드 파일 ≥100이면 위험 상위 10이 비어 있지 않음(구조 신호: untested-code·팬인·공변경), 상위 10 정밀도 ≥0.70(사람 라벨, 사전등록), 모든 RiskEntry가 factors ≥1 + provenance + grade inferred(계약 테스트), 코드 노드 링 3단계·범례·인스펙터 요인, 커버리지 리포트 없는 레포에서 "0%" 대신 "측정 안 됨", `impact_of` 응답에 confidence 카운트·bound·affected{tests,docs,requirements}, 결정론·수렴·추가 본문 fetch 0·크레딧 0, dismiss·verdict 반영, 푸시당 영향 반경 3수치.
- **판정**: 오늘 아니오. 코드 노드 앵커 + `untested-code` + 팬인·공변경 요인 + 그래프 링 + 편집 전 `impact_of` 경고 이후 **번들의 유료 정당화 축**(시장이 좌석당 돈을 내는 유일한 항목이 판정) — 단 정밀도 게시 전에는 "위험 후보"로 카피.

### 4.4 todo 체크

- **오늘의 실체**: `[ ]`/`[x]`만 open/done 2상태(`[~]`·`[-]`·`[/]` 탈락, 중첩 평면화), 파일명 정규식 인식(spec-kit tasks.md·PLAN.md·BACKLOG.md·.beads·숫자 접두 핸드오프 미인식; 실레포 파일럿 인식률 측정된 0), `log_progress`는 ULID 또는 `progress:`+lower(task)로만 매칭 → 문서 todo와 에이전트 todo는 절대 합쳐지지 않고 **근거 없는 done이 SQL 수준에서 허용**, 에이전트는 todo를 읽을 툴이 없다(MCP는 TODO.md 체크박스조차 못 봄 — content가 요약/빈 문자열), 레포 역동기화 없음.
- **반박이 찾은 결함(PGlite 재현)**: ⑴ 체크박스 제목 **240자 초과 시 스캔 전체 롤백**(`todos_title_length` CHECK; 이 레포 BUILD_PLAN_PHASE4 18항목 전부 1,132자 이상 → spec 체크박스를 todo로 파싱하면 자기 스캔이 죽는다) ⑵ 문서 상단 1줄 삽입 후 재스캔 시 ULID 생존 1/10, 그 1건은 **바이트 충돌로 다른 항목에 오귀속** ⑶ `progress_events.todo_id` FK에 ON DELETE 없음 → 에이전트가 ULID로 기록한 뒤 문서 편집 시 `apply_repository_scan` 전체가 FK 위반으로 실패하고 이후 모든 스캔이 **영구 wedge** ⑷ 문서 todo 카드의 원문 링크가 데모 `/findings`로 가는 dead link ⑸ `full` 상태 카피("모두 출처 있는 완료 증거")가 자기 신고 done으로도 표시.
- **품질 바**: 증거 기반 done ≥80%(연결 경로 커밋/해소 finding/CI pass), 근거 없는 done은 100% "claimed"(호박), 불변 재스캔 delta 0·상단 편집 후 id 보존 100%·미병합 ≤2%, 세션 내 반영 100%, 인식 픽스처 8종 중 ≥7, todo↔요구사항↔코드 연결 ≥90%(reference), stale precision ≥90%·recall ≥70%, `log_progress` ≤150·읽기 ≤400토큰/50항목, 세션 ≥70%에서 기록·시작 시 읽기 ≥80%.
- **판정**: 오늘 아니오(Claude Code 네이티브 todo + 자기 TODO.md로 이미 갖고 있음). 정체성·FK·240자 수정 + 읽기 툴 + 증거 등급 이후 "세션을 넘어 살아남고 done마다 근거가 붙는 리스트"로 번들 구성 요소 — 단독 결제 사유 아님.

### 4.5 완전성 비평 — 감사가 놓친 것(요지)

⑴ **T2FV**: 연결 시 스캔 없음(OQ-029) + 푸시 뒤에도 findings 0·본문 없음·enrich 수동 크레딧 → "5분 내 첫 발견"이 아니라 "더미 푸시 + 결제 뒤에야 내용" — 분 단위 실측 부재. ⑵ **라이브 발광이 라이브가 아니다**: 서버는 Realtime 브로드캐스트하지만 브라우저 구독 코드가 0건 — `/app/map`의 window 버스에 이벤트를 넣는 유일한 코드는 데모 시뮬레이터. 시그니처 경험(§1.4-②)이 페이지 로드 시 20건 재생뿐. ⑶ **그래프 뷰 자체**(히어로)에 "코드 못 읽는 사용자가 60초 안에 자기 프로젝트를 알아본다"는 품질 바가 없다. ⑷ **결제 경로·플랜 게이트 없음**(plan 컬럼 없음, Free/Pro 차이는 보존 기간 하나, MCP 레이트 리밋 없음). ⑸ **크레딧이 사는 것의 가치 미평가**(판정 10크레딧 → "판정 완료" 문자열). ⑹ **스펙 없는 레포의 요구사항 부트스트랩 부재** — 드리프트(유료 차별화)가 스펙 보유 레포 전용. ⑺ 라이브 finding 상세 화면 없음(§5.2-②). ⑻ 영수증의 사용자 가치 미정의(스펙 없는 레포에서 "0·0·0" 도장, implVerified가 체크박스를 verified로 셈 — §3-1 긴장). ⑼ 하네스 대시보드·지시문 린트(0크레딧 피치)가 라이브에 없고, 출하되는 Cursor 변형이 `alwaysApply: true`라 §1.5와 충돌. ⑽ 팀 초대 경로 없음. ⑾ 에이전트의 **코딩 결과**(기존 테스트 통과율·엉뚱한 파일 접촉)가 한 번도 측정되지 않음. ⑿ Codex·Cursor 결과 미평가(훅은 Claude Code 전용). ⒀ 재방문 트리거(알림) 0. ⒁ **레포 단위 스코핑 부재** — 모든 라이브 로더가 workspace 평면, "Pro = 무제한 레포"가 두 번째 레포에서 데이터가 섞이는 blocker. ⒂ 라이브 화면을 실스캔 위에서 검증하는 e2e 0 — "제품이 동작한다"는 자동 증거는 픽스처가 동작한다는 증거.

**모순 13건 중 핵심**: 같은 벤치 증거를 놓고 반대 판정(v3 MET vs v2 NOT MET vs 세션 미측정 — 셋 다 다른 질문); 툴 개수 방향 정반대(다이어트 22→14 vs 계획·감사 합산 27); 지시 블록 300토큰 예산에 네 감사가 각자 필수 호출을 얹어 합산하면 두 배 초과; "본문 서빙" 전제가 감사마다 달라 출하되지 않는 문제를 고치는 제안이 섞임; "실레포"가 감사마다 다른 레포; verified 정의가 제품 안에 둘(영수증 implVerified vs 맵). **횡단 주제**: `implements` 엣지 하나에 네 기능이 매달림; 에이전트가 기록하지 않으면 네 화면이 비고 기록시키는 문안은 토큰 예산과 충돌; 프로덕션 아티팩트 본문 부재가 토큰 미터·todo 읽기·위험 컨텍스트·첫인상·벤치 대표성을 동시에 흔든다(하드룰 ③의 직접 귀결 → 제품 결정 필요, OQ-039); 데이터 모델 잔결함(오프셋 정체성·FK·240자·provenance 평탄화·repository_id 부재)은 **v6 통합 마이그레이션 한 파일**로 묶어야 두 경로 동등성 회귀를 한 번만 치른다.

### 4.6 최소 유료 번들 (비평 종합, 판단이지 예측이 아님)

"연결(또는 푸시)마다 갱신되는, 내 레포의 정직한 상태판" — 하나의 그래프 위 세 신호, 전부 결정론·크레딧 0:

1. **내 코드가 보이는 그래프**: Wave A(링크 복구·implements·문서/폴더/도메인) + Wave B(커서 줌·fit·hover·드래그) + Wave C 백필 스캔 + **라이브 발광 브리지 + HUD 실데이터 칩**(계획에 없던 신규).
2. **오늘/이번 주 진행 원장**: 거짓 0% 제거, v6 통합 마이그레이션(todo 재키잉·FK ON DELETE SET NULL·240자 절단·repository_id·findings target_node_id·edges.family), `query_brain(kind:'todo', format:'table')`(새 툴 없음), 다이제스트·stale/blocked 상단, 커밋 항목 제목 = receipt coverage.
3. **문서 없이도 뜨는 위험 지도**: finding 코드 앵커 + `untested-code` 룰 + 팬인·공변경 요인, 링 3단계·범례·인스펙터 요인, `get_findings` 기본 open, 정밀도 사전등록 후 게시(전에는 "위험 후보").
4. **배선층 = 예산 문서**: 툴 ≤16(search_nodes→search_index 흡수, get_artifact↔get_node_content 통합, route_query·record_note·record_prompt 미노출, request_rescan 추가), count_tokens 상한 계약 테스트, 지시 블록 ≤300토큰(시작 `query_brain(kind:'todo')` 선택 1회 · 진입 `search_index` 1회 · 관계형만 그래프 툴 · 3회 후 파일 폴스루 · 위험 후보 편집 전 `impact_of` 1회 · 종료 `log_progress` 1회 + `memory_write` ≤1회), SessionEnd 훅은 `log_progress` 요약 1건만. 이 예산이 v3의 측정 대상이며 v3는 **프로덕션 형태(요약 전용 스토어)**로 그래프군을 구성한다.

빼는 것: 토큰 절감 카피(v3·텔레메트리 통과 전, 레포별 "내 숫자"만), AI 판정·코칭(verdict 미소비·가치 미증명), doc_page(G3·크레딧), 영수증(포함하되 피치 제외; implVerified 라벨을 "체크됨"으로 정정), 팀, CI verified(상위 업셀 후보), 심볼. **"예"의 선행 조건(전부 미충족)**: (a) 결제 경로 + 레포 단위 스코핑 (b) 스펙 없는 레포의 요구사항 부트스트랩 결정 (c) 실스캔 픽스처 위 라이브 전용 e2e (d) 측정 4종 — T2FV ≤5분, 위험 상위 10 정밀도 ≥0.70, 세션당 log_progress ≥70%, 설치된 예산으로 v3 PASS 비열등·턴 비증가.

---

## 5. Phase 4 계획에 반영한 변경 (요약 — 본문은 `BUILD_PLAN_PHASE4.md` v2)

| 변경                                        | 내용                                                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave A todo 0 신설 "링크 복구"              | 별칭·배럴 해석, `tests` 파생(reference), `LINK_SCHEMA_VERSION` + `mode:'full'`, set-based 링크 적용, protocol 중복 제거·`1/min(deg)` 복원, `measure-graph-density.ts`                                                                 |
| Wave A todo 1~4 확장 + v6 통합 마이그레이션 | 전 md 노트화·ignore·`.alrescha.json layers`, `edges.family`, directory/contains(layoutOnly)·areaHint·clusterGraph/MT-6 삭제·허브 별도 상한, 도메인 6종·unit, todo 정체성·FK·240자·repository_id·findings target_node_id·untested-code |
| **Wave A′ 신설** 허브 패밀리                | route+handles, db_object+queries/defines/modifies, section(선택), unit 태그·4종 모양, 밀도 회귀 테스트                                                                                                                                |
| Wave B 확장 + 신규 todo                     | 패밀리별 힘장·collide, 스타일 그룹 stroke·Sprite·컬링·리비전 지오메트리, `hierarchyAssignment`·setVisibility·레이어 토글·앵커 슬라이더·Obsidian 패리티, **라이브 발광 브리지 + HUD 실데이터**                                         |
| Wave C 확장                                 | 백필 스캔이 link_schema_version 불일치 시 full, `request_rescan(mode)`, `run-local.ts` 지연 생성, **CI 증거 배선(verified 경로 개통)**                                                                                                |
| Wave D 확장                                 | 0크레딧 표면 묶음(산문 노출·다이제스트·finding 상세·dismiss/verdict 반영·커밋 제목), doc_page "페이지=얼굴"·md5 슬러그·스켈레톤 0크레딧, `query_brain` 필터(todo·risk·family) + 위험 지도 빌더                                        |
| Wave E 재정의                               | todo 16 = **예산 문서**(툴 다이어트·문안 통일·훅·impact 신뢰도·families 필터·loadWorkspace 분리), 16b 텔레메트리, 16c 레포별 미터·상시 로드 표, 17 v3 = 프로덕션 형태 스토어 + 부속 실험(progress·risk·todo)                          |
| Wave F 사양 확정                            | 심볼 헤일로·슬라이스 API·`loadSymbolNeighborhood`·OQ-019 실험 조건                                                                                                                                                                    |
| 사용자 결정 목록                            | OQ-039 무료 티어 서빙 내용 · OQ-040 가격 티어/게이트 · OQ-041 스펙 없는 레포 요구사항 부트스트랩 · OQ-042 레포 단위 스코핑                                                                                                            |

## 6. 가드레일·ADR 충돌 판정

| 항목                                                                     | 판정                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 하드룰 ① verified 분리 vs `tests`·`implements`                           | 새 패밀리 전부 resolved/reference/inferred. `tests`·`implements`가 `SUPPORTING_RELATIONS`에 있으나 소스가 evidence 노드일 때만 승격 — 단언 추가. **영수증 implVerified(체크박스=verified)는 §3-1과 긴장 → 라벨 정정**(OQ-036 병기) |
| 하드룰 ② provenance vs contains·handles·co_changed·layoutOnly·앵커       | span 없는 패밀리는 `{reason, tier}` 명시. layoutOnly·앵커는 엣지가 아님을 타입·스펙 문장으로 격리(OQ-037)                                                                                                                          |
| 하드룰 ③ 원본 비저장 vs 문서 인라인 코드·심볼                            | 경로형 토큰만 매칭·값 비저장, 테이블명·심볼명은 식별자 메타데이터, 심볼 시그니처·독스트링 저장 금지(`verify-scope-boundaries` 확장). **귀결: 무료 사용자의 MCP는 enrich 전 내용이 없다 → OQ-039**                                  |
| 하드룰 ⑤ 항상-로드 금지 vs 출하되는 Cursor `alwaysApply: true` 지시 블록 | 긴장 — 지시 블록은 ≤300토큰 인덱스이므로 "최소 인덱스" 범주로 해석하되 OQ-032 문안 통일 시 명시                                                                                                                                    |
| 하드룰 ⑥ MCP stateless·레포 변경 금지 vs `request_rescan`·families 필터  | 잡 큐가 상태 소유, 새 툴은 rescan 1개(순증 0 목표: 통합으로 상쇄)                                                                                                                                                                  |
| 하드룰 ⑦ 과금 vs 새 패밀리·doc_page                                      | 새 과금 경로 0. docskeleton은 결정론 0크레딧 목록에 추가(마이그레이션)                                                                                                                                                             |
| 하드룰 ⑧·ADR-012 vs 본 문서 수치                                         | 밀도·차수는 에뮬레이션 추정, fps·TTFB·토큰은 실측 게이트 전 미게시. 외부 수치는 출처·검증 상태 병기                                                                                                                                |
| ADR-013 동등성 vs 허브·co_changed 백필·dot-dir 제외                      | 허브는 SQL 유도(플랜 불변) 또는 플랜 메타데이터(strict 스키마 동기 + 바이트 동등성 테스트). co_changed 백필은 OQ-035. **GitHub 경로에 dot-dir 제외가 없고 CLI에는 있다 → 회귀 항목**                                               |
| ADR-014 vs Python/FastAPI                                                | calls 0·handles reference를 배지로 정직 표기, OQ-019는 Wave F 실험 조건으로만                                                                                                                                                      |
| ADR-015 vs 로컬 인제스트                                                 | 무충돌. 단 타깃 사용자가 더 얇은 경로(CLI)를 쓸 가능성 → OQ-030 우선순위 상향                                                                                                                                                      |
| WORK_SPEC §5.1 `/app/[repo]/…` vs 라이브 워크스페이스 평면               | 스펙 미구현 — OQ-042                                                                                                                                                                                                               |
| WORK_SPEC §16 알림 비목표 vs 리텐션 표면                                 | 재판정 후보로만 기록(이번 계획 범위 밖)                                                                                                                                                                                            |

## 7. 출처

**내부(이 세션 산출·재검증):** 설계 4안·심판 3인·합성(워크플로 `galaxy-graph-design-panel`), 조사 5주제·검증 5(`vibe-coding-monetization-research`), 감사 4·반박 4·비평 1(`feature-quality-bar-audit`) — 저널은 세션 워크플로 디렉터리. 코드 인용은 본문 파일:라인. 실측 스크립트: `tools/list` 측정(InMemoryMcpStore, 원시 JSON-RPC), `git ls-files` 기반 링크 후보 카운트(이 레포·`../30m`).

**외부(2026-09-04 조회, 검증 상태는 §3.5):** Anthropic advanced-tool-use · effective-context-engineering · code.claude.com best-practices/tools-reference/memory · arXiv 2602.11988(v2) · 2603.27277 · 2602.05892 · 2603.17973(TDAD) · 2605.30208(RADAR) · 2607.06766 · 2606.27045 · metr.org 2026-02-24 · cursor.com/blog/semsearch · june-2025-pricing · akonlabs.com/benchmarks · github.com/trailhq/Graft · kubeblogs Graphify 테스트 · ilzam.dev · pantheon 재현 · sonarsource.com State of Code 2026-01-08 · survey.stackoverflow.co/2025 · chartmogul.com conversion·retention 보고서 · lennysnewsletter free-to-paid · growthunhinged B2B monetization 2026 · github.blog Copilot usage-based billing · cursor.com/pricing·docs · claude.com/pricing · coderabbit.ai/pricing·docs/triage · greptile.com/pricing·benchmarks·v4 · docs.sentry.io/pricing · docs.devin.ai · linear.app/developers/agent-interaction · atlassian.com/software/jira/ai · linearb.helpdocs.io · about.codecov.io · docs.lovable.dev/features/security · docs.qodo.ai · symvanta.com · codealive.ai · trynia.ai · context7.com/plans · repowise.dev · getunblocked.com · cmem.ai · supermemory.ai · mem0.ai · getzep.com · specstory.com · tessl.io · kiro.dev · tryhamster.com · graphify.com/pricing·blog · github.com/{colbymchenry/codegraph, abhigyanpatwari/GitNexus, DeusData/codebase-memory-mcp, oraios/serena, thedotmack/claude-mem, steveyegge/beads, eyaltoledano/claude-task-master, github/spec-kit, ryoppippi/ccusage, basicmachines-co/basic-memory} · blog.pebblous.ai GitNexus 프로덕션 리포트 · techcrunch/engadget/macrumors 한도 관련 기사 · lucumr.pocoo.org 2025-12-22 · buildtolaunch 토큰 최적화 · dev.to 4개 리뷰어 병렬 테스트.
