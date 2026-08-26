# Arr 프로덕션 배포 런북 (G4 · 2C todo 9)

> 2026-08-26 기준. 도메인 `arr.tools`는 구매 완료(Vercel 팀 `ao2`). 아키텍처:
> **Vercel** = `apps/web` (웹 + `/api/mcp` 호스티드 MCP + `/api/github/webhooks`) ·
> **Fly.io** = 워커(잡 드레인 루프, `fly.toml`/`apps/worker/Dockerfile` 준비됨) ·
> **Supabase 클라우드** = DB + Auth. 체크리스트는 [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md).

## 0. 준비물 요약 (사람이 만들어야 하는 계정·연동)

| # | 준비물 | 어디서 |
|---|---|---|
| P1 | Supabase 클라우드 프로젝트 | supabase.com → New project |
| P2 | **Vercel GitHub App에 `2klips/arr-app` 접근 권한** | vercel.com/account/login-connections 또는 프로젝트 Import 화면에서 GitHub 연결 → `2klips` 계정에 Vercel 앱 설치 (이게 없어서 자동 생성이 `repo_no_access`로 막혀 있음) |
| P3 | Fly.io 계정 + `flyctl` 로그인 | fly.io → `fly auth login` |
| P4 | 로그인용 GitHub **OAuth App** (OQ-017) | GitHub Settings → Developer settings → OAuth Apps |
| P5 | GitHub **App**(기존) webhook URL 전환 권한 | 기존 App 설정 화면 |

## 1. Supabase 클라우드 (P1)

1. 프로젝트 생성(리전: `ap-northeast-2` 권장). DB 비밀번호 보관.
2. 마이그레이션 적용 — 로컬에서:
   ```bash
   DATABASE_URL="postgresql://postgres:<비밀번호>@db.<ref>.supabase.co:5432/postgres" pnpm db:migrate
   ```
3. Auth → Providers → GitHub 활성화: **P4의 OAuth App** `Client ID/Secret` 입력 (GitHub App 자격증명 재사용 금지 — `supabase/config.toml`의 OQ-017 주석 참조). OAuth App의 callback = `https://<ref>.supabase.co/auth/v1/callback`.
4. 기록해둘 값: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(anon), `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.

## 2. Vercel — 웹 + MCP (P2)

1. P2 완료 후: 팀 `ao2`에서 Import → `2klips/arr-app`, **Root Directory = `apps/web`**, Framework = Next.js. (P2가 되면 Claude가 MCP로 대신 생성 가능 — "Vercel 프로젝트 만들어줘"라고 하면 됨.)
2. 환경 변수 (Production):
   - `NEXT_PUBLIC_APP_URL=https://arr.tools`
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
   - `GITHUB_APP_ID` / `GITHUB_APP_SLUG` / `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` / `GITHUB_APP_PRIVATE_KEY`(줄바꿈은 `\n`) / `GITHUB_INSTALL_STATE_SECRET` / `GITHUB_WEBHOOK_SECRET`
   - `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` (P4 — Supabase 셀프호스트 시에만 웹에 필요, 클라우드 Auth를 쓰면 Supabase 대시보드에만 넣으면 됨)
   - (선택) `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `BYOK_ENCRYPTION_KEY` / `ARR_MCP_URL=https://arr.tools/api/mcp`
3. Domains: 프로젝트에 `arr.tools` + `app.arr.tools` 추가(도메인이 이미 팀 소유라 클릭만으로 붙음). `mcp.arr.tools`는 선택 — 호스티드 MCP는 `https://arr.tools/api/mcp`로 서빙되므로 서브도메인 없이도 동작. 쓰려면 같은 프로젝트에 도메인 추가 후 `ARR_MCP_URL` 갱신.
4. Deploy → 빌드 green 확인.

## 3. Fly.io — 워커 (P3)

레포 루트에서:
```bash
fly launch --no-deploy --copy-config --name arr-worker
```
```bash
fly secrets set DATABASE_URL="postgresql://postgres:<비밀번호>@db.<ref>.supabase.co:5432/postgres" GITHUB_APP_ID=... GITHUB_APP_PRIVATE_KEY="$(cat private-key.pem)" ANTHROPIC_API_KEY=... OPENAI_API_KEY=... BYOK_ENCRYPTION_KEY=...
```
```bash
fly deploy
```
- 로그 확인: `fly logs` — `claimed job` / idle 루프가 보이면 정상. 워커는 HTTP 포트가 없다(의도).

## 4. GitHub App 전환 (P5)

1. App 설정 → Webhook URL = `https://arr.tools/api/github/webhooks`, Secret = `GITHUB_WEBHOOK_SECRET`와 동일.
2. Callback URL = `https://arr.tools/api/github/callback`.
3. 권한·이벤트는 기존 최소 프로필 그대로(Email addresses 추가 금지 — 가드레일).

## 5. 스모크 (프로덕션 파일럿 재완주 — todo 9 수용 기준)

1. `https://arr.tools` 로그인(P4 경유) → 레포 연결 → 파일럿 레포 푸시.
2. webhook 수신 → Fly 워커가 scan/analyze 드레인 → 커밋 카드 `assurance=full` + **receipt 1건(신 포맷: predicateType `https://arr.tools/receipt/v1`, git:commit subject)**.
3. MCP: 설정 화면에서 토큰 발급 → `https://arr.tools/api/mcp`로 `get_graph_schema` 1콜.
4. 헬스·롤백: Vercel은 이전 배포로 Instant Rollback, 워커는 `fly releases` + `fly deploy --image <이전>`.

## 6. 이후 Claude가 이어서 할 수 있는 것

P2(Vercel GitHub 연동)만 열리면: 프로젝트 생성·도메인 연결 확인·배포 상태/빌드 로그 점검·웹 스모크를 MCP로 대행 가능. P1/P3/P5는 각 서비스 콘솔 권한이 필요해 사람 몫.
