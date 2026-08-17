# todo 3 — 로컬 인제스트 CLI `arr push` (2026-08-17)

**범위:** BUILD_PLAN_PHASE2B Wave 1 todo 3, ADR-013(로컬 인제스트는 메타데이터만·경로 전체 허용·GitHub 유도).

## 1. 구조 — "같은 파이프라인, 다른 운송수단"

| 층 | 파일 | 역할 |
|---|---|---|
| 공유 계약 | `packages/core/src/ingest/local-ingest.ts` | **strict zod** 페이로드 스키마(전 계층 `strictObject` — 어떤 이름의 본문 필드도 거부) + 라우트 핸들러(스토어 주입형, webhook 핸들러 관용구) |
| 단일 영속 | `supabase/migrations/202608170002_local_ingest.sql` | `apply_repository_scan(jsonb)` — worker 스토어 apply를 **원자적 SQL 함수로 이식**, `ensure_local_repository` |
| worker 개정 | `apps/worker/src/repository-scan-store.ts` | `apply()`가 같은 SQL 함수를 호출 — **GitHub 경로와 로컬 경로가 문자 그대로 같은 코드로 영속**(동등성의 구조적 보장) |
| 웹 라우트 | `apps/web/app/api/ingest/local/route.ts` + `lib/ingest/supabase-local-ingest-store.ts` | GET 이전 상태 / POST 적용. 인증 = 기존 **워크스페이스 MCP 토큰**(`SupabaseMcpStore.authenticateAccessToken` 재사용, GET=`mcp:read`, POST=`mcp:write`) |
| CLI | `packages/cli` (`@arr/cli`, bin `arr`) | `local-source.ts`(git 형태 트리: blob sha1·mode·심링크 120000·결정론 가상 commit), `push.ts`(GET 이전 상태 → 공유 `scanRepository` → strict 스키마 자가검증 → POST), `arr.ts`(bin), `messages.ts`(한국어 카피 + **GitHub 연결 유도**) |

스캔 규칙은 전부 `scanRepository`(@arr/core) 하나다 — 분류·1MiB 상한·binary/oversized/symlink 스킵·증분 diff가 두 경로에서 동일 코드로 돈다 (Must NOT "다른 규칙 사용" 충족).

## 2. 수용 기준 ↔ 테스트

| 수용 기준 | 테스트 |
|---|---|
| **업로드 페이로드에 파일 본문 없음** | 3중 증명 — ⑴ `packages/cli/src/push.test.ts`: 소스 본문에만 존재하는 센티널이 **실제 와이어 바이트**에 없음(경로·심볼명 등 메타데이터는 있음) ⑵ `tests/local-ingest-route.test.ts`: 최상위/plan/artifact 어느 층이든 본문 필드를 밀수한 페이로드는 strict 스키마가 400으로 거부, 스토어 호출 0 ⑶ `tests/local-ingest.test.ts`: apply 후 DB 전 행 직렬화에 센티널 부재 |
| **CLI/GitHub 두 경로 동일 그래프** | `tests/local-ingest.test.ts` — 같은 픽스처(`fixtures/drifted-demo`)를 ⑴ 로컬 소스 ⑵ **실제 `GitHubRepositorySource`**(fetch 스텁이 트리·raw 콘텐츠 API를 로컬 파일로 응답)로 스캔 → **plan 완전 일치**, 각각 별도 워크스페이스에 apply → artifacts·graph_nodes·todos 행 **완전 일치** |
| **오프라인·부분 실패 처리** | `push.test.ts` — GET 실패(오프라인, 아무것도 전송 안 됨)·POST만 실패(socket hang up)·401→auth-failed·500→server-error(본문 verbatim). 서버 측 부분 실패는 SQL 함수의 트랜잭션 원자성이 차단 |
| 증분 동작 | unchanged 재스캔 → 빈 plan → apply 0 반환(no-op), todo 수정+파일 삭제 → update+removal 한 plan |
| 워크스페이스 토큰 인증 | 라우트 테스트(무토큰 401·오토큰 401·읽기전용 토큰 POST 403) |

CLI 자체 단위: `local-source.test.ts` — git blob sha 실값 검증(`hello\n` → `ce01…464a`), 결정론(같은 내용=같은 가상 commit), 내용 변경 시 commit 변경, `.git`/`node_modules` 제외, 심링크 mode 120000(win32 skip).

## 3. ADR-013 §5 (GitHub 유도)

- CLI 성공 출력에 `githubNudge`("GitHub에 연결하면 push마다 자동으로 분석됩니다") 고정 출력.
- 온보딩 `identity.note`의 구 카피 "로컬 설치 없음"(ADR-013과 모순)을 "설치 없이 시작 + 로컬 인제스트 CLI(메타데이터만)" 안내로 개정. `terms.ts`에 `CLI`·`Git`·`push` 추가.
- 가드레일 유의: `git push` 리터럴은 `repo-write-outside-pr-proposal` 패턴에 걸리므로 카피는 "GitHub에 연결"로 표현.

## 4. 게이트

- 스코프 스캐너 `PASS: 11 boundaries, 194 files`(신규 CLI 패키지 포함 — bin·셰뱅 존재하되 `raw-source-upload` 무위반, ADR-013 경계의 첫 실전 검증)
- vitest **540/541**(74 파일, 1 skip = win32 심링크) · Playwright 전체(아래) · eslint·typecheck(신규 `packages/cli` 포함) 무결점
- `pnpm install`로 워크스페이스 등록(`pnpm-workspace.yaml`의 `packages/*` glob이 자동 포함)

## 5. 남긴 것

- 로컬 인제스트는 run/receipt를 만들지 않는다 — 커밋 카드·영수증 연동은 후속(스캔 그래프 반영까지가 이번 범위).
- `arr push`의 실서버 E2E는 Supabase 준비물이 붙는 시점에(테스트는 PGlite + 스텁 fetch로 전 구간 커버).
