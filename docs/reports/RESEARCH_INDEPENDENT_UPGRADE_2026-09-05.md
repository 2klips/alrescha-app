# Alrescha 독립 연구: 은하수 그래프에서 신뢰할 수 있는 코딩 작업 기반으로

작성: Codex · 조사일: 2026-09-05 · 성격: 연구 및 실행 제안, 승인된 제품 사양이 아님.

이 문서는 Claude의 Phase 4 연구를 대체하지 않고, 구현과 근거를 재검토하여 보완한다. 제품 코드·스펙·Claude 작업 트리는 수정하지 않았다. 바로 작업을 배분하려면 [실행 백로그](C:/Users/axz14/Desktop/Project/Arr/app/docs/reports/RESEARCH_UPGRADE_BACKLOG_2026-09-05.md)를 먼저 읽는다.

## 1. 결론

방향은 맞다. 다만 **더 많은 선을 그리는 것보다, 연결의 의미·최신성·조회 완전성을 보장하는 일이 먼저**다. 그래프는 그 토대 위에서 사용자가 이해하는 지도이자 에이전트의 탐색 수단이 되어야 한다.

우선 보완할 여덟 가지:

1. 하나의 사실 저장소에서 **시각화용·검색용·변경 영향 분석용 그래프를 구분**한다. 문서의 공통 링크가 코드의 파급 경로로 해석되어서는 안 된다.
2. MCP와 UI에 **snapshot, completeness, freshness** 계약을 공통 적용한다. 일부만 읽었거나 오래된 결과로 확정적인 답을 하지 않는다.
3. 모든 파일은 연결 직후 결정론적 **파일 카드**를 갖는다. 산문 생성이나 결제 완료를 기다려야 쓸 수 있는 두뇌는 피한다.
4. 디렉터리 구조에 더해 **화면→API 계약→서버 핸들러→DB 객체→테스트**의 기능 경로를 만든다. 함수 전체 확장은 필요할 때 한다.
5. 기존 Pixi·Worker 기반을 유지하면서 **600개 상호작용 한계, 카메라, 안정된 위치, 단계별 세부 표시**를 먼저 해결한다.
6. 에이전트에는 매번 그래프를 탐험하게 하기보다 **작업에 필요한 근거 묶음과 부족한 근거**를 한 번에 제공한다.
7. 완료율·위험도는 선언과 관측과 실행 검증을 분리한다. 자동 생성 문서로 같은 코드를 재평가하여 정확도를 주장하지 않는다.
8. 유료화 판단 기준은 토큰 감소만이 아니라 **성공한 변경 1건당 총비용, 회귀, 시간, 실제 재사용**으로 둔다.

기술을 더 많이 설치하는 것이 권장안은 아니다. Postgres + 현재 추출기 + MCP + Pixi를 중심으로, 아래 프로젝트의 유용한 원리를 선택적으로 구현하는 것이 현재 규모에 적합하다.

## 2. 조사 범위와 현재 작업 상태

### 2.1 근거 구분

| 표시      | 의미                                                           |
| --------- | -------------------------------------------------------------- |
| 직접 재현 | 실제 소스 함수 실행. DB 부분은 명시된 가짜 REST 응답을 사용    |
| 정적 확인 | 소스·설정·마이그레이션에서 확인, 운영 장애를 입증한 것은 아님  |
| 기존 실측 | 저장소에 이미 있는 결과를 다시 읽음. 이번에 재실행한 것은 아님 |
| 외부 근거 | 공식 저장소·문서·논문. 공급자 주장과 독립 검증을 구분          |
| 제안      | 아직 구현·효과 검증되지 않은 설계 또는 실험 기준               |

공개 저장소 24개의 GitHub API 메타데이터와 공식 자료를 조사했다. 별 수는 2026-09-05 조회 시점이며 성능·품질·상업적 사용 허가를 의미하지 않는다. 이 목록은 주요 접근법을 포괄하는 비교군이지 세상의 모든 도구를 전수 조사했다는 뜻은 아니다.

### 2.2 구현 스냅샷

대상: C:/Users/axz14/Desktop/Project/Arr/app. main HEAD는 75f60fa. 조사 중 Claude 작업 트리는 3fa7c4a에서 51d0efe까지 진행했다. 아래는 **51d0efe 관찰 시점**이며 이후 작업은 다시 확인해야 한다.

| 범위           | 확인 상태             | 해석                                                                    |
| -------------- | --------------------- | ----------------------------------------------------------------------- |
| Phase 4 todo 0 | main의 51cea4c에 구현 | 별칭·배럴 해석, tests 파생, full relink                                 |
| todo 1         | Claude 3fa7c4a        | implements 영속화, finding 코드 앵커, untested-code, 진행도 근거 구분   |
| todo 2         | Claude 56b12ee        | 전 파일 노트화, doc→code references, edge family                        |
| todo 3         | Claude 5104e96        | directory·contains, 서버 레이아웃/600노드 집계 제거, family별 조회 예산 |
| todo 4         | Claude 51d0efe        | database·other, 레이아웃 관례, .alrescha.json, domain/unit              |
| todo 5         | 미커밋 변경 관찰      | TODO identity·이벤트 scope 등 진행 중. 완료로 세지 않음                 |
| Wave B         | 계획상 미완료         | 카메라·호버·드래그·접힘·렌더 최적화·라이브 브리지                       |
| Wave C~F       | 대부분 계획           | 첫 연결 스캔, 로컬 serve, CI 증거, 문서 페이지, MCP 예산·벤치, 심볼     |

Claude의 todo 3/4 증빙에는 1,149/1,165 테스트 통과 등의 실행 기록이 있다. 이는 **Claude 기록을 읽은 것**이며 Codex가 전체 테스트를 다시 통과시킨 것은 아니다. 3,000노드 접힘은 서버가 필요성을 알리는 단계이지 렌더 구현 완료가 아니다. unit은 데이터로 존재하지만 모양·필터 구현은 남아 있다. layersHidden도 저장만 한다.

마감 재확인: Claude가 todo 5에 해당하는 5117e62(fix(db): TODO identity·progress 참조·제목 길이·repository 이벤트 scope)를 추가 커밋했다. 위 표와 probe의 조사 기준은 51d0efe 시점이고, 새 커밋 전체의 독립 검증을 완료했다는 뜻은 아니다.

읽은 기준: [AGENTS](C:/Users/axz14/Desktop/Project/Arr/app/AGENTS.md), [Phase 4 계획](C:/Users/axz14/Desktop/Project/Arr/app/spec/BUILD_PLAN_PHASE4.md), [9월 3일 연구](C:/Users/axz14/Desktop/Project/Arr/app/spec/RESEARCH_GRAPH_SECONDBRAIN_2026-09-03.md), [9월 4일 연구](C:/Users/axz14/Desktop/Project/Arr/app/spec/RESEARCH_GALAXY_MONETIZATION_2026-09-04.md), [Claude todo 3 증빙](C:/Users/axz14/Desktop/Project/Arr/app/.claude/worktrees/awesome-lehmann-a47e28/.omo/evidence/phase4/todo-3.md), [todo 4 증빙](C:/Users/axz14/Desktop/Project/Arr/app/.claude/worktrees/awesome-lehmann-a47e28/.omo/evidence/phase4/todo-4.md).

## 3. 새로 확인한 핵심 문제

다음 네 관찰은 main과 위 Claude 작업 트리 양쪽에서 같은 결과가 나왔다. 재현은 [읽기 전용 probe](C:/Users/axz14/Desktop/Project/Arr/app/docs/reports/research-upgrade-2026-09-05.probe.mjs), 원출력은 [results.json](C:/Users/axz14/Desktop/Project/Arr/app/docs/reports/research-upgrade-2026-09-05.results.json)에 보존했다.

### 3.1 이웃 탐색을 변경 영향도로 오해할 수 있다 — 직접 재현

```text
A ─imports→ B ←imports─ C
impactOf(A, 2).transitiveNodeIds = [C]

README ─references→ A
README ─references→ C
impactOf(A, 2).transitiveNodeIds = [C]
tracePath(A, C) = A — README — C
```

이는 현재 코드가 정의한 **무방향 이웃 탐색으로는 정상**이다. 그러나 A 변경이 C에 전파된다는 근거는 아니다. 관련 자료 탐색에는 쓸 수 있지만 이를 그대로 위험 지도·blast radius·테스트 영향 판정에 쓰면 허브가 오탐을 증폭한다.

보완: discover는 양방향 관련성, dependency-impact는 허용 관계의 방향성 있는 역추적, feature-trace는 계약 경로로 분리한다. 문서와 테스트는 필요한 맥락으로 붙일 수 있지만 그것을 경유해 무관한 코드로 영향이 번지지 않게 한다. 후보 영향도와 실제 실행 결과도 별개다.

근거: [tracePath 및 impactOf](C:/Users/axz14/Desktop/Project/Arr/app/packages/mcp/src/graph-tools.ts:205). 기존 todo 22의 “impact 신뢰도”에 점수만 추가해서는 부족하다. **탐색 의미 자체의 계약**이 필요하다.

### 3.2 1,000행 상한을 고려하지 않는 MCP 로딩 — 정적 확인 + 경계조건 재현

[Supabase 설정](C:/Users/axz14/Desktop/Project/Arr/app/supabase/config.toml:18)은 max_rows=1000이다. [loadWorkspace](C:/Users/axz14/Desktop/Project/Arr/app/apps/web/lib/mcp/supabase-store.ts:457)는 workspace 전체를 11개 요청으로 읽는데 페이지 순회가 없다.

1,000행 상한을 모사한 REST 응답에 실제 loader를 연결하자, 1,001개 artifact 중 1,000개만 반환되고 다음 페이지 요청은 없었다. 이는 **해당 설정에서의 누락 위험을 재현**한 것이며 운영 Supabase의 상한·실제 데이터 누락을 측정한 것은 아니다.

UI의 todo 3 family별 예산과 별개의 MCP 경로 문제다. 단순히 max_rows를 크게 올리면 재발점만 늦춘다. 저장소·질문별 조회, 안정된 cursor, 전체 범위가 필요할 때의 페이지 순회, complete/truncated/omittedReason 표시가 필요하다. 서로 다른 테이블을 동시에 읽는 것만으로 일관된 snapshot이 보장되지는 않는다.

### 3.3 최신 blob에 이전 요약이 붙어 서빙된다 — 정적 확인 + loader 재현

스캔 upsert는 기존 metadata를 보존하며 source_blob_sha를 바꾼다. worker의 listSummarizedFiles는 summaryBlobSha와 현재 blob이 같은 요약만 선택한다. 반면 MCP loader는 같은 검사를 하지 않고 metadata.summary를 content/summary로 반환한다.

probe 입력: source_blob_sha=new-blob, metadata.summaryBlobSha=old-blob. 출력: blobSha=new-blob과 이전 요약이 함께 제공되고 freshness 표시는 없다.

따라서 “요약 갱신 캐시가 없다”가 아니라 **쓰기·합성 경로의 유효성 규칙이 읽기 경로에 일치하지 않는다**가 정확한 진단이다. 요약을 삭제할 필요는 없다. 현재 자료에서는 제외하거나 stale로 표시하고, 새 산문이 없어도 최신 메타데이터 카드로 대체한다.

근거: [metadata 병합](C:/Users/axz14/Desktop/Project/Arr/app/supabase/migrations/202609040001_link_recovery.sql:125), [worker의 freshness 필터](C:/Users/axz14/Desktop/Project/Arr/app/apps/worker/src/postgres-enrich-store.ts:70), [MCP 요약 매핑](C:/Users/axz14/Desktop/Project/Arr/app/apps/web/lib/mcp/supabase-store.ts:608).

### 3.4 저장된 edge의 근거가 MCP read model에서 빠진다 — loader 재현

loader의 edge select/매핑은 id, relation, source, target만 전달한다. probe의 family·provenance·confidence를 가진 입력도 이 네 필드만 남았다. 전체 신규 허브 종류 역시 MCP의 node/relation allowlist·그래프 조립과 함께 동기화해야 한다.

todo 2/3으로 DB와 시각화가 풍부해져도 에이전트가 같은 정보를 받는다고 단정할 수 없다. “이 연결은 어디서 왔나”, “방향은 무엇인가”, “지금 버전에도 유효한가”, “어떤 타입을 제외했나”를 응답에서 보존해야 한다.

근거: [edge 조회](C:/Users/axz14/Desktop/Project/Arr/app/apps/web/lib/mcp/supabase-store.ts:497), [edge 매핑](C:/Users/axz14/Desktop/Project/Arr/app/apps/web/lib/mcp/supabase-store.ts:660), [MCP 그래프](C:/Users/axz14/Desktop/Project/Arr/app/packages/mcp/src/graph-tools.ts:22).

## 4. 토큰 절약과 정확도: 기존 실험을 어떻게 읽어야 하는가

### 4.1 이 프로젝트의 결과

| 기존 실측                                | 관찰                                                                                               | 제품에 허용되는 해석                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Data Brain v3, 등록된 600 trials         | data-brain 대 checkout 총토큰 −67.39%, 평균 score +8.69pp                                          | 해당 retrieval 비교의 긍정 신호. 모든 코딩 작업의 성공률 +8.69pp가 아님 |
| 같은 v3                                  | pass rate 67.0%→67.5%; 도구 호출 1,340→2,240                                                       | 부분점수·완전 성공·호출비용을 분리해서 보고해야 함                      |
| Graph surface v2, arm별 pooled 48 trials | PASS 42/48→36/48, 평균 turns 4.708→7.021                                                           | 현재 그래프 도구/하네스 조합은 pooled 게이트 미달                       |
| 같은 v2, 모델별                          | Luna 22/24→15/24; Sonnet 20/24→21/24                                                               | “그래프는 항상 해롭다”도 틀림. 모델별 상호작용·작업 종류 분석 필요      |
| techniques.real                          | id-first 토큰 −26.84%, recall −2.78pp로 off; 안전한 compaction은 토큰 +4.36%, recall +16.30pp로 on | 압축률만 최적화하지 않은 기존 판단은 유지                               |

출처: [Data Brain v3 원보고](C:/Users/axz14/Desktop/Project/Arr/app/benchmarks/databrain/results.v3.real.md), [graph surface v2](C:/Users/axz14/Desktop/Project/Arr/app/benchmarks/graph-surface/results.v2.md), [techniques](C:/Users/axz14/Desktop/Project/Arr/app/benchmarks/databrain/techniques.real.md). 서로 다른 실험의 분모·채점·도구 환경을 섞어 하나의 절감률로 광고하지 않는다.

### 4.2 외부 연구가 더해 주는 판단

| 1차 자료                                                                  | 실제 보고 범위                                                                | Alrescha에 주는 시사점                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Codebase-Memory, 2026-03](https://arxiv.org/abs/2603.27277)              | 31개 저장소에서 답 품질 83% 대 파일 탐색 92%, 약 10배 적은 토큰. preprint     | 토큰 절약과 정확도 손실은 동시에 가능. 구조 질문과 구현 질문을 분리     |
| [Evaluating AGENTS.md, 2026-06 개정](https://arxiv.org/abs/2602.11988)    | 평가 설정에서 context 파일이 일반적으로 성공을 개선하지 않고 추론 비용을 늘림 | 거대한 자동 생성 지침을 기본 주입하지 말고 비표준 규칙·검증 절차만 짧게 |
| [ContextBench, 2026-02](https://arxiv.org/abs/2602.05892)                 | 1,136 tasks·66 repos·8 languages에서 문맥 검색 품질을 평가                    | 읽은 파일 수보다 정답에 필요한 근거의 precision/recall 측정             |
| [TDAD, 2026-03](https://arxiv.org/abs/2603.17973)                         | 소규모 모델·제한된 task 집합의 test-dependency 문맥 실험                      | TDD 지시문을 늘리는 것보다 해당 변경에 필요한 테스트 연결을 실험        |
| [Working Set / Coherence Debt, 2026-08](https://arxiv.org/abs/2608.16630) | 7 models·5 harnesses의 통제 실험. 필요한 사실의 부재·낡은 관례의 영향         | 작업 시점에 필요한 계약·테스트·설정이 있는지 확인하는 working set 제안  |
| [Cursor semantic search](https://cursor.com/blog/semsearch)               | 공급자 자체 평가에서 여러 모델의 검색 성능 개선 보고                          | identifier 검색만으로 답이 안 나오는 자연어 질문용 hybrid 비교군은 필요 |

논문 초록·공개 방법 설명을 검토했으며 전 실험을 재현하지 않았다. 특히 최신 preprint의 수치를 Alrescha의 개선 예상치로 환산하지 않는다. Cursor의 결과도 외부 독립 보증이 아니다.

### 4.3 다음 벤치마크의 핵심 수정

- 질문 답변, 실제 수정+테스트, 위험 탐지, 작업 재개를 별도 strata로 둔다.
- baseline은 native grep/file/LSP + 최소 지침. full dump만 상대하는 실험으로 우월성을 주장하지 않는다.
- 현재 Alrescha와 예산형 근거 묶음을 비교하고, 방향성·freshness·compact output·질문 라우팅을 각각 ablation한다.
- 모델·저장소·작업을 분리 보고한다. 반복 trial을 독립 저장소처럼 세지 말고 task/repo 단위 불확실성도 산출한다.
- 실패·재시도·인덱싱·요약 생성·캐시 비용을 포함한다. 총비용/성공건수와 p50/p95 완료시간, 새 회귀 수, 근거 정확도를 동시에 본다.
- 캐시 input/output은 공급자별 정의를 정규화하여 중복 합산하지 않는다. chars/4는 제공량 추정일 뿐 실제 청구 토큰이나 구독 한도 절감이 아니다.
- margin·제외 규칙·표본 규모는 실행 전에 등록한다. 작은 pilot의 좋은 수치를 보고 임계값을 사후 조정하지 않는다.

## 5. 비교 프로젝트 24개: 무엇을 연결하고 무엇을 가져오지 않을 것인가

별 수는 공개 REST API 조회값. 라이선스는 API 표시와 일부 원문 확인 결과이며 개별 파일·의존성·상용 배포 조건의 완전한 감사를 대신하지 않는다. 아래 “적용”은 **설계 제안**이지 실제 설치·통합 완료가 아니다.

| 프로젝트 / 1차 출처                                                  |   Stars | 가져올 원리                                 | Alrescha 적용과 경계                                                                         |
| -------------------------------------------------------------------- | ------: | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Graphify](https://github.com/Graphify-Labs/graphify)                | 114,912 | 다형식 관계 추출·연결 설명·증분 관리        | 추출 근거·재링크 품질 비교군. 공급자 수치를 자체 성능으로 쓰지 않음                          |
| [Dataview](https://github.com/blacksmithgu/obsidian-dataview)        |   9,321 | 문서 속성의 선언적 질의                     | 동일 query로 graph/table/todo lens. 임의 JS 실행은 도입하지 않음                             |
| [GitNexus](https://github.com/abhigyanpatwari/GitNexus)              |  47,035 | 코드 관계·process 중심 탐색·CLI/MCP         | 기능 경로 UX 참고. Noncommercial 라이선스 소스를 상용 제품에 당연히 재사용하지 않음          |
| [Serena](https://github.com/oraios/serena)                           |  28,860 | LSP/IDE의 symbol·reference 탐색             | 로컬 정밀도 어댑터 후보. 하네스의 기존 파일 도구를 불필요하게 복제하지 않음                  |
| [Aider](https://github.com/Aider-AI/aider)                           |  48,757 | 작업별 관련도 순위·token-budget repo map    | 예산형 map 원리만. 원문·signature 서버 보존은 현재 경계와 다름                               |
| [Repomix](https://github.com/yamadashy/repomix)                      |  28,199 | 로컬 패키징·토큰 가시성·보안 필터           | export와 비교 baseline. 매 질문마다 full dump하지 않음                                       |
| [Graphiti](https://github.com/getzep/graphiti)                       |  30,604 | 시간에 따른 사실 갱신·복합 검색             | valid/superseded 상태와 snapshot 원리. 별도 graph DB 필수 아님                               |
| [Mem0](https://github.com/mem0ai/mem0)                               |  64,734 | 선택적 메모리·entity 검색                   | 기억할 것만 추출. 대화 기억 효과를 코드 인과 그래프 효과로 일반화하지 않음                   |
| [Basic Memory](https://github.com/basicmachines-co/basic-memory)     |   3,862 | Markdown entity/observation/relation·export | 소유권 있는 문서 export, 출처 있는 결정 기록. AGPL 엔진 도입은 별도 검토                     |
| [Claude-Mem](https://github.com/thedotmack/claude-mem)               |  93,253 | 세션 관측·요약·단계별 검색                  | opt-in 작업 재개. 모든 tool output·민감 로그의 무차별 저장은 금지                            |
| [LightRAG](https://github.com/HKUDS/LightRAG)                        |  39,403 | 검색 모드·추적·인용·재색인                  | retrieval eval/근거 노출 참고. 복잡한 멀티모달 스택은 당장 미도입                            |
| [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG)                |   3,980 | 그래프를 이용한 연상 검색·PPR               | 검색 순위 실험. 중심성을 결함 확률로 사용하지 않음                                           |
| [Microsoft GraphRAG](https://github.com/microsoft/graphrag)          |  35,845 | local/global/community 질의 분리            | repo 전반 질문과 정확한 symbol 질문의 경로 분리                                              |
| [Superpowers](https://github.com/obra/superpowers)                   | 281,945 | skill 기반 작업·검증 단계                   | 수용 기준·증빙 중심 얇은 워크플로. 전체 지침의 상시 주입은 측정 후                           |
| [Spec Kit](https://github.com/github/spec-kit)                       | 133,556 | 의도→계획→작업의 연결                       | 승인된 요구사항과 todo/code/test의 추적. 관측 문서를 의도로 둔갑시키지 않음                  |
| [Beads](https://github.com/gastownhall/beads)                        |  26,915 | dependency-ready 작업·claim·지속 identity   | blocked/ready와 중복 작업 감지. 현재 Dolt/명시 export 구조를 Markdown 스캔으로 오해하지 않음 |
| [Task Master](https://github.com/eyaltoledano/claude-task-master)    |  28,048 | 에이전트 친화 작업 분해·관리                | 계획과 실행 관측의 연결 참고. Commons Clause 조건 확인                                       |
| [Context7](https://github.com/upstash/context7)                      |  61,654 | 버전별 외부 라이브러리 문서                 | lockfile version→공식 문서 참조. 프로젝트 사적 메모리와 외부 지식 분리                       |
| [Claude Context](https://github.com/zilliztech/claude-context)       |  12,468 | BM25+dense 검색·증분 index                  | 자연어 검색 비교군. 원문 chunk의 외부 저장은 현 정책과 충돌                                  |
| [Quartz](https://github.com/jackyzha0/quartz)                        |  13,168 | 문서·backlink·local/global graph            | 공개 구현/행동 비교군. 제품 shell까지 복제하지 않음                                          |
| [force-graph](https://github.com/vasturiano/force-graph)             |   2,111 | canvas graph 상호작용                       | 작은 동일 fixture 비교. 현재 renderer 전면 교체 근거로 삼지 않음                             |
| [Sigma.js](https://github.com/jacomyal/sigma.js)                     |  12,159 | 대규모 WebGL 그래프                         | 대형 fixture의 대조군. 전환 비용 포함해 판단                                                 |
| [SCIP](https://github.com/scip-code/scip)                            |     776 | 언어 중립 symbol occurrence·정의/참조       | 로컬 indexer metadata adapter. 낮은 별 수여도 표준 역할은 유용                               |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) |   7,135 | 재현 가능한 의존성·아키텍처 규칙            | 신규 순환·금지 경계·prod→test 의존 경고의 비교군                                             |

Dataview의 마지막 push는 API상 2025-11-17이었다. 인기와 유지보수 속도는 분리해서 봐야 한다. 최신 후보·전통적 도구·낮은 별 수의 기반 표준을 같이 포함한 이유다.

라이선스 주의: [GitNexus LICENSE](https://raw.githubusercontent.com/abhigyanpatwari/GitNexus/main/LICENSE)는 PolyForm Noncommercial 1.0.0이다. [Task Master의 라이선스 설명](https://github.com/eyaltoledano/claude-task-master#licensing)은 MIT with Commons Clause 및 hosted/competing product 제한을 명시한다. “GitHub 공개=상용 SaaS에 복사 가능”은 성립하지 않는다. 본 연구는 설치·소스 복사를 하지 않았다.

## 6. 권장 구조: 같은 사실, 서로 다른 질문

```text
로컬/일시적 source → 결정론적 추출 → 버전 있는 canonical 사실
                                      ├─ 시각 projection: hierarchy + 문서 + 코드, LOD/가시성
                                      ├─ 검색 projection: lexical + 관계 + 선택적 요약
                                      └─ 영향 projection: 방향/관계 제약 + 실행 증거 연결
                                                ↓
                                  동일한 파일 카드·근거·출처·누락 표시
                                      UI / MCP / 저장 질의 / 작업 재개
```

### 6.1 세 개의 독립된 신뢰 축

- extraction: 어떤 parser/resolver/rule/agent가 어떤 위치에서 추출했는가.
- freshness: 어느 commit/blob/extractor version에 대한 결과이며 아직 유효한가.
- evidence: 사용자 선언인가, 코드 관측인가, 실제 실행으로 검증했는가.

compiler로 정확히 resolve한 import도 “테스트 검증 완료”는 아니다. 테스트 통과도 임의의 모든 요구사항을 증명하지 않는다. 이를 confidence 하나나 verified 한 색으로 압축하지 않는다.

### 6.2 최소 snapshot/read 계약 — 제안

응답에 repositoryId, snapshotId, indexedCommit, extractorVersion, complete, omittedReasons, freshness를 공통으로 넣는다. branch/worktree overlay가 있으면 baseSnapshot과 overlay digest를 구분한다. 사용자 권한은 snapshot/cache key와 별도로 매번 검증한다.

스캔은 시작→부분 진척→완료/실패를 기록하고, 완성된 snapshot만 현재 상태로 publish한다. 늦게 끝난 과거 스캔이 최신 상태를 덮어쓰지 않게 한다. 변경된 파일과 역의존 결과만 invalidation하되 rename/delete/설정 변경/분석기 변경에는 충분한 범위의 relink를 보장한다. cache 키에 raw source·비밀 값을 넣거나 로그로 남기지 않는다.

Graphiti의 시간적 기억에서 가져오는 것은 이 **유효기간과 갱신 의미**다. Neo4j나 외부 메모리 서비스를 동시에 도입해야 한다는 뜻은 아니다. [Graphiti 소개](https://help.getzep.com/graphiti/getting-started/welcome).

### 6.3 “파일마다 문서”는 같은 사실을 두 번 세지 않는다

파일 node가 안정된 주소를 가지고 그 화면이 문서가 되게 한다. header·domain·unit·exports 이름·관계·TODO·관련 테스트·출처 범위·최신성은 결정론적으로 구성한다. 사람이 쓴 설명과 AI 산문은 출처/버전이 다른 레이어다.

doc_page를 두더라도 describes 관계로 파일과 연결한다. 생성 페이지와 파일을 두 개의 구현 성과로 세거나, 그것만으로 밀도를 올리면 안 된다. 실제 문서 section은 독립적으로 인용할 가치가 있을 때만 노드화한다.

## 7. 은하수 그래프: 밀도보다 식별 가능성과 조작 안정성

Obsidian 공식 문서가 공개하는 참조 대상은 내부 링크, hover 강조, 검색 기반 그룹, 줌·팬, label fade, 힘장 설정, local depth 등 **행동**이다. 내부 엔진과 동일 stack/FPS라는 주장은 공식 문서로 확인되지 않았다. [Obsidian Graph](https://obsidian.md/help/plugins/graph), [Quartz Graph](https://quartz.jzhao.xyz/features/graph-view).

### 7.1 표현 규칙

- domain은 색: frontend/backend/database/docs/tests/other. unit은 형태·아이콘·검색 필터. 검증 상태는 별도 배지로 표현한다.
- 멀리서는 작은 파일 점과 희미한 실관계가 보이고, 디렉터리/패키지는 약한 중심을 만든다. 노드 전체를 거대한 문서 카드로 그리지 않는다.
- 중간 배율은 파일명·컴포넌트·route/DB hub를 선택적으로 표시한다. 근접/선택 시 symbol·테스트·관련 문서가 펼쳐진다.
- 자동 cluster는 이름 있는 디렉터리/패키지 기반을 우선한다. 의미 없는 type:grade 집계나 인덱스 순서 연결은 복구하지 않는다.
- domain anchor는 완만한 힘으로 둔다. 영역별 분리만 강조해 실제 cross-domain 기능 경로를 갈라놓지 않는다.
- edge family는 토글/범례·선택 경로에서 식별한다. 모든 edge를 항상 굵게 강조하거나 glow 처리하지 않는다.
- 필터는 기본적으로 visibility 변경이다. 숨긴 노드 때문에 위험도·완료율·검색 지식까지 사라지지 않는다.
- 같은 snapshot 재방문, 검색 해제, 필터 복귀 때 위치를 유지한다. 소규모 diff는 주변만 움직인다.
- 키보드 검색·이웃 목록·선택 inspector로 캔버스 이외의 접근 경로를 제공한다. DOM 접근성 상한이 캔버스 hit 상한이 되어서는 안 된다.
- reduced motion에서는 자동 흔들림·연속 발광을 끄고 변화를 목록으로도 제공한다.

### 7.2 자연스러운 밀도를 평가하는 법

평균 degree는 무방향 단순 그래프에서 2E/N이다. E/N, 유향 in/out degree, 중복 relation 수를 혼용하지 않는다. display-only contains, 생성 doc_page mirror, 실제 code/doc/test 관계를 따로 집계한다.

모든 저장소에 “삼각형이 많아야 통과” 같은 게이트를 적용하지 않는다. 정상적인 계층형·희소·비순환 저장소도 있다. 테스트할 것은 알려진 import·reference의 누락/오연결, rootless orphan의 사유, family 분포, 실제 사용자 질문의 경로 도달률이다. 미려함을 위해 존재하지 않는 연결을 생성하지 않는다.

### 7.3 기존 stack의 최적화 순서

1. camera와 renderer 좌표계를 통일하고 pointer를 한 번 역변환한다. quadtree hit index는 현재 좌표 revision과 동기화한다.
2. Worker simulation과 render를 분리한다. 입력·snapshot revision보다 오래된 worker 결과는 버린다. drag 시 pin/reheat, 놓을 때 정책대로 unpin한다.
3. 좌표 배열·sprite를 재사용하고 edge geometry 재생성·텍스트 rasterization을 제한한다. label은 화면상 크기·충돌·우선순위로 예산을 둔다.
4. viewport culling과 LOD를 각각 켜고 꺼 CPU/GPU 병목을 측정한다. Pixi 문서도 culling이 CPU-bound에서는 손해일 수 있음을 명시한다.
5. graph 재진입/해제 반복에서 worker·ticker·texture·event listener를 회수한다. context loss·저사양 fallback을 점검한다.

공식 근거: [Pixi v8 성능 가이드](https://pixijs.com/8.x/guides/concepts/performance-tips), [D3 simulation 및 Worker](https://d3js.org/d3-force/simulation). BitmapText의 이점은 한국어 폰트 atlas 크기·동적 라벨까지 평가한 뒤 적용한다.

브라우저 검증 제안: 1k/5k/10k 노드 + 희소/허브/고밀도 edge fixture, DPR 1/2, 내장 GPU 기준 장치, light/dark, 30초 zoom/pan/hover/drag/realtime 시나리오. 초기 목표 후보는 보통 fixture의 frame p95≤33ms, hover p95≤100ms, 시각적 변화 없는 idle 안정화다. **제안한 예산이지 달성 실측이나 Obsidian 대비 동등성 보증이 아니다.**

이번 localhost /map 연결은 ERR_CONNECTION_REFUSED여서 화면·GPU 성능을 검증하지 못했다. Claude의 동작 중 환경을 바꾸거나 새 서버를 띄워 “실측 완료”로 처리하지 않았다.

## 8. 에이전트 DB: 탐색 도구 모음에서 작업 근거 묶음으로

### 8.1 질문별 retrieval

| 질문                          | 우선 경로                                       | 피해야 할 경로                   |
| ----------------------------- | ----------------------------------------------- | -------------------------------- |
| 특정 파일/함수 위치           | path·identifier exact/prefix, 필요 시 resolver  | 전체 커뮤니티 요약부터 읽기      |
| 이 변경의 소비자·테스트       | 방향성 있는 code 영향 + test 관계               | README 경유 무방향 전체 BFS      |
| 로그인 기능 전체 흐름         | feature→client operation→route→handler→DB→tests | 폴더 이름만으로 기능을 추정      |
| 프로젝트 전반의 구조          | 패키지/도메인 요약 + 대표 근거                  | 모든 symbol과 파일 본문 주입     |
| 한국어 개념 질문, 식별자 없음 | lexical 후보 + 요약/태그, 이후 hybrid 실험      | 검색 실패를 “기능 없음”으로 확정 |

GraphRAG도 local/global/DRIFT를 구분하고 global의 자원 비용을 명시한다. 이를 질문 라우팅 원리로 적용하고 raw-document chunk 중심 전체 파이프라인은 그대로 가져오지 않는다. [GraphRAG query overview](https://microsoft.github.io/graphrag/query/overview/).

### 8.2 근거 묶음 — 제안

기존 context pack/query_brain 표면을 확장하여 task, snapshot, relevant files/symbol IDs, permitted paths, applicable decisions, suggested tests, open risks, missing facts, continuation cursor를 예산 안에서 반환한다.

첫 응답은 ID만도, 거대한 산문도 아니다. 짧은 이유·관계 방향·출처 위치·freshness가 있어 에이전트가 필요한 로컬 파일을 바로 열 수 있어야 한다. 원문을 읽어야 하는 작업은 명확히 그렇게 지시한다. MCP 왕복 1회를 줄이려다 필요한 근거를 없애지 않는다.

선택 순서는 질문 관련도와 증거의 질·최신성을 우선하고 중복 맥락은 제거한다. 예산 때문에 빠진 필수 사실을 missing으로 표시한다. “작업에 필요한 사실이 모두 있다”는 판정도 전체 corpus completeness가 불명확하면 유보한다.

Aider의 repo map은 예산·관련도 선택의 좋은 사례지만 signature·source snippet 정책까지 이식하면 현재 raw-code 비보존 원칙과 충돌한다. [Aider repo map](https://aider.chat/docs/repomap.html).

### 8.3 기능 경로의 마지막 빈칸

기존 todo 6/7의 route→handler와 handler→DB에 **client→API 계약**을 잇는 후속을 추가한다. 우선 OpenAPI operationId/생성 client, 정적 HTTP method+정규화 path처럼 근거 있는 경우만 다룬다. GraphQL operation·gRPC service·메시지 topic은 나중의 adapter다.

문자열이 비슷하다는 이유로 frontend 함수와 backend 함수를 “확정 연결”하지 않는다. 동적 URL·동일 path의 다른 service·모호한 router prefix는 unresolved로 남긴다. ORM table 매핑과 SQL FK는 query/modifies/depends 관계를 구별한다.

SCIP/LSP는 타입·심볼 해석의 정밀도를 높이는 로컬 보조 입력으로 평가한다. 현재 파서를 즉시 버리거나 서버에서 임의 저장소의 build/plugin 코드를 실행하지 않는다. 업로드는 허용된 ID·이름·범위·관계 metadata로 정규화하고, index 원본의 문서/소스 payload는 통째로 전송하지 않는다. [SCIP](https://raw.githubusercontent.com/scip-code/scip/main/README.md), [Serena](https://github.com/oraios/serena).

### 8.4 하네스와 skill는 얇게

- 상시 지침: 제품 역할, 언제 조회할지, stale/unknown 처리, 검증·완료 기록법만 짧게 둔다.
- 작업별 내용: 시작할 때 필요한 scope를 가져오고, 수정 후 변경 파일·검증 결과·미해결 사항만 명시적으로 기록한다.
- hook는 opt-in, bounded, 실패해도 사용자 코딩을 막지 않도록 한다. 비밀·raw tool output을 기본 수집하지 않는다.
- tool 이름 수·출력 schema의 전송 bytes·모델에 실제 보이는 토큰은 다른 지표다. outputSchema를 크다는 이유만으로 삭제하면 구조화 응답의 이점을 잃을 수 있다.
- client의 deferred tool search는 지원 여부에 따라 활용한다. 서버의 임의 코드 실행 도구를 도입할 근거로 삼지 않는다.

Anthropic의 tool search 문서는 지연 로딩의 이점을 설명하지만 그 절감률은 전체 코딩 세션 절감률과 같지 않다. 설치된 Claude/Codex 등 실제 client·버전별로 측정해야 한다. [Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use).

## 9. 진행도·위험·TODO·세션 기억

### 9.1 완료의 분모를 먼저 정한다

planned task, code-linked, test-observed, verified, blocked를 독립 상태로 둔다. README 체크박스나 agent의 done 보고만으로 verified를 올리지 않는다. requirement→code 연결은 구현 후보이며 테스트 증거는 commit·실행 명령·결과·증빙 식별자와 함께 좁은 범위를 지지한다.

스펙 없는 기존 저장소에는 “관측한 구조/현재 행동”을 먼저 만든다. 그것이 사용자가 원했던 기능이라고 간주하지 않는다. 요구사항 기반 완성도를 원할 때 최소 의도/수용 기준을 사용자에게 확인하는 흐름을 별도로 둔다. 모르는 완료율을 그럴듯한 백분율로 채우지 않는다.

### 9.2 위험은 설명 가능한 변경 중심 후보로

처음에는 새로운 순환 의존, 선언된 계층 경계 위반, 바뀐 API와 갱신되지 않은 계약, source 변경 후 오래된 증빙, 관련 테스트를 찾지 못한 변경처럼 재현 가능한 규칙을 우선한다. dependency-cruiser의 규칙 기반 검사는 좋은 비교군이다. [공식 README](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/README.md).

변경량·도달 소비자·테스트 공백으로 우선순위를 줄 수는 있지만 가중 점수를 “버그 확률 87%”라고 표현하지 않는다. 테스트 연결이 없다는 것은 테스트가 없거나 코드가 나쁘다는 증명이 아니다. stale·unsupported·truncated이면 risk confidence를 올리지 말고 검사 한계를 보여준다.

Top 10 위험을 항상 채우지 않는다. 실제 근거가 2건이면 2건+미검사 범위를 제시한다. dismiss에는 이유·rule version·source digest를 연결하여 조건이 달라질 때 재평가한다. false positive 비용과 놓친 문제를 따로 기록한다.

### 9.3 TODO와 기억의 출처

TODO ID는 행 번호만으로 만들지 않는다. 문서 이동·문구 수정·중복 항목·상태 변경을 구분하고 원본을 잃으면 tombstone/unknown 처리한다. 완료 여부의 출처를 유지한다. Beads에서 취할 것은 dependency-ready와 claim 원리이며 현재 Dolt source of truth를 JSONL 단독 DB로 오해하지 않는다. [Beads](https://github.com/gastownhall/beads).

대화 전체를 장기 기억에 넣기보다 결정(decision), 관례(convention), 주의사항(gotcha), 미해결(open question)을 구분하고 적용 scope·source snapshot·대체 기록을 갖게 한다. Basic Memory의 파일 소유권·export와 Claude-Mem의 progressive retrieval은 참고하되 자동 주입은 유효성/예산 검사 후에 한다. [Basic Memory](https://github.com/basicmachines-co/basic-memory), [Claude-Mem](https://github.com/thedotmack/claude-mem).

멀티 에이전트 협업 확장은 task claim/lease·branch·예상 수정 범위·실행 결과를 공유하는 수준부터 시작한다. claim은 충돌 알림이지 실제 파일 잠금이 아니다. 다른 agent의 branch를 자동 병합하거나 코드 실행 권한을 넓히지 않는다. 이 업무 세션 기록은 MCP transport session을 다시 도입한다는 뜻이 아니다.

## 10. 완성된 저장소의 첫 연결 경험

```text
연결/허용 범위 확인
 → commit 고정 + 파일 inventory + 지원/제외 사유
 → 구조 추출·링크·파일 카드 (산문 없이도 사용 가능)
 → 완전한 snapshot publish + 최초 graph/table
 → 미분류·미해석·최신성·테스트 연결 상태 제시
 → 선택적 설명 생성/의도 확인/실행 증거 연결
 → 변경분 반영 + rescan + 작업 재개
```

첫 scan은 다음 push를 기다리지 않아야 한다. 실패·취소·재시작·중복 webhook을 상태로 보여주고 scan 완료와 analysis/enrich 완료를 구분한다. monorepo의 범위를 설명하고 비용 큰 생성은 사용자가 선택한다.

네트워크가 불안하거나 private source를 올릴 수 없으면 로컬 scan/serve 경로를 사용한다. 허용된 metadata만 전송한다. source는 임시 처리하며 코드·signature·docstring을 편의상 저장하지 않는다. binary/vendor/generated/excluded/unsupported 파일 수를 보여주되 “모두 분석했다”는 표현은 쓰지 않는다.

Dataview와 함께 [Obsidian Bases](https://obsidian.md/help/bases)를 참조할 가치가 있다. 같은 속성과 저장 질의가 table/list/cards 등 여러 뷰를 만든다. Alrescha에서는 “이 기능의 파일”, “이번 변경 중 테스트 미연결”, “막힘 없는 TODO”라는 하나의 typed query가 그래프·표·작업 목록에서 같은 결과를 보여주게 한다. 사용자 SQL/JS를 그대로 실행하는 기능은 필요하지 않다.

## 11. 유료 가치와 사업성: 확정 결론이 아닌 검증 가능한 가설

기존 연구의 “위험/리뷰만 유료 가치가 있고 그래프·위키·TODO는 무료여야 한다”는 판단은 너무 강하다. 시장의 무료 대안 존재는 유료 수요 부재의 증명이 아니다.

공식 자료의 반례도 있다. Mem0 최신 문서는 graph retrieval과 graph view의 제공 범위를 구분하며 graph view를 Pro/Enterprise에 둔다. Basic Memory는 같은 노트 엔진에 hosting·sync·backup을 유료로 제공하고 Serena는 무료 LSP와 유료 JetBrains 경로를 구분한다. 이것이 Alrescha의 지불 의사를 증명하는 것은 아니지만, 과금 가능한 가치가 위험 탐지만은 아니라는 근거다. [Mem0 graph 문서](https://github.com/mem0ai/mem0/blob/main/docs/platform/features/graph-memory.mdx), [Basic Memory Cloud](https://github.com/basicmachines-co/basic-memory#basic-memory-cloud), [Serena](https://github.com/oraios/serena).

권장 가설은 **기본 구조 이해는 즉시 제공하고, 반복 운영의 편의·검증·협업·확장 비용에 과금**하는 것이다. 구체 가격과 무료 상한은 OQ-039/040 등 제품 결정으로 남긴다.

| 사용자                | 반복되는 가치 가설                                      | 검증할 행동                                     |
| --------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| 혼자 바이브 코딩      | 며칠 뒤 재개해도 덜 헤맴, 수정 영향·검증 누락을 즉시 봄 | 다음 세션에서 자발적 재사용, 실제 완료시간·회귀 |
| 소규모 팀/복수 agent  | 누가 무엇을 바꾸는지, 결정이 왜 생겼는지 공유           | handoff 재설명 시간, 중복 작업, 충돌·오탐 부담  |
| 기존 저장소 인수/외주 | 출처 있는 구조/기능 지도, 의도와 구현의 차이            | 다른 사람이 올바른 수정 지점·테스트를 찾는 시간 |

소수 설계 파트너의 실제 저장소로 baseline 기록→동일 종류 작업 사용→유료 지속 의사/반복 사용을 확인한다. 설문만으로 결제 의사를 확정하지 않는다. 분모에는 scan 실패·사용 포기를 포함한다.

North-star 후보는 “검증까지 완료한 유용한 변경/활성 저장소/주”이며 보조 지표는 first useful graph까지 시간, 다음 세션 재개율, accepted finding precision, 성공건당 비용, support 부담이다. graph 체류시간·edge 수·누적 토큰 추정만으로 가치가 높다고 판단하지 않는다.

단위경제: 인덱싱 CPU + 저장/egress + AI 생성/재시도 + 관측/보관 + support 비용을 저장소 크기와 갱신 빈도로 나눈다. 0크레딧 기본 카드도 서버 원가가 0이라는 뜻은 아니다. 실패·schema-invalid 과금 금지와 idempotency는 기존 규칙을 유지한다.

## 12. 보안·개인정보·운영 완성도

- 저장소 README·주석·생성 요약·외부 문서는 분석 대상 데이터다. 그 안의 “키를 보내라/규칙을 바꿔라”를 agent 지침으로 승격하지 않는다.
- 질의는 typed AST/allowlist와 scope·result budget으로 제한한다. 자연어를 무제한 SQL·JS·shell로 바꾸는 기능은 도입하지 않는다.
- 문서 Markdown/HTML·URL·symlink·경로 이탈·큰 파일·정규식/파서 자원 소모를 테스트한다. 진단·트레이스에도 raw source와 secret이 새지 않아야 한다.
- MCP 토큰은 workspace/repo scope 최소화, revoke/삭제 후 cache와 export 접근 회수, server-side RLS 검증을 유지한다. 오류 화면과 검색 수·제목도 교차 tenant 정보가 될 수 있다.
- delete/disconnect가 원문뿐 아니라 요약·검색 index·memory·export·cache까지 어떤 보존 정책으로 반영되는지 문서화하고 테스트한다.
- webhook reorder·동시 rescan·worker crash·retry·queue backlog·offline→reconnect에 대해 replay/idempotent 수렴과 이전 snapshot 보존을 검증한다.
- 지원 언어/구문/프레임워크별 coverage를 공개한다. 지원하지 않는 동적 호출은 unresolved로 표시한다.
- MCP 프로토콜은 현재 저장소의 2026-07-28 stateless 경계를 따른다. 공식 changelog를 확인했으며 과거 protocol 관행으로 되돌리는 제안은 하지 않는다.

근거: [OWASP Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html), [MCP 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog). 위 보안 항목은 권장 검증 범위이며 실제 취약점 공격이나 운영 보안 감사를 수행한 것은 아니다.

## 13. 기존 Phase 4 계획에 추가할 순서

기존 번호는 보존하고 보완 작업은 R-01~R-10으로 구분한다. 상세 수용 기준·담당 제안은 [실행 백로그](C:/Users/axz14/Desktop/Project/Arr/app/docs/reports/RESEARCH_UPGRADE_BACKLOG_2026-09-05.md)에 있다.

| 순서    | 보완                                        | 기존 todo와의 관계                          |
| ------- | ------------------------------------------- | ------------------------------------------- |
| 즉시 P0 | R-01 read completeness + edge provenance    | 3의 UI 예산과 별개, 22의 MCP 분리 선행      |
| 즉시 P0 | R-02 stale summary + snapshot 계약          | 16/19/20/23의 공통 기반                     |
| 즉시 P0 | R-03 방향성 있는 impact                     | 21/22/25 위험·도구·벤치 이전                |
| 병행 P1 | R-04 graph interaction + 실브라우저 검증    | 9~15 유지, renderer interface 미구현분 확인 |
| 병행 P1 | R-05 최초 scan + 0크레딧 카드               | 16/17/19/20의 end-to-end 묶음               |
| 다음 P1 | R-06 API를 가로지르는 기능 경로             | 6/7 이후의 빈 연결 보완                     |
| 다음 P1 | R-07 근거 묶음 + typed saved query          | 21/22, 무조건 graph-first 지침 대체 실험    |
| 다음 P1 | R-08 성공건당 비용/회귀 벤치                | 23~25의 측정 의미 강화                      |
| 이후 P2 | R-09 신뢰할 수 있는 작업 재개·risk feedback | 5/18/21 기반, scope·lease·증빙              |
| 이후 P2 | R-10 유료 pilot + adapter 실험 판단         | OQ 제품 결정과 26/27의 평가 게이트          |

이번 연구는 신규 승인·과금·실행 권한을 가정하지 않는다. embedding 도입, raw-code 보존, hosted compiler 실행, 새 외부 서비스, 가격 변경, 광범위 hook 설치, 자동 PR/merge는 별도 결정 사항이다.

## 14. 최종 한계와 완료 범위

완료: 현행 코드/Claude 진행 상태 대조, 24개 공개 저장소 메타데이터 조사, 공식 문서·논문 비교, 네 가지 관찰을 양쪽 checkout에서 재현, 실행 백로그와 재현물 작성.

미완료/미실시: 전체 외부 도구 설치 비교, 유료 모델 벤치 재실행, 실제 Supabase 1,001행 검증, 운영 데이터/과금 접근, 브라우저 GPU/시각 품질 검증, 사용자 지불 의사 실험. 저장소의 기존 시험 결과는 이번 실행 결과와 구별했다.

보고서의 핵심 권고는 “더 거대한 그래프”가 아니라 **사실과 버전을 믿을 수 있고, 필요한 수준으로 펼쳐지며, 올바른 변경과 검증을 더 적은 노력으로 끝내게 해 주는 그래프**다.
