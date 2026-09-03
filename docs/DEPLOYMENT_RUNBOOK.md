# Alrescha 프로덕션 배포 핸드오프 (G4 · BUILD_PLAN_PHASE2C todo 9)

> **이 문서를 받는 에이전트에게:** 이 작업은 코드 작성보다 **외부 서비스 연동**이 중심이다.
> 레포 규약은 `AGENTS.md`를 먼저 읽고, 하드룰(원본 코드 비저장·verified는 실행 증거만·측정 없는 수치 금지·테스트 약화 금지)은 배포 작업 중에도 그대로 적용된다.
> 작성 시점 2026-08-26 · 마지막 커밋 `5c43f54` (푸시됨, `2klips/alrescha-app` main).

---

## 0. 지금 상태 (무엇이 끝났고 무엇이 남았나)

**끝난 것 — 다시 하지 말 것:**

- Phase 3 전체(Wave A~F) 완료. 벤치 v3 릴리스 게이트 MET, 사이트 정확도 주장 복원됨.
- **receipt 포맷 최종화 완료** — `predicateType` + WORK_SPEC §13 예약 필드 4종(git:commit sha1 subject · `tool` · `analyzedAt` · `coverage`)이 이미 구현·테스트됐다. §2에서 도메인 값만 교체하면 된다.
- **워커 컨테이너 준비 완료** — `apps/worker/Dockerfile` + 레포 루트 `fly.toml`. `fly deploy` 한 번으로 뜬다.
- 웹 프로덕션 빌드 로컬 통과 확인(`pnpm --filter @alrescha/web build`) — **빌드 타임에 필요한 환경 변수는 없다**(전부 런타임 주입).
- 게이트 상태: vitest 872 passed / 1 skipped, lint·typecheck 무결점, `scripts/verify-scope-boundaries.ts` PASS(12경계).

**남은 것 = 이 문서의 §1~§7.**

**아키텍처(확정):**

| 구성요소                      | 어디                       | 무엇                                                                      |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| 웹 + 호스티드 MCP + 웹훅 수신 | **Vercel** (`apps/web`)    | `/app/*` 화면, `/api/mcp`, `/api/github/webhooks`, `/api/github/callback` |
| 잡 드레인 루프                | **Fly.io** (`apps/worker`) | scan → analyze → enrich → judge/coach. **HTTP 포트 없음**(의도)           |
| DB + Auth                     | **Supabase 클라우드**      | Postgres(RLS) + GitHub OAuth 로그인                                       |

> MCP는 별도 서버가 아니라 Next.js 라우트(`/api/mcp`)다. `mcp.` 서브도메인은 선택 사항.

---

## 1. 사람 준비물 (에이전트가 대신 못 하는 것)

| #   | 준비물                                                    | 비고                                  |
| --- | --------------------------------------------------------- | ------------------------------------- |
| P1  | **Supabase 클라우드 프로젝트**                            | 리전 `ap-northeast-2` 권장            |
| P2  | **Vercel 프로젝트 기본 도메인** + GitHub 연동된 원래 계정 | 확정값: `arr-app-web.vercel.app`      |
| P3  | **Fly.io 계정** + `fly auth login`                        | 워커용                                |
| P4  | **로그인용 GitHub OAuth App** (OQ-017)                    | GitHub App과 **별개**. 아래 경고 참조 |
| P5  | 기존 **GitHub App** 설정 변경 권한                        | webhook·callback URL 전환             |

**이력(반복 방지):** 처음에 `arr.tools`를 팀 `ao2`에 구매했으나, 그 Vercel 계정에 GitHub(`2klips`)을 연결할 수 없었다 — GitHub 계정 하나는 Vercel 계정 하나에만 연결되고, `2klips`는 이미 다른 Vercel 계정(운영 중, 자동배포 사용)에 묶여 있다. Vercel 팀 간 Move는 양쪽 팀 멤버여야 하고(멤버 2명 = Pro), 레지스트라 Transfer out은 ICANN 60일 잠금(2026-10-25 해제). **2026-08-26 사용자 결정: 추가 도메인 구매를 연기하고, 원래 계정의 Vercel 기본 프로덕션 주소 `https://arr-app-web.vercel.app`로 배포한다.** 커스텀 도메인은 이후 이 프로젝트에 alias로 연결할 수 있지만 receipt `predicateType`은 마이그레이션 없이는 바꾸지 않는다.

---

## 2. 도메인 값 교체 (코드 작업 — 배포 전에 이것부터)

프로덕션 기준 주소는 첫 Vercel 배포로 확정된 `arr-app-web.vercel.app`이다.

> **왜 다시 바꿔도 되는가:** WORK_SPEC §13은 "predicateType은 전체 receipt 마이그레이션 결정 없이 다시 바꾸지 않는다"고 못박았다. 그 조건은 **프로덕션 receipt가 존재할 때**의 이야기다. 지금은 프로덕션 receipt가 0건이고 로컬 dev receipt는 폐기 마이그레이션이 이미 처리하므로, **프로덕션 첫 발급 전인 지금이 마지막으로 바꿀 수 있는 시점**이다. 프로덕션에 receipt가 한 건이라도 쌓인 뒤에는 이 항목을 건드리지 말 것.

바꿀 파일 (전부 실측 목록):

1. `packages/core/src/assurance/receipts.ts` — `RECEIPT_PREDICATE_TYPE = "https://arr-app-web.vercel.app/receipt/v1"` + 위 주석의 도메인·날짜
2. `packages/core/src/assurance/receipts.test.ts` — 픽스처 `predicateType` **및 음성 테스트**(구 값 거부 단언)를 새 값 기준으로
3. `apps/worker/src/analysis-job.test.ts:169` — `expect(statement.predicateType).toBe(...)`
4. `apps/web/lib/assurance/fixtures.ts:315` — 데모 receipt `predicateType`. **다이제스트 2개를 재계산해야 한다**(아래 스니펫)
5. `apps/web/app/app/settings/mcp/actions.ts:117,122` — 폴백 주소 `https://arr-app-web.vercel.app` / `https://arr-app-web.vercel.app/api/mcp`
6. `supabase/migrations/202608260002_discard_arr_tools_receipts.sql` — **새 마이그레이션 파일 추가**(기존 `202608260001_discard_dev_receipts.sql`은 수정 금지 — 이미 적용된 이력). `arr.tools` 값을 지우는 delete이며 `tests/helpers/database.ts`의 `ALL_MIGRATIONS`에 등록
7. `spec/WORK_SPEC.md` §13 — 예시 JSON + "Wave 4 예약 이행 완료" 문단의 도메인
8. `spec/BUILD_PLAN_PHASE2C.md` todo 10 주석 · 이 문서

**픽스처 다이제스트 재계산** (레포 루트에서 실행):

```bash
npx tsx -e "import('./packages/core/src/assurance/receipts.ts').then(async (m)=>{const s={_type:'https://in-toto.io/Statement/v1',predicate:{analyzedAt:'2026-08-10T13:42:00.000Z',commitSha:'b'.repeat(40),coverage:{implVerified:3,requirements:5,testVerified:2},evidence:{inferred:1,verified:3},previousReceiptDigest:'9'.repeat(64),repository:'2klips/alrescha-app',runId:'run-bad0551',tool:{name:'alrescha',version:'0.1.0'}},predicateType:'https://arr-app-web.vercel.app/receipt/v1',subject:[{digest:{sha1:'b'.repeat(40)},name:'git:commit'},{digest:{sha256:'a'.repeat(64)},name:'2klips/alrescha-app'}]};console.log('current:',await m.digestInTotoStatement(s));const p={...s,predicate:{...s.predicate,commitSha:'e'.repeat(40),evidence:{inferred:2,verified:2},previousReceiptDigest:null,runId:'run-e9101b5'}};console.log('previous:',await m.digestInTotoStatement(p));})"
```

출력된 두 값을 `apps/web/lib/assurance/fixtures.ts`의 `expectedDigest` 자리(현재 `52341865…` / `176b9f63…`)에 넣는다.

**검증:** `pnpm lint && pnpm typecheck && pnpm test` 전부 green + `npx tsx scripts/verify-scope-boundaries.ts` PASS.
**커밋:** `chore(domain): adopt the Vercel production domain`

---

## 3. Supabase 클라우드 (P1)

1. 프로젝트 생성. **DB 비밀번호를 보관**한다(마이그레이션에 필요).
2. 마이그레이션 적용 — 로컬에서:
   ```bash
   DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<REF>.supabase.co:5432/postgres" pnpm db:migrate
   ```
   `supabase/migrations/` 전량이 순서대로 적용된다. 적용 후 `receipts`·`graph_nodes`·`jobs`·`credit_ledger` 테이블 존재 확인.
3. **Auth → Providers → GitHub 활성화**: P4에서 만든 **OAuth App**의 Client ID/Secret 입력.
   > ⚠️ **GitHub App의 자격증명을 여기 넣지 말 것** (OQ-017). 최소 권한 GitHub App은 `GET /user/emails`를 403으로 막고, 그걸 풀려고 App에 Email 권한을 추가하면 `assertMinimalGitHubPermissions` 가드레일이 거부한다. `supabase/config.toml`의 주석이 이 결정을 담고 있다.
4. 확보할 값 4종: `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(anon) · `SUPABASE_SERVICE_ROLE_KEY` · `DATABASE_URL`.

## 4. 로그인용 GitHub OAuth App (P4)

GitHub → Settings → Developer settings → **OAuth Apps** → New:

- Homepage: `https://arr-app-web.vercel.app`
- Authorization callback URL: `https://<REF>.supabase.co/auth/v1/callback`
- 발급된 Client ID/Secret → **Supabase Auth의 GitHub provider에 입력**(§3-3)

## 5. Vercel — 웹 + MCP (P2)

GitHub이 연결된 원래 계정에서:

1. Import `2klips/alrescha-app` → **Root Directory = `apps/web`**, Framework = Next.js.
2. 환경 변수 (Production) — **실측 전량 목록**:

| 변수                                                | 값                                       | 필수 |
| --------------------------------------------------- | ---------------------------------------- | ---- |
| `NEXT_PUBLIC_APP_URL`                               | `https://arr-app-web.vercel.app`         | ✅   |
| `NEXT_PUBLIC_SUPABASE_URL`                          | §3-4                                     | ✅   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`              | §3-4                                     | ✅   |
| `SUPABASE_SERVICE_ROLE_KEY`                         | §3-4                                     | ✅   |
| `GITHUB_APP_ID` / `GITHUB_APP_SLUG`                 | 기존 App                                 | ✅   |
| `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` | 기존 App                                 | ✅   |
| `GITHUB_APP_PRIVATE_KEY`                            | PEM 전문, 줄바꿈은 `\n`                  | ✅   |
| `GITHUB_INSTALL_STATE_SECRET`                       | 임의 랜덤 문자열                         | ✅   |
| `GITHUB_WEBHOOK_SECRET`                             | GitHub App 설정과 동일 값                | ✅   |
| `ALRESCHA_MCP_URL`                                  | `https://arr-app-web.vercel.app/api/mcp` | 권장 |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`              | 플랫폼 AI 판단·enrich 제공 시            | 선택 |
| `BYOK_ENCRYPTION_KEY`                               | BYOK 사용 시                             | 선택 |

3. Domains: 기본 프로덕션 주소 `arr-app-web.vercel.app` 유지. 커스텀 도메인은 추후 alias로 연결한다.
   - `ARR_MCP_URL`은 현재 전환 릴리스에서만 읽기 alias로 지원한다. 신규 배포에는 `ALRESCHA_MCP_URL`만 설정한다.
4. Deploy → 빌드 green 확인.

## 6. Fly.io — 워커 (P3)

레포 루트에서:

```bash
fly launch --no-deploy --copy-config --name arr-worker
```

```bash
fly secrets set DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<REF>.supabase.co:5432/postgres" GITHUB_APP_ID="..." GITHUB_APP_SLUG="..." GITHUB_APP_PRIVATE_KEY="$(cat private-key.pem)" ANTHROPIC_API_KEY="..." OPENAI_API_KEY="..." BYOK_ENCRYPTION_KEY="..."
```

```bash
fly deploy
```

- 워커 필수 변수: `DATABASE_URL` · `GITHUB_APP_ID` · `GITHUB_APP_SLUG` · `GITHUB_APP_PRIVATE_KEY`. AI 키는 judge/enrich/coach 잡에만 필요(없으면 그 잡만 실패, 결정론 잡은 계속 동작).
- `fly logs`로 드레인 루프 확인. **HTTP 포트가 없는 게 정상** — 헬스체크 URL을 찾지 말 것.
- ⚠️ `fly.toml`에 auto-stop을 켜지 말 것(큐가 안 돌아간다).

## 7. GitHub App 전환 (P5) + 스모크

1. 기존 GitHub App 설정:
   - Webhook URL → `https://arr-app-web.vercel.app/api/github/webhooks`, Secret = `GITHUB_WEBHOOK_SECRET`
   - Callback URL → `https://arr-app-web.vercel.app/api/github/callback`
   - **권한·이벤트는 그대로**(Email addresses 추가 금지 — 가드레일 위반)
2. **프로덕션 파일럿 재완주 = todo 9 수용 기준:**
   1. `https://arr-app-web.vercel.app` 로그인(GitHub OAuth) → 레포 연결 → 테스트 레포에 푸시
   2. webhook 수신 → Fly 워커가 scan·analyze 드레인 → 커밋 카드 `assurance=full`
   3. **receipt 1건 발급 확인 — `predicateType`이 `https://arr-app-web.vercel.app/receipt/v1`이고 subject 선두가 `git:commit`인지** 눈으로 확인(§2가 제대로 반영됐다는 최종 증거)
   4. 설정 화면에서 MCP 토큰 발급 → `https://arr-app-web.vercel.app/api/mcp`로 `get_graph_schema` 1콜
3. **롤백:** Vercel은 이전 배포로 Instant Rollback. 워커는 `fly releases` → `fly deploy --image <이전 이미지>`.
4. 완료 시: `spec/BUILD_PLAN_PHASE2C.md` todo 9 체크박스 + `.omo/evidence/phase2c/wave-4-todo-9.md` 기록 + 커밋.

---

## 8. 이 작업에서 하지 말아야 할 것

- **GitHub App에 Email addresses 권한 추가** — 최소 권한 프로필 가드레일 위반. 로그인은 반드시 별도 OAuth App(§4).
- **시크릿을 레포에 커밋** — 어떤 형태로도. Vercel/Fly의 시크릿 스토어만 사용.
- **프로덕션 receipt가 쌓인 뒤 predicateType 변경** — §2의 창은 첫 발급 전까지만 열려 있다.
- **기존 마이그레이션 파일 수정** — 새 파일을 추가하고 `ALL_MIGRATIONS`에 등록.
- **테스트를 약화시켜 green 만들기** — 배포 작업 중에도 하드룰이다.

## 9. 참고 문서

- `docs/DEPLOYMENT_CHECKLIST.md` — 배포 전 점검 항목
- `docs/SECURITY_CHECKLIST.md` — GitHub 권한 프로필 기준
- `spec/BUILD_PLAN_PHASE2C.md` Wave 4 — todo 9·10 원문
- `spec/WORK_SPEC.md` §13 — receipt 포맷 정본
- `.omo/evidence/phase2c/wave-4-todo-10.md` — 도메인 채택 시 실제로 손댄 지점(§2의 실행 예시)

---

## 10. 모니터링·알림 런북 (2026-09-03 추가)

배포 체크리스트의 운영 항목 3종(관측 대상 / 알림 대상 / 롤백 준비)을 실행 절차로 옮긴 것이다. **새 자격증명·유료 서비스를 도입하지 않는다** — 이미 있는 Fly·Vercel·Supabase 콘솔과 프로덕션 `DATABASE_URL`만 쓴다.

### 10.1 DB에서 보이는 것 — `pnpm ops:health`

```bash
DATABASE_URL="<프로덕션 세션 풀러 URL>" pnpm ops:health
```

읽기 전용 단일 쿼리(`scripts/ops-health.ts`)로 7개 신호를 판정해 한 줄씩 출력하고, `ok`가 아니면 종료 코드 1을 낸다. 페이로드·프롬프트·토큰·프로바이더 키는 읽지 않는다 — 집계값과 시각만 나온다.

| 신호                         | 판정  | 의미                                                          |
| ---------------------------- | ----- | ------------------------------------------------------------- |
| `access-event-retention`     | alert | 보존 기간을 넘긴 access event가 남아 있다 = 일일 prune 미동작 |
| `audit-write-coverage`       | alert | scan 잡 수 > `scan_requested` 감사 행 수 = 감사 기록 유실     |
| `stale-leases`               | alert | 리스 만료 상태로 `running` = 워커가 잡 중간에 죽었다          |
| `credit-reservations`        | alert | reserve에 대응하는 settle·refund가 없다 = 예약 크레딧 미정산  |
| `queue-depth`                | warn  | queued+running > 25 = 드레인 루프 정지 의심                   |
| `permanent-failures`         | warn  | 재시도 소진 실패 > 5 = 프로바이더·잡 종류 계통 실패           |
| `webhook-delivery-freshness` | warn  | 최신 수신 delivery가 24시간보다 오래됐다 = webhook 경로 단절  |

임계값 근거는 `DEFAULT_OPS_HEALTH_THRESHOLDS` 주석에 실측과 함께 적혀 있다. 2026-09-03 프로덕션 실측은 전 항목 `ok`(`.omo/evidence/phase2c/followup-deployment-checklist.md`).

**권장 주기:** 파일럿 규모에서는 사람이 하루 1회 + 배포 직후 실행. 무인 스케줄링은 러너 자격증명이 필요하므로 도입하지 않았다.

### 10.2 DB에서 보이지 않는 것 — 콘솔에서 봐야 하는 신호

거절된 webhook과 RLS 거부는 **저장되기 전에 끝나므로** DB에 흔적이 없다. 이 셋은 콘솔 로그에서만 보인다.

| 신호                 | 어디                                                                                                             | 무엇을 찾나                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| webhook 4xx/5xx      | GitHub App → Advanced → **Recent Deliveries** (7일 보존) / Vercel → 프로젝트 → Logs, `/api/github/webhooks` 필터 | 200 아닌 응답. `401` 연속 = 서명 불일치, `503 github_webhook_not_configured` = 시크릿 누락 |
| 반복 서명 불일치     | 같은 두 곳                                                                                                       | 짧은 시간에 `401`이 반복되면 위조 시도 — 시크릿 회전 전에 **먼저 원인 확인**               |
| 교차 테넌트·RLS 오류 | Supabase → Logs → Postgres, `permission denied` / `row-level security` 검색                                      | 정상 운영에서는 0건이어야 한다. 1건이라도 나오면 해당 쿼리 경로를 즉시 조사                |
| 워커 드레인 루프     | `flyctl logs -a arr-worker`                                                                                      | 잡 클레임·완료 로그가 멈췄는지. **HTTP 헬스체크는 없는 게 정상**                           |
| 워커 재시작·OOM      | `flyctl status -a arr-worker`, `flyctl releases -a arr-worker`                                                   | 의도하지 않은 버전 변화나 재시작 반복                                                      |

로그를 볼 때 **페이로드·시크릿을 복사해 붙여넣지 말 것** — evidence에는 상태 코드·건수·시각만 남긴다.

### 10.3 알림 (파일럿 수준)

전용 알림 파이프라인은 자격증명이 필요해 도입하지 않았다. 파일럿 동안의 대체 수단:

- **Fly**: 앱이 죽으면 Fly가 계정 이메일로 알린다(기본 동작).
- **Vercel**: 프로젝트 → Settings → Notifications에서 배포 실패 알림이 기본 켜져 있다.
- **Supabase**: 프로젝트 → Settings → Integrations에 무료 알림 훅 없음 — 위 10.1을 사람이 돌리는 것이 현재의 알림이다.
- 유료 알림(예: Fly metrics + Grafana, Vercel Log Drains)은 **결정 필요** — `spec/OPEN_QUESTIONS.md` OQ-025.

### 10.4 롤백

| 대상         | 절차                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 웹 (Vercel)  | 프로젝트 → Deployments → 직전 성공 배포 → **Instant Rollback**. 커밋 되돌림 불필요                                             |
| 워커 (Fly)   | `flyctl releases -a arr-worker`로 직전 버전 확인 → `flyctl deploy -a arr-worker --image <직전 이미지>`                         |
| 마이그레이션 | **행을 지우는 롤백을 하지 않는다.** 되돌릴 것이 있으면 역방향 마이그레이션 파일을 새로 추가하고 `ALL_MIGRATIONS`에 등록해 적용 |

`private_migrations.schema_migrations`는 적용된 파일의 체크섬을 들고 있다. **이미 적용된 마이그레이션 파일을 수정하면** 다음 `pnpm db:migrate`가 `Applied migration checksum changed`로 멈춘다 — 이것은 안전장치이니 파일을 고치지 말고 새 파일을 추가한다.

사용자 데이터 삭제로 롤백하지 않는다는 원칙은 하드룰이다. 스키마를 되돌려야 하는데 데이터 손실이 불가피하면 **롤백하지 말고** 앞으로 고치는 마이그레이션을 쓴다.
