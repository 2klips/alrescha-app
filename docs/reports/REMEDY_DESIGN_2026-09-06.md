# Alrescha 보완 방법 연구 — 수정 가능한 설계와 격리 실험

작성: Codex · 2026-09-06 · 상태: 권장 설계, 제품 구현/배포 승인 아님.

이전 [독립 연구](C:/Users/axz14/Desktop/Project/Arr/app/docs/reports/RESEARCH_INDEPENDENT_UPGRADE_2026-09-05.md)와 [실행 백로그](C:/Users/axz14/Desktop/Project/Arr/app/docs/reports/RESEARCH_UPGRADE_BACKLOG_2026-09-05.md)의 “무엇을 개선할까”를 “현재 코드에서 어떻게 개선할까”로 구체화한다.

## 1. 최종 권장안

**공통 Data Brain 읽기 Module + 조건부 요약 저장 + 목적별 그래프 순회**를 채택하는 것이 좋다. 기존 Postgres·추출기·MCP 도구 이름·Pixi를 유지한다. 새 graph DB나 범용 query language 도입은 선행 조건이 아니다.

실행 순서는 다음이다.

1. 요약을 읽는 모든 경로에 같은 freshness 규칙을 적용하고, 늦은 요약 저장은 blob 비교 조건으로 막는다.
2. 전체 workspace 배열을 반환하는 loader 의존을 줄이고 저장소/질문별 bounded read로 옮긴다. 결과와 누락 정보를 함께 반환한다.
3. edge provenance를 DB부터 MCP 출력까지 보존하고, discovery와 dependency impact의 순회 규칙을 분리한다.
4. UI 파일 카드와 MCP가 같은 사실·같은 최신성을 사용하게 한다. 그 위에 변경 작업용 근거 묶음을 얹는다.
5. 읽기 일관성, 스캔 완료 여부, 파생 결과의 유효성을 별도 상태로 둔다. immutable snapshot 전체 재설계는 필요한 단계에서 한다.

이는 단순히 함수를 한 곳으로 이동하는 refactor가 아니다. 호출자마다 알고 있어야 했던 버전 검사·조회 상한·연결 의미를 Module의 Implementation 안으로 모으는 제안이다.

## 2. 이번에 직접 검증한 것

기준 소스는 main 75f60fa다. Claude 작업 트리는 5117e62까지 커밋된 시점과 route/handles 관련 미커밋 변경을 관찰했다. 작성 중에도 진행되므로 구현 시작 시 최신 diff를 다시 확인한다.

실험: [실행 가능한 파일](C:/Users/axz14/Desktop/Project/Arr/app/docs/reports/remedy-design-2026-09-06.experiment.mjs), [원결과](C:/Users/axz14/Desktop/Project/Arr/app/docs/reports/remedy-design-2026-09-06.results.json).

| 검사                         | 실행 대상                                                | 결과                                                          |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| 옛 요약 작업이 늦게 완료     | 현재 migration의 apply_artifact_summaries, 메모리 PGlite | source B에 저장된 최신 요약 B가 이전 요약 A로 덮임            |
| 저장 시 blob 일치 조건       | 같은 격리 DB의 후보 UPDATE                               | 이전 A 반영 0건, 현재 B 반영 1건                              |
| 삭제된 파일에 요약 저장      | 현재 함수와 후보 UPDATE                                  | 기존 touched=1, 후보 실제 반영=0                              |
| bounded scalar 결과 + keyset | 격리 임시 테이블 1,001행, 실제 SQL                       | 첫 페이지 1,000/hasMore=true, 다음 페이지 1/false             |
| 목적별 역방향 순회           | 별도 순수 정책 prototype                                 | A→B←C에서 impact(A)=[], impact(B)=[A,C], README/contains 제외 |

쓰기 실험은 완료 순서를 통제한 재현이다. 동시 PostgreSQL 연결의 lock 경쟁이나 운영 DB 장애를 재현한 것은 아니다. 페이지 실험도 SQL 의미를 확인한 것이지 PostgREST 상한·RLS·네트워크 처리량 검증은 아니다. 제품 함수는 변경하지 않았다.

main에서 pnpm lint, pnpm typecheck, pnpm test도 실행했다. **142 test files 통과, 1,066 tests 통과, 1 skipped**. 이는 main의 기존 테스트와 연구 파일 검사 결과이며 새 설계의 전체 수용 기준을 통과했다는 뜻은 아니다.

## 3. 대안 세 가지를 비교한 이유

코드 구조 개선 스킬의 대안 비교 절차에 따라, 세 독립 검토에 서로 다른 제약을 주었다. 도메인 보조 문서가 없어 저장소 ADR의 Data Brain·artifact·requirement→code→test→receipt 용어를 기준으로 삼았다.

여기서 Module은 하나의 책임을 감추는 코드 묶음, Interface는 입력 타입뿐 아니라 오류·버전·예산·완전성 계약까지 뜻한다. Seam은 구현을 바꿀 수 있는 접점, Adapter는 그 접점을 구현하는 구체 수단이다. Depth는 적은 호출자 지식으로 많은 올바른 동작을 얻는 정도, Leverage는 재사용 이익, Locality는 변경과 검증이 한곳에 모이는 정도다.

### 대안 A — 최소 Interface

- Files: MCP store/hosted/graph-tools, Supabase loader.
- Problem: 모든 도구가 전체 workspace를 읽고 비슷한 검증을 따로 한다.
- Solution: DataBrain.read와 DataBrain.impact 두 진입점. 기존 MCP handler는 Adapter로 유지한다.
- Benefits: 호출 지점 변경을 작게 유지하면서 공통 freshness/provenance/coverage의 Locality를 높인다.
- 약점: 거대한 ReadQuery union 뒤에 기존 loader를 숨기기만 하면 Depth가 생기지 않는다. 데이터 읽기 자체가 좁아져야 한다.

### 대안 B — typed Query + Projection + ReadStamp

- Files: 기존 BrainQueryFilter, pure query compiler, 저장소 Adapter, version metadata.
- Problem: graph/table/todo/근거 묶음이 서로 다른 필터와 범위를 해석한다.
- Solution: 제한된 typed query를 versioned projection으로 compile하고 stamp·coverage를 공통 반환한다.
- Benefits: 여러 표면과 향후 저장 질의에 높은 Leverage. 질의 의미와 transport를 분리한다.
- 약점: 범용 planner, 모든 writer revision, immutable history까지 한 번에 구현하면 현재 네 문제보다 일이 커진다. 외부 SQL/JS/임의 재귀 DSL은 필요 없다.

### 대안 C — 가장 자주 쓰는 호출자 최적화

- Files: get_artifact/get_node_content/impact_of/request_context_pack, UI inspector.
- Problem: 파일 하나를 보려는 호출자도 repo 해석·요약 상태·이웃 join·누락을 알아야 한다.
- Solution: artifact/contents/impact/prepareChange가 즉시 유용한 카드와 근거 묶음을 반환한다.
- Benefits: 사용자가 원하는 작업 단위에서 Depth가 높고, 파일 카드의 Locality가 UI/MCP 모두에 이익이다.
- 약점: 아직 없는 published snapshot을 이미 있는 것처럼 전제하면 설계가 거짓 보장을 한다. 검색/고급 구조 질의도 별도 수용해야 한다.

### 선택

**A의 좁은 진입점 + C의 카드/근거 묶음 + B의 명시적인 상태 계약**을 결합한다. B의 범용 planner와 영구 snapshot 저장은 보류한다.

| 선택 기준            | A 최소형       | B 확장형            | C 호출자형  | 권장 조합               |
| -------------------- | -------------- | ------------------- | ----------- | ----------------------- |
| 초기 이행 비용       | 작음           | 큼                  | 중간        | 작음~중간               |
| 기존 도구 호환       | 좋음           | recipe Adapter 필요 | 좋음        | 기존 이름 유지          |
| 처음부터 유용한 응답 | 추가 설계 필요 | query 설계에 좌우   | 강함        | 카드 우선               |
| 저장 질의 확장       | 제한적         | 강함                | 별도 필요   | 고정 recipe부터         |
| 일관성 구현 비용     | 피할 수 없음   | 명시적이나 큼       | 감추기 쉬움 | 보장 가능한 상태만 노출 |

Deletion test: 이 Module을 지웠을 때 freshness·scope·coverage·순회 규칙이 UI/MCP/pack으로 다시 흩어진다면 존재 이유가 있다. 반대로 단순 forwarding 함수만 늘어난다면 만들지 않는다.

## 4. 공통 Interface: 최소한으로 무엇을 보장할 것인가

다음은 확정 구현이 아닌 타입 설계 스케치다. 처음에는 read와 impact만 옮기고 prepareChange는 후속으로 추가한다. 새로운 MCP 도구 세 개를 더 등록하라는 뜻이 아니다.

```ts
interface DataBrainReader {
  read(
    principal: AuthorizedPrincipal,
    request: ReadRecipe,
  ): Promise<BrainReply>;
  impact(
    principal: AuthorizedPrincipal,
    request: ImpactRequest,
  ): Promise<BrainReply>;
  prepareChange(
    principal: AuthorizedPrincipal,
    request: ChangeRequest,
  ): Promise<BrainReply>;
}
```

ReadRecipe는 artifact/batch/search/discovery 같은 닫힌 목록이다. 요청은 대상 ID 또는 repositoryId+path, 필요한 depth·예산을 말한다. workspaceId는 인증된 principal에서 얻는다. 사용자가 보낸 actor/workspace 문자열을 권한 증명으로 취급하지 않는다.

응답 계약의 필수 요소:

```ts
type ReadBasis = {
  repositoryId: string;
  indexedCommit: string | null;
  readConsistency: "single-statement" | "revision-fenced" | "unproven";
  dataRevision: string | null;
  graphGeneration: string | null;
  stages: {
    structure: "ready" | "building" | "unknown";
    analysis: "current" | "pending" | "unavailable";
  };
};

type Coverage = {
  result: "complete" | "partial" | "unknown";
  scopeDescription: string;
  omissions: Array<{ reason: string; count: number | null }>;
  extraction: "supported-scope" | "has-unresolved" | "unknown";
};
```

존재하지 않는 revision/generation을 commit SHA나 현재 시각으로 꾸며 채우지 않는다. complete는 명시된 질의 범위에서의 읽기 완료이며 저장소의 모든 동적 행동을 이해했다는 뜻이 아니다. 단계별 분석이 늦었다면 structure-ready/analysis-pending으로 충분히 유용한 그래프를 보여줄 수 있다.

## 5. 보완 1 — 1,000행 누락을 없애는 조회 방법

### 5.1 단기 이행과 최종 읽기 형태

단기에는 특정 ID/path/batch를 해당 저장소에서 바로 조회한다. 파일 하나를 찾기 위해 모든 artifacts/edges/receipts를 읽지 않는다. workspace 검색은 모든 허용 repo에 대한 검색 의미를 유지하고 임의의 첫 repo로 범위를 축소하지 않는다.

여러 관계가 동시에 필요한 조회는 **범위가 제한된 단일 SQL SELECT 기반 RPC**를 권장한다. 함수는 read-only STABLE이고, 필요한 테이블을 CTE로 읽어 결과·hasMore·누락을 하나의 scalar JSON에 담는다. domain 판단은 순수 Module에 남기고 SQL은 scoped selection과 join을 맡는다.

scalar JSON은 큰 결과를 몰래 상한 밖으로 보내기 위한 수단이 아니다. 서버에서 node/edge 수, 응답 bytes, 실행 시간, depth 상한을 제한한다. 반환이 하나의 SQL 행이어도 JSON 내부가 무한히 커지면 실패한 설계다.

### 5.2 페이지 판단의 정확한 규칙

- id 또는 (정렬키,id)의 안정된 keyset 순서로 진행한다.
- SQL 안에서 필요한 n+1개를 먼저 읽고 n개만 반환한다. 남은 한 개로 hasMore를 판정한다.
- LIMIT는 jsonb_agg 결과가 아니라 **집계 전 행 집합**에 적용한다.
- REST로 직접 읽는 임시 경로에서 “요청 2,000, 응답 1,000이므로 끝”이라고 판단하면 안 된다. 실제 transport 상한을 고려하고 서버가 알리는 hasMore/total을 사용한다. 없다면 완료를 보수적으로 표시한다.
- exact count가 비싸거나 미측정이면 null로 둔다. 응답 행 수를 전체 노드 수로 둔갑시키지 않는다.

격리 실험의 SQL은 1,001행을 1,000+1로 읽는 의미를 통과했다. 전체 구현에서는 workspace/repo predicate와 권한·budget 검사가 추가되어야 한다.

공식 근거: [Supabase range](https://supabase.com/docs/reference/javascript/using-modifiers-range), [Database functions](https://supabase.com/docs/guides/database/functions).

### 5.3 “RPC 하나”와 “snapshot 하나”는 같지 않다

현재 설정은 PostgreSQL 17이다. 기본 Read Committed에서는 같은 transaction의 연속 SELECT도 다른 시점을 볼 수 있다. 따라서 기존 11개 읽기를 VOLATILE PL/pgSQL 함수에 감싸는 것만으로 해결되지 않는다. 단일 SELECT 또는 적합한 STABLE read-only 함수의 snapshot 의미를 검증한다. [PostgreSQL 17 isolation](https://www.postgresql.org/docs/17/transaction-iso.html), [function volatility](https://www.postgresql.org/docs/17/xfunc-volatility.html).

여러 HTTP 페이지를 순회할 때 단일 SELECT 보장은 각 페이지까지만 적용된다. 그 이상은 다음 중 하나가 필요하다.

1. revision fence: 읽기 전/후 같은 dataRevision인지 확인하고 다르면 결과를 버려 제한 횟수 재시도한다.
2. immutable generation: 처음 지정한 generation의 자료를 모든 페이지가 읽는다.

초기 권장안은 고정된 작은 읽기 + 필요 시 revision fence다. 오래된 snapshot 조회를 지원하지 않는 상태에서 과거 cursor를 latest로 조용히 바꾸지 않는다. revision_changed/cursor_invalidated와 재시작 경로를 반환한다.

### 5.4 revision과 publication을 혼동하지 않는다

commit이 같아도 summary, concept, finding, memory, TODO, CI 증거가 바뀐다. fence를 도입한다면 **read-visible 변경과 revision UPDATE가 같은 transaction**이어야 한다. repo 공통 revision과 workspace 공통 memory revision 정도로 시작하고 필요 없이 종류별 counter를 늘리지 않는다.

access_events와 last_used_at 같은 조회 관측값은 revision에 넣지 않는다. 그러면 읽기가 자기 자신을 무효화한다. 인증/revoke는 별도 검증이다.

또한 revision이 안정되어도 scan 완료→analyze 미완료 사이의 상태일 수 있다. query consistency와 structure publication과 derived freshness는 세 개의 독립 상태다. 구조가 준비되었을 때 먼저 화면을 열고, 이전 finding을 현재 검증으로 승격하지 않는 단계 표시가 필요하다.

### 5.5 권한

현재 SupabaseMcpStore는 보통 service-role client를 쓰며 principal의 소유권 검증은 진입점에서 한다. SECURITY INVOKER만 붙여도 service-role의 RLS 우회 권한이 사라지는 것은 아니다.

RPC의 execute 권한은 명시적으로 제한하고, 인증된 principal에서 얻은 workspace 및 검증된 repo 조건을 유지한다. UI의 사용자 JWT/RLS Adapter와 MCP의 서버 역할 Adapter는 각각 음성 테스트한다. cursor는 권한이 아니므로 매 요청 검증한다. [기존 소유권 계약](C:/Users/axz14/Desktop/Project/Arr/app/apps/web/lib/mcp/supabase-store.ts:126).

## 6. 보완 2 — 요약은 읽기와 쓰기를 함께 고친다

### 6.1 공통 ArtifactCard

source metadata와 AI 산문을 content 하나에 섞지 않는다.

```ts
type SummaryState =
  | { state: "current"; text: string; sourceBlobSha: string; grade: "inferred" }
  | { state: "stale"; sourceBlobSha: string; currentBlobSha: string }
  | { state: "unknown"; reason: string }
  | { state: "missing" };
```

current 조건은 유효한 non-empty source blob과 summaryBlobSha가 같을 때다. 둘 다 null인 것을 같다고 취급하지 않는다. digest 없는 legacy 산문은 unknown이다. stale 산문 본문은 기본 응답에서 제외하고, 이력 조회가 필요할 때만 이전 버전 표시와 함께 제공한다.

산문이 없어도 카드에는 path/kind/domain/unit/exported symbol 이름과 범위/추출기/실관계/TODO·test 연결 상태가 있다. exported_symbols와 index metadata의 실제 형태를 정규화한다. source signature·docstring·body를 추가로 저장하지 않는다.

공통 card 생성/유효성 Module을 UI inspector, get_artifact, get_node_content, 검색 excerpt, context pack의 입력이 공유한다. worker의 module 합성에도 같은 입력 유효성 계약을 적용한다. 지금 module-tools에는 memberDigest 검사도 있으므로 재사용하고 별도 기준을 새로 발명하지 않는다.

### 6.2 저장 조건: 생성 시작의 버전과 저장 순간의 버전을 비교

현재 함수는 workspace/repo/path만 비교한다. 조건에 source_blob_sha = item.summaryBlobSha를 추가하는 형태의 compare-and-set을 권장한다. 실제 반영 건수는 UPDATE RETURNING 또는 ROW_COUNT에서 얻는다.

```sql
-- 개념 예시. 제품 migration 자체가 아니다.
UPDATE public.artifacts
SET metadata = /* 기존 metadata와 검증된 summary 필드의 병합 */
WHERE workspace_id = :authorized_workspace
  AND repository_id = :authorized_repository
  AND id = :artifact_id
  AND source_blob_sha IS NOT NULL
  AND source_blob_sha = :expected_blob
RETURNING id;
```

기존 payload는 path 중심이므로 우선 path+blob 조건으로 안전성을 개선할 수 있다. 후속으로 artifact ID와 job 입력 digest를 같이 전달하여 rename/recreate·동일 blob의 정책 변경까지 구분한다. schema 전환 중 어떤 필드를 필수화할지는 기존 CLI/worker 계약과 함께 결정한다.

CAS가 필요한 이유: 읽기에서 stale을 걸러도 최신 요약 B가 옛 A로 덮이면 B를 잃고 재생성 비용이 생긴다. 저장 조건은 이를 예방하고, 읽기 검사는 source가 **정상 저장 이후** 바뀌는 경우를 보호한다. 둘은 서로 대체할 수 없다.

### 6.3 반영 결과와 job 완료의 의미

저장 결과를 applied/superseded/missing/invalid로 구분하고 실제 rows를 센다. 현재 touched는 존재하지 않는 path의 입력도 1로 세며, worker는 생성된 summary 항목 수를 기준으로 summaryCount를 계산한다. 이는 새 조건부 쓰기를 도입할 때 반드시 함께 정리해야 한다.

모든 결과가 superseded인 경우를 provider 실패로 무한 재시도하지 않는다. 현재 상태에 필요한 작업만 새로 계산한다. billing·reservation·부분 성공의 처리 기준은 기존 무과금/멱등 규칙에 맞춰 명시하고, 이 실험만으로 운영 과금 결함이 확인되었다고 주장하지 않는다.

module summary는 입력 member digest가 현재 멤버 집합/버전과 일치하는지 조건부 저장한다. concept graph에도 같은 원칙을 적용한다. skip 상태 또한 어느 blob의 실패인지 구분하여 옛 실패가 최신 성공 위에 덮이지 않게 한다.

근거: [현재 요약 저장 함수](C:/Users/axz14/Desktop/Project/Arr/app/supabase/migrations/202608240001_enrich_pass.sql:203), [worker 저장 및 집계](C:/Users/axz14/Desktop/Project/Arr/app/apps/worker/src/enrich-job.ts:295), [Postgres enrich Adapter](C:/Users/axz14/Desktop/Project/Arr/app/apps/worker/src/postgres-enrich-store.ts:112).

## 7. 보완 3 — 영향도는 versioned 경로 규칙으로 계산한다

### 7.1 같은 edge 저장소, 다른 순회 규칙

| 목적              | 허용 이동                                         | 중단/제외                                    |
| ----------------- | ------------------------------------------------- | -------------------------------------------- |
| discovery         | 명시된 관계의 양방향 이웃                         | budget/depth/권한 scope                      |
| dependency-impact | imports/calls의 target에서 source로 소비자 역추적 | references/contains/유사성 경유 금지         |
| test context      | 영향 후보와 tests 연결을 수집                     | test를 경유해 다른 코드로 계속 확장하지 않음 |
| feature trace     | client operation→route→handler→DB 등의 허용 전이  | 모호한 method/path/service는 unresolved      |
| visual projection | hierarchy와 선택한 실관계                         | 분석 분모/영향도와 분리                      |

프로파일은 관계 목록뿐 아니라 이동 방향·노드 역할·중단 규칙을 가진다. 예를 들어 test 파일을 imports 소비자로 발견해도 “관련 테스트”로 분류하고 기본적으로 거기서 확장을 멈춘다. 실제 런타임 소비자와 테스트 실행 맥락을 혼합하지 않는다.

### 7.2 기본 알고리즘

incoming dependency adjacency를 한 번 만들고, 바뀐 node에서 BFS를 수행한다. 전개된 seed와 edge budget을 추적하고 stable ordering을 적용한다. cycle/self-loop에는 visited를 사용한다. discovered consumer별 최소 경로 하나와 추가 근거 참조를 예산 안에 보존한다.

direct dependencies는 이해를 돕는 별도 필드다. A→B에서 B를 맥락에 넣더라도 B의 다른 소비자 C를 A의 영향으로 이어 붙이지 않는다.

complete와 depth 제한도 구분한다. “2-hop 범위의 후보를 다 읽음”이 “더 먼 영향이 없음”은 아니다. 구조적으로 정확한 도달성도 런타임 실패를 증명하지 않으므로 결과 이름은 candidate-impact다.

### 7.3 기존 MCP와의 호환 이행

get_neighbors와 trace_path의 관련성 탐색 의미는 유지한다. impact_of는 먼저 명시된 mode/semanticsVersion을 추가하여 새 영향 규칙을 opt-in으로 제공한다. 기존 transitiveNodeIds를 설명 없이 다른 의미로 바꾸지 않는다.

새 UI/하네스는 새 mode를 사용하고, 기존 결과에는 related-neighborhood임을 명시한다. 관측·계약 테스트 후 별도 호환성 결정으로 기본값을 전환한다. 도구 개수를 늘리지 않고 입력·출력 schema와 문안을 함께 갱신한다.

## 8. 보완 4 — 근거를 잃지 않는 직렬화

공통 edge record가 최소한 edge ID, source/target, relation, family, provenance, 추출 tier/engine, 입력 버전, layoutOnly를 표현하게 한다. 실제 저장 자료에 없는 값은 unknown으로 두고 resolved/verified를 만들어 넣지 않는다.

저장 방향과 순회 방향은 별개다. 경로에는 edgeId와 traversedFrom/traversedTo를 표시하고 원래 source/target도 복구할 수 있어야 한다.

단계별 수정:

1. DB select에서 필요한 필드를 빠뜨리지 않는다.
2. Adapter decoder가 provenance와 node/relation 종류를 검증한다.
3. GraphEdgeRef 생성 때 근거·버전을 제거하지 않는다.
4. hosted Zod output schema와 structured/text 결과가 같은 계약을 사용한다.
5. endpoint 미로드·미지원 relation·잘못된 metadata는 silent drop하지 않고 scope 내 omissions에 집계한다.

동일 source/target/relation이라도 근거가 다르면 그대로 구분하거나 reasons를 합친다고 명시한다. 단순 삼중키 dedup으로 증거를 삭제하지 않는다.

provenance dictionary를 쓰면 반복되는 출처를 줄일 수 있다. 다만 첫 구현에서는 정확한 inline provenance를 우선하고 실제 응답 중복량을 측정한 뒤 dictionary를 도입한다. token budget 때문에 설명 가능한 근거부터 버리지 않는다.

Claude가 route/handles 등 타입을 확장하고 있으므로 old allowlist를 기준으로 별도 enum을 복제하지 않는다. parser→DB→MCP→UI fixture round trip이 누락을 잡도록 한다.

## 9. 근거 묶음과 그래프에 연결하는 구체 방법

### 9.1 prepareChange는 문서 생성기가 아니다

정확한 대상 카드→적용 requirement/ADR→방향성 소비자→관련 테스트·현재 증거→열린 위험→부족한 정보 순으로 결정론적으로 선택한다. 모델이 읽어야 할 로컬 원문 위치를 제공하며, 소스 읽기를 대체했다고 주장하지 않는다.

현재 context pack의 documentKinds에는 code_metadata가 없다. 파일 카드를 문서 본문처럼 강제 cast하지 말고 **code-card lane**을 별도로 추가해야 한다. token estimate는 산문만이 아니라 카드·근거·omissions를 포함한 최종 직렬화 결과를 대상으로 한다. [기존 pack 선택](C:/Users/axz14/Desktop/Project/Arr/app/packages/mcp/src/data-brain.ts:513).

추가로 확인한 호출자 문제도 함께 처리한다.

- 같은 path가 두 repo에 있으면 임의의 첫 repo를 선택하지 않고 ambiguous_target을 반환한다. 후보는 허용된 repo 안에서만 보여준다.
- batch contents는 입력 순서대로 한 결과씩 돌려준다. 존재하지 않거나 허용되지 않은 ID는 외부에 동일한 not_found로 표현한다.
- withoutRelations=[tests] 같은 부정 질의는 edge 조회가 불완전하면 “테스트 없음” 대신 unknown/해당 범위에서 미발견이다.

근거: [path 선택](C:/Users/axz14/Desktop/Project/Arr/app/packages/mcp/src/data-brain.ts:426), [batch 생략](C:/Users/axz14/Desktop/Project/Arr/app/packages/mcp/src/hosted.ts:1077), [부정 관계 필터](C:/Users/axz14/Desktop/Project/Arr/app/packages/mcp/src/data-brain.ts:386).

### 9.2 은하수 그래프는 별도 visual projection

공통 읽기 결과의 ID·domain·unit·family·freshness를 렌더러가 소비하되 query별 작은 EvidencePacket을 전체 지도 데이터처럼 사용하지 않는다. map은 범위가 명시된 구조 projection, inspector는 공통 ArtifactCard를 사용한다.

전체 화면에서 파일과 디렉터리의 안정된 위치를 유지하고, 선택 시 근거 묶음의 경로만 강조한다. 시각상 접힌/숨긴 노드는 지식에서 삭제하지 않는다. 변경된 snapshot revision과 worker layout revision이 다르면 오래된 좌표 응답을 적용하지 않는다.

즉 데이터 신뢰 보완과 기존 Wave B의 camera/quadtree/drag/LOD 작업은 병행할 수 있다. DB 보완을 이유로 렌더러 전면 재작성을 기다릴 필요도, 렌더 완성을 이유로 stale 자료를 계속 서빙할 이유도 없다.

## 10. 어디에 구현하면 되는가

아래 새 파일명은 제안이며 아직 제품에 생성하지 않았다.

| 위치                                        | 맡길 책임                                           | 맡기지 않을 책임                 |
| ------------------------------------------- | --------------------------------------------------- | -------------------------------- |
| packages/core/src/brain/                    | 순수 카드·freshness·순회 규칙·packing               | DB/네트워크/인증 상태            |
| packages/mcp/src/brain-reader.ts            | read/impact/prepareChange 조정, 오류·예산 계약      | MCP SDK 세션, 임의 SQL           |
| apps/web/lib/brain/supabase-brain-source.ts | scoped read RPC/field decode/transport              | 위험 의미를 별도로 재정의        |
| packages/mcp/src/hosted.ts                  | 기존 도구→Module Adapter·schema·access event        | 다시 whole-workspace 조립        |
| 기존 UI server loader/inspector             | 같은 카드·metadata 소비                             | 요약 freshness 복제 구현         |
| 새 DB migration + enrich writer             | bounded read, conditional write, actual-row outcome | source 보관, 무제한 graph export |

순수 연산은 in-process다. Postgres는 PGlite라는 local-substitutable 테스트 수단이 있다. Supabase transport는 운영 Adapter와 cap/error를 모사하는 테스트 Adapter로 Seam을 검증한다. 새 package/port를 도식 때문에 만들지 않는다.

필수 호환 원칙:

- 기존 도구 이름은 유지하고 내부 read 경로부터 점진적으로 바꾼다.
- 신규 결과 필드·상태와 기존 node/nodes/content 호환 필드는 함께 검증한다. stale prose를 호환성 명목으로 다시 넣지 않는다.
- 모든 caller가 옮겨가기 전 loadWorkspace를 삭제하지 않는다.
- core 독립성 검사와 기존 회귀 테스트를 유지한다. 스킬의 일반적인 테스트 교체 조언보다 저장소의 테스트 약화 금지 규칙이 우선한다.

## 11. 짧은 수직 구현 단위

| 단계 | 범위                                         | 완료를 입증할 것                                                             |
| ---- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| S1   | fresh-card 읽기 + artifact summary CAS       | old A/new B 순서 역전, null digest, 삭제된 파일, 실제 반영 건수              |
| S2   | lossless edge + targeted artifact/batch read | provenance round trip, 마지막 1,001번째 파일, ambiguity, per-ID 결과         |
| S3   | scoped read RPC + coverage                   | row/byte/depth budget, transport cap, SQL 권한, incomplete negative          |
| S4   | directional impact opt-in                    | shared library/README/cycle/test-terminal/unknown endpoint                   |
| S5   | UI card 공유 + prepareChange                 | code-card lane, 같은 basis의 UI/MCP 결과 일치, packet 비용                   |
| S6   | writer revision + 단계별 publication         | same-commit mutation, rollback, scan/analyze gap, revoke/cursor invalidation |

S1~S4는 새 graph DB나 함수 전체 노드화를 기다리지 않는다. S5의 효과는 기존 baseline 대비 성공률·회귀·총비용·왕복·시간으로 검증한다. S6의 immutable history 부분은 큰 페이지 조회·과거 조회 수요와 이행 비용을 보고 별도 판단한다.

운영 전 남는 시험: 실제 Supabase RPC/권한, 다중 연결 write race, page 사이 변경·revoke, 실제 브라우저/Worker 성능, 유료 모델 benchmark. 현재 격리 시험이 이를 대신하지 않는다.

## 12. 기존 제안에서 더 엄격히 바로잡은 부분

1. **“최신성 필드만 추가”는 부족하다.** 읽기 필터와 조건부 저장이 둘 다 필요하다.
2. **“pagination만 추가”도 부족하다.** 페이지 완료 판단, 버전 일관성, scope와 부정 질의 의미가 함께 필요하다.
3. **“snapshotId=commit”은 틀리다.** 동일 commit의 memory/enrich/CI 변경과 분석 단계 완료를 표현하지 못한다.
4. **SECURITY INVOKER는 자동 tenant 안전장치가 아니다.** service-role 경로의 기존 principal 계약·scope가 유지되어야 한다.
5. **선택적 LSP/SCIP를 canonical 파서에 투명하게 추가하는 제안은 ADR-013/014와 충돌할 수 있다.** 같은 commit에서 실행 환경에 따라 결과가 달라지는 형태는 금지다. 실험용 분리 자료라 해도 제품 노출/영속화는 별도 결정이고, 정식 반영은 결정론 동등성과 ADR를 먼저 검토한다.
6. **로컬 메타데이터를 받아 verified findings/receipt를 만드는 확장은 하지 않는다.** ADR-015의 graph-only 의미를 유지한다.

이 연구의 선택은 기능을 더 얹는 것이 아니라, **같은 사실을 한 번 제대로 읽고 설명하며, 바뀐 사실에 오래된 해석이 따라붙지 않게 하는 기반을 먼저 완성하는 것**이다.
