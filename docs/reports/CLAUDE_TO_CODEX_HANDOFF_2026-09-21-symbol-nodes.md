# Claude → Codex 배포 인수인계: Phase 4 todo 26 — 심볼 노드(`symbols`·`symbol_edges`), MCP 지연 이웃 로드, `/api/map/symbols` + 헤일로

작성: 2026-09-21 · 대상: Alrescha 배포를 담당하는 Codex
상태: **머지·배포 대기.** 마이그레이션 1건 필요, 웹 머지, 워커 재배포, 그리고 **full 다시 스캔 1회**(증분 스캔은 재읽은 파일의 심볼만 유도한다).
브랜치: `phase4/todo-26-symbol-nodes` (base `main` `f061996`) · PR: 본문 하단 "PR" 항목.
근거 문서: [`todo-26.md`](../../.omo/evidence/phase4/todo-26.md), [`BUILD_PLAN_PHASE4.md`](../../spec/BUILD_PLAN_PHASE4.md) todo 26 완료 노트, [OQ-031 resolved](../../spec/OPEN_QUESTIONS.md).

## 1. 왜

심볼은 Phase 1부터 `artifacts.exported_symbols`의 메타데이터였고 노드가 아니었다. OQ-031이 이유였다 — 그대로 승격하면 이 레포 ~1,300개 export가 맵의 2,000 노드 예산과 MCP 읽기 예산을 첫날에 넘긴다. 이번 todo는 OQ-031 ⑴(계층 LOD 로딩)을 채택한 구현이다: **심볼은 identity를 가진 노드이되, 어떤 기본 읽기도 심볼을 싣지 않는다.** 호출자가 심볼 id를 이름 붙이거나 파일을 볼 때만, 이웃 또는 헤일로로 온다.

## 2. 변경 파일과 동작

| 파일                                                                                                                                                  | 동작                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/202609210001_symbol_nodes.sql` (신규)                                                                                            | `graph_nodes.kind`에 `symbol` 추가. `symbols`(name·kind·container·span·engine·stable_key — 시그니처·독스트링 컬럼 없음) + `symbol_edges`(`declares`·`extends`, `edges`와 같은 provenance 계약, **별도 테이블**) + RLS(소유자 select). `symbol_stable_key()`(md5). `apply_repository_scan` 재정의: 스캔 범위 파일의 `exported_symbols`에서 심볼 유도(identity 보존, 사라진 심볼 삭제), `declares` upsert, 플랜 `symbolLinks`로 `extends`, 삭제 파일의 심볼 노드 정리. |
| `packages/core` (`code-links`, `repository-scanner`, `local-ingest`, `symbol-identity`)                                                               | 파서가 exported class/interface의 상속 절을 기록, `resolveSymbolLinks`가 파일·이름으로 해석 → 플랜 `symbolLinks`(Zod default `[]` — 옛 CLI 플랜 호환). `symbolStableKey` TS 동등 구현.                                                                                                                                                                                                                                                                               |
| `packages/mcp` (`store`, `local-workspace`, `graph-tools`, `hosted`)                                                                                  | `McpStore.loadSymbolNeighborhood`(InMemory·Supabase 둘 다), `selectSymbolNeighborhood` 공유 규칙(상한 200/5,000/20,000 보고형), 로컬 투영 `symbols`/`symbolEdges`, `get_neighbors`·`impact_of`·`trace_path`의 심볼 id 지연 로드, `search_index` 심볼 히트에 `symbols:[{name,kind,nodeId,span}]`. **카탈로그 불변**(21툴·토큰 래칫).                                                                                                                                  |
| `apps/web/lib/mcp/supabase-store.ts`                                                                                                                  | 노드 읽기에서 `kind='symbol'` 제외 + `loadSymbolNeighborhood` 구현(id로 3회 읽기, 전량 없음).                                                                                                                                                                                                                                                                                                                                                                        |
| `apps/web/lib/map/workspace-map.ts`, `lib/home/journey.ts`, `apps/worker/postgres-doc-store.ts`                                                       | 기본 읽기에서 심볼 kind 제외(맵 모델·로더·홈 카운트·doc skeleton 노드).                                                                                                                                                                                                                                                                                                                                                                                              |
| `apps/web/app/api/map/symbols/route.ts`, `lib/map/symbol-layer.ts`                                                                                    | `GET /api/map/symbols?files=<id>,…` — 세션 클라이언트(RLS), 같은 상한, `{files, symbols, edges, truncated}`.                                                                                                                                                                                                                                                                                                                                                         |
| `apps/web/lib/graph/{symbol-halo,render-frame,engine,pixi-backend}.ts`, `app/ui/{symbol-halo-loader,brain-map,brain-map-stage}.tsx`, `map-screen.tsx` | 선택한 파일의 층을 1회 요청·IndexedDB(`symbols:<ws>:<commit>:<file>`) 캐시, 황금각 헤일로(시뮬 불참, Near에서만, 64개 + 이름 24개), 스테이지 `data-symbol-halo`/`data-symbol-count`.                                                                                                                                                                                                                                                                                 |
| `scripts/adr-guardrails.ts`                                                                                                                           | `raw-code-persistence`가 `docstring`/`symbol_signature` 류 컬럼·persist 호출도 거부.                                                                                                                                                                                                                                                                                                                                                                                 |
| 테스트                                                                                                                                                | `tests/symbol-nodes.test.ts`(실DB 9), `tests/local-serve.test.ts`(+2 등가), `packages/mcp/src/symbol-layer.test.ts`(6), `hosted.test.ts`(+7), `tests/graph-symbol-halo.test.ts`(9), 밀도·맵·가드레일 핀, e2e `tests/e2e/map-symbol-halo.spec.ts`. 픽스처 `fixtures/symbol-heritage/`.                                                                                                                                                                                |

## 3. 테스트·게이트 (브랜치 팁)

- 본문 하단 "게이트 수치" 항목. 실DB 9·등가 2·MCP 13·프레임 9·e2e 1 — 전부 evidence에 이름이 있다.

## 4. 배포 필요 사항

- **마이그레이션** — **필요**: `202609210001_symbol_nodes.sql`. 프로덕션 `DATABASE_URL`은 Fly 워커 시크릿에만 있다; `db:migrate`는 보류 중인 것을 전부 적용하므로 원장을 먼저 본다. **이 파일 하나만 pending이어야 한다.** 파일 안에 `begin;/commit;`은 없다. `apply_repository_scan`을 통째로 재정의한다(1,436줄 — 본문은 `202609110015`의 함수 + 심볼 절). 적용 직후 `symbols`는 0행이다 — 다음 스캔이 채운다.
- **웹 배포** — 머지 시 Vercel 자동. 화면 변화: `/app/map`에서 코드 파일을 선택하면 Near 줌에서 헤일로가 그려진다. 새 라우트 `/api/map/symbols`.
- **워커** — **필요**(Fly `arr-worker`): 스캐너의 상속 절 추출과 `symbolLinks`는 워커 번들(`packages/core`) 안에 있다. 옛 워커가 새 SQL을 만나면 심볼과 `declares`는 생기고 `extends`만 0이다(해는 없음).
- **환경변수·GitHub App** — 없음.

**절차: 마이그레이션 적용 → PR merge commit 머지 → Vercel 확인 → 루트 체크아웃을 `main`으로 fast-forward한 뒤 `flyctl deploy` → `request_rescan({ mode: "full" })` 1회(MCP) 또는 UI의 full 옵션.**

순서 이유: 마이그레이션이 먼저여야 새 워커의 첫 `apply_repository_scan`이 `symbols` 테이블을 만난다(함수는 SQL 안에 있고 워커는 호출만 한다). **full**이어야 하는 이유: 증분 플랜은 재읽은 파일의 심볼만 유도하고, 변경 0인 증분 스캔은 심볼을 하나도 만들지 않는다.

검증(전부 크레딧 0):

1. 워커 로그: scan(full)·analyze succeeded, attempt 1, cost 0. 새 로그 줄은 없다(심볼 유도는 SQL 안).
2. 읽기 전용: `select count(*) from public.symbols where repository_id = <파일럿>` ≈ 이 레포 export 수(**~1,300**, R5 §1.2 실측 1,261 + 이후 증가), `select relation, count(*) from public.symbol_edges … group by 1` — `declares` = 심볼 수, `extends` > 0. `select count(*) from public.edges where relation in ('declares','extends')` = **0**.
3. `/app/map`: 아무 코드 파일이나 선택 → 스테이지 `data-symbol-halo`가 그 파일 id, `data-symbol-count` > 0; Near로 줌하면 파일 주위에 작은 도형(클래스 사각·인터페이스 마름모·함수 원)과 이름 라벨. 같은 파일을 다시 선택해도 `/api/map/symbols` 요청은 없다(IndexedDB). 맵 노드 수(HUD)는 배포 전과 같다(심볼은 맵 노드가 아니다).
4. MCP(읽기 토큰): `search_index({ query: "<이 레포의 export 이름>" })` 히트에 `symbols:[{name,kind,nodeId,span:"path:start-end"}]`; 그 `nodeId`로 `get_neighbors` → 소유 파일 + `declares`(+ 있으면 `extends`), `impact_of(nodeId)` found true. `get_neighbors(<파일 id>)`는 배포 전과 같은 답(심볼 없음). `tools/list`는 21개 그대로.
5. `pnpm ops:health`: 변화 없음(새 잡 종류 없음). 스크린샷 1장(헤일로)과 `symbols`·`symbol_edges` 카운트를 `.omo/evidence/phase4/todo-26/`에 남긴다. evidence 노트 추기는 Claude Code.

## 5. 롤백 지점

- 마이그레이션: 테이블 2개·함수 1개·CHECK 확장·`apply_repository_scan` 재정의. 되돌리려면 `202609110015`의 함수 본문을 새 마이그레이션으로 다시 적용하고 두 테이블을 지운다(FK cascade가 심볼 노드는 지우지 않으므로 `delete from graph_nodes where kind='symbol'` 동반). 심볼 행은 파생 데이터라 손실이 없다 — 다음 full 스캔이 다시 만든다.
- 워커: 이전 Fly 릴리스로. 심볼·`declares`는 SQL이 계속 만들고 `extends`만 멈춘다.
- 웹: 이전 배포로. `/api/map/symbols`가 404가 되면 헤일로 훅은 조용히 null(맵은 그대로).

## 6. 예상과 다른 점

- 안정 키는 계획의 sha1이 아니라 **md5**다 — pgcrypto 없이 모든 PostgreSQL이 갖는 함수이고 TS가 같은 문자열을 계산한다. 식별자이지 체크섬이 아니다.
- `symbolOwner` 접힘 층은 `hierarchyAssignment`의 세 번째 레벨이 아니라 **LOD 게이팅**이다: 심볼은 맵 노드가 아니므로 Mid/Far에서 "소유 파일로 접힌다"는 것은 프레임이 헤일로를 싣지 않는 것과 같다.
- `relations: ["extends"]` 필터는 안 된다(카탈로그 enum 밖). 이름 붙인 이웃은 두 관계를 다 싣는다.
- 첫 full 스캔 뒤 `symbols`가 0이면 워커가 옛 트리를 빌드했는지 먼저 본다([기록](../../.omo/evidence/phase4/todo-26.md)의 "Nothing loads it by default" 절이 아니라 스캔 범위 문제).

## PR

- (PR 생성 뒤 기입)

## 게이트 수치

- `pnpm test` 209 files / 1,920 passed / 1 skipped (브랜치 팁, 2026-09-22) · `pnpm lint` clean · `pnpm typecheck` clean(root + 6) · `verify-scope-boundaries.ts` PASS(12 boundaries, 388 files) · `git diff --check` clean · 로컬 Supabase(PostgreSQL 17)에 `202609210001` 적용 성공 · e2e `map-symbol-halo.spec.ts` 통과(두 테마 Near 스크린샷 `.omo/evidence/phase4/todo-26/halo-*.png`).
