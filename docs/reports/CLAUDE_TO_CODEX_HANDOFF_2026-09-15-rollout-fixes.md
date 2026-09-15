# Claude → Codex 배포 인수인계: PR #19–#22 롤아웃의 프로덕션 차단 2건 수정 — docskeleton 슬러그 충돌, CI 아티팩트 ZIP 415

작성: 2026-09-15 · 대상: Alrescha 배포를 담당하는 Codex
상태: **배포 대기 — 마이그레이션 1건 적용 + 웹 머지 + 워커 재배포 + 다시 스캔 1회.** 환경변수 변경 없음. 웹 화면 변경 없음(core 변경은 워커·SQL이 호출).
브랜치: `phase4/rollout-fixes-doc-slug-ci-zip` (base `origin/main` `e53b36b`) · PR: 본문 하단 "PR" 항목.
근거 문서: Codex 롤아웃 기록 [`pr19-22-production-rollout-2026-09-15.md`](../../.omo/evidence/phase4/pr19-22-production-rollout-2026-09-15.md), [`todo-20.md`](../../.omo/evidence/phase4/todo-20.md) "2026-09-15" 절, [`todo-18.md`](../../.omo/evidence/phase4/todo-18.md) "2026-09-15" 절, [OQ-072 추기](../../spec/OPEN_QUESTIONS.md).

## 1. 왜

PR #19–#22 롤아웃에서 두 수용이 실패했다. ⑴ 첫 `docskeleton` 잡이 `doc_pages_workspace_repository_slug_unique` 위반으로 attempt 3 failed — 서로 다른 두 모듈(`scripts/adr-guardrails.ts`·`scripts/verify-plan-coverage.ts`)이 같은 디렉터리 집합(`scripts/`+`tests/`)이라 슬러그가 같았다. `/app/docs`는 빈 상태. ⑵ CI 아티팩트 ZIP 다운로드가 **415**(`Accept: application/octet-stream`)를 받아 증거 0행 — analyze는 성공했고 아무 로그도 없었다. 테스트 파일은 `inferred`.

## 2. 변경 파일과 동작

| 파일                                                                | 동작                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/202609150001_doc_page_slug_identity.sql` (신규) | `doc_page_slug`: 노드 스코프(module/feature/repo) 해시에 **identity_key**를 넣는다(`scope\nidentity\n디렉터리`). 디렉터리는 남겨 주소는 모양이 바뀔 때만 움직인다. 붙는 스코프는 불변. 옛 규칙의 기존 행은 재주소화하며 옛 슬러그를 `previous_slugs`에 보존(프로덕션은 0행이라 no-op). |
| `packages/core/src/docs/doc-page.ts`                                | TS `docPageSlug` 동일 규칙. `tests/doc-pages.test.ts`가 SQL과 등가를 계속 핀하고, 파일럿 모양 그대로(두 모듈, 같은 디렉터리 집합)의 실DB 회귀를 추가.                                                                                                                                  |
| `apps/worker/src/postgres-doc-store.ts`                             | `enqueueDocSkeleton`이 `next_retry_idempotency_key`로 키를 만든다: terminal failure 뒤 다음 analyze가 `docskeleton:<repo>:<sha>:r1`을 큐잉, 큐·실행·성공 잡은 그대로 반환. **실패 행은 손대지 않는다**(`tests/doc-skeleton-store.test.ts`).                                        |
| `apps/worker/src/github-ci-evidence-source.ts`                      | ZIP 요청도 API 미디어 타입(`application/vnd.github+json`)으로 — 302를 fetch가 따라간다. 그리고 분석 commit의 **이름당 최신 아티팩트(최대 id)만** 읽는다(재실행 이력: 실패본까지 읽으면 203파일 전부 `unknown`).                                                                      |
| `apps/worker/src/analysis-job.ts`                                   | 수집 실패를 로그로 말한다: `ci evidence collection failed: <메시지> — no evidence recorded for <sha>`(엔드포인트 종류·상태만, 본문·토큰 없음). 파싱 실패는 아티팩트 이름으로. 잡은 여전히 실패시키지 않는다.                                                                         |
| `tests/scanner-extensions.test.ts`                                  | main CI 1차를 실패시킨 5.09s PGlite 케이스에 타임아웃 명시(단언 불변).                                                                                                                                                                                                                  |
| 테스트                                                              | `doc-pages` 25 · `doc-skeleton-store` 4 · `ci-evidence` 10(Accept 헤더 핀, 재실행 아티팩트 선택) · `analysis-job` (+경고 로그 단언) · e2e `docs-pages`·`map-verified` 마이그레이션 적용된 로컬 Supabase에서 재통과.                                                                     |

## 3. 테스트·게이트 (브랜치 팁)

- `pnpm lint` clean · `pnpm typecheck` clean(root + 6) · `pnpm test` 203 files / 1,878 passed / 1 skipped · `git diff --check` clean.
- 마이그레이션을 로컬 Supabase(PostgreSQL 17)에 적용: `Applied: 202609150001_doc_page_slug_identity.sql`, 파일럿 두 모듈 모양의 슬러그가 다름을 실DB에서 확인. 마이그레이터가 파일을 자체 트랜잭션으로 감싸므로 파일 안의 `begin;/commit;`이 `there is no transaction in progress` 경고를 내는데, `202609020001` 등 기존 9건과 같은 무해한 경고다.

## 4. 배포 필요 사항

- **마이그레이션** — **필요**: `202609150001_doc_page_slug_identity.sql`. 프로덕션 `DATABASE_URL`은 Fly 워커 시크릿에만 있다; `db:migrate`는 보류 중인 것을 전부 적용하므로 원장을 먼저 본다. 이 파일 하나만 pending이어야 한다.
- **웹 배포** — 머지 시 Vercel 자동(화면 변화 없음; `packages/core`가 웹 번들에도 들어가지만 슬러그 함수는 웹에서 호출하지 않는다).
- **워커** — **필요**(Fly `arr-worker`): 새 Accept·아티팩트 선택·재시도 키·로그가 전부 워커에 있다.
- **환경변수·GitHub App** — 없음.

**절차: 마이그레이션 적용 → 이 PR merge commit 머지 → Vercel 확인 → 루트 체크아웃을 `main`으로 fast-forward한 뒤 `flyctl deploy` → 다시 스캔 1회.**

순서 이유: 마이그레이션이 먼저여야 새 워커의 첫 skeleton이 새 슬러그 함수를 만난다(함수는 SQL 안에 있고 워커는 호출만 한다). 옛 워커가 새 함수를 만나도 해는 없다(같은 시그니처).

검증(전부 크레딧 0):

1. `2klips/alrescha-app` **다시 스캔 1회**(`/app` 또는 MCP `request_rescan`). main 머지 시점의 CI가 끝난 head여야 한다.
2. 워커 로그: ⑴ `docskeleton` 잡이 키 `docskeleton:<repo>:<sha>:r1`로 **succeeded**(같은 sha의 실패 잡은 그대로 failed로 남는다 — 정상). ⑵ `ci evidence 203 row(s), 203 supporting`(스위트가 늘면 그만큼 는다). 수집 실패가 있으면 이제 `ci evidence collection failed: …` 줄이 찍힌다 — 그 줄이 보이면 상태 코드를 인계한다.
3. `/app/docs`: 저장소 페이지 1 + 모듈 21 + 디렉터리 151 근처의 목록, 전부 "산문 없음"(G3 전). 아무 행이나 열면 멤버·export 이름·관계 수가 보이고 `verified` 배지는 없다. 임의 주소는 404.
4. `/app/map`: 테스트 파일 노드(예: `apps/worker/src/analysis-job.test.ts`)가 `verified`, `src/`·`lib/` 파일은 `inferred`. 스크린샷 1장과 두 로그 줄을 `.omo/evidence/phase4/todo-18/`에 남긴다. evidence 노트·BUILD_PLAN 체크박스 갱신은 Claude Code로 인계(성공 결과를 받아 닫는다).
5. `pnpm ops:health`: docskeleton failed **1 유지**(옛 실패 행은 세는 게 맞다), analyze failed 5 유지, 큐 0.

## 5. 롤백 지점

- 마이그레이션: 함수 정의 변경 + 0행 업데이트라 데이터 롤백 대상이 없다. 되돌리려면 `202609060010`의 함수 본문을 새 마이그레이션으로 다시 적용해야 하며, 그 경우 슬러그 충돌이 재현된다 — 롤백보다 전진 수정이 맞다.
- 워커: 이전 Fly 릴리스(v21)로. 415와 무로그가 돌아온다. 새 워커가 이미 쓴 doc_pages·evidence 행은 옛 워커의 다음 패스가 각각 통째로 갱신·치운다.
- 웹: 변화 없음.

## 6. 예상과 다른 점

- `docskeleton` failed 1은 이 수정 뒤에도 health에 남는다. 실패 행을 고치지 않는 설계이며, 7일 창이 지나면 WARN에서 빠진다.
- 재시도 키 규칙은 `docskeleton`에만 새로 붙였다. `docpage`는 아직 생산자가 없다.
- 로컬 main에 Codex의 `3ed4139`(롤아웃 기록)가 origin보다 1개 앞서 있다. 이 브랜치는 `origin/main`에서 갈라져 그 커밋을 포함하지 않으며, 두 커밋이 손대는 파일은 겹치지 않는다. 푸시·머지 순서는 Codex 판단.

## PR

- https://github.com/2klips/alrescha-app/pull/23 — base `main`. 커밋 3건: `fix(docs): put the page identity in the module slug and retry a skeleton pass after a terminal failure`(`32b7ca7`), `fix(worker): request CI artifacts with the API media type, read the latest artifact per name, and say when collection fails`(`48f4a3c`), 문서(`b075e42`).

## 게이트 수치

- `pnpm test` 203 files / 1,878 passed / 1 skipped (브랜치 팁, 2026-09-15) · `pnpm lint` clean · `pnpm typecheck` clean · `verify-scope-boundaries.ts` PASS · `git diff --check` clean.
