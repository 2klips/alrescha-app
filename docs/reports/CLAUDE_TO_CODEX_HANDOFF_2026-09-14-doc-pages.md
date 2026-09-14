# Claude → Codex 배포 인수인계: todo 20 결정론 나머지 — `docskeleton` 워커 잡·analyze 연쇄·`/app/docs`·옛 주소 리다이렉트

작성: 2026-09-14 · 대상: Alrescha 배포를 담당하는 Codex
상태: **배포 대기 — 웹 머지 + 워커 재배포.** 마이그레이션·환경변수 무변경(`202609060010_doc_pages.sql`은 이미 적용됨). 사용자 지시로 머지·배포는 보류 중이며, 이 문서는 그 뒤에 쓰는 절차다.
브랜치: `phase4/wave-d-todo-20` (`phase4/wave-d-todo-19` 위에 쌓임 → PR #19 → PR #20 순으로 먼저 머지되어야 한다) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/todo-20.md`](../../.omo/evidence/phase4/todo-20.md) ("2026-09-14" 절), 프론트 로그 [`docs/frontend/logs/2026-09-14-doc-pages.md`](../frontend/logs/2026-09-14-doc-pages.md).

## 1. 왜

todo 20의 2026-09-06 패스는 스키마·슬러그 규칙·`apply_doc_page_skeletons`·`apply_doc_page_prose`까지 설치하고 멈췄다: 저장된 행에서 페이지를 조립하는 워커 잡이 없었고, `previous_slugs`를 읽는 코드가 없었으며, `/app/docs`가 없었다. 이 PR이 G3 없이 할 수 있는 나머지를 전부 닫는다. **산문 생성(`docpage`)은 여전히 0회** — 체크박스는 열린 채다.

## 2. 변경 파일과 동작

| 파일                                                                                                  | 동작                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/worker/src/doc-skeleton-job.ts` (신규)                                                          | `buildDocSkeletonPages`: 저장된 행(경로·blob sha·export 이름·디렉터리·엣지·라벨 — 본문 열 없음)에서 repo 1 · 모듈(`deriveModuleClusters`·`moduleMemberDigest`와 같은 정의) · 멤버 있는 디렉터리 페이지. `contains` 제외. 아티팩트 0이면 거부, 검증 못 하는 commit은 null. `docpage`는 "no producer yet"으로 실패하는 핸들러. |
| `apps/worker/src/postgres-doc-store.ts` (신규)                                                        | 메타데이터만 읽고 `apply_doc_page_skeletons` 호출; `enqueueDocSkeleton` = `enqueue_job(..., 'docskeleton', 'docskeleton:<repo>:<sha>', cost 0, attempts 3)`.                                                                                                                                                       |
| `apps/worker/src/{queue,analysis-job,run-local,index}.ts`                                             | `JobKind` += `docpage`·`docskeleton`; analyze가 `publishAnalyzedCommit` **뒤에** docskeleton을 큐잉; `run-local.ts`에 두 핸들러 등록.                                                                                                                                                                                 |
| `apps/web/lib/docs/doc-pages-report.ts` (신규)                                                        | 세션 클라이언트 로더(RLS `doc_pages_select_member`). 산문 상태 `current`/`missing`/`stale`(member digest 비교), 옛 슬러그 조회, 읽기 시점 백링크(`cited_node_ids` contains).                                                                                                                                         |
| `apps/web/app/ui/doc-pages.tsx`, `apps/web/app/app/(shell)/docs/{page,[slug]/page}.tsx` (신규)        | 목록(스코프 칩·멤버 수·`inferred` 배지 또는 부재 문장)과 페이지(설명·멤버·export 이름·관계 수·인용 후보·백링크). `previous_slugs` 적중 → 영구 리다이렉트, 32-hex가 아니거나 없는 슬러그 → 404. **stale 산문은 문장으로 말하고 싣지 않는다.**                                                                             |
| `apps/web/lib/strings/{docs,common,terms,index}.ts`, `apps/web/app/ui/shell-nav-data.ts`, `docs.css` | 문구 모듈(한국어 스윕 등록), `NAV.docs`(기록·자산 그룹 `문서`, 1차 탭 아님), 관용 영어에 `export` 추가, 화면 스타일.                                                                                                                                                                                                  |
| 테스트                                                                                                | 워커 단위 8 · PGlite 3 · 웹 단위 9 · e2e 1(라이브, 두 테마 axe 0) · 셸 nav·한국어 스윕·throttle 테스트 핸들러 맵 갱신.                                                                                                                                                                                                 |

core·SQL·의존성 무변경.

## 3. 테스트·게이트 (브랜치 팁)

- `pnpm lint` clean · `pnpm typecheck` clean(root + 6 workspaces) · `pnpm test` 202 files / 1,864 passed / 1 skipped · `scripts/verify-scope-boundaries.ts` PASS(12 boundaries, 381 files) · `git diff --check` clean.
- Playwright: `docs-pages.spec.ts` 1/1(라이브 — 실스캔 → 워커 빌더 → RPC 둘 → 개명 → 목록·리다이렉트·stale·백링크·404·두 테마 axe violation 0). 증빙 `.omo/evidence/phase4/todo-20/`.

## 4. 배포 필요 사항

- **마이그레이션** — 없음. **웹 배포** — **필요**(Vercel, 머지 시 자동). **워커** — **필요**(Fly `arr-worker` 재배포: `docskeleton` 핸들러와 analyze 연쇄가 `run-local.ts`에 있다). **환경변수** — 없음.

**절차: PR #19 → PR #20 → 이 PR 순 merge commit 머지 → Vercel 배포 확인 → 루트 체크아웃을 `main`으로 fast-forward한 뒤 `flyctl deploy`** (워커 배포는 루트 워킹 트리를 빌드한다 — 옛 트리를 배포하지 않도록).

순서가 중요한 이유: 웹이 먼저 나가도 해가 없다(페이지 0건이면 빈 상태). 워커가 먼저 나가도 해가 없다(페이지가 쌓이고 화면이 나중에 읽는다). 다만 **워커 재배포 전에 analyze가 돌면** `docskeleton` 잡이 cost 0으로 큐에 남고, 새 워커가 뜨는 순간 drain 루프가 집어 간다 — 정상이며 조치 불필요.

검증(크레딧 0):

1. 워커 로그: 다음 analyze 뒤 `docskeleton` 잡 1건이 `succeeded`. `pnpm ops:health`에서 `docskeleton` failed 0. 실패가 있으면 메시지가 `docskeleton ran before any artifact was stored`인지 확인 — 그 경우 스캔이 먼저 끝나지 않은 레포이며 다음 analyze에서 재시도된다.
2. `/app/docs`: 스켈레톤이 돈 워크스페이스면 저장소 페이지 1 + 모듈·디렉터리 페이지 목록, 전부 "산문 없음" 문장(G3 전이라 정상). 안 돈 워크스페이스면 빈 상태 문장.
3. 아무 행이나 열기 → 멤버·export 이름·관계 수·인용 후보가 보이고 `verified` 배지는 어디에도 없다. 주소를 임의로 바꾸면 404.
4. MCP·사이트 문구 — 변화 없음.

## 5. 롤백 지점

- 웹: 이전 Vercel 배포로. `doc_pages` 행은 남는다(읽기만 사라짐).
- 워커: 이전 Fly 릴리스로. **주의:** `claim_next_job`은 kind를 가리지 않으므로 옛 워커도 큐에 남은 `docskeleton` 잡을 claim하고, 핸들러 맵에 그 kind가 없어 **attempt 3회 뒤 failed로 기록된다**(cost 0이라 과금은 없다; `pnpm ops:health`의 failed에 잡힌다). 롤백 뒤 새 analyze가 돌면 잡이 또 생기므로, 롤백을 오래 유지할 거면 `jobs`에서 `kind='docskeleton'`을 정리해야 한다 — 수동 DB 변경이므로 사용자 승인 뒤에만.

## 6. 예상과 다른 점

- 이 범위의 산문은 전부 픽스처(e2e가 실제 조건부 쓰기로 넣은 것)다. 프로덕션에는 산문이 한 줄도 없고, 있어서도 안 된다(G3 전).
- `docpage` 잡은 큐잉 경로가 없다(`request_docs` 미등록). 누군가 수동으로 넣으면 "no producer yet"으로 실패한다 — 의도.

## PR

- (머지 보류 중 — PR 번호는 생성 뒤 기입)

## 게이트 수치

- `pnpm test` 202 files / 1,864 passed / 1 skipped (브랜치 팁, 2026-09-14).
