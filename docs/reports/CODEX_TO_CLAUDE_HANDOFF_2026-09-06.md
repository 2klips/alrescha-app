# Codex → Claude 보완 설계 인수인계

작성: 2026-09-06 · 대상: 현재 Phase 4 작업을 진행하는 Claude
상태: 사용자 요청에 따른 설계 전달. 아래 연구는 제품에 구현된 변경이나 운영 검증 완료 보고가 아니다.

## 1. 지금 할 일

사용자 요청: “현재 클로드가 기존 설계대로 작업을 진행하고 있다, 클로드가 너가 반영한 보완사항 대로 작업을 이어갈 수 있도록 전달해”

현재 작업 단위를 안전하게 마무리한 뒤 이 문서와 보완 설계서를 읽고, **완료 작업을 유지하면서 기존 Phase 4에 보완 수용 기준을 연결**한다. 기존 전체 계획을 폐기하거나 처음부터 재작성하지 않는다.

1. AGENTS.md의 필수 읽기 순서와 Phase 4 시작 절차를 따른다. 현재 git log/status, 계획 체크박스, evidence를 다시 확인한다.
2. [보완 방법 설계서](REMEDY_DESIGN_2026-09-06.md)를 읽는다. 이 문서는 이전 연구의 해결 방법을 정교화한 최신 권장안이다.
3. [실행 백로그](RESEARCH_UPGRADE_BACKLOG_2026-09-05.md)의 R-01~R-03을 우선 연결하고, 관련 todo를 구현할 때 아래 음성/회귀 테스트를 포함한다.
4. 이번 세션 범위·선행 조건·보류 항목을 짧게 기록한다. 하나의 wave 또는 2~3 todo 원칙과 기존 담당 구분을 유지한다.
5. ADR/WORK_SPEC와 충돌하는 제안은 자동 채택하지 않는다. OPEN_QUESTIONS에 기록하고 기존 가드레일 안에서 진행한다.

자료의 상세 설계는 제안이며, 새 파일명·타입명까지 그대로 복사하라는 요구가 아니다. 사용자 요청은 보완안을 기존 작업에 반영하라는 뜻이지, 배포·유료 외부 실행·파서 정책 변경 등 별도 결정까지 승인한 것은 아니다.

## 2. 현재 위치와 보존할 작업

전달 시 읽기 확인한 작업 트리: C:/Users/axz14/Desktop/Project/Arr/app/.claude/worktrees/awesome-lehmann-a47e28
브랜치: claude/busy-jones-014a8f · HEAD: 980865c

- todo 0~7은 커밋된 상태다. 특히 5117e62(todo 5), 130961c(todo 6: route/handles), 980865c(todo 7: db_object/schema/query 관계)를 보존한다.
- todo 8은 확인 시 미완료다. 이 스냅샷 이후 진행분이 있으면 현재 작업 상태가 우선한다.
- 이 전달 전 worktree의 git status에는 미추적 .codex/만 있었다. Codex는 그 파일들을 수정하지 않았다.
- 이 인수인계로 추가한 것은 reports의 자료 8개와 CLAUDE.md의 짧은 읽기 안내뿐이다. 제품 코드·migration·spec·체크박스는 수정하지 않았다.
- 기존 분담은 Claude: Wave A/A′/C/D/E, Codex: Wave B와 todo 19 웹 표면·24다. 이 문서로 담당을 재배정하거나 다른 에이전트를 기동하지 않는다.
- Wave B의 시각·조작감 개선은 공유 타입 경계만 조율하면 진행할 수 있다. 아래 보완을 이유로 모든 렌더 작업을 대규모 DB 재설계 뒤로 미루지 않는다.

## 3. 핵심 방향

**공통 읽기 모듈 + 버전 일치 조건부 요약 저장 + 목적별 그래프 순회**를 기존 Postgres·추출기·MCP·Pixi 위에 만든다.

core는 순수한 카드/freshness/순회 정책을 담당한다. 애플리케이션 읽기 모듈은 조회·예산·오류를 조정하고, Supabase adapter가 scoped query와 디코딩을 맡는다. UI와 MCP는 같은 카드와 근거를 소비한다. 기존 전체 loader를 새 이름으로 감싸는 것만으로 완료 처리하지 않는다.

### P0-A. 오래된 요약: 읽기 검사와 저장 조건을 함께 수정

- source_blob_sha와 metadata.summaryBlobSha를 비교한다. 둘 다 비어 있지 않고 같을 때만 current다. current/stale/unknown/missing 상태를 구분한다.
- stale/unknown 산문은 기본 답변·excerpt·pack에 최신 사실처럼 넣지 않는다. 과거 데이터는 보존하고, 결정론적 파일 메타데이터 카드로 대체할 수 있다.
- 저장 시에도 생성 시작의 blob과 현재 blob이 같을 때만 UPDATE한다. 조회 시 필터만 넣으면 늦게 끝난 A가 최신 B의 요약을 덮어쓰는 문제는 남는다.
- 기존 apply_artifact_summaries는 입력 항목 수가 아니라 실제 반영 건수를 반환하도록 개선한다. applied/superseded/missing/invalid 등 결과를 구분하고 worker의 생성 수·저장 수·job 결과를 일치시킨다.
- superseded를 무조건 AI 재호출하는 retry loop로 만들지 않는다. 실패/스키마 오류 무과금과 과금 멱등성을 유지한다. 이번 실험은 운영 과금 오류까지 확인한 것이 아니다.
- module/concept 산문도 입력 digest 기반으로 같은 원칙을 적용하되, 존재하지 않는 snapshot을 이미 구현된 것처럼 약속하지 않는다.

### P0-B. 전체 workspace 조회: 좁은 범위와 누락 상태를 계약에 포함

- 현재 loadWorkspace의 무페이지 전체 workspace 조회를 repo/id/path/질문별 bounded read로 점진 이행한다. PostgREST max_rows만 높이는 방식은 해결책으로 삼지 않는다.
- 페이지마다 명시적 hasMore/nextCursor와 전체 coverage를 반환한다. SQL의 n+1 조회/keyset 방식도 전송 상한·행/바이트/깊이/시간 예산을 검증해야 한다.
- 같은 경로가 여러 repo에 있으면 첫 repo를 임의 선택하지 말고 ambiguity를 반환한다. batch ID는 누락 항목을 flatMap으로 없애지 않고 입력별 결과를 준다.
- 불완전한 조회에서 “테스트 없음/연결 없음/영향 없음”을 확정하지 않는다. 부분 결과와 부정 질의의 unknown을 표현한다.
- 단일 RPC가 항상 단일 snapshot인 것은 아니다. 관련 사실은 단일 SELECT 또는 검토된 STABLE SQL의 일관성 경계로 읽고 실제 DB에서 검증한다.
- SECURITY INVOKER만으로 service-role tenant 안전이 확보되지 않는다. 기존 인증된 principal 계약, workspace/repo scope, RPC EXECUTE 제한을 유지하고 user-JWT 및 service-role 경로를 각각 테스트한다.
- 최신 loader에는 route/db_object 조회도 추가돼 있다. 이전 보고서의 “11개 조회” 수치를 현재 고정 목표로 사용하지 않는다.

### P0-C. 변경 영향: 관련성 탐색과 인과 후보를 분리

- A imports B, C imports B일 때 A 변경의 dependency impact에 C를 포함하지 않는다. B 변경에는 A와 C가 후보가 된다.
- 현재 depth=2의 무방향 neighborhood를 그대로 변경 영향으로 부르는 경로를 분리한다. discovery/trace와 dependency impact는 다른 정책이다.
- dependency impact는 우선 imports/calls 역방향을 사용한다. README references, contains, 유사도는 영향 전파에 넣지 않는다. 테스트는 별도 종단 근거로 다룬다.
- routes/tables/requirements/docs는 각각 관계 의미에 맞는 별도 투영/근거로 설명한다. 단순 인접을 “파손 확정”으로 승격하지 않는다.
- 정적 결과는 변경 영향 후보이며 verified나 실제 실행 결과가 아니다. confidence·bound·omissions와 저장 edge 방향/순회 방향을 구분한다.
- 기존 응답을 무통보 재해석하지 않는다. mode/semanticsVersion 등 호환 경로부터 넣고 기존 계약 테스트를 유지한다. todo 22의 예정된 도구 통합도 명시적 계약 이행과 실제 클라이언트 검증 아래 수행한다.

### P0-D. 연결 근거: DB → loader → core → MCP schema 전 구간 보존

- edge provenance, family, confidence/tier, source/version 정보를 loader와 GraphEdgeRef, hosted Zod 출력에서 잃지 않게 한다.
- reason/source span이 없는 근거를 resolved로 꾸미지 않는다. 미지원/누락 endpoint는 조용히 제거하지 말고 omission을 설명한다.
- source/target/relation만으로 서로 다른 근거를 합쳐 버리지 않는다.
- 최신 route/db_object/handles/queries/defines/modifies 등 실제 타입을 기준으로 저장소 규정의 MCP 동기 지점을 함께 검증한다. 예전 allowlist를 복제하지 않는다.

## 4. 기존 계획에 연결할 구현 순서

아래 단계는 별도 대규모 프로젝트가 아니라 관련 todo의 짧은 수직 구현 단위다. P0의 선행 읽기/쓰기 기반은 해당 표면을 완료 처리하기 전에 마련한다.

| 단계 | 결과물                                         | 기존 계획과의 접점                                    |
| ---- | ---------------------------------------------- | ----------------------------------------------------- |
| S1   | 공통 fresh card + summary CAS + 실제 반영 건수 | todo 19/20의 산문 노출·생성 전에 기반 보완            |
| S2   | lossless edge + scoped artifact/batch read     | todo 19/21/22의 공통 읽기 계약                        |
| S3   | bounded SQL/RPC + coverage/권한                | todo 21의 부정 질의, todo 22의 loader 분리            |
| S4   | directional impact의 호환 이행                 | todo 22 impact confidence/families, todo 21 위험 지도 |
| S5   | UI/MCP 카드 공유 + 변경용 근거 묶음            | todo 19 웹 담당과 계약 조율, todo 22 워크플로         |
| S6   | writer revision과 단계별 publication           | 읽기 일관성 보장이 필요한 writer를 좁혀 점진 적용     |

- get_artifact/get_node_content 내부 이행을 먼저 하고 모든 caller가 옮기기 전에 loadWorkspace를 제거하지 않는다.
- prepareChange는 내부 조정 개념이다. 새 MCP 도구를 무조건 추가하지 않고 기존 도구 예산·계약 안에서 배치한다.
- context-pack의 documentKinds에 code_metadata가 없다는 사실을 고려한다. 코드 메타데이터 카드를 별도 lane으로 넣고 문서 타입으로 위장하지 않는다.
- dataRevision은 commit SHA와 다르다. 같은 commit에서 enrich/CI/업무 상태가 바뀔 수 있다. 관련 writer의 데이터 변경과 revision 증분이 같은 트랜잭션이어야 한다.
- access_events/last_used 같은 읽기 부수 기록은 자기 무효화를 일으키지 않도록 graph revision과 분리한다. workspace memory와 repo 데이터 scope도 구분한다.
- 모든 관련 writer를 덮기 전 before/after revision 비교가 완전한 snapshot을 보장한다고 말하지 않는다. 아직 없는 generation은 null/unknown으로 표현한다.
- cursor는 scope/query/policy/revision을 고정하고 페이지마다 권한을 재검사한다. 중간 변경 시 몰래 최신 페이지를 섞지 않는다.
- immutable 전체 이력, 범용 query planner, 새 graph/vector DB는 이 네 문제의 선행 조건이 아니다.

## 5. 완료 판정에 추가할 테스트

- A→B←C, README를 통한 우회, cycle, test 종단, 미지원 endpoint: impact/discovery 의미를 각각 단언.
- 999/1,000/1,001행에서 마지막 artifact와 edge 조회. 요청 page보다 작은 transport cap, 페이지 사이 변경/삭제, cursor 만료·권한 철회.
- current/stale/null/empty hash, B 저장 후 늦은 A 완료, 삭제 파일 반영 0건. 산문을 제공하는 모든 caller의 동일 freshness 정책.
- edge 근거의 DB부터 MCP 출력까지 round trip. 최신 노드/관계 누락 방지, repo 혼선, unauthorized scope/cursor.
- 동일 basis의 UI/MCP 카드 일치. 불완전 데이터에서 withoutRelation 결과를 완전한 부재로 단정하지 않음.
- core 순수성, 원문 비저장, local graph-only, 기존 회귀 테스트 유지. 변경 범위에 맞춰 실제 DB/브라우저 검증.
- 기존 저장소 종료 규칙의 lint/typecheck/test 및 scope 검사, 관련 Playwright·밀도 회귀와 evidence를 충족한 뒤 완료 처리.

테스트가 미구현 보완을 드러내면 기대값을 약화하지 않는다. 아래 baseline probe는 예전 동작을 확인하는 연구 코드이므로 제품 수정 후 실패할 수 있다. **그 probe를 통과시키려고 옛 버그를 복원하지 않는다.** 새로운 바람직한 동작의 회귀 테스트를 제품 테스트에 추가한다.

## 6. 증거의 범위

- 원 독립 연구의 재현 대상은 main 75f60fa와 당시 Claude 51d0efe다. 후속 해결안 실험은 main migration을 적용한 메모리 PGlite와 별도 후보 SQL/순수 함수다.
- 확인된 실험: 늦은 A 요약이 최신 B를 덮는 기존 writer; blob 조건 후보는 A 반영 0/B 반영 1; 삭제 파일 기존 count=1/후보 실제 반영=0; 1,001행 후보 페이지 1,000+1; 역방향 순회 후보.
- 인수인계 시 980865c 소스에서도 무페이지 loadWorkspace, 4필드 GraphEdgeRef, 무방향 neighborhood를 사용하는 impactOf, 기존 summary writer 정의를 정적으로 재확인했다. 최신 브랜치 전체 probe/DB 테스트를 다시 실행한 것은 아니다.
- main 검증 기록: lint/typecheck 통과, 142 test files, 1,066 passed + 1 skipped. 이 기록은 현재 Claude branch나 새 설계의 수용 기준 통과 증거가 아니다.
- 메모리 SQL 실험은 실제 PostgREST cap/RLS, 다중 연결 race, 운영 장애, 실제 브라우저 성능을 증명하지 않는다. 이 항목들은 구현 후 별도 검증한다.
- 기존 벤치의 평균 점수 변화와 PASS 변화는 다르다. 성공률·총비용·cache·모델별 결과·재시도까지 보고하며 “토큰이 줄었으니 더 정확하다”고 주장하지 않는다.

## 7. 그래프 품질과 후속 연구의 적용 경계

- 은하수 느낌은 실제 파일/디렉터리/컴포넌트/기능 관계의 시각 투영으로 만든다. 밀도 목표를 맞추기 위한 허위 edge는 만들지 않는다.
- Pixi/Worker 기반 렌더를 유지하며 실제 포인터 조작, zoom/drag/hover, 큰 그래프, layout 안정성, 두 테마와 접근성을 측정한다. Obsidian 내부 엔진이나 동등 FPS를 확인한 것처럼 주장하지 않는다.
- ADR-013/014의 local/GitHub canonical graph 동등성을 유지한다. 선택적으로 설치된 LSP/SCIP/parser에 따라 canonical 출력이 달라지는 도입은 별도 ADR 검토 사항이다.
- ADR-015: local ingest는 graph-only이고, client findings/receipts를 verified 근거로 받지 않는다. raw source·signature·docstring 저장 금지 등 현재 경계를 유지한다.
- 외부 프로젝트는 아이디어와 원리를 참고한다. 라이선스 확인 없이 경쟁 SaaS에 코드를 이식하지 않는다. 가격제 변경·외부 유료 모델 실험·서비스 추가는 연구 권고만으로 실행하지 않는다.

## 8. 동봉 자료와 작업 후 보고

이 디렉터리에 원본 내용 그대로 옮긴 7개 자료:

- [상세 보완 설계](REMEDY_DESIGN_2026-09-06.md)
- [격리 실험 코드](remedy-design-2026-09-06.experiment.mjs), [실험 결과](remedy-design-2026-09-06.results.json)
- [독립 연구 전체](RESEARCH_INDEPENDENT_UPGRADE_2026-09-05.md)
- [R-01~R-10 실행 백로그](RESEARCH_UPGRADE_BACKLOG_2026-09-05.md)
- [기존 동작 probe](research-upgrade-2026-09-05.probe.mjs), [원 관찰 결과](research-upgrade-2026-09-05.results.json)

동봉 원문 안의 절대 링크는 연구 당시 main checkout을 가리킨다. 의도적으로 원문/증거를 바꾸지 않았다. 동봉 설계는 여기서 읽되, 수정 대상 코드는 현재 worktree의 최신 파일로 재탐색한다.

Claude의 다음 보고에는 (1) 읽은 보완안, (2) 이번에 기존 어느 todo에 연결했는지, (3) 실제 구현·검증 결과, (4) 미적용/충돌/차기 범위를 구분해 남긴다.

전달 방법: 작업 트리 파일 배치와 CLAUDE.md 안내. 이 파일 생성 자체는 실행 중인 Claude 세션의 수신·열람 확인이 아니다.
