# Alrescha 연구 보완 실행 백로그

작성: Codex · 2026-09-05 · 제안 상태. 이 문서는 작업 배정·제품 변경 승인이 아니다.

근거와 비교 연구: [독립 연구 보고서](C:/Users/axz14/Desktop/Project/Arr/app/docs/reports/RESEARCH_INDEPENDENT_UPGRADE_2026-09-05.md).
현재 동작: [probe](C:/Users/axz14/Desktop/Project/Arr/app/docs/reports/research-upgrade-2026-09-05.probe.mjs), [양쪽 checkout 결과](C:/Users/axz14/Desktop/Project/Arr/app/docs/reports/research-upgrade-2026-09-05.results.json).

## 1. 시작 전 인수인계

- main 75f60fa에는 todo 0까지 있다. probe 기준인 Claude 51d0efe에는 todo 1~4가 추가되어 있었다. 마감 재확인에서 todo 5 관련 5117e62 커밋도 확인했다. 새 커밋 전체를 독립 검증한 것은 아니므로 구현 시작 시 최신 HEAD·변경 파일·증빙을 다시 읽는다.
- Claude 작업 트리의 미커밋 파일은 덮어쓰지 않는다. 기존 QA 이미지·브랜드 작업도 보존한다. 이 연구는 제품 소스·spec·기존 변경을 수정하지 않았다.
- 기존 Phase 4 todo 번호는 유지한다. R 번호는 추가 요구와 수용 기준을 연결하는 보완 식별자다.
- GraphData, WorkspaceMapModel, simulation protocol이 A↔B 경계다. todo 3/4 완료를 “계획에 적힌 미래 node 종류와 pin/reheat 프로토콜까지 모두 완성”으로 해석하지 않는다. 실제 타입 diff를 먼저 확인한다.
- repo read/write schema는 한 담당이 소유한다. Claude 데이터 경로와 Codex 렌더 작업을 분리하되 계약 변경은 공동 검토 후 단일 커밋으로 전달한다.
- 아래 기간 대신 작업 크기 S/M/L을 쓴다. S=한 경계, M=다중 경계, L=end-to-end/새 schema. 시간 보장이 아니다.

## 2. 의존 관계와 권장 분담

```text
R-01 완전성·출처 ─┬─ R-03 영향 의미 ─┬─ R-06 기능 경로
R-02 최신성·버전 ─┘                  ├─ R-07 근거 묶음/저장 질의 ─ R-08 효과 검증
                                    └─ R-09 작업 재개/위험 피드백
A3/A4 타입 인수 ───── R-04 그래프 조작·렌더 ─┐
R-01/R-02 + C16 ───── R-05 첫 연결·파일 카드 ┴─ 사용자 pilot
                                                  ↓
                                         R-10 유료/adapter 판단
```

권장 분담은 Claude=scan/DB/MCP writer·reader, Codex=Wave B·웹 read surface·브라우저 성능 fixture, 공동=계약·golden 데이터·벤치 설계다. 실제 구현을 맡았다는 뜻은 아니다.

## 3. 즉시 P0

### R-01. MCP read completeness와 provenance를 보장한다

- 크기 M. 관련 기존 todo 3/21/22. 권장 담당: MCP/DB 담당.
- 대상: [Supabase store](C:/Users/axz14/Desktop/Project/Arr/app/apps/web/lib/mcp/supabase-store.ts), [MCP store types](C:/Users/axz14/Desktop/Project/Arr/app/packages/mcp/src/store.ts), [graph tools](C:/Users/axz14/Desktop/Project/Arr/app/packages/mcp/src/graph-tools.ts), hosted schema·계약 테스트.
- 산출: workspace 전체 로딩을 질문·repository scope별 read로 나누고, 필요한 전량 조회는 안정된 순서와 cursor로 순회한다. 각 read가 complete/truncated/unsupported/omittedReason을 반환한다.
- edge의 family, 추출 근거, 방향, 지원되는 신뢰·버전 정보를 손실 없이 전달한다. 새 node/relation allowlist 누락도 같은 계약에서 검사한다.
- 안전 경계: Supabase 제한을 무제한으로 올리거나 service role 우회로 해결하지 않는다. cache는 authorization scope와 snapshot을 구분한다.

수용 기준:

1. 999/1,000/1,001행 fixture에서 마지막 artifact와 마지막 edge가 필요한 질의의 답을 검증한다. 조용한 누락은 실패다.
2. 결과 예산 때문에 일부만 반환하면 complete=false와 후속 cursor/사유가 있다. complete=true는 명시된 scope에 대해서만 말한다.
3. 공통 파일명을 가진 두 repo, 다른 workspace, revoke된 token에서 교차 데이터 노출이 없다.
4. stored edge→loader→tool response round trip에서 provenance/family/방향이 보존된다. UI/MCP node ID를 대조한다.
5. 페이지 사이 데이터 변경을 검증한다. 중복/누락을 피할 snapshot 또는 재시작 전략을 문서화한다.
6. query count·반환 bytes·p95를 기존 경로와 비교하되 “11개를 1개로” 자체를 목표로 삼지 않는다.

최소 릴리스: 현재 schema 안의 조회 정합성·표시 보완. 새로운 snapshot 저장 구조는 R-02의 결정과 함께 진행한다.

### R-02. 오래된 요약과 버전이 섞인 답을 차단한다

- 크기 M~L. 관련 todo 16/19/20/23. 권장 담당: scan/enrich/reader 공동 계약, writer 소유자 구현.
- 대상: [요약 store](C:/Users/axz14/Desktop/Project/Arr/app/apps/worker/src/postgres-enrich-store.ts), [enrich job](C:/Users/axz14/Desktop/Project/Arr/app/apps/worker/src/enrich-job.ts), MCP/UI mapper, scan publish.
- 즉시 패치 범위: summaryBlobSha가 source_blob_sha와 다르면 current summary로 서빙하지 않는다. 누락된 digest도 검증된 최신 상태로 간주하지 않는다.
- 확장 범위: snapshotId/indexedCommit/extractorVersion, source와 summary의 독립 버전, module member digest, scope와 validity. 저장 schema 변경은 관련 ADR/OQ 검토 후 별도 migration.
- 오래된 산문은 이력으로 유지할 수 있다. 최신 파일 카드로 대체하면서 stale 상태를 숨기지 않는다.

수용 기준:

1. blob a의 요약 뒤 blob b 스캔, b 요약 전의 UI/MCP 모두 최신 카드 또는 명시된 stale 자료를 반환한다.
2. 요약이 없는 첫 scan도 content가 비어 사실상 쓸 수 없는 응답이 되지 않는다.
3. 삭제·rename·설정 변경·extractor version 변경에 맞는 invalidation을 검증한다.
4. 오래된 enrich 작업이 늦게 끝나도 최신 요약/버전을 덮어쓰지 않는다. 쓰기 시 expected digest를 비교한다.
5. 동시 scan 및 부분 실패 후 이전 완전 snapshot은 계속 읽을 수 있고 과거 scan이 최신 head를 역전하지 않는다.
6. 화면의 “최신”과 MCP의 freshness는 동일한 함수/계약으로 판정한다.

### R-03. 관련성 탐색과 변경 파급을 분리한다

- 크기 M. 관련 todo 21/22/25. 권장 담당: core/MCP 담당.
- 대상: [impactOf/tracePath](C:/Users/axz14/Desktop/Project/Arr/app/packages/mcp/src/graph-tools.ts:205), core risk builder, UI 설명·tool schema.
- 산출: discover, dependency-impact, feature-trace 의미를 명시한다. 기존 함수/필드를 호환 확장하거나 새 버전으로 교체하되 기존 결과의 의미를 조용히 바꾸지 않는다.
- dependency-impact는 허용된 관계의 방향성 있는 역도달이다. docs/tests는 증거·맥락으로 붙여도 무제한 전파 통로로 쓰지 않는다.
- 추출된 구조의 도달성은 “실제로 깨짐”의 증명이 아니다. static candidate와 runtime evidence를 구분한다.

수용 기준:

1. A→B, C→B에서 A 변경의 dependency-impact에 C가 포함되지 않는다.
2. B 변경에서는 알려진 A/C 소비자가 둘 다 후보로 포함된다.
3. README→A/C에서 A와 C는 discover로 연결될 수 있으나 dependency-impact로 이어지지 않는다.
4. 실제 역방향 import chain, cycle, re-export, unresolved import, test-only import를 분리한다.
5. hierarchy/layoutOnly·유사성·단순 문서 references는 blast radius 계산에 들어가지 않는다.
6. trace는 relation, 방향, 근거, freshness를 설명한다. cap/unsupported 때문에 불완전하면 exact/complete 주장을 하지 않는다.

주의: 제공한 probe는 **기존 동작을 확인하는 연구 스크립트**다. 제품 수정 후 그대로 “정상 테스트”로 쓰지 말고 위 수용 기준으로 새 회귀 테스트를 작성한다.

## 4. 병행 P1

### R-04. Wave B를 실제 조작과 브라우저 성능으로 완성한다

- 크기 L. 기존 todo 9~15를 대체하지 않는다. 권장 담당: Codex frontend.
- 대상: [graph canvas](C:/Users/axz14/Desktop/Project/Arr/app/apps/web/app/ui/graph-canvas.tsx), [Pixi backend](C:/Users/axz14/Desktop/Project/Arr/app/apps/web/lib/graph/pixi-backend.ts), [Worker protocol](C:/Users/axz14/Desktop/Project/Arr/app/apps/web/lib/graph/simulation-protocol.ts).
- 선행: A3/A4의 실제 타입 인수. 새 node·force 메시지 타입을 누구 소유로 추가할지 합의.
- 순서: camera/hit→hover/drag→좌표 안정성/visibility→렌더 budget→folding→realtime. 데이터량을 늘리기 전에 601번째 노드도 조작 가능해야 한다.

수용 기준:

1. 599/600/601/2,001노드에서 모든 보이는 node를 캔버스로 선택할 수 있다. DOM 접근성 cap과 별개다.
2. 커서 앵커 zoom, pan 후 hit, drag/pin/unpin, fit, 선택 해제의 좌표 오차를 테스트한다.
3. 필터 on/off와 검색 해제 뒤 기존 노드의 위치를 보존한다. count·risk·완료율의 의미를 바꾸지 않는다.
4. hierarchy 접힘 전후 identity와 포함 노드 수를 추적할 수 있다. 미구현 접힘을 완료된 것으로 표시하지 않는다.
5. Worker 오래된 revision·삭제된 노드 이벤트·realtime 재연결/중복/역순에 화면이 역행하지 않는다.
6. 1k/5k/10k × sparse/hub/dense fixture의 실제 브라우저 trace를 남긴다. 장치·브라우저·DPR·GPU·버전·시나리오를 기록한다.
7. frame p50/p95/p99, input/hover latency, initial layout, memory trend를 분리한다. CPU simulation 시간만으로 FPS 통과를 선언하지 않는다.
8. 한국어 label, light/dark, reduced motion, 키보드 탐색, WebGL context loss, mount/unmount 누수를 확인한다.

성능 목표는 benchmark preregistration에서 확정한다. 연구 보고서의 숫자는 목표 후보다. Obsidian과 동일 성능이라는 표현은 동일 조건 비교 증거가 있어야 한다.

### R-05. 기존 저장소 첫 연결에서 유용한 그래프와 파일 카드를 제공한다

- 크기 L. 기존 todo 16/17/19/20. 권장 담당: Claude ingest + Codex 화면.
- 선행: R-01/R-02의 최소 read 계약.
- 산출: connect→backfill→완전 snapshot→graph/table/card→선택적 enrich의 end-to-end 흐름. pricing과 무관하게 기본 설명에 빈칸이 없게 한다.

수용 기준:

1. 새 push·유료 생성·manual enrich 없이 기존 repo의 파일/디렉터리/문서/실관계가 나타난다.
2. first card는 경로, domain/unit, 알려진 exports 이름, 관계, TODO/test 상태, source 위치·버전·누락 이유를 가진다.
3. schema/framework를 지원하지 않으면 unknown/unsupported를 표시한다. 잘못된 backend fallback으로 채우지 않는다.
4. 최소 fixture: Next+FastAPI+DB, Python 단일 repo, TS monorepo, docs 중심 repo. 생성물/vendor/비밀 파일 제외를 검증한다.
5. scan/enrich의 진행·실패·재시도·취소 상태를 분리한다. 중복 요청은 같은 작업에 수렴한다.
6. 파일 카드와 doc_page가 같은 파일의 구현량·밀도·진행도로 중복 집계되지 않는다.
7. first useful graph까지의 시간을 기록한다. 연결만 성공하고 빈 화면인 상태를 activation으로 세지 않는다.

### R-06. frontend와 backend를 잇는 기능 경로를 추가한다

- 크기 M~L. 기존 todo 6/7 후속. 권장 담당: 추출기 담당.
- 첫 범위: OpenAPI operationId/정적 client method+path→route→handler→명시된 DB 객체. gRPC/GraphQL/message bus는 별도 후보.
- 원칙: source 기반 resolved와 heuristic/unresolved 구분. 서비스를 가로지르는 ID에 repository/service scope를 포함한다.
- ADR 영향: 새 relation/node/metadata 허용 목록 검토 필요. raw 코드·signature·docstring 업로드는 허용하지 않는다.

수용 기준:

1. 한 사용자 기능에서 화면→API→서버→DB→test 경로가 실제 fixture와 일치한다.
2. 같은 path를 가진 다른 service, 동적 URL, router prefix, method 차이가 오연결되지 않는다.
3. 추출 precision/recall을 수작업 golden과 비교한다. 연결을 못 찾는 것과 없음을 구분한다.
4. route rename·API client 재생성·table rename 뒤 오래된 edge가 사라진다.
5. function-level 정밀도가 필요한 때만 symbol adapter를 호출한다. 대규모 전역 symbol 렌더를 선행 조건으로 두지 않는다.

### R-07. 예산형 근거 묶음과 공유 저장 질의를 제공한다

- 크기 M. 기존 todo 21/22. 권장 담당: MCP/질의 담당 + Codex UI 소비.
- 선행: R-01~03. R-06은 feature 질문 지원을 강화하지만 모든 query의 선행은 아니다.
- 산출: 기존 context pack/query_brain 확장. typed query AST가 graph/table/todo에서 같은 ID 집합을 반환한다.
- 상시 지침은 최소화하고 task별 근거를 공급한다. 저장소 전체 읽기나 graph-first N단계를 강제하지 않는다.

수용 기준:

1. exact identifier, 방향 영향, 전체 구조, 한국어 개념, unsupported 질문을 별도 fixture로 평가한다.
2. 초기 응답에 짧은 이유·출처·버전·다음 로컬 read 위치가 있다. ID-only 왕복을 필요 이상 늘리지 않는다.
3. budget을 넘으면 무엇이 빠졌는지 표시한다. 필요한 근거가 없으면 적절히 abstain한다.
4. UI와 MCP 같은 saved query가 같은 snapshot에서 같은 결과를 낸다. JS/SQL 임의 실행은 없다.
5. 도구 수·schema bytes·실제 prompt input·output·round trip을 따로 측정한다.
6. raw-source 비보존을 유지한다. semantic embedding은 기본 포함하지 않고 별도 승인·ablation 후 판단한다.

### R-08. 실제 성공과 비용을 판정하는 benchmark v3를 만든다

- 크기 M~~L. 기존 todo 23~~25 강화. 권장 담당: 공동 실험 설계, 구현 경계별 fixture.
- 선행: telemetry 필드 의미 합의. 유료 실행 전 예산·모델·표본·실패 규칙을 확정한다.
- 비교: native baseline, 현재 Alrescha, R-07 방식. 질문·수정/테스트·재개·위험 strata와 모델별 결과를 분리한다.

수용 기준:

1. immutable corpus commit·manifest·harness/tool versions·model IDs·client capabilities를 저장한다.
2. 평균 score와 완전 PASS, retrieval recall과 최종 코드 정답률을 혼용하지 않는다.
3. 비용/성공 = 실패·재시도 포함 총비용 ÷ 성공건수. 성공 0이면 0원으로 표기하지 않는다.
4. provider usage에서 cache input/output 중복 합산을 막고 추정/관측/청구 지표를 구분한다.
5. 지연 p50/p95, 회귀·false positives·misses, indexing amortization과 cold/warm을 보고한다.
6. repo/task clustering과 표본 규모의 한계를 반영한다. 사전등록 margin을 사후 성공에 맞춰 바꾸지 않는다.
7. 유리한 모델만 보여주거나 실패 trial을 삭제하지 않는다. preview 수치는 일반 절감 보장으로 광고하지 않는다.

## 5. 이후 P2

### R-09. 작업 재개·진행도·위험 피드백의 신뢰를 높인다

- 크기 M~L. 기존 todo 5/18/21 기반. 권장 담당: domain/MCP 담당, UI 협업.
- 산출: scoped decisions/gotchas, task ready/blocked, evidence-linked completion, 선택적 claim/lease, digest-bound dismiss.
- “모든 대화를 저장”하거나 agent 선언을 verified로 올리는 기능은 범위 밖이다.

수용 기준:

1. task 이동/이름 변경/중복·소스 삭제에서 identity와 provenance가 유지되거나 명시적으로 무효화된다.
2. blocked dependency가 있으면 ready가 아니며 claim 만료/취소 뒤 중복 작업 상태를 설명할 수 있다.
3. agent 완료 보고, code 연결, 실제 CI evidence를 각각 표시한다. 실행 결과를 제공한 주체·commit·scope를 검증한다.
4. stale convention 또는 다른 branch의 기억이 현재 규칙으로 무조건 주입되지 않는다.
5. dismiss가 다른 digest/rule version에 무기한 승계되지 않는다. feedback으로 오탐/누락률을 측정한다.
6. no-spec repo는 관측된 구조와 사용자 승인 의도를 구분한다. 분모 없는 완료율은 unknown이다.

### R-10. 유료 가치와 정밀도 adapter를 별도 실험으로 결정한다

- 크기 S(pilot 설계)/L(운영). 제품 담당 결정 필요. 기존 OQ-039~042, todo 26/27와 연결.
- 가설 A: 무료 구조 탐색 위의 지속 갱신·협업·검증·보관·운영 편의에 지불 의사가 있다.
- 가설 B: LSP/SCIP local adapter가 특정 언어의 unresolved 문제를 충분히 개선한다.
- 가설 C: 저장 가능한 metadata/summary의 hybrid 검색이 한국어·개념 질문에서 lexical보다 유용하다.

수용 기준:

1. pilot는 실제 반복 작업의 baseline, scan 실패·사용 포기·support 시간을 포함한다.
2. 가격은 설문만이 아니라 실제 사용·갱신 의사로 검증한다. 현재 조사만으로 유료 전환율을 예상하지 않는다.
3. adapter는 precision/recall·setup cost·index latency·원문 노출 경계를 함께 비교한다.
4. 소스 license/의존성/서비스 약관과 ADR를 확인하기 전 설치·상용 코드 복사를 하지 않는다.
5. 성능이 같다면 운영과 설치가 단순한 경로를 선택한다. Neo4j/vector DB/tree-sitter로의 전환은 결과가 요구할 때만 한다.

## 6. 공통 Definition of Done

- 적용한 task와 commit, 변경 계약, 범위 밖 항목을 증빙에 기록한다.
- 단위/계약 테스트와 필요한 실제 DB·브라우저 시험을 분리한다. 못 돌린 시험을 추정으로 완료 처리하지 않는다.
- raw source 비보존, core 순수성, provenance, verified 실행근거, 과금 idempotency를 유지한다.
- 문서·화면·MCP의 상태 표현을 맞춘다. partial/stale/unknown을 “없음/정상/완료”와 혼동하지 않는다.
- 기존 테스트의 의미를 약화하여 통과시키지 않는다. 변경된 의미에는 새로운 양성·음성 사례를 추가한다.
- 프론트 구현은 해당 AGENTS·frontend 문서·로그 규칙을 따르고 양 테마·접근성·브라우저 결과를 남긴다.
- 기존 spec 수정 제한을 준수한다. 새 정책은 OQ/ADR 결정 후 반영한다.

## 7. 연구 재현 안내

아래는 app 디렉터리에서 실행한다. probe 자체는 source를 읽고 메모리 fixture를 사용하는 읽기 전용 진단이다.

```powershell
node --import tsx docs/reports/research-upgrade-2026-09-05.probe.mjs
node --import tsx docs/reports/research-upgrade-2026-09-05.probe.mjs .claude/worktrees/awesome-lehmann-a47e28
```

관찰 시 두 명령 모두 exit 0. 실제 graph 함수에서 무방향 영향 후보를 확인했고, 실제 loader에 capped REST stub을 연결하여 1,001→1,000행, stale summary 노출, edge provenance 손실을 확인했다. 실제 Supabase 요청·제품 변경·모델 API 과금은 없다.

이 probe가 나중에 실패하면 먼저 제품이 개선되어 기존 관찰이 달라졌는지 확인한다. 결과를 맞추려고 개선을 되돌리지 않는다.
