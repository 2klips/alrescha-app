# arr-app — Phase 4 Work Plan v2: 은하수 그래프 · 계층형 Data Brain · 기존 레포 온보딩 · 정직한 상태판(유료 번들)

> **개정 이력:** v1 2026-09-03(R4 `RESEARCH_GRAPH_SECONDBRAIN_2026-09-03.md` 기반) → **v2 2026-09-04** — 사용자 지시("은하수처럼 빽빽한 그래프 + 성능", "토큰 절약·진행도·위험·todo가 유료 요금제를 들 만큼")에 따라 설계 패널·상업성 조사·기능 감사를 수행한 [`RESEARCH_GALAXY_MONETIZATION_2026-09-04.md`](RESEARCH_GALAXY_MONETIZATION_2026-09-04.md)(이하 R5)를 반영. todo를 전면 재번호했다(구→신 대응표는 §부록).
> **Governing decisions:** `DECISIONS-ADR.md` — ADR-001(AI 산출물은 `inferred`), ADR-012(효율 수치는 벤치 통과 전 게시 금지), ADR-013(CLI/GitHub 두 경로 동등성·메타데이터만), ADR-014(tree-sitter 미채택 — OQ-019 재판정 예약), ADR-015(보증은 서버 관측 증거만). WORK_SPEC §3 가드레일 10개.
> **충돌 우선순위:** ADR = WORK_SPEC > 이 계획 > GUIDE. 드리프트 검증·receipt·팀 표면의 **의미**는 건드리지 않는다(라벨 정정·앵커 추가는 허용) — 기존 테스트·가드레일은 그대로 green.
> **협업:** Claude Code와 Codex가 웨이브 단위로 분담한다(§협업 규약). 이 문서가 두 에이전트의 단일 진실 소스다.

## TL;DR (For humans)

Phase 3까지 "push → 스캔 → 그래프 → MCP 22툴 → enrich → 벤치"가 완주됐지만 사용자가 실레포에서 본 것은 "문서끼리 연결된 덩어리"였다. R4·R5가 코드로 확정한 원인은 렌더가 아니라 데이터다: **비상대 import(`@alrescha/*`·`@/`)를 버리고, 변경 없는 파일은 영원히 재링크되지 않으며, README·docs·sql·css는 아티팩트조차 아니고, 요구사항 노드는 엣지가 0이며, facet은 이 레포의 모노레포 관례만 안다.** 그래서 프로덕션 구조 엣지는 ~135인데 같은 레포의 결정론 링크 후보는 ~1,036쌍이다. 여기에 힘장 링크 중복·600 초과 시 15덩어리 붕괴·DOM 히트 600 캡이 얹혀 "알아볼 수 없는 형태"가 된다.

**Phase 4 v2의 골격은 "모든 파일은 노트, 모든 결정론 관계는 링크(14패밀리), 허브는 SQL이 경로에서 유도한다"**이며(설계 패널 승자 + 계층/허브 설계의 실행 규율 이식), 목표 밀도는 이 레포 노드 ~1,260·엣지 ~4,000·평균 차수 ~6.3(0크레딧, 추정 — `measure-graph-density.ts`로 실측 후 게시). 그 위에 사용자가 유료로 받아들일 "정직한 상태판" 세 신호(은하수 그래프+라이브 발광, 진행 원장, 위험 지도)와 그것을 살리는 배선층(툴·지시 블록 예산)을 얹는다. **토큰 절감·AI 판정·doc_page·영수증·팀은 번들의 근거가 아니라 부속**이다(R5 §4.6).

**Effort:** XL(7 waves, 28 todos) · **Risk:** Medium-High — 노드 kind 4종·relation 6종·`edges.family`·v6 통합 마이그레이션이 스키마와 계약 테스트를 넓게 건드리고, Wave B는 e2e 120건이 걸린 화면을 만진다(단언 약화 금지·경로만 이동).

**Decisions locked (do not relitigate):**

- 렌더 스택은 graphology + d3-force(Worker) + Pixi.js v8 **유지**. 격차는 전부 구현 공백(R4 §2.2, R5 §2.7).
- **설계 골격 = Obsidian-native(설계 ①) + 계층/허브 설계(②)의 규율.** `feature`·`domain`은 노드가 아니다(색·접힘 키·앵커). 심볼 노드는 Wave F, 생성 문서 페이지는 Wave D — 둘 다 은하의 원천이 아니다.
- **Phase 0(링크 복구) 없이는 어떤 노드·엣지도 화면에 도달하지 않는다** — Wave A todo 0이 모든 웨이브의 선행 조건이다.
- 새 엣지 패밀리는 전부 resolved/reference/inferred. `tests`·`implements`는 reference ≤0.6, **`verified`는 실행 증거만**(ADR-001). 영수증 `implVerified` 라벨은 "체크됨"으로 정정(OQ-036).
- `edges.family` 8종(structure·hierarchy·doc·database·route·statistical·semantic·evidence)으로 읽기 상한·힘장·그리기·MCP 기본값을 패밀리 단위로 정한다. 파일 레벨 NODE_LIMIT 2,000 유지, 허브·패밀리별 별도 상한(OQ-038).
- 데이터 모델 잔결함(todo 오프셋 정체성·FK ON DELETE·240자 CHECK·repository_id·finding target_node_id·provenance 평탄화)은 **v6 통합 마이그레이션 한 파일**로 묶는다 — 두 경로 동등성 회귀를 한 번만 치른다.
- 레이아웃 관례 설정은 레포 내 `.alrescha.json`(ADR-013). 관례 밖은 `기타`로 정직 표시.
- id-first는 관계 질의에만. 지시 블록·최소 인덱스·툴 설명 세 곳을 **하나의 상수**로 통일하고 **예산(툴 ≤16 · 블록 ≤300토큰 · 첫 읽기 전 호출 ≤2)**을 계약 테스트로 고정. 동적 툴 노출 금지, 훅은 옵트인·차단 없음.
- 그래프 뷰·결정론 스캔·MCP 읽기는 **무료**여야 한다(시장 기대치, R5 §3). 유료 게이트는 판정·자동 재스캔·히스토리·팀·동기화 — 구체 티어는 OQ-040(사용자 결정) 전까지 구현하지 않는다.
- 자체 효율 수치는 graph-surface v3(프로덕션 형태 스토어) 통과 전 게시 금지(ADR-012). 60fps는 브라우저 실측 게이트 통과 전 미주장.
- 순서: **A0 → A(1–5) ∥ B(9–15) → A′(6–8) → C(16–18) → D(19–21) → E(22–25) → (F 26–27 선택)**. A와 B는 파일이 겹치지 않아 병행 가능(Claude Code = A·A′·C·D·E, Codex = B + D19 웹 부분).

---

## 밀도 목표 · 성능 예산 (R5 §2.8)

| 단계                    | 이 레포 노드 / 엣지 / 평균 차수(추정)                                  | 전형 800파일 Next+FastAPI                | 게이트                                                                            |
| ----------------------- | ---------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| A0 링크 복구 **(완료)** | **실측 502 / 1,994 / 7.94 — 고유 쌍 기준 4.40, 고아 9.2%, 삼각형 546** | TS 절반 resolved                         | `scripts/measure-graph-density.ts` 실측 evidence, 두 경로 플랜 바이트 동등성      |
| A 데이터 정합성         | ~1,070 / ~3,200(표시 ~2,300 + contains ~885 layoutOnly) / ~5.9         | —                                        | `tests/graph-density.test.ts`: 평균 차수 ≥3 · contains 제외 고아 ≤10% · 삼각형 >0 |
| A′ 허브 패밀리          | **~1,260 / ~4,000 / ~6.3, 고아 ~7%**                                   | ~1,200 / ~3,200 / ~5.3(Python 성김 배지) | 동일 + 두 테마 스크린샷                                                           |

성능: 프레임 플랜 p95 <16.7ms(vitest, 1,300/4k·5k 컬링 케이스 신설) · 워커 틱 p95 <33.3ms · **브라우저 팬/줌 p95 <16.7ms는 `scripts/bench-graph-browser.ts`(Playwright, 호스트·GPU 명시) 통과 전 미주장** · 정착 후 idle 0프레임 · `/app/map` TTFB 회귀 0 · 필터·토글 시 워커 `start` 0건 · 페이로드 ≤300KB gz 목표 · `apply_repository_scan` set-based 적용 시간과 `/api/ingest/local` 타임아웃 여유 기록 · MCP 기본 로드 = structure+evidence+semantic만. 수치는 전부 실측 전 "추정"(§3-8).

## 보완 설계 접속 — Codex 인수인계 2026-09-06 (R-01–R-03 · P0-A–P0-D · S1–S6)

[인수인계](../docs/reports/CODEX_TO_CLAUDE_HANDOFF_2026-09-06.md)와 [보완 설계](../docs/reports/REMEDY_DESIGN_2026-09-06.md)의 P0을 **기존 todo에 수용 기준으로 붙인다.** todo 번호·담당·순서·기존 문안은 그대로다. 근거는 격리 실험(메모리 PGlite + 후보 SQL)이지 제품 검증이 아니므로(HANDOFF §6), 여기 붙는 것은 "무엇을 통과해야 완료인가"이지 "이미 참인 사실"이 아니다.

| 보완                           | 한 줄                                                                                                                                     | 붙는 todo                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **R-01 / P0-B** 읽기 완전성    | 무페이지 whole-workspace 조회를 scope별 bounded read로, 페이지마다 `hasMore`·coverage, 부정 질의의 unknown, 두 repo 같은 경로의 ambiguity | 22(loader 분리) · 21(부정 질의) · 19 |
| **R-01 #4 / P0-D** 근거 무손실 | edge의 family·provenance·tier·방향을 DB→loader→core→MCP 출력까지 보존. `(source,target,relation)` 삼중키 dedup으로 증거를 지우지 않는다   | **8**(게이트가 단언) · 22(계약)      |
| **R-02 / P0-A** 요약 최신성    | 읽기 freshness(`current`/`stale`/`unknown`/`missing`)와 **쓰기 CAS**(생성 시작 blob = 저장 시점 blob)를 함께. 실제 반영 건수를 반환       | 19 · 20 · 16                         |
| **R-03 / P0-C** 영향 의미      | discovery와 dependency-impact 분리. 역방향은 imports/calls만, `mode`·`semanticsVersion`으로 호환 이행                                     | **8**(게이트가 단언) · 21 · 22       |

**채택하지 않는 것과 그 이유:**

- 새 graph DB · 범용 query planner · immutable 전체 이력 — 보완 설계 자신이 선행 조건이 아니라고 적었다(REMEDY §1·§10).
- `loadWorkspace` 즉시 삭제 — 모든 caller가 옮기기 전에는 지우지 않는다(REMEDY §10).
- 새 MCP 툴(`prepareChange` 포함) — 툴 ≤16은 todo 22가 잠그는 계약이다. 내부 조정 개념으로만 둔다.
- 선택적 LSP/SCIP를 canonical 파서에 투명 추가 — 같은 커밋에서 실행 환경에 따라 출력이 달라진다(ADR-013/014 충돌, REMEDY §12-5).
- 로컬 메타데이터에서 verified finding·receipt 생성 — ADR-015 graph-only 유지.
- "11개 조회를 1개로" 같은 수치 목표 — 최신 loader에는 route·db_object 조회가 더 붙어 그 수치가 이미 낡았다(HANDOFF §3-B).

**완료 판정에 추가되는 음성 테스트:** A→B←C에서 `impact(A)`에 C 없음 · 999/1,000/1,001행 경계의 마지막 행 · `current`/`stale`/null/empty digest · 늦게 끝난 A가 최신 B를 덮지 않음 · 삭제된 파일 반영 0건 · edge 근거의 DB→MCP 왕복 · 불완전 조회에서 "테스트 없음" 단정 금지 · 두 repo 같은 경로의 ambiguity · batch 입력별 결과 · cursor 만료·권한 철회.

동봉된 probe(`docs/reports/research-upgrade-2026-09-05.probe.mjs`)는 **옛 동작을 확인하는 연구 코드**다. 제품 수정 뒤 실패할 수 있고, 통과시키려고 옛 동작을 복원하지 않는다(HANDOFF §5).

**진행:** S1(요약 freshness 읽기 + 쓰기 CAS + 실제 반영 건수) 완료 — [evidence](../.omo/evidence/phase4/remedy-s1.md). `module_summaries`·concept의 digest 조건부 저장은 todo 20 소관으로 남는다.
S2 완료 — [S2a 근거 무손실](../.omo/evidence/phase4/remedy-s2a.md)(한 어휘·edge provenance·누락 보고), [S2b 경계 있는 읽기](../.omo/evidence/phase4/remedy-s2b.md)(order+limit+coverage·부정 질의 unknown·targeted lookup·경로 ambiguity·batch 입력별 결과). 커서/페이징과 revision fence는 S3.
S3 완료 — [evidence](../.omo/evidence/phase4/remedy-s3.md): `read_edge_page`(keyset·n+1 hasMore·행/바이트 예산·`exactCount` null·service_role 전용 EXECUTE)와 스토어의 커서 페이징. 실 PostgreSQL(PGlite)에서 99/100/101 경계·권한 음성 테스트. 나머지 컬렉션과 revision fence(OQ-053)는 미착수.
S4 완료 — [evidence](../.omo/evidence/phase4/remedy-s4.md): `impact_of`에 `mode`·`semanticsVersion` 추가, `dependency-impact`는 imports/calls 역방향 전이 폐쇄(cycle 종료·경로 근거·test 종단·budget 보고). 기본값은 그대로 `related-neighborhood` — 전환은 OQ-052 판정(todo 22).
S5 완료 — [evidence](../.omo/evidence/phase4/remedy-s5.md): 공통 `buildArtifactCard`(화면·에이전트 동일 카드, 산문 없이도 사실), context pack의 code-card lane(문서로 위장 금지·직렬화 기준 토큰 추정), `prepareChange`는 툴 등록 없는 내부 조합. 화면 렌더는 todo 19 소관.
S6 완료 — [evidence](../.omo/evidence/phase4/remedy-s6.md): `repositories.data_revision`·`workspaces.memory_revision`(writer가 자기 트랜잭션에서 증분, 읽기 부수 기록은 제외), `read_repository_basis`의 3상태(revision·structure·analysis), `read_edge_page`의 revision fence, 로드의 `readConsistency`. **OQ-053 resolved(⑴)**. 재시도 루프·memory revision writer·analyze 발행은 미구현.

**S1–S6 전부 완료.** 다음은 원래 계획 순서인 Wave C(todo 16–18).

---

## 유료 번들의 최소 정의 (R5 §4.6 — 판단이지 예측이 아님)

"연결(또는 푸시)마다 갱신되는, 내 레포의 정직한 상태판": ① 내 코드가 보이는 은하수 그래프 + **라이브 발광**(todo 15) + HUD 실데이터 ② 오늘/이번 주 진행 원장(거짓 0% 제거·todo 정체성·`query_brain(kind:'todo')`·다이제스트) ③ 문서 없이도 뜨는 위험 지도(코드 노드 앵커·`untested-code`·팬인·공변경·링 3단계) ④ 배선층(예산 문서, todo 22). 번들에서 빼는 것: 토큰 절감 카피(v3 통과 전), AI 판정·코칭, doc_page, 영수증 피치, 팀, CI verified(상위 업셀 후보), 심볼.

**"예"라고 말하기 위한 선행 조건(전부 미충족, 사용자 결정 포함):** (a) 결제 경로·플랜 게이트(OQ-040) + 레포 단위 스코핑(OQ-042) (b) 무료 티어에 무엇을 서빙할지 — 프로덕션 아티팩트는 enrich 전 내용이 없다(OQ-039) (c) 스펙 없는 레포의 요구사항 부트스트랩(OQ-041) (d) 실스캔 픽스처 위 라이브 전용 e2e (e) 측정 4종 — T2FV ≤5분, 위험 상위 10 정밀도 ≥0.70, 세션당 `log_progress` ≥70%, 설치된 예산으로 v3 PASS 비열등·턴 비증가.

---

## 상태 스냅샷 — 이 계획을 처음 받은 에이전트를 위해

**이미 있는 것 (재구현 금지, 확장만):** v1과 동일 — 스캐너(`packages/core/src/ingest/*`), `apply_repository_scan` v5 단일 경로, analyze(`reconcileRequirements` 노드·행만), enrich 3종, 그래프 엔진(`apps/web/lib/graph/*`, `brain-map*.tsx`, `map-screen.tsx`, `workspace-map.ts`), MCP 22툴·지시 블록·최소 인덱스, 벤치 하네스(databrain v3·graph-surface v1/v2·기법 실측), 프레임 예산 테스트, perf 후속 목록(MT-6·MT-7).

**R5가 코드로 확정한 결함(전부 Phase 4 범위):**

| #   | 결함                                                                                          | 위치                                                                                                                    | 고치는 todo  |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------ |
| D1  | 비상대 지정자 미해석(`@alrescha/*` 96건, `@/…`, `backend/app` 패키지 루트)                    | `code-links.ts:274`, `:293-317`                                                                                         | 0            |
| D2  | 변경 없는 파일은 영원히 재링크되지 않음                                                       | `repository-scanner.ts:642-648, 714-718`, `202608230002:243-252`, 워커·CLI previousArtifacts                            | 0, 16        |
| D3  | 힘장 링크 중복·상수 강도(허브 헤어볼)                                                         | `simulation-protocol.ts:219-226`, `force-simulation.ts:126-129`                                                         | 0(B 첫 커밋) |
| D4  | 600 초과 시 `type:grade` 15덩어리·DOM 히트 600                                                | `workspace-map.ts:162, 500-503`, `graph-model.ts:433-467`, `brain-map-stage.tsx:45`                                     | 3, 10        |
| D5  | 분류 사상이 문서로 몰림·README/docs/sql/css 비아티팩트·정렬 결함                              | `graph-model.ts:106-114`, `workspace-map.ts:367-389, 583-587`, `artifact-facets.ts:92`, `repository-scanner.ts:157-215` | 1, 2, 4      |
| D6  | 요구사항 커버리지 거짓 0%(`implements` writer 없음), UI 테스트가 0%를 고정                    | `progress-report.ts:113-121`, `postgres-analysis-store.ts:134-198`, `progress-dashboard.test.tsx:36-41`                 | 1            |
| D7  | todo 오프셋 정체성(편집 시 오귀속)·240자 CHECK 스캔 롤백·FK wedge·dead link                   | `todos.ts:29`, `202608100010:17, 58-62`, `enrich_pass.sql:405-431`, `progress-dashboard.tsx:39-43`                      | 5, 19        |
| D8  | finding 앵커가 항상 문서 노드·전부 {medium, low}·MCP provenance 평탄화·dismiss/verdict 미반영 | `analysis-job.ts:159-177`, `rules.ts:162-173, 428`, `supabase-store.ts:96-119`, `judgment.ts:98-111`                    | 1, 19, 21    |
| D9  | 프로덕션 아티팩트 본문 없음 → enrich 전 MCP·검색·팩·stats 미터 내용 부재                      | `supabase-store.ts:479-481, 613-614`, `context-pack.ts:118-120`                                                         | OQ-039(결정) |
| D10 | 라이브 발광 브리지 없음(브라우저 Realtime 구독 0건), HUD 지표는 데모 상수                     | `supabase-store.ts:746-763` vs `map-screen.tsx:366-375`, `graph-model.ts:636-647`                                       | 15           |
| D11 | 레포 연결 시 스캔 없음(웹훅 전용), CLI 레포는 analyze·enrich 불가                             | `connect-repository.ts`, `202608100004:511-520`, `run-local.ts:144-151`                                                 | 16, 17       |
| D12 | CI 리포트 인제스트 미배선 → evidence writer 0 → verified 도달 불가                            | `analysis-job.ts:22-33`, `ci-reports.ts`, `github-ci-evidence-source.ts`                                                | 18           |
| D13 | 지시 블록·최소 인덱스·툴 설명이 서로 다른 워크플로, 툴 정의 30,130자(outputSchema 62%)        | `instruction-blocks.ts:24-37`, `minimal-index.ts:45-53`, `repo-map.ts:223`, `hosted.ts:157-719`                         | 22           |
| D14 | 라이브 로더가 전부 워크스페이스 평면, access_events·progress_events에 repository_id 없음      | R5 §4.5 ⒁                                                                                                               | 5, OQ-042    |
| D15 | 라이브 화면을 실스캔 위에서 검증하는 e2e 0(파일럿 플로우는 데모 투어)                         | `tests/e2e/pilot-flow.spec.ts:269-335`, `helpers/app-screens.ts:15-28`                                                  | 검증 전략    |

**게이트:** G1(로컬 Supabase)·G2(GitHub App) 열림. G3(AI 크레딧/키) — todo 20·25. G4(배포) — 웨이브 종료마다 선택.

**신규 OQ(R5와 함께 등록):** OQ-035(co_changed 백필 vs ADR-013) · OQ-036(`tests`·`implVerified` — verified 정의 둘) · OQ-037(layoutOnly·앵커 vs 하드룰 ②) · OQ-038(패밀리별 읽기 상한) · **OQ-039(무료 티어 서빙 내용 — 사용자 결정)** · **OQ-040(가격 티어·게이트 — 사용자 결정)** · **OQ-041(스펙 없는 레포 요구사항 부트스트랩 — 사용자 결정)** · **OQ-042(레포 단위 스코핑 — 사용자 결정)** · OQ-043(문서 기본 포함 범위). v1의 OQ-029~034도 유효.

### 세션 시작 프롬프트 템플릿 (Claude Code · Codex 공용 — 복사해서 사용)

```
arr-app 레포에서 Phase 4(v2)를 이어간다.
1. spec/IMPLEMENTATION_GUIDE.md → spec/WORK_SPEC.md(§3 가드레일) → spec/RESEARCH_GRAPH_SECONDBRAIN_2026-09-03.md(R4) → spec/RESEARCH_GALAXY_MONETIZATION_2026-09-04.md(R5) → spec/BUILD_PLAN_PHASE4.md를 읽어라.
2. BUILD_PLAN_PHASE4의 체크박스와 git log·.omo/evidence/phase4/로 진행 상태를 파악하라. 다른 에이전트가 진행 중인 웨이브(§협업 규약 담당 표)는 건드리지 않는다.
3. 이번 세션 범위: Wave {N} (todo {a}, {b}). 게이트가 닫혀 있으면 건너뛰고 보고하라. todo 0이 미완이면 다른 데이터 todo를 시작하지 않는다.
4. 각 todo는 수용 기준을 테스트로 통과시켜야 완료다. 완료 시 체크박스 갱신 + .omo/evidence/phase4/todo-{k}.md + todo당 1커밋(Conventional Commits, 아래 Commit 문구).
5. 종료 전 pnpm lint && pnpm typecheck && pnpm test 전체 green, Playwright는 변경 화면의 스펙 파일 green, scripts/verify-scope-boundaries.ts PASS, 밀도 회귀 테스트(todo 8 이후) green. 마지막 보고는 "다음 컨텍스트가 행동하는 데 필요한 것"을 앞세운다.
```

### 협업 규약 (Claude Code ↔ Codex)

| 규칙            | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 담당 기본값     | **Claude Code:** Wave A·A′·C·D·E(core·SQL·worker·MCP) / **Codex:** Wave B 전부 + todo 19의 웹 표면 + todo 24 화면. 바꿀 때는 이 표를 먼저 갱신·커밋한다.                                                                                                                                                                                                                                                                                                                                                                              |
| 브랜치          | 웨이브당 브랜치 `phase4/wave-{a,a2,b,c,d,e,f}`; todo당 1커밋; squash 금지(커밋 = 증빙 단위). 워크트리 사용 시 다른 에이전트의 미커밋 작업을 덮어쓰지 않는다.                                                                                                                                                                                                                                                                                                                                                                          |
| 로그            | 프론트 todo는 `docs/frontend/logs/YYYY-MM-DD-<slug>.md` + `WORKLOG.md` 1행. 그 외는 `.omo/evidence/phase4/`.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 인터페이스 동결 | A↔B 경계는 `GraphData`(`graph-model.ts`)·`WorkspaceMapModel`(`workspace-map.ts`)·`simulation-protocol.ts`의 `LinkPair`/메시지 타입이다. **A(todo 0·3)가 먼저 커밋**: `GraphNodeType += directory \| route \| db_object \| section \| rationale \| doc_page`, `GraphNode += domain·unit·hub·parentId·risk`, `GraphEdge += family·layoutOnly`, `LinkPair = [i, j, familyCode]`, 프로토콜 `pin/unpin/reheat/settled`. 신규 relation: `contains·handles·queries·defines·modifies·implements·references·tests`. B는 그 위에 렌더를 붙인다. |
| MCP 타입 동기   | `McpNodeType`·`McpEdgeRelation`은 `packages/mcp/src/store.ts`·`hosted.ts` zod·`graph-tools.ts` 세 곳 + 계약 테스트 툴 이름 목록을 같은 커밋에서 갱신한다(갱신이지 약화가 아님).                                                                                                                                                                                                                                                                                                                                                       |
| 금지            | `spec/` 수정 금지(OPEN_QUESTIONS.md와 이 계획의 체크박스·담당표 제외). 테스트 약화 금지. hex 하드코딩·strings 모듈 밖 카피 금지. 측정 없는 수치 게시 금지.                                                                                                                                                                                                                                                                                                                                                                            |

---

## Wave A — 링크 복구 + 데이터 정합성 _(게이트 없음 — 지금 시작, 렌더 무변경)_

- [x] **0. 링크 복구 — 별칭·배럴 해석, `tests` 파생, 전량 재링크, set-based 적용, 힘장 링크 중복 제거, 밀도 실측** _(R5 §2.2 D1–D3, 모든 웨이브의 선행 조건)_ — **완료 2026-09-04**, 증빙 [`.omo/evidence/phase4/todo-0.md`](../.omo/evidence/phase4/todo-0.md)
      `code-links.ts`: `resolveWorkspaceAlias`(package.json `name`/`exports`·tsconfig `paths`/`baseUrl` — 매니페스트를 플랜 메타데이터로 동봉, 레포 내 파일만 입력이라 ADR-013 유지) + `resolveThroughBarrels`(`export … from` 표로 index.ts 통과, method `barrel-resolution`) + Python 패키지 루트 탐색(가장 가까운 `pyproject.toml`/`__init__.py` 체인·`backend/app` 접두 해석, reference 상한) + `tests` 파생(source가 `unit=test` → relation `tests`, reference 0.6, method `test-import`). `LINK_SCHEMA_VERSION` 상수 + `repositories.link_schema_version`; 불일치 시 unchanged 슬롯을 fetch로 강등하는 `scanRepository({mode:'full'})` — 워커·CLI 플래그(본문은 재조회하되 저장하지 않음). `apply_repository_scan` v6: 코드 링크 적용을 `jsonb_to_recordset` set-based로, delete 집합에 `tests` 포함, 적용 시간·`/api/ingest/local` 타임아웃 여유를 evidence로. **Wave B 첫 커밋(Codex 또는 A가 대행, 5줄):** `createStartMessage` (min,max) 쌍 중복 제거 + `force-simulation.ts` 링크 강도 d3 기본 `1/min(deg)` 복원. `scripts/measure-graph-density.ts` — 로컬 스캔에서 노드/엣지/차수 히스토그램/고아/최대 차수 상위 10을 `.omo/evidence/phase4/graph-density-<date>.md`에 기록.
      수용 기준: code-links 픽스처(별칭·배럴·테스트 import·`@/`·`backend/app`)에서 기대 엣지 스냅샷(티어별), `fixtures/layout-variants/` 신설(Next `frontend/`+FastAPI `backend/`+Prisma+Supabase 마이그레이션+단일 앱 `src/`), 두 경로 플랜 바이트 동등성, `mode:'full'` 후 이 레포 로컬 스캔 구조 엣지 ≥1,000(실측 evidence), "아티팩트 소스 tests 엣지는 verified를 만들지 않는다" 단언(`workspace-map.test.ts`), 힘장 링크 수 = 고유 쌍 수 단언(`graph-engine.test.ts`), 기존 `tests/repository-scanner.test.ts` 플랜 바이트 불변(mode 미지정 시).
      Commit: `feat(ingest): resolve aliases and barrels, derive test edges, and add a full relink mode`
      **실측 정정(2026-09-04):** 같은 파스 집합 위에서 v1 1,486 링크·988 쌍 → v2 2,001 링크·1,109 쌍이다. 별칭·배럴·Python 루트는 구조 링크를 **+12.7%**(1,486 → 1,675) 늘릴 뿐이고, 프로덕션의 구조 엣지 ~135 → ~1,675은 **재링크(D2)** 가 만든 차이다. 계획의 “비상대 지정자가 희소 그래프의 가장 큰 원인”이라는 서술은 이 수치로 대체한다 — 별칭 해석의 가치는 개수가 아니라 **패키지·언어를 건너뛰는 엣지는 다른 출처가 없다**는 점(예: `@/*`만 쓰는 Next 앱)에 있다. 수용 기준의 “구조 엣지 ≥1,000”은 충족(1,675). 별칭·배럴 자체는 레포 전체 수치가 아니라 `fixtures/layout-variants/` 두 픽스처로 판정한다.
      **추가로 처리한 것:** ⑴ 배럴 귀속의 스캔 이력 의존성 제거 — 증분 스캔이 변경 파일이 통과하는 배럴 본문을 추가로 읽는다(상한 200개·4라운드, index 파일과 패키지 진입점만). 같은 커밋이면 전량 스캔과 같은 엣지가 나온다. ⑵ 매니페스트는 매 패스 재조회(부분 별칭 표는 같은 커밋에서 전량 스캔보다 적게 해석한다) — `scan-fetch-concurrency.test.ts`가 “변경 없는 아티팩트는 재조회 0, 매니페스트는 항상”을 고정. ⑶ 매니페스트 본문 유출 차단 — `verify-scope-boundaries.ts`에 `manifestText` 식별자 추가 + CLI 업로드에 매니페스트 센티널 음성 테스트. ⑷ CLI 로컬 소스가 `.claude/worktrees`를 건너뛴다(이 레포 기준 2,921 → 502 노드; git이 제외하는 경로라 두 경로 동등성 복원).

- [x] **1. 요구사항→코드 `implements` 영속화 · rationale 분리 · 정렬 결함 · 커버리지 의미 분리 · finding 코드 앵커 + `untested-code` 룰** _(D5·D6·D8, v1 todo 1 확장, 진행/위험 감사 P1)_ — **완료 2026-09-04**, 증빙 [`.omo/evidence/phase4/todo-1.md`](../.omo/evidence/phase4/todo-1.md)
      v1 todo 1 그대로(`reconcileRequirements`가 `implements` reference ≤0.6 upsert; `GraphNodeType` rationale; artifacts 정렬; `"unknown"` 폴백) + ⑴ `buildProgressDashboard`의 `ProgressMetric`에 `basis:'measured'|'no-links'|'no-data'` — active 요구사항 >0·implements 0이면 percent=null·"미측정 — 구현 링크 없음"; `progress-dashboard.test.tsx:36-41`의 거짓 0% 고정을 먼저 뒤집는다 ⑵ 커밋 항목 제목을 receipt `summary.statement.predicate.coverage`로(스키마 변경 없음) ⑶ finding에 `target_node_id`(코드 아티팩트) — stale-doc은 참조 경로 노드, missing-implementation은 심볼 소유 파일, missing-test는 implements 대상 — 맵 링·findingCount를 target에도 집계 ⑷ 신규 결정론 룰 `untested-code`(code_metadata 파일 중 형제/동명 테스트·`tests` 엣지 없음, inferred·low) — 문서 없는 레포에서도 위험 신호가 뜨는 첫 룰 ⑸ `get_findings` 기본 `status:'open'` + 심각도 정렬 버그 수정 ⑹ MCP finding provenance 평탄화 해제(경로·span·suggestedAction 전달).
      수용 기준: v1 기준 + basis 분기 단위 테스트, drifted-demo·layout-variants에서 `untested-code` 발화 스냅샷과 오탐 상한(테스트 파일 자체·설정 파일 제외), 코드 노드 링 렌더 e2e(Wave B 이후 활성화되는 단언은 skip 아닌 todo 12 수용 기준으로 이관), `get_findings` 계약 테스트, verified 승격 0.
      Commit: `feat(analyze): persist implements edges, anchor findings to code, and add the untested-code rule`
      **실측 정정(2026-09-04):** `implements`는 이 레포에서 요구사항 127개 중 **링크 8개(고유 대상 6개)** 다 — R5 §2.5의 추정 ~120과 한 자릿수 차이. 파생 규칙은 기존 `missing-implementation`이 쓰던 것과 같은 "요구사항 문장의 camelCase 토큰 중 선언 파일이 유일한 심볼"이고, 이 레포 스펙은 심볼이 아니라 경로·클래스명·메서드명(최상위 export 아님)을 인용한다. 경로 인용 방식도 실측했으나 +4건에 그쳐 채택하지 않았다(OQ-045: 파생 확대 vs 지표 라벨 정정). 부수 효과로 커버리지는 "미측정"을 벗어나지만 링크율이 낮게 읽힌다. **배럴 재수출 우선순위**는 그 자체로 값을 했다 — 선언 파일 우선(`kind !== "export"`) 규칙으로 이 레포의 고유 소유 심볼이 743 → 1,234(전체 1,246)로 늘었다.
      **`untested-code` 실측:** 이 레포 코드 아티팩트 473개 중 **103건(21.8%)**, 전체 finding 213건 중 코드 앵커 보유 108건, verified 0. 픽스처 스냅샷 — drifted-demo 2건, monorepo-aliases 6건, next-fastapi 5건. 제외 규칙은 계획이 적은 4종(테스트 파일·설정·`.d.ts`·생성물)에 **모듈 진입점(`index.*`/`__init__.py`)** 과 **export 0개 파일**을 더했다: 배럴은 자기 단위가 없어 모든 패키지에 영구 finding 1건을 남긴다. 테스트가 0인 레포에서 파일마다 발화하는 문제는 OQ-044(§9 스팸 금지 vs R5 §4.3 위험 목록 비지 않기)로 기록하고 파일 단위 발화를 기본값으로 진행했다.
      **추가로 처리한 것:** ⑴ `GraphNodeType`에 `unknown` 추가 — 로더의 `artifacts`·`graph_nodes` 정렬을 같은 키(`created_at, id`)로 맞춰 페이지 어긋남을 없애고, 그래도 매칭이 실패하면 `document`가 아니라 `unknown`으로 표시한다(todo 3의 "2,001 시드에서 unknown 0" 단언 대상). ⑵ 맵 finding 집계가 source·target 양쪽을 세되 같은 노드면 1회. ⑶ MCP `get_findings` 기본 `status:'open'`(`'all'`로 해제), 심각도 순위 정렬, provenance 통과(경로·span·suggestedAction, excerpt는 제외). ⑷ 신규 OQ-044·045·046.

- [x] **2. 전 파일 노트화 + 문서→코드/문서 `references` + `edges.family`** _(D5, v1 todo 2 확장, 설계 ①)_ — **완료 2026-09-05**, 증빙 [`.omo/evidence/phase4/todo-2.md`](../.omo/evidence/phase4/todo-2.md)
      `classifyArtifactPath`: `doc` = **모든** `*.md/*.mdx/*.rst/*.txt`(spec/adr/agents/claude/skill/cursor_rule/todo 규칙 우선), `schema` = `*.sql/*.prisma/schema.graphql/drizzle/**`, `style` = `*.css/scss/less`, `config` = package.json·tsconfig*·pyproject·`*.yml/yaml/toml`·Dockerfile·`.env.example`·`.alrescha.json`; 기본 ignore(output/·coverage/·dist/·lockfile·node_modules)를 **두 경로 공통 상수**로(GitHub 경로 dot-dir 규칙과 CLI `IGNORED_SEGMENTS` 정합 — OQ-043) + `.alrescha.json ignore/layers.hidden`. `packages/core/src/ingest/doc-links.ts` 신설: `markdown.ts` `codeReferences` 중 **경로형 토큰만**(값 비저장) → 경로 존재 `resolved` / basename 단독 소유자 `reference` / 모호·다중 소유(index.ts 등) 엣지 없음; markdown/wiki 링크 doc→doc(resolved); ID 토큰 헤딩(`ADR-NNN`·`OQ-NNN`)은 todo 8. `RepositoryScanPlan.docLinks`, `local-ingest.ts` strict 스키마 동기(필드 누락 시 400 함정). 같은 마이그레이션에 `edges.family` 컬럼(CHECK 8종·인덱스·기존 행 relation→family 백필: rationale references=structure, concept 7동사=semantic, implements/tests=evidence).
      수용 기준: 픽스처 기대 엣지 스냅샷(티어별), 두 경로 동일 플랜, 이 레포 로컬 스캔 doc→file ≥300(실측 evidence, `.omo` 포함 여부 병기), 문서 인라인 코드 값이 플랜·DB 어디에도 없음(scope 스캐너 확장), family 백필 검증 SQL 테스트, 스캔 시간 회귀 가드 갱신.
      Commit: `feat(ingest): treat every text file as a note and resolve doc→code references`
      **실측(2026-09-05, [`graph-density-2026-09-05.md`](../.omo/evidence/phase4/graph-density-2026-09-05.md)):** 노드 502 → **730**, 엣지 1,994 → **3,032**, 고유 쌍 1,104 → 2,096, 평균 차수(쌍) 4.40 → **5.74**, 고아 9.2% → 8.4%, 삼각형 546 → **1,328**. 신규 분류 doc 130 · schema 44 · style 19 · config 18. `references` 996건 = doc→file 657 + doc→doc 339, 티어 resolved 765 / reference 231. **doc→file은 `.omo` 포함 657, 제외 187** — 수용 기준 ≥300은 `.omo` 포함으로만 충족되며 이는 OQ-043의 임시 결정 그대로다(→ OQ-048로 재판정 대상 등록). 계획의 Wave A 목표 대역(엣지 ~3,200·차수 ~5.9)에서 엣지·차수는 도달했고 노드는 todo 3의 directory와 A′의 허브가 남은 ~340개다. R5 §1.2 추정(doc→file 973·doc→doc 90)과 다른 이유는 **언급 수가 아니라 관계 수**를 세기 때문이다(문서-대상 쌍당 1엣지).
      **범위 판정:** `.alrescha.json`은 `ignore`만 해석한다 — 스캔 결과를 바꾸므로 지금 필요하고(OQ-043의 탈출구), `layout`·`layers.hidden`·`todoFiles`·`progressDocs`는 소비자(`repositories.layout_config`·Wave B 레이어)가 없어 todo 4로 넘긴다(OQ-047). 룰 엔진의 `isDocument`는 "코드가 아님"에서 **산문 7종 명시**로 바꿨다 — 그대로 뒀으면 `.sql`·`.css`·`.json`이 remark로 들어가고 analyze가 그 본문을 전부 가져왔다. `doc`은 일부러 제외(README 기원 요구사항은 OQ-041).
      **추가로 처리한 것:** ⑴ `LINK_SCHEMA_VERSION` 2 → 3, 전량 재링크가 **문서도** 다시 읽는다(코드만 읽으면 D2가 문서에서 재발). ⑵ 매니페스트가 이제 아티팩트라 슬롯을 통합 — 한 번 fetch로 별칭 규칙과 아티팩트 행을 모두 만든다(픽스처 fetch 수 `artifacts + manifests` → `artifacts`). ⑶ 기본 ignore를 두 경로 공통 상수로(`DEFAULT_IGNORED_SEGMENTS`), CLI의 사설 `.omo` 제외 삭제 — ADR-013 회귀 항목 해소. ⑷ `edges.family`는 writer가 생략하면 **BEFORE 트리거가 relation + source 노드 kind로 유도**한다(`references`는 문서=doc·rationale=structure·concept=semantic, `implements`는 requirement=evidence·concept=semantic). 기본값이었으면 concept 합성이 조용히 structure로 들어갔다. ⑸ scope 스캐너에 문서 본문 식별자군 추가 + 위반 심기 테스트. ⑹ `measure-graph-density.ts`가 doc 링크도 센다. ⑺ 신규 OQ-047·048.

- [x] **3. directory 노드 + `contains`(layoutOnly) · 패키지 핵 · areaHint · clusterGraph/MT-6 삭제 · 허브 별도 상한** _(D4, v1 todo 3 확장, OQ-037·OQ-038)_ — **완료 2026-09-05**, 증빙 [`.omo/evidence/phase4/todo-3.md`](../.omo/evidence/phase4/todo-3.md)
      `apply_repository_scan` v6 SQL이 경로 접두사에서 `graph_nodes(kind='directory')`·`directory --contains--> dir|file`(`{reason:'path containment', tier:'resolved'}`, family hierarchy)을 유도(플랜 불변 → ADR-013 자명), `role:'package'`(package.json/pyproject 보유), 아티팩트 0 디렉터리 스윕, 통과 디렉터리(파일 0·자식 1)는 로더가 접음. 모든 비파일 노드에 `path` 앵커 → `graphNodeArea`가 도메인 유도(facet 테스트로 고정). 로더: `MAP_CLUSTER_THRESHOLD`·`clusterGraph`·서버 `forceDirectedLayout`(MT-6) 삭제, 좌표 0 송신, `isClustered` 단언은 "3,000 초과 시 계층 할당 접힘"으로 재작성; 허브는 별도 쿼리·별도 상한(directory ≤300·route ≤100·db_object ≤100·section ≤100), 엣지는 `edges.family`별 병렬 쿼리 상한(structure 6,000·doc 6,000·hierarchy 6,000·database 3,000·route 1,000·statistical 3,000·semantic 3,000). `GraphData.layoutOnly`·`GraphEdge.family` 타입 **선커밋**(B 경계).
      수용 기준: 트리 픽스처 스냅샷, 파일 삭제 시 빈 폴더 소멸, 두 경로 동등성, `workspace-map.test.ts` layoutOnly 분리·상한 단언(2,001 시드에서 unknown 0), `/app/map` TTFB 전후 로컬 Supabase 측정 evidence(MT-6 형식), 힘 시뮬 테스트에 contains 링크가 군집 반지름을 줄이는 결정론 단언.
      Commit: `feat(ingest): derive directory nodes and containment edges, drop the server layout and cluster fallback`
      **실측(2026-09-05):** 이 레포 경로에서 유도된 계층은 디렉터리 **142개**, `contains` **851개**, package 역할 5개(+루트), 계층 포함 노드 **874개**(파일 732 + 디렉터리 142). R5 §2.4 추정(~145 / ~885)과 근접. 요청 경로에서 걷어낸 서버 레이아웃 비용은 `forceDirectedLayout` 단독 측정으로 502노드 58ms · 730노드 45ms · **2,000노드 336ms**다 — TTFB가 아니라 "요청마다 더 이상 하지 않는 일"의 CPU 시간이며, TTFB 전후는 로컬 Supabase(Docker)가 필요해 **미측정으로 남는다**.
      **범위 판정:** 계층은 **플랜에 없다** — `apply_repository_scan`이 저장된 경로에서 유도하므로 두 경로가 트리를 두고 어긋날 수 없다(ADR-013이 구조로 성립). `contains`는 `family: 'hierarchy'` · `tier: 'resolved'` · `reason: 'path containment'` · `layoutOnly: true`. 통과 디렉터리 접기는 **미구현**: 로더가 접으면 MCP가 읽는 저장 트리와 화면이 갈리고, 접힘 결과는 Wave B의 `hierarchyAssignment`가 어차피 다시 계산한다 → OQ-049로 todo 12에 넘김.
      **추가로 처리한 것:** ⑴ `MAP_CLUSTER_THRESHOLD`(600 `type:grade` 붕괴) → `MAP_HIERARCHY_FOLD_THRESHOLD`(3,000, 클라이언트 접힘 신호). ⑵ 서버 레이아웃 삭제 — 모델은 좌표 0을 보내고 단언이 고정한다. ⑶ 허브는 별도 예산(`DIRECTORY_LIMIT` 300), 엣지는 **패밀리당 1쿼리**·패밀리별 상한(계약 테스트로 고정) + `family is null` 쿼리로 백필 누락을 조용히 버리지 않는다. `evidence` 6,000은 계획 목록에 없었으나 todo 0·1이 만든 `tests`·`implements`가 그 패밀리라 추가했다. ⑷ `graphNodeArea`가 디렉터리 경로에 슬래시를 붙여 유도(폴더가 자기 안의 코드와 같은 밴드). ⑸ `--node-directory` 토큰(양 테마). ⑹ 밀도 스크립트 리포트가 "계층은 플랜에 없어 여기 없다"를 스스로 밝힌다. ⑺ 신규 OQ-049.

- [x] **4. `database`·`기타` 도메인 · 레이아웃 관례 일반화 · `.alrescha.json` · `unit` 태그** _(D5, v1 todo 4 확장)_ — **완료 2026-09-05**, 증빙 [`.omo/evidence/phase4/todo-4.md`](../.omo/evidence/phase4/todo-4.md)
      v1 todo 4 그대로(FacetDomain·BrainArea에 `database`·`unclassified→기타` 정직 표시, 관례 확장 `frontend/ backend/ server/ api/ src/app/ pages/ prisma/ migrations/ db/ drizzle/`, `ROUTE_FILE` 일반화, `.alrescha.json`(`layout`·`ignore`·`layers.hidden`·`todoFiles`·`progressDocs`)을 아티팩트로 읽어 커밋 sha와 함께 `repositories.layout_config` 저장, 선택 인자 주입) + `deriveArtifactUnit`(component·route·action·schema·test·doc·lib — 경로 + 영속된 exported_symbols의 PascalCase만) → `GraphNode.unit`, 밴드 뷰 6밴드, 토큰 `node-database·node-other·node-directory·node-route·node-table`(두 테마), 범례·필터 칩 strings.
      수용 기준: v1 기준 + `../30m`형 픽스처(`frontend/`+`backend/`+`db/`)에서 도메인 3종 이상·`unclassified` 0, unit 판정 결정론 테스트, 설정 없는 기존 픽스처 결과 불변, overview 뷰모델·밴드 뷰 e2e.
      Commit: `feat(ingest): add the database domain, generalize layout conventions, honor .alrescha.json, and tag units`
      **실측(2026-09-05, 아티팩트 734):** 6개 밴드가 모두 채워진다 — frontend 201 · tests 180 · docs 173 · backend 96 · **database 47** · **other 37**. 47개는 전부 backend에 섞여 있었고, 37개는 backend라고 **주장**하고 있었다(조용한 흡수). unit 태그: lib 242 · test 180 · doc 173 · route 47 · schema 46 · component 39 · action 7. 두 축 모두 경로·분류·저장된 심볼 **이름**만 읽는다(본문·시그니처 비열람).
      **범위 판정:** `src/`는 `unclassified`가 아니라 **shared**다 — 단일 앱 레포는 전부 거기 있고, 레포 전체를 `기타`로 칠하는 것은 평범한 답보다 나쁜 답이다. `vendor/`류만 unclassified→`기타`로 남는다. `.alrescha.json`은 **파싱된 값**이 플랜에 실려 `repositories.layout_config`에 커밋 sha와 함께 저장되고(문서 텍스트는 절대 아님), 플랜이 아무것도 말하지 않으면 지워진다 — 삭제된 설정 파일이 레포를 계속 지배하지 않는다. 선언된 layout은 관례보다 먼저 보되 **추가만** 한다.
      **추가로 처리한 것:** ⑴ `GraphNode += domain·unit`(B 경계) — 로더가 레포 관례로 **한 번** 유도하고, `graphNodeArea`는 노드의 domain을 우선하며 데모 픽스처만 경로로 폴백한다(화면이 다시 유도하면 `svc/`를 쓰는 레포에서 맵과 어긋난다). ⑵ `ROUTE_FILE` 일반화 — `app/**`(page·layout·route)와 `pages/**`(index·`_app` 제외) 양쪽, 라우트 그룹 `(shell)` 제거. ⑶ 토큰 `node-database·node-other·node-route·node-table`(양 테마) + overview 영역 막대 6색(전부 토큰, 실브라우저 확인). ⑷ 픽스처 `next-fastapi/db/` 신설로 3티어 형태 완성. ⑸ `layersHidden`·`todoFiles`·`progressDocs`는 저장만 — 소비자는 Wave B 레이어 토글과 todo 5의 todo 파서다(OQ-047 해소).

- [x] **5. v6 통합 마이그레이션 — 데이터 모델 잔결함 일괄 수정** _(D7·D8·D14, 감사 반박 PGlite 재현)_ — **완료 2026-09-05**, 증빙 [`.omo/evidence/phase4/todo-5.md`](../.omo/evidence/phase4/todo-5.md)
      한 마이그레이션 파일에: ⑴ todo `sourceKey`를 `document:<path>:<정규화 제목 해시>[#n]`으로(편집에도 id·created_at 보존; 충돌 시 순번) — `todos.ts`·`local-ingest.ts` 동기 ⑵ `progress_events.todo_id` FK **ON DELETE SET NULL** + 기존 행 정리 ⑶ todo 제목 240자 **절단**(rationale의 `MAX_RATIONALE_TEXT` 선례) — CHECK 위반으로 스캔 전체 롤백되던 지뢰 제거 ⑷ `access_events.repository_id`·`progress_events.repository_id`(대상 노드→레포 역참조, nullable) ⑸ `findings.target_node_id`(todo 1과 같은 파일이면 병합) ⑹ `edges.family`(todo 2와 병합 가능) ⑺ `[~]`·`[-]`·`[/]` 마커 → in-progress/blocked, 중첩 depth 보존(`parent_key`).
      수용 기준: PGlite — 불변 재스캔 delta 0, 상단 3줄 삽입 후 id 보존 100%, 300자 항목 스캔 성공, ULID 기록 후 문서 편집 재스캔 성공(wedge 0), 두 경로 플랜 동등성, 기존 e2e `local-ingest-card.spec.ts` 확장(PROGRESS.md 푸시 → `/app/progress` 보드 단언 — **실스캔 위 라이브 e2e의 첫 게이트**).
      Commit: `fix(db): stabilize todo identity, null progress refs on delete, truncate titles, and scope events by repository`
      **판정:** ⑸ `findings.target_node_id`는 todo 1, ⑹ `edges.family`는 todo 2 마이그레이션에 이미 병합했으므로(계획이 허용) 이 파일은 나머지 ⑴⑵⑶⑷⑺을 담는다. 수용 기준 6개 중 **PGlite 5개는 `tests/todo-identity.test.ts`로 통과**(불변 재스캔 delta 0 / 상단 3줄 삽입 후 id·created_at 100% 보존 / 300자 항목 저장 성공 / 기록 후 편집해도 스캔 성공·이벤트는 문장 유지·링크만 null / 두 경로 플랜 동등성), **e2e는 작성했으나 실행 못 함**(Docker 없음 — `playwright test --list`로 인식만 확인).
      **설계 판정:** ⑴ 키는 `document:<path>:<정규화 제목 sha256[16]>[#n]`이고, **해시는 잘리기 전 전체 제목**을 덮는다(240자 접두가 같은 두 항목이 합쳐지지 않게). 스캔이 제목이 같은 기존 행의 키를 **옮겨** id·created_at을 보존하므로 프로덕션 행은 다음 스캔에 스스로 재키잉된다. ⑵ FK는 cascade가 아니라 `on delete set null (todo_id)` — 링크 하나를 잃는 것이 레포의 인제스트 전체를 잃는 것보다 싸다. ⑶ 240자는 파서가 자르고(rationale 선례) CHECK은 원래 의도대로 백스톱으로 남는다. ⑷ `repository_id`는 **BEFORE INSERT 트리거**가 이미 가리키고 있는 노드·todo에서 유도한다 — MCP 서버·설정 액션·SQL 함수가 각자 쓰는 컬럼을 일부만 기억하는 것보다 낫다(OQ-042의 스키마 절반; 로더는 아직 워크스페이스 평면). ⑺ `[~]`·`[/]`=in-progress, `[-]`=blocked는 GFM이 파싱하지 않으므로 마크다운 레이어가 원문 첫 글자에서 마커를 읽어 보고하고 의미 판정은 todo 레이어가 한다. 중첩은 `parent_key`.

## Wave A′ — 허브 패밀리 _(A0·A2·A3 뒤, 밀도 회귀 테스트로 게이트)_

- [x] **6. route 노드 + `handles`** _(설계 ②·GitNexus Route)_ — **완료 2026-09-06**, 증빙 [`.omo/evidence/phase4/todo-6.md`](../.omo/evidence/phase4/todo-6.md)
      `packages/core/src/ingest/route-links.ts`: Next.js `app/**/(page|layout|route)`·`pages/**` URL → `graph_nodes(kind='route')` + `route --handles--> file`(SQL 유도, resolved; layout 공유 체인 포함), FastAPI/Flask 데코레이터 정규식(`@router.get('/x')` → method·path·line만) → `plan.routes`(reference) + strict 스키마 동기. 라우트 다이아몬드 스프라이트(B).
      수용 기준: layout-variants 픽스처 route 스냅샷(Next 32+API 10 규모), 두 경로 동등성, `impact_of` 응답 `affectedRoutes`(todo 22와 계약 공유).
      **실측(2026-09-06):** 이 레포 라우트 엔트리 파일 47개(그중 layout 5) → **URL 42개**, **`handles` 115개**. R5 §2.4 추정(~30 route / ~45 handles)과의 차이는 **layout 체인**이다 — 추정이 세지 않은 부분. 데코레이터 라우트는 0(파이썬 서비스가 없는 레포).
      **설계 판정:** Next는 **SQL 유도**(플랜에 라우트 없음 → ADR-013 구조적 성립, resolved 1.0), FastAPI/Flask는 **plan.routes**(method·path·line만, reference 0.6 — `APIRouter(prefix=…)`가 붙인 URL은 스캔이 볼 수 없다). layout 포함 규칙은 **URL 접두가 아니라 경로 포함**이다 — `(shell)` 그룹은 URL에서 지워지므로 URL로 비교하면 루트 레이아웃과 구분되지 않아 `/api/health`까지 잡았고, 테스트가 그걸 잡아냈다. 한 규칙의 두 구현(TS `nextRouteFile` / SQL `next_route_url`)은 9개 경로에서 서로 비교하는 테스트로 묶었다.
      **MCP 절반:** `impact_of.affectedRoutes` 추가(영향 집합이 서빙하는 URL + 자기 자신이 라우트인 경우). 어휘 추가는 좁게 — `McpEdgeRelation += handles`만이고 **`contains`는 뺐다**(계층 엣지 885개가 모든 `get_neighbors` 답을 묻는다; 끄는 플래그는 todo 22). `McpNodeType += route`는 순회용이며 `index_entries.entry_type` CHECK은 6종 그대로다.
      Commit: `feat(ingest): derive route nodes and handles edges from Next.js and FastAPI conventions`

- [x] **7. db_object 노드 + `queries`/`defines`/`modifies`/FK** _(설계 ①·Graphify SQL)_
      `packages/core/src/ingest/schema-links.ts`: `create table/function/view` → `db_object`(subkind, 이름·소유 마이그레이션 span만), `alter table` → `modifies`, `references public.x` → FK(resolved); 코드 측 `.from('t')`·`.rpc('f')`·`__tablename__`·`Table('t')`·`prisma.t` 리터럴 → `queries`(reference 0.6, **소유 테이블 목록에 있는 이름만**). database 밴드·범례·사각 스프라이트.
      수용 기준: 이 레포 실측(테이블 43·함수 59·queries ≥100) evidence, 픽스처 스냅샷, 동적 테이블명 미검출을 문서화, 두 경로 동등성.
      Commit: `feat(ingest): extract database objects, schema edges, and code→table query references`

- [x] **8. section 노드(선택) · 4종 모양 문법 · 밀도 회귀 테스트** _(설계 ①·②)_
      ID 토큰 헤딩(`ADR-NNN`·`OQ-NNN`·`G\d+`·`MT-\d+`, `.alrescha.json`로 확장 가능)만 `section`으로 승격, doc/rationale(`adr_ref`)→section `references`(resolved). 4종 스프라이트(원/링/다이아몬드/사각)와 `unit` 필터 칩은 B(todo 12)에서 렌더. **`tests/graph-density.test.ts`**: 픽스처 2종에서 평균 차수 ≥3·contains 제외 고아 ≤10%·삼각형 >0·두 경로 플랜 바이트 동일·verified 승격 0·원문 비저장(scope 스캐너) 단언 + 이 레포 실측표 evidence.
      수용 기준: 위 테스트 green, 전형 레포(section 0)에서도 green, 두 테마 스크린샷(줌아웃 카테고리 라벨·줌인 파일 라벨).
      보완(R-01 #4·R-03, 2026-09-06): 게이트가 **근거 무손실**도 단언한다 — 표시되는 모든 엣지가 family와 provenance(reason 또는 source span)를 갖고, 같은 `(source,target,relation)`에 근거가 둘이면 하나를 버리지 않는다. 그리고 **blast radius 분모에서 hierarchy(`contains`, layoutOnly)·doc `references`·통계 공변경을 제외**한 수가 별도로 기록된다 — 밀도는 이것들을 세지만 영향도는 세지 않는다(R-03 #5). `verified` 승격 0 단언은 그대로.
      Commit: `feat(ingest): add section nodes for id-token headings and lock the density regression gate`

## Wave B — Graph View 조작감·성능 "Obsidian 급" _(게이트 없음, Codex 권장, A와 병행)_

- [ ] **9. 카메라: 커서 앵커 줌 · 부드러운 줌/팬 · fit-to-view · `settled` 소비** _(v1 todo 5 그대로)_
      Commit: `feat(map): cursor-anchored smooth zoom, fit-to-view, and settled signalling`

- [ ] **10. 캔버스 히트 테스트(quadtree) + 호버 이웃 강조/페이드 + DOM 접근성 전용 캡 200** _(v1 todo 6 그대로 — **데이터 웨이브의 선행 조건**: 1,260노드는 600 캡을 넘는다)_
      Commit: `feat(map): canvas hit-testing with a spatial index and hover neighborhood focus`

- [ ] **11. 노드 드래그 + 리히트 + `forceCollide` + 패밀리별 힘장** _(v1 todo 7 확장)_
      `LinkPair = [i, j, familyCode]`, 패밀리별 strength/distance 표(structure 0.55/90 · doc 0.3/120 · contains 0.3/30 · database 0.4/100 · route 0.45/70 · statistical 0.1/140 · semantic 0.3/110 · evidence 0.45/90), `1/min(deg)` 정규화, `forceCollide(r).iterations(2)`, `pin/unpin/reheat` 프로토콜, 시드 결정론 유지.
      Commit: `feat(map): drag nodes with reheat, collision, and family-aware forces`

- [ ] **12. 렌더 성능 + 허브 시각 문법** _(v1 todo 8 확장, G5·G6·G7·MT-7)_
      스타일 그룹(color,width,alpha,dashed)당 1회 stroke, 4종 텍스처 Sprite 풀(원/링/다이아몬드/사각), positions 리비전에서만 엣지 지오메트리 재기록, 노드·엣지 스크린 AABB 컬링, 스크린 공간 라벨 + 실제 페이드, 라벨 Text 풀 회수, DPR 변경 추적, 패밀리별 draw 정책(far: contains·co_changed·section·semantic 숨김; near: contains α 0.08), far 라벨 kind 가중(package > route > directory > 차수) `FAR_HUB_LABEL_LIMIT` 12, dash 스크린 단위, 코드 노드 위험 링 3단계(todo 1·21의 `risk` 필드) + 범례, 상태 배지. **`scripts/bench-graph-browser.ts`** 신설(Playwright, 5k 노드 팬/줌 p95, 호스트·GPU 명시).
      Commit: `perf(map): sprite nodes, style-group strokes, culling, screen-space labels, and the browser benchmark`

- [ ] **13. 필터=가시성 · 레이아웃 영속화 · `/app/map` force 패널 · Obsidian 옵션 패리티 · 결정론 접힘 · 레이어 토글 · 도메인 앵커 슬라이더** _(v1 todo 9 확장)_
      `setVisibility`(시뮬 재시작 0), IndexedDB 좌표 워밍(`initialPositions`, 키에 commitSha), force 패널 이식, Groups(검색어→색, 저장)·Orphans·Arrows·Node size/Link thickness·Local graph depth·뷰 프리셋·핀, `hierarchyAssignment(level)`(far→package ?? depth-2 dir, mid→leaf dir; Louvain은 허브 없는 데이터 폴백; 슈퍼노드 템플릿 = 디렉터리 노드 자신, 병합 엣지 두께 ∝ log(count), `RAW_RENDER_NODE_LIMIT` 3,000 유지), 레이어 토글(contains/co_changed/concept/section/style/config/doc), forceX/Y 도메인 앵커 슬라이더(강도 ≤0.05, 기본 off), 빈 상태를 `visibleGraph` 기준으로, 뷰 토글 시 스테이지 유지.
      Commit: `feat(map): visibility filters, persisted layout, deterministic collapse, layer toggles, and Obsidian option parity`

- [ ] **14. 렌더러 단일화 + 데모 하드코딩 제거** _(v1 todo 10 그대로)_
      Commit: `refactor(graph): unify on the Pixi stage and drop the SVG renderer`

- [ ] **15. 라이브 발광 브리지 + HUD 실데이터 칩** _(D10 — 신규, §1.4-② 시그니처 경험)_
      브라우저가 워크스페이스 Supabase Realtime 브로드캐스트 채널을 구독해 `window` 버스(`lib/realtime/access-events.ts`)로 재전달 — 서버 `httpSend`(`supabase-store.ts:746-763`)와 `map-screen.tsx:366-375` 사이의 끊긴 선. 채널 인가(RLS·토큰)·재연결·revoked 토큰 필터. `/app/map` HUD 칩을 실데이터로(미해소 finding·위험 상위 N·커버리지 basis·마지막 스캔 커밋/신선도) — 데모 상수(`graph-model.ts:636-647`) 제거 및 e2e 문구 갱신(약화 아님, 데모 라우트 단언은 유지).
      수용 기준: e2e — 실 MCP 토큰으로 `search_index` 호출 → 새로고침 없이 맵 노드 발광(Playwright, 로컬 Supabase Realtime), 채널 교차 테넌트 차단 테스트, HUD 값이 로더 출처와 일치.
      Commit: `feat(map): subscribe to live access events in the browser and drive the HUD from workspace data`

## Wave C — 기존(완성된) 레포 온보딩 _(G2 열림)_

- [ ] **16. 연결 시 백필 스캔 · "다시 스캔" · MCP `request_rescan(mode)` · `run-local.ts` 지연 생성** _(D11, v1 todo 11 확장, OQ-029)_
      v1 todo 11 그대로(`enqueue_backfill_scan`, 멱등 키 `backfill:<repoId>:<headSha>`, 온보딩 진행 표시, 버튼, `request_rescan` — `readOnlyHint:false`) + `link_schema_version` 불일치 시 자동으로 `mode:'full'`, `request_rescan(repository_id?, mode?)` 인자, 워커 소스 팩토리를 잡 종류별 지연 생성(DB만 읽는 결정론 잡이 CLI 레포에서도 돌게 — ADR-013). 툴 수 순증 0 목표(todo 22의 통합으로 상쇄).
      수용 기준: v1 기준 + 재링크 잡이 0크레딧임을 원장 테스트로, e2e "레포 연결 → 진행 표시 → `/app/map` 노드 >0"(테스트 이메일 세션), T2FV(연결→의미 있는 첫 화면) 분 단위를 evidence에 기록.
      보완(R-02, 2026-09-06): 백필·재스캔이 산문을 무효화하는 지점을 명시한다 — 새 blob이 들어오면 그 파일의 요약은 즉시 `stale`이고, 구조가 준비되면(structure-ready) 분석이 아직이어도(analysis-pending) 화면을 연다. 두 상태는 별개다.
      **진행(2026-09-06, 미완):** 결정론 절반 완료 — [evidence](../.omo/evidence/phase4/todo-16.md). `enqueue_backfill_scan`·`enqueue_repository_rescan`(head/mode 멱등, 0크레딧 원장 테스트, `link_schema_version` 미달 시 full 승격+사유), MCP `request_rescan`(`readOnlyHint:false`, 툴 23개로 +1 — todo 22에서 상쇄), 스캔 잡이 payload의 `mode`를 읽음, 보완 3상태 단언. **체크박스는 열어 둔다:** G2 미개통이라 실기 연결 0회, 커넥트가 아직 head sha를 읽지 않아 실제로는 `scheduled:false`, 온보딩 진행 표시·버튼·e2e·T2FV 미착수. 워커 소스 팩토리 분리는 소스 없는 잡이 실제로 생기는 todo 17로 미룬다.
      Commit: `feat(onboarding): backfill scan on connect with a full relink mode and an on-demand rescan tool`

- [ ] **17. 로컬 서빙 모드 `alrescha serve --local` + 로컬 레포 분석 경로 판정** _(v1 todo 12 그대로, OQ-030)_
      **진행(2026-09-06, 미완):** 서빙 모드와 판정 완료 — [evidence](../.omo/evidence/phase4/todo-17.md). `alrescha serve --local [디렉터리]`가 로컬 스캔을 `InMemoryMcpStore`로 투영해 stdio MCP로 서빙(서버·토큰·네트워크 없음), 툴 표면은 호스티드와 같은 팩토리(`createMcpServerFor`, 23개), `mcp:read`만 부여해 쓰기는 거절, 사람 대상 출력은 전부 stderr. **투영은 실DB에서 `apply_repository_scan`과 픽스처 2종 전수 비교**로 묶었다(엣지·누락 사유·인덱스·라우트·객체·section) — 두 번째 구현이 어긋나는 것이 이 방식의 유일한 위험이라서다. OQ-030 판정: ⑴ 채택·⑵ 기각, 그 결과로 `enqueue_repository_rescan`이 installation 없는 레포를 잡 생성 **전에** 거절하고 CLI를 가리킨다(todo 16이 열어 둔 3회 실패 경로). 부수 발견 OQ-057(이웃 캐시가 계층·라우트·DB·section을 못 봄 — 투영도 동일하게 맞춤)·OQ-058(stdio는 2025 핸드셰이크 수용, 호스티드는 거절 — SDK 기준 클라이언트로 실측). **체크박스는 열어 둔다:** OQ-030 ⑴이 명시한 **BYOK enrich 미구현**(프로바이더 클라이언트가 `apps/worker`에 있어 이관이 별도 변경), 빌드 산출물이 워크스페이스 패키지를 external로 남겨 `tsx` 없이는 실행 불가(`push`도 동일한 기존 상태). 워커 소스 팩토리 종류별 분리는 todo 20의 `docskeleton`(본문 없이 도는 첫 잡)으로 다시 미룬다.
      Commit: `feat(cli): serve a local repository graph over stdio MCP`

- [ ] **18. CI 증거 배선 — verified 경로 개통** _(D12, 위험 감사 P3, ADR-015 §6 정합: 서버 fetch만)_
      이미 있는 `GitHubCiEvidenceSource`(Actions artifacts + check runs)를 analyze 잡에 주입, `ingestCiTestReports` 결과를 `evidence` 행(kind test/ci, verdict)과 `tests`/`supports` 엣지(evidence family, 소스가 evidence 노드일 때만 verified 유도)로 영속화. 커버리지 리포트(lcov/istanbul) 파싱은 파일별 "측정됨/측정 안 됨"만 — CI 없는 레포에서 "0%" 표시 0. 죽은 코드 `probes.ts`·테스트·export 정리.
      수용 기준: 실DB 헬퍼로 픽스처 CI 리포트 → evidence 행 → 맵 verified 노드 스냅샷(처음으로 도달 가능), 실행 증거 없는 verified 0 단언 유지, 파일럿 레포(Actions 있음) 실기 1회 evidence.
      **진행(2026-09-06, 미완):** 배선 완료 — [evidence](../.omo/evidence/phase4/todo-18.md). `evidence` 행을 쓰는 프로덕션 writer가 처음 생겼다(그 전까지 `insert into public.evidence`는 테스트에만 있었고, 맵의 `verified` 등급은 프로덕션에서 도달 불가였다). 등급을 지는 주장은 둘뿐이다 — **테스트 파일이 돌아 통과했다**(`tests` 엣지)와 **테스트 이름이 부르는 요구사항**(`supports` 엣지). 테스트가 import하는 코드는 승격하지 않는다(스캔의 file→file `tests`는 import 파생이라 실행 증거가 아니다 — ADR-001); 이건 "쓰이지 않는 엣지"로 단언한다. 커버리지는 lcov/istanbul에서 **파일 이름만** 읽어 `ci`/`unknown` 행으로 남기고 엣지를 만들지 않는다(퍼센트는 파서에서 버린다 — "측정 안 됨"과 "0%"는 다른 사실이다). 부수 수정: `coverage-final.json`을 vitest 리포트로 읽던 분류 버그(진단 하나가 그 런의 증거 전체를 버리므로 커버리지를 같이 올리는 레포는 `verified`를 통째로 잃었다), CI 절대 경로 → 레포 경로 해석(`resolveReportedPath`). 죽은 `probes.ts`·테스트·export 삭제(단, "레포 코드 실행 경로 없음" 단언은 새 파서로 **이전**). **체크박스는 열어 둔다:** 파일럿 레포 실기 1회가 G2에 막혀 0회(전부 녹화 픽스처), 맵 스냅샷은 모델 단언이고 Playwright 스크린샷은 Docker 부재로 미실행, 리시트 predicate는 `strictObject`라 CI 증거 수를 싣지 않았다(모든 리시트 digest가 바뀐다).
      Commit: `feat(worker): wire CI test evidence into analyze and open the verified grade`

## Wave D — 0크레딧 표면 · 문서 레이어 · 질의 레이어 _(todo 19·21 게이트 없음 · todo 20은 G3)_

- [ ] **19. 0크레딧 표면 묶음 — 산문 노출 · 다이제스트 · finding 상세 · dismiss/verdict · 커밋 제목 · dead link** _(v1 todo 13 확장 + 진행 P5·P6, 위험 반박, todo 반박; Codex 웹 부분)_
      ⑴ v1 todo 13(인스펙터 파일 요약·concept 요약·모듈 카드, concept MCP 노출) ⑵ `buildProgressDashboard` `digest{today, thisWeek, sinceLastVisit}` + `attention{stale(in-progress 7일↑), blocked(사유 필수)}` 순수 함수, `workspace_screen_views`(마지막 방문), 보드 상단 정렬, `full` 상태 카피를 근거 등급 기준으로 정정 ⑶ 라이브 finding 상세(경로:라인·confidence·증거 체인·권장 조치 — 데모 `assurance-workspace.tsx` 컴포넌트 재사용 + 로더 select 확장) + 문서 todo 카드의 원문 링크를 라이브 경로로 ⑷ finding `dismissed` writer(사용자 액션) + `apply_successful_judgment`가 verdict rejected→dismissed, `reconcileFindings`가 dismissed를 open으로 복원하지 않음 ⑸ 진행 타임라인 커밋 항목 = receipt coverage 제목 + `/app/commits` 링크, 로컬 인제스트 런 "스캔됨(그래프 전용)" 표시 ⑹ write 툴 access_event 정렬(log_progress·record_note 발행; record_prompt는 스펙대로 미발행).
      수용 기준: 뷰모델 단위 테스트(다이제스트 refs dangling 0, stale/blocked 정렬), DB 테스트(dismiss 영속·재분석 복원 0), Playwright 두 테마 axe, Korean-first 스위프, 실스캔 픽스처 위 `/app/progress`·`/app/inspection` 라이브 e2e.
      보완(R-02·R-01, 2026-09-06): 산문을 노출하는 **모든** caller(인스펙터·`get_artifact`·`get_node_content`·검색 excerpt·context pack)가 하나의 freshness 함수를 쓴다. `stale`·`unknown` 산문은 기본 답변에 최신 사실처럼 넣지 않고, 산문이 없어도 카드는 경로·domain/unit·export 이름·관계·TODO/test 상태·출처와 누락 이유를 갖는다. context pack의 `documentKinds`에 `code_metadata`가 없으므로 코드 카드는 **별도 lane**이며 문서 타입으로 위장하지 않는다.
      Commit: `feat(app): digests, live finding details, finding dismissal, and stored-prose surfaces at zero credits`

- [ ] **20. `doc_page` — "페이지는 노드의 얼굴"** _(v1 todo 14 사양 보강, 설계 ④, OQ-033)_
      file/directory/concept은 `doc_pages.anchor_node_id`로 기존 노드에 붙이고 **module/feature/repo만** `graph_nodes(kind='doc_page')`. 슬러그 = md5(정렬된 멤버 디렉터리 집합) + `previous_slugs`. **`docskeleton` 잡(0크레딧, `enqueue_job` 결정론 목록 마이그레이션)**: 멤버·심볼 이름·관계·백링크(읽기 시점 역방향 조회, 저장 없음)·인용 후보 집합을 결정론으로 조립; `docpage` 잡(1크레딧/BYOK 0, enrich 라이프사이클): 저장 산문만 입력, 후보 집합 밖 인용 거부, 축자·펜스·줄 길이 검증기, `inferred` CHECK. module 페이지가 far 접힘 슈퍼노드의 라벨·산문. `/app/docs`·`/app/docs/[slug]`, MCP `get_doc_page`·`list_doc_pages`·`request_docs`(3상태; 툴 수는 todo 22 예산 안에서).
      수용 기준: v1 기준 + 스켈레톤 0크레딧 원장 테스트, 슬러그 불변 테스트(파일 1개 변동), 인용 노드 dangling 0, CLI 레포에서도 스켈레톤 생성(todo 16 지연 생성 전제), 실기 1회(repo 1 + module 5 + feature 3 산문).
      보완(R-02, 2026-09-06): module·concept 산문도 입력 digest 조건부 저장이다 — 저장 시점의 member digest가 생성 시작의 것과 같을 때만 UPDATE하고, 반영 결과를 `applied`/`superseded`/`missing`/`invalid`로 구분한다. `superseded`를 무조건 AI 재호출로 되돌리지 않는다(무과금·멱등 규칙 유지). skip도 어느 blob의 실패인지 구분해 옛 실패가 최신 성공을 덮지 않게 한다.
      Commit: `feat(docs): attach skeleton pages to nodes and generate inferred prose pages from stored summaries`

- [ ] **21. `query_brain` 확장 + 위험 지도 빌더 + 저장 질의** _(v1 todo 15 확장 + 위험 P2, 진행 P4, todo P3 통합)_
      필터 `domain`·`unit`·`family`·`kind`(directory/route/db_object/section/doc_page/**todo**)·`relation`/`withoutRelation`·`hasSummary`·`pathGlob`·`changedSince`, `format:'table'|'ids'`(행 50·열 6), `sortBy:'risk'`. **`packages/core/src/inspection/risk-map.ts`**: 파일별 `RiskEntry{path,nodeId,score,level,factors[],grade:'inferred'}` — 요인 = open findings(target/source; 심각도는 {medium,low}뿐이므로 가중 아닌 카운트)·`untested-code`·팬인(imports/calls 역방향, `importanceMap` PageRank 재사용)·공변경(`file_co_changes` change_count·updated_at 감쇠)·npm audit(있을 때만); 커버리지·감사 부재는 "증거 부족" 회색. `/app/inspection` 위젯 교체(도달 불가 "드리프트 의심" 제거) + 저장 질의 3종(테스트 없는 코드·문서 없는 모듈·요구사항 미구현·위험 상위 10). todo 읽기는 새 툴이 아니라 `query_brain(kind:'todo')`; `log_progress`에 `todo_id?`·`repository_id?`·`commit_sha?` 선택 필드 + 정규화 제목 매칭(SQL·InMemory 동등성 테스트). `.alrescha.json todoFiles/progressDocs`로 인식 범위 확장(spec-kit tasks.md·PLAN/BACKLOG·핸드오프·`.beads`).
      수용 기준: 필터 조합 단위 테스트, 표 토큰 상한, RiskEntry 계약(factors ≥1·provenance·grade), 문서 없는 픽스처에서 위험 상위 10 비어 있지 않음, 결정론 수렴·추가 본문 fetch 0·크레딧 0, 계약 테스트 하위 호환, todo 인식 픽스처 8종 중 ≥7.
      보완(R-03·R-01, 2026-09-06): 위험 지도의 팬인은 **imports/calls 역방향**만 쓴다 — doc `references`·`contains`·유사도는 전파 통로가 아니다. `withoutRelation` 같은 **부정 질의는 조회가 불완전하면 "없음"이 아니라 unknown**을 반환하고, 그 사유를 coverage에 적는다. 정적 도달성은 후보이지 실행 증거가 아니므로 결과는 `candidate`로 이름 붙인다.
      Commit: `feat(brain): risk map, todo-aware query_brain with tabular output, and saved inspection queries`

## Wave E — 에이전트 표면 예산 · 텔레메트리 · 벤치 v3 _(G3 — todo 25)_

- [ ] **22. 예산 문서 — 툴 다이어트 · 단일 워크플로 문안 · 옵트인 훅 · impact 신뢰도 · families 필터 · loadWorkspace 분리** _(D13, v1 todo 16 재정의, OQ-032·OQ-024)_
      ⑴ 툴 카탈로그 ≤16: `search_nodes`→`search_index(include_excerpt=false, domain_filter, limit, excerpt_chars)` 흡수, `get_artifact`↔`get_node_content` 통합(path|id|ids 셀렉터, `max_chars`), `route_query`는 지시 문장 1줄로 이전, `record_note`·`record_prompt` 미노출 검토(스펙 §11 유지 여부 OQ 병기), `request_rescan` 추가; **`outputSchema` 제거**(선택 항목, 카탈로그 62%); `memory_read` limit; `toolResult` 이중 직렬화의 실클라이언트 호환 패스(Claude Code·Codex·Cursor) 후 정리. **count_tokens 실측 상한(≤1,500토큰)을 계약 테스트로** ⑵ 지시 블록·최소 인덱스·`get_graph_schema.text`·툴 설명이 같은 상수를 참조: "시작 시 `query_brain(kind:'todo')` 선택 1회 → 진입 `search_index` 1회 → 관계형(경로·영향·의존) 질문만 `get_neighbors/trace_path/impact_of` → 3회 조회 후 미해결이면 파일을 직접 읽어라 → 위험 후보 파일 편집 전 `impact_of` 1회 → 종료 `log_progress` 1회 + `memory_write` ≤1회(assert_link·record_ruled_out은 필요 시)"; 블록 ≤300토큰(count_tokens), 첫 파일 읽기 전 강제 호출 ≤2; Cursor `alwaysApply`와 §1.5 긴장을 문안에 명시 ⑶ 옵트인 훅 스니펫(Claude Code SessionEnd → `log_progress` 요약 1건; PreToolUse Grep/Read → `search_index` 권고, **차단 아님**), Codex·Cursor 대응 문서화 ⑷ `impact_of` 응답 `confidence{resolved,reference,inferred,agent_asserted}`·`bound:'exact'|'lower-bound'`·`affected{tests,docs,requirements,routes,tables}`·`targetRisk` ⑸ `get_neighbors/impact_of/query_brain/trace_path`에 `families` 필터·`includeHierarchy=false` 기본·결과 캡, `get_graph_schema`가 families 카운트 광고 ⑹ `loadWorkspace` 기본 로드 = structure+evidence+semantic, hierarchy/database/route는 부분 쿼리(`loadHierarchy(ids)`), 요청당 페이로드 전후 evidence(MT-5 정신).
      수용 기준: 계약 테스트(툴 목록·readOnlyHint·count_tokens 상한·families 필터 하위 호환), 문안 공통 상수 테스트·스니펫 스냅샷, 쓰기 툴이 graph_nodes에 없는 id 거부, `verify-scope-boundaries.ts` PASS, OQ-024 갱신.
      보완(R-01·R-03, 2026-09-06): ⑹의 `loadWorkspace` 분리는 **모든 caller가 옮기기 전에 삭제하지 않는다.** 각 read가 `complete`/`truncated`/`unsupported`와 누락 사유를 반환하고, 999/1,000/1,001행 경계에서 마지막 아티팩트·마지막 엣지가 답에 들어오는지 단언한다. 같은 경로가 두 repo에 있으면 첫 repo를 임의 선택하지 않고 ambiguity를, batch는 입력별 결과를 돌려준다. ⑷의 `impact_of`는 `mode`·`semanticsVersion`으로 **opt-in 이행**이며 기존 `transitiveNodeIds`의 의미를 설명 없이 바꾸지 않는다. SECURITY INVOKER는 service-role 경로의 tenant 안전을 대신하지 않으므로 user-JWT와 service-role 경로를 각각 음성 테스트한다.
      Commit: `feat(mcp): budget the tool catalog and instructions, add families filters, and label impact confidence`

- [ ] **23. 세션 텔레메트리 — 툴별 응답 크기 · 에이전트 보고 usage · 일 집계** _(토큰 감사 P4, 신규)_
      `emitAccessEvent`에 `response_chars`·`estimated_tokens`(4자/토큰 가정 컬럼 고정, 원문 없음), 경량 툴 또는 훅 수신 경로 `report_session_usage({input_tokens, cache_read_tokens, …})`(옵트인, 원문 없음, 실패 무시 — 툴 수 예산 안에서 `record_prompt` 자리 재검토), `usage_daily(workspace_id, repository_id, day)` 집계, 보존은 `access_event_retention_days` 준수.
      수용 기준: 이벤트 스키마·집계 SQL 테스트, 프라이버시(ADR-011) 음성 테스트(원문 0), `docs/PRIVACY.md` 갱신.
      보완(R-01, 2026-09-06): `access_events`·`last_used_at` 같은 **읽기 부수 기록은 graph revision에 넣지 않는다** — 넣으면 읽기가 자기 자신을 무효화한다. workspace memory와 repo 데이터의 scope도 구분한다.
      Commit: `feat(telemetry): record response sizes and opt-in session usage per repository`

- [ ] **24. 레포별 절감 미터 · 상시 로드 지시문 비용 표(§5.2-③) 실데이터화** _(토큰 감사 P5·P8, Codex 화면)_
      `/app/stats` 레포 필터 + 세 카드 분리(서빙 토큰 실측 / 에이전트 보고 usage / 팩 예산 추정, 각 가정 1줄) + n<임계 "증거 부족" + 방법론 링크를 v3 리포트로 + "벤치 수치 ≠ 내 수치" 명시. `packages/core/src/inspection/instruction-cost.ts`: agents/claude/cursor_rule/skill 아티팩트의 `size_bytes`·classification으로 파일별 토큰 추정(공통 상수)·로드 주체 규칙(Claude Code CLAUDE.md·.claude/rules / Codex AGENTS.md 계층 / Cursor alwaysApply) → `/app/harness` 표. 데모 픽스처 문구는 "데모" 라벨 + e2e 갱신.
      수용 기준: 뷰모델 테스트, 실레포 표 합계가 `size_bytes`와 정합(±10%), 두 테마 axe.
      Commit: `feat(stats): per-repository savings meter with stated assumptions and a live instruction cost table`

- [ ] **25. graph-surface v3 — 설치된 예산 · 프로덕션 형태 스토어 · 부속 실험** _(v1 todo 17 확장, ADR-012)_
      사전등록 v3(다이제스트 잠금): 그래프군 = todo 22 예산(지시 블록 포함) + A′ 계층 그래프 + `get_doc_page`(있으면), 툴 정의는 하네스 자체 JSON이 아니라 **제품 `tools/list` 출력에서 변환**, usage에 `cache_creation/cache_read` 포함, **프로덕션 형태(요약 전용 스토어)**로 코퍼스 구성(픽스처 본문 코퍼스 금지 — R5 §4.5 모순 ⒀), MCP 없음 baseline 유지, 질문 세트·채점은 v1과 바이트 동일. 부속 실험(주 가설 오염 금지, 별도 사전등록): 진행 기록 채택률·호출당 토큰(provider usage)·todo 중복률, 위험 상위 30 정밀도 라벨링(파일럿 레포 + arr-app, CI 유/무 분리), 관계형 질문 4개 세트. 결과는 판정 무관 게시, 사이트 문구는 ADR-012 절차로만.
      수용 기준: 다이제스트 잠금 후 실행, 실패 0, `verify-benchmark-report.ts` PASS, 모델별 표 evidence.
      Commit: `feat(bench): preregister and run graph-surface v3 against the production-shaped store`

## Wave F — 심볼 헤일로 + tree-sitter WASM 재판정 _(선택 — OQ-031·OQ-019 판정 후)_

- [ ] **26. 심볼 노드(`symbol`) + `declares`/`extends` + 헤일로 부분 로드** _(v1 todo 18 사양 확정, 설계 ③)_
      `symbols` 테이블 + `graph_nodes(kind='symbol')`, 안정 id sha1(path|container|kind|name), name/kind/container/span/engine만(시그니처·독스트링 저장 금지 — scope 스캐너 확장), `GET /api/map/symbols?fileIds`(파일 ≤200·심볼 ≤5,000·엣지 ≤20,000) + IndexedDB(commitSha 키), 소유 파일 중심 황금각 헤일로(시뮬 불참), `symbolOwner` 접힘 층, MCP `loadSymbolNeighborhood` 지연 로드(전량 로드 금지), `impact_of(symbol)`·`trace_path` 심볼 id, `search_index` 심볼 히트에 `path:startLine-endLine`(이건 0마이그레이션이라 todo 22에서 선행 가능).
      Commit: `feat(ingest): promote symbols to graph nodes behind hierarchical loading`

- [ ] **27. OQ-019 재판정 실험 — `web-tree-sitter` 프로토타입(채택 아님)**
      브랜치에서 WASM + python/go 그래머: CLI 패키지 크기 증분, 1k Python 파일 파싱 시간, 두 경로 동등성, 심볼 품질 대비 — ADR-014 §5 트리거 데이터(주 언어 분포·벤치 귀인)가 있을 때만 착수. 결과는 `.omo/evidence/phase4/oq-019-wasm.md` + OQ-019 갱신.
      Commit: `chore(research): prototype web-tree-sitter for the ADR-014 re-judgement`

---

## Must NOT have

- 렌더 라이브러리 교체, 서버 사이드 레이아웃 부활, WebGL 없는 폴백 렌더러 신설.
- 원본 소스 본문·코드 스니펫·심볼 시그니처·독스트링의 저장·전송, 문서 본문의 AGENTS.md/CLAUDE.md 인라인.
- `verified` 승격 — 새 엣지는 전부 resolved/reference/inferred; 영수증 `implVerified` 라벨 정정 외 의미 변경 금지.
- 가상 `feature`/`domain` 노드, 파일→domain 저장 엣지, 설정을 DB에만 두는 레이아웃 관례, `unclassified`의 조용한 흡수.
- 동적 툴 노출, 훅 strict 차단 기본값, 새 과금 경로, 실패 출력 과금, 툴 수 순증(예산 ≤16 밖).
- 기존 e2e 단언 약화·스냅샷 갱신으로 회귀 은폐·측정 없는 성능/효율 수치 게시·픽스처 본문 코퍼스로 잰 벤치 수치를 제품 수치로 표기.
- hex 하드코딩, strings 모듈 밖 사용자 카피, Pretendard 외 본문 폰트.

## 검증 전략

기존 규약(수용 기준 = 테스트, lint/typecheck/vitest/Playwright/scope boundaries)에 더해:

- **밀도 회귀 게이트**(todo 8): 픽스처 2종에서 평균 차수·고아·삼각형·두 경로 동등성·verified 0·원문 비저장 단언. 이 레포 실측표는 `measure-graph-density.ts`로 evidence에.
- **그래프 성능 두 겹**: vitest 프레임 플랜(1,300/4k·5k 컬링 케이스) + 브라우저 실측(`bench-graph-browser.ts`, 호스트·GPU 명시). GPU 조각은 vitest가 볼 수 없다.
- **실스캔 위 라이브 e2e**(D15): `local-ingest-card.spec.ts` 발판을 확장해 `/app/map`·`/app/progress`·`/app/inspection`을 실스캔 픽스처 위에서 단언 — 데모 라우트 단언은 유지(약화 아님).
- **두 경로 동등성**은 매 웨이브 회귀: 같은 픽스처를 GitHub 소스 mock과 `alrescha push`로 넣어 플랜 바이트 비교(ignore 규칙 포함).
- **보완 음성 테스트**(2026-09-06): 위 §보완 설계 접속의 목록은 해당 todo의 완료 판정에 포함된다. 테스트가 미구현 보완을 드러내면 기대값을 낮추지 않는다 — 저장소의 테스트 약화 금지 규칙이 우선한다.
- **벤치는 프로덕션 형태**: v3 그래프군은 요약 전용 스토어 + 제품 `tools/list` 카탈로그로 구성. 사전등록 후 실행, 판정 무관 게시.
- **화면은 두 테마 스크린샷 + axe**를 evidence에(1440 기준).

## 우선순위·병행

1. **todo 0**(Claude Code) — 단독 첫 세션. 완료 전에는 다른 데이터 todo 착수 금지. Wave B 첫 커밋(protocol dedup·강도 복원)은 이 세션에서 A가 대행해도 된다.
2. **Wave A 1–5**(Claude Code) ∥ **Wave B 9–13**(Codex). 파일 경계: A는 `packages/core`, `apps/worker`, `supabase/migrations`, `apps/web/lib/map`·`lib/dashboard/graph-model.ts`(타입 선커밋); B는 `apps/web/lib/graph`, `app/ui/brain-map*`, `map-screen.tsx`, `dashboard-screen.tsx`, `styles/screens/map-hud.css`. A3 완료 + B10 완료가 **첫 은하 배포 지점**(1,000+ 노드가 600 캡을 넘으므로 둘 다 필요).
3. **Wave A′ 6–8** → **Wave C 16–18**(사용자가 실제로 "완성된 레포"를 연결해 은하를 보는 첫 순간) → **Wave B 14–15** → **Wave D 19 → 21 → 20** → **Wave E 22 → 23 → 24 → 25** → 필요 시 F.
4. 배포(G4) 권장 지점: A3+B10, C16, D19, E22.
5. **사용자 결정이 필요한 OQ(039·040·041·042)는 Wave D 착수 전까지** — D19의 무료 표면 범위와 E22의 예산이 이 결정에 좌우된다.

## 부록 — v1 todo 번호 대응

| v1                  | v2                             | v1                                                                                                                           | v2                     |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Wave A 1·2·3·4      | A 1·2·3·4 (+ A0, A5 신설)      | Wave C 11·12                                                                                                                 | C 16·17 (+ 18 신설)    |
| Wave B 5·6·7·8·9·10 | B 9·10·11·12·13·14 (+ 15 신설) | Wave D 13·14·15                                                                                                              | D 19·20·21             |
| —                   | A′ 6·7·8 신설                  | Wave E 16·17                                                                                                                 | E 22·25 (+ 23·24 신설) |
| Wave F 18           | F 26 (+ 27 신설)               | OQ-029~034 본문의 "Wave C todo 11", "Wave D todo 14", "Wave E todo 16·17", "Wave F todo 18"은 각각 16·20·22/25·26으로 읽는다 |                        |
