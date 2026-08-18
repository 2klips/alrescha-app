# Phase 2C todo 5 — 인증 화면 실배선 + `arr push` 실데이터 완주 (2026-08-18)

사용자 지시 "todo 5 진행". **G2(GitHub App)는 닫혀 있다** — `.env.local`에 `GITHUB_APP_*`가 없다. 계획의 게이트 규칙대로 실기 파일럿(GitHub install → webhook → full 보증 카드 → receipt)은 보류하고, **todo 5에서 G2에 의존하지 않는 전부**를 완주했다.

## G2 재판정 — 이관 사유가 절반은 틀렸다

Wave 1(todo 4)은 `/app/*` 순회와 `arr push` 실데이터 e2e를 "로그인 수단이 GitHub OAuth뿐이라 GitHub App이 필요"하다는 이유로 todo 5에 이관했다. **세션이 필요한 것은 맞지만 GitHub App은 필요 없다.** 이유는 두 가지다:

1. 브라우저 스위트는 **어차피 실제 GitHub OAuth를 몰 수 없다** — 사람·비밀번호·2차 인증이 중간에 있다. G2가 열려도 이 화면들은 여전히 못 돈다.
2. 로컬 Supabase는 이메일 가입이 켜져 있고(`config.toml` `[auth.email] enable_signup = true`, `enable_confirmations = false`), admin API로 확인된 사용자를 만들 수 있다. `handle_new_user` 트리거가 개인 워크스페이스까지 붙여준다.

그래서 세션은 **Supabase가 세션을 만드는 방식 그대로** 만든다(`tests/e2e/helpers/session.ts`): admin API로 확인 사용자 생성 → password grant → **쿠키는 `@supabase/ssr`가 직접 쓴다**. 쿠키 포맷을 손으로 재구현하지 않았으므로 라이브러리가 올라가도 하네스와 서버가 조용히 어긋날 수 없다. 제품 표면은 그대로다 — UI 어디에도 이메일 로그인은 없고 이 파일은 테스트 전용이다. 사용자마다 워크스페이스가 분리되고 테스트 종료 시 삭제(cascade)된다.

**G2가 실제로 막는 것은 두 화면뿐이다**: `/app/connect/github`는 렌더 시점에 `GITHUB_APP_ID` 등을 읽어 없으면 500이고, `/app/connect/github/repositories`는 거기로 리다이렉트한다. 순회 목록(`tests/e2e/helpers/app-screens.ts`)에 이 사실을 적어두고 제외했다.

## 한 것

### 1. Wave 1 로더 3종을 실제 화면에 연결

Wave 1은 `inspection`·`team`·`commits` 로더를 만들어 단위·RLS 테스트까지 끝냈지만 **어떤 라우트도 쓰지 않고 있었다**(공개 라우트는 전부 데모 픽스처). `/app/progress`·`/app/stats` 패턴 그대로 세 라우트를 신설했다:

- `/app/commits` — `loadWorkspaceCommitCards`
- `/app/inspection` — `loadWorkspaceInspectionDashboard`
- `/app/team` — `loadWorkspaceTeamReport`

데모 폴백은 없다. 빈 워크스페이스는 데모가 아니라 "증거 부족"을 렌더한다.

뷰 두 개가 데모 타입에 묶여 있어 최소한으로 풀었다:

- `CommitAnalysisBoard`에 `basePath` — 카드 링크가 `/commits` 하드코딩이었다. 데모 보드는 `/commits`, 워크스페이스 보드는 `/app/commits`.
- `TeamView`가 받던 `DemoTeam` → `TeamViewModel`(구조 타입). 차이는 `coaching`뿐이라 **`coaching: null`을 표현 가능하게** 만들고 그때는 `TEAM.coaching.insufficient`를 렌더한다. 코칭 잡이 한 번도 안 돈 워크스페이스에 데모의 채점 결과를 보여줄 수는 없다.

### 2. `/app/*` 두 테마 순회 + axe AA 편입

`screens-theme.spec.ts`의 순회 본문을 `walkBothThemes`로 추출해 공개/인증 두 계열이 같은 검사를 받게 하고, `a11y-contrast.spec.ts`도 같은 방식으로 `auditContrast`를 추출했다. 인증 화면 11개 × 2테마 = 순회 11건 + axe 22건 추가.

**리다이렉트가 통과를 가장하는 문제를 먼저 막았다.** 세션 없는 `/app/*`는 `/auth/login`으로 리다이렉트하는데 그 화면도 완전히 테마링돼 있어서, 그대로 두면 로그인 화면을 11번 검사하고 전부 통과했을 것이다. `walkBothThemes`가 착지 경로를 단언한다:

- 위반 심기: `signIn` 호출 제거 → 인증 순회 **11건 전부 실패**, 복원 → 11/11 통과.

### 3. `arr push` → 실 Supabase → graph-only 카드 (ADR-015)

`tests/local-ingest.test.ts`가 이미 DB 레벨에서 카드를 증명하지만, **이음매**(실 HTTP·실 MCP 토큰·실 라우트 핸들러·실 화면)는 증명한 적이 없었다. `tests/e2e/local-ingest-card.spec.ts`가 한 번 완주한다:

1. `/app/settings/mcp` **실제 발급 폼**으로 `mcp:write` 토큰 발급 → DOM에서 시크릿 읽기
2. 임시 디렉터리(AGENTS.md·spec.md·PROGRESS.md)를 실제 `pushLocalProject`로 업로드 → `uploaded`
3. `/app/commits`에서 그 커밋이 `data-assurance="graph-only"` 카드로 렌더, `full` 카드는 0건

- 위반 심기: 셀렉터를 `graph-only` → `full`로 바꾸면 `Expected: 1 / Received: 0`으로 실패.

ADR-015의 사용자 가시적 절반이 이걸로 닫혔다 — 로컬 스캔 커밋이 화면에서 완전 관측 커밋으로 보이지 않는다.

## 실물이 픽스처와 달랐던 지점

이번 세션에는 **없다.** 로더 3종이 실 Postgres에서 그대로 동작했고(Wave 1이 PGlite에서 잡아둔 GRANT 문제도 재발 없음), axe 위반 0. 인증 화면군이 처음 브라우저에 뜬 것치고는 무사고인데, Phase 2D가 토큰 단일 팔레트로 정리해둔 덕이 크다.

발견된 실제 결함은 **테스트 쪽**이었다: 인증 순회를 리다이렉트가 통과시킬 수 있었다는 것(위 2번). 착지 단언이 없었다면 초록불이 아무것도 증명하지 않았다.

## 검증

- vitest **729/730**(1 skip = win32 심링크) · Playwright **111/111**(직전 79 → +32)
- lint(`--max-warnings=0`)·typecheck·`format:check` green
- `verify-scope-boundaries.ts` **PASS: 12 boundaries, 232 files, 0 forbidden paths** · `adr-guardrails.ts` exit 0
- 하네스용 루트 devDependency 2개 추가(`@supabase/ssr`, `@supabase/supabase-js` — apps/web와 동일 버전)

## 남은 것 — G2 없이는 불가능한 것들

todo 5의 나머지는 **전부 사람 준비물 뒤에** 있다. 필요한 것(계획 게이트 표 G2):

- GitHub App 등록(권한·이벤트는 `spec/IMPLEMENTATION_GUIDE.md` §2 Phase B, 코드 기준은 `packages/core/src/github/app-permissions.ts`)
- `.env.local`: `GITHUB_APP_ID`·`GITHUB_APP_SLUG`·`GITHUB_APP_CLIENT_ID`·`GITHUB_APP_CLIENT_SECRET`·`GITHUB_APP_PRIVATE_KEY`·`GITHUB_INSTALL_STATE_SECRET`·`GITHUB_WEBHOOK_SECRET`
- smee.io 채널 + 2klips 소유 테스트 레포

열리면 할 일: install → push → webhook 수신 → 스캔·분석 잡 → **`full` 보증 카드** → receipt 발급·검증 완주, 녹화 픽스처 갱신(`fixtures/drifted-demo/recordings/github/`는 현재 `offline: true` 합성 데이터), 픽스처-실물 차이 목록화, `/app/connect/github` 두 화면 순회 편입.
