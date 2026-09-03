# 후속 — 배포 체크리스트를 프로덕션 실측과 맞추고 운영 항목 닫기 (2026-09-03)

`docs/DEPLOYMENT_CHECKLIST.md`는 프로덕션이 2026-08-27부터 살아 있는데도 **체크박스가 전부 비어 있었다.** 이 작업은 ⑴ 각 항목을 읽기 전용 수단으로 실측해 증거가 있는 것만 체크하고 ⑵ 진짜로 열려 있던 운영 항목을 구현한 것이다.

실측 시각: **2026-09-03 14:00–14:20 UTC**. 모든 프로브는 읽기 전용이며, `DATABASE_URL`·시크릿 값은 어디에도 출력·기록하지 않았다.

## 실측 수단

| 대상            | 수단                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------- |
| DB              | `flyctl ssh console -a arr-worker -C "node -e ..."` — 워커 컨테이너의 `postgres` 드라이버로 조회 |
| Fly             | `flyctl status`, `flyctl secrets list` (이름·다이제스트만)                                      |
| GitHub App      | 워커 안에서 App 개인키로 JWT 서명 → `GET /app`, `/app/installations`, `/app/hook/config`, `/app/hook/deliveries` |
| Supabase Auth   | `GET <SUPABASE_URL>/auth/v1/authorize?provider=github`의 302 Location (공개 리다이렉트)         |
| 웹              | 익명 `curl -o /dev/null -w "%{http_code}"` + 사용자 로그인 Chrome으로 인증 화면 2종             |
| Vercel 배포     | `gh api repos/2klips/alrescha-app/commits/2bd34bb/status`                                       |

> **ssh 프로브 주의(재확인됨):** 한 번에 하나만 실행해야 하고(동시 실행 시 hang), 끝에 붙는 `Error: The handle is invalid.`는 무해하다. SQL 문자열 리터럴은 `String.fromCharCode(39)`/`chr()`로 만들어야 인용부호가 살아남는다.

## 실측 결과

### 마이그레이션·보안 객체 (체크 ✔)

```
MIG    [{"n":40,"oldest":"202608100001_auth_tenancy.sql","latest":"202609020002_requirement_judgment_enqueue.sql"}]
TABLES access_events,credit_ledger,graph_nodes,jobs,receipts,security_audit_events,workspace_security_rate_limits
FUNCS  audit_scan_job_request,consume_workspace_security_limit,prune_expired_access_events,record_security_audit_event,revoke_github_installation
EXT    -            (pg_cron 미설치)
AVAIL  1            (pg_available_extensions에 pg_cron 있음)
CRONSCHEMA 0        (cron 스키마 없음)
PG     17.6         (supabase/config.toml major_version = 17 과 일치)
```

`202608100009_release_hardening.sql`을 포함해 40건 전량 적용. 체크리스트가 요구한 두 테이블과 revocation 함수 모두 실존.

### Fly 워커 (체크 ✔)

```
Image  arr-worker:deployment-01M1H7G6E1AY8DNRX26JVD44HA
worker 48e7e62f574d58  v13  nrt  started  2026-09-02T14:14:31Z
secrets ANTHROPIC_API_KEY, DATABASE_URL, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_SLUG, OPENAI_API_KEY
```

**`BYOK_ENCRYPTION_KEY`는 없다** — 파일럿에 BYOK 경로가 없으므로 필수가 아니다(OQ-027에 기록).

### GitHub App (체크 ✔ — 단, 항목 문구가 틀렸다)

```
APPNAME  arr-dev-2klips           (html_url https://github.com/apps/arr-dev-2klips)
EVENTS   ["check_run","push","workflow_run"]
PERMS    {"actions":"read","checks":"read","contents":"read","metadata":"read"}
INSTALLS 1  → account 2klips, repository_selection "selected", suspended_at null
HOOK_CONFIG {"content_type":"json","insecure_ssl":"0","secret":"********",
             "url":"https://arr-app-web.vercel.app/api/github/webhooks"}
DELIVERIES 25건 전부 push / status_code 200 (2026-09-01 14:06 ~ 2026-09-03 13:18)
```

- 권한이 `GITHUB_READ_ONLY_PERMISSIONS`와 **정확히 일치**하고 `pull_requests`는 없다 → `docs/SECURITY_CHECKLIST.md` 프로필 충족.
- webhook URL은 HTTPS, `insecure_ssl = 0`, 시크릿 설정됨. 수신 delivery 200/200.
- **체크리스트 문구 수정:** 항목은 `installation` 이벤트 구독을 요구했지만, GitHub 문서는 `installation`에 대해 "All GitHub Apps receive this event by default. You cannot manually subscribe to this event."라고 명시한다(`installation_repositories`도 동일). 즉 **구독 체크박스가 존재하지 않으므로** 요구 자체가 이행 불가능한 문구였다. 핸들러는 `packages/core/src/github/webhook.ts`에 있고 서명 픽스처 테스트도 있다. 항목에서 `installation`을 빼고 그 이유를 주석으로 남겼다.
- 콜백 URL은 API로 노출되지 않는다. 대신 **2026-08-27 13:48:23 UTC의 실제 설치**가 `/api/github/callback`(HTTPS)을 통과했음이 감사 이벤트로 남아 있다.

### 로그인 OAuth App — OQ-017 ⑴ 프로덕션 확인 (체크 ✔)

`GET <SUPABASE_URL>/auth/v1/authorize?provider=github` → `302`

```
https://github.com/login/oauth/authorize?client_id=<OAuth App>&redirect_uri=
  https%3A%2F%2F<REF>.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=user%3Aemail
```

리다이렉트의 client_id를 워커 안에서 GitHub App의 `client_id`와 **직접 비교**해 `OAUTH_IS_SEPARATE_APP true`를 얻었다(값은 출력하지 않음). scope는 `user:email`, 콜백은 규정된 `<SUPABASE_URL>/auth/v1/callback`. → **전용 OAuth App이 프로덕션에서 실제로 쓰이고 있다**; GitHub App 자격증명 재사용 아님, 최소 권한 가드레일 무손상.

### 웹 표면 (체크 ✔)

```
/                       200
/app/settings/privacy   307 -> https://arr-app-web.vercel.app/auth/login
/app/stats              307 -> https://arr-app-web.vercel.app/auth/login
/api/mcp                405           (GET 불허 — 라우트 살아 있음)
Vercel status(2bd34bb)  success
```

**인증 사용자 실측**(사용자 로그인 Chrome):

- `/app/settings/privacy` — credits 정책 렌더("결정론적 스캔은 credits를 전혀 쓰지 않습니다 …").
- `/app/stats` — "측정 꺼짐 / 파일럿 측정이 꺼져 있습니다" + 옵트인 버튼 렌더.

둘 다 파일럿 사용자에게 도달 가능. 익명 307은 라우트가 404가 아님을 함께 증명한다.

### 시크릿 — 값 없이 존재 증명 (체크 ✔)

Vercel 환경변수 목록은 이 에이전트가 읽을 수 없었다(연결된 Vercel MCP는 팀 `ao2` 범위이고, 프로덕션 프로젝트는 `2klips-projects` 소속). 대신 **기능으로** 증명했다:

| 값                                    | 기능 증거                                                            |
| ------------------------------------- | -------------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET`               | GitHub delivery 로그 보존 창 25건 전부 `200` + 수용 delivery 35건 저장(없으면 `503 github_webhook_not_configured`) |
| `GITHUB_APP_*`, `GITHUB_INSTALL_STATE_SECRET` | 2026-08-27 설치가 서명 state 콜백을 통과                     |
| `SUPABASE_SERVICE_ROLE_KEY`           | 서버 렌더 화면(receipts·stats)이 admin 경로로 데이터를 읽는다        |
| `NEXT_PUBLIC_*` 3종                   | 익명 리다이렉트가 정상 동작하고 인증 화면이 렌더된다                 |
| `ANTHROPIC_API_KEY`                   | 2026-09-02 판단 잡 성공(claude-sonnet-5)                              |

### 운영 데이터 (모니터링 임계값 근거)

```
AUDIT      github_installation_connected(github) 1 @2026-08-27 13:48:24
           repository_selected(user) 1 @2026-08-27 13:48:40
           scan_requested(system) 35 @2026-09-03 13:18:00
RETENTION  access_event_retention_days = 30, 워크스페이스 1
ACCESS     1건, 2026-08-27 14:06:30 (유일) → 보존 초과 0건
REPOS      1 (스캔됨 1)          JOBS  succeeded 75 / failed 1
RECEIPTS   35 (최신 2026-09-03 13:19:25)   DELIVERIES  push 35
JOB_KINDS  scan 35✔ / analyze 35✔ / judge 3✔ / coach 2✔+1✘
SCAN_VS_AUDIT  scan_jobs 35, scan_requested 감사 35  → 감사 유실 0
RLS        public 테이블 43 / RLS 43 / force 40
LEDGER     grant 1(+50) · reserve 6(−33) · settle 5(0) · refund 1(+1), 잔액 18
```

**감사 메타데이터는 최소 3종뿐**(설치 연결·레포 선택·스캔 요청) — `index_pr_proposed`는 0건, 원본·프롬프트·토큰 없음.

**하드룰 #7 프로덕션 실증:** 실패한 `coach` 잡 `01M1GZZP57TAYMGJ28RBKACJHP`(3회 시도, `Anthropic judgment response was incomplete.`)의 원장은 `reserve:−1` → `refund:+1`. **실패한 AI 출력에 과금되지 않았다.**

**발견한 이탈:** `concepts`·`module_summaries`·`rationales` 3개 테이블은 RLS는 켜져 있고 정책도 있으나 `force row level security`가 없다(나머지 40개는 있음). 원본 마이그레이션 3건이 `force` 줄을 빠뜨렸고 프로덕션이 그대로 반영한 것. 앱 경로(`authenticated`/`service_role`)는 테이블 소유자가 아니므로 교차 테넌트 노출은 아니지만 레포 관행에서 벗어난다 → **OQ-028**.

## 구현 ①  일일 prune 스케줄

`supabase/migrations/202609030001_prune_access_events_cron.sql`

- `pg_available_extensions`에 `pg_cron`이 없으면 **notice 후 즉시 return** — PGlite(테스트 DB)와 pg_cron 없는 Postgres에서 무해한 no-op. cron 관련 문장은 전부 `execute` 동적 SQL이라 plpgsql이 `cron` 스키마를 **계획조차 하지 않는다**.
- `create extension if not exists pg_cron` → `cron.job`에 `alrescha_prune_access_events`가 **없을 때만** `cron.schedule`. 고정 job 이름 + 존재 확인으로 이중 등록 불가.
- 스케줄 `17 18 * * *` = 18:17 UTC = 03:17 Asia/Seoul(파일럿 운영자 시간대의 한적한 시각). 정시를 피한 분값.
- 스케줄러 역할은 함수 소유자인 마이그레이션 롤. pg_cron은 superuser에게만 다른 `username`을 허용하고 Supabase `postgres`는 superuser가 아니다 — `prune_expired_access_events`가 `security definer`이므로 어느 쪽이든 소유자 권한으로 실행된다(항목이 말하는 "service-role job"의 실질).

`tests/access-events-prune-schedule.test.ts` **4건**: pg_cron 없는 DB에서 no-op(cron 스키마 0, 함수는 존재) / 두 번 재적용 무오류 / 고정 job 이름 + 5필드 일간 cron 식 + 중복 방지 가드 / **cron에 넘기는 문장을 마이그레이션에서 추출해 실제로 실행** — 31일 된 access event 1건 삭제, 2일 된 1건 잔존. `ALL_MIGRATIONS`에 등록(다른 18개 테스트도 이 마이그레이션을 함께 적용한다).

**프로덕션 미적용 — 사용자 대기.** 확립된 경로는 사용자가 `.env.migrate`를 제공하고 에이전트가 스크립트를 돌린 뒤 사용자가 삭제하는 것이다. 이 세션에 `.env.migrate`가 없었다(`.env.local`은 로컬 dev용이므로 쓰지 않았다). 적용 명령:

```bash
node --env-file=.env.migrate --import tsx scripts/migrate.ts
```

적용 후 확인 프로브(값 노출 없음):

```
select jobname, schedule, active from cron.job where jobname = 'alrescha_prune_access_events';
```

**기한:** 유일한 access event가 2026-08-27이고 보존이 30일이므로 **2026-09-26**부터 보존 위반이 실제로 발생한다. 그때까지 적용하면 관측 가능한 지연은 없다.

## 구현 ②  모니터링 — `pnpm ops:health`

`scripts/ops-health.ts` — 새 자격증명 없이(기존 `DATABASE_URL`만) 도는 읽기 전용 단일 쿼리. 7개 신호를 `ok`/`warn`/`alert`로 판정하고 `ok`가 아니면 종료 코드 1. **페이로드·프롬프트·토큰·프로바이더 키를 읽지 않는다** — 집계값과 시각만 나온다.

alert 3종은 관측 가능한 불변식 위반이다: 보존 초과 행 존재(= prune 미동작), scan 잡 수 > 감사 행 수(= 감사 유실), 리스 만료 `running`(= 워커 사망), reserve에 대응하는 settle/refund 없음(= 미정산). warn 3종은 임계값 판단이다: 큐 적체 25, 영구 실패 5, delivery 침묵 24시간 — 전부 위 실측값에서 뽑았고 근거를 `DEFAULT_OPS_HEALTH_THRESHOLDS` 주석에 남겼다.

**DB로 보이지 않는 것을 정직하게 분리했다:** 거절된 webhook(4xx/5xx·서명 불일치)과 RLS 거부는 저장 전에 끝나므로 DB에 흔적이 없다 → 콘솔 감시 대상으로 `docs/DEPLOYMENT_RUNBOOK.md` §10.2에 위치와 검색어를 적었다. 유료 알림 파이프라인은 자격증명이 필요해 미도입(**OQ-025**).

`tests/ops-health.test.ts` **11건**: 실측 프로덕션 형상이 전 항목 ok / alert 4종 각각 / warn 3종의 경계값(임계값 = ok, +1 = warn) / 최악 등급으로의 승격 / 포맷 8줄 — 그리고 **쿼리를 ALL_MIGRATIONS 스키마에 실제로 실행하는 4건**: 빈 배포는 전부 0, scan 잡 하나가 큐 깊이·감사 커버리지에 잡히는지, 리스 만료·보존 초과·미정산 예약이 alert로 올라가는지, 대응 settle이 들어오면 해제되는지. 컬럼명이 바뀌면 이 테스트가 깨진다.

## 구현 ③  런북 §10 + 릴리스 기록

- `docs/DEPLOYMENT_RUNBOOK.md` §10 신설: 10.1 `pnpm ops:health` 신호표, 10.2 콘솔에서만 보이는 신호(위치·검색어·판독법), 10.3 자격증명 없이 가능한 알림의 실제 범위, 10.4 롤백(Vercel Instant Rollback / `flyctl deploy --image` / **전진 전용 마이그레이션**과 체크섬 가드가 안전장치라는 설명).
- `docs/DEPLOYMENT_CHECKLIST.md`: 문서 머리에 실측 시각과 이 파일 경로를 박고, 체크한 항목마다 **증거 한 줄**을 붙였다. 릴리스 기록 표(커밋·마이그레이션 버전·환경·운영자·UTC 시각·관측 상태·evidence 경로)와 알려진 한계 6종을 추가했다.

## 남긴 미체크 항목 (진짜 열려 있는 것)

1. **DB 백업·복원 리허설** — Supabase 대시보드 없이는 백업 스케줄조차 확인 불가하고, 복원 리허설은 수행된 바 없다. 남은 운영 항목 중 가치가 가장 높다.
2. **일일 prune 프로덕션 적용** — 위 구현 ①, `.env.migrate` 대기. 기한 2026-09-26.
3. **모집 베이스라인** — 외부 참가자가 없어 베이스라인이 존재하지 않는다. 체크리스트가 "below"라며 자기 문서 안의 절을 가리켰는데 그런 절은 없었다 → `PILOT_RECRUITMENT.md`로 정정.

## 게이트

수치는 커밋 메시지 참조. 신규 테스트 15건(prune 스케줄 4 + ops health 11).

## 실측 이후의 이동 (같은 날 병행 세션)

이 작업 중 `main`이 두 번 움직였다 — 병행 세션의 receipts 레일 수정(`233195a`, 14:09 UTC)과 성능 중기 과제 7커밋(`68be681`까지), 그리고 워커 **v14** 재배포(`deployment-01M1KTYZKH7CM2K3WHGATB5S0D`, 14:32:55 UTC). 위 실측값은 전부 **14:00–14:20 UTC 창의 프로덕션**(웹 `2bd34bb`, 워커 v13)에 대한 것이고, 릴리스 기록 표에 그 창을 명시했다.

재확인한 것: `233195a`·`68be681` 모두 Vercel `success`. 이동한 커밋들은 웹 그래프·MCP·스캔 fetch 경로를 건드렸을 뿐 이 작업이 실측한 대상(마이그레이션 원장·GitHub App 권한·OAuth App·감사 이벤트·보존 설정)과 겹치지 않는다. 리베이스 후 전체 게이트를 다시 돌려 green을 확인했다.

`spec/OPEN_QUESTIONS.md`에서 OQ-024를 병행 세션이 먼저 점유했으므로(MCP 툴 등록 비용) 이 작업의 항목은 **OQ-025~OQ-028**로 재번호했다.

## 배포 후 확인 (2026-09-03 14:44 UTC)

`b3dc578` push → **Vercel `success`**(컨텍스트 "Vercel"). 이 세션의 변경은 마이그레이션 파일·ops 스크립트·문서뿐이라 웹 동작 변화는 없다.

**`ops-health` 쿼리를 프로덕션에서 실제로 1회 실행했다** — 위 개별 조회들에서 추론한 것이 아니라, `OPS_HEALTH_SNAPSHOT_QUERY` 원문을 base64로 실어 보내 그대로 돌렸다:

```
SNAPSHOT [{"access_events_overdue":0,"audited_scan_requests":40,
  "newest_delivery_age_hours":"0.02030508083333333333","permanently_failed_jobs":1,
  "queue_depth":1,"reservations_unresolved":0,"scan_jobs":40,"stale_leases":0}]
```

판정: 보존 초과 0 → ok / scan 40 = 감사 40 → ok / 리스 만료 0 → ok / 미정산 예약 0 → ok / 큐 1(방금 push의 스캔이 진행 중, ≤25) → ok / 영구 실패 1(≤5) → ok / 최신 delivery 73초 전(≤24h) → ok. **전 항목 ok** — 즉 `pnpm ops:health`는 프로덕션에서 종료 코드 0이다.

부수 확인 2건:

- `newest_delivery_age_hours`가 postgres.js에서 **문자열**("0.0203…")로 온다(numeric 타입). `toOpsHealthSnapshot`이 `Number()`로 정규화하고 `OpsHealthRow`를 `number | string`으로 타이핑한 것이 실제로 필요한 처리였음이 확인됐다.
- scan 잡이 35 → 40으로 늘었는데 감사 행도 40으로 같이 늘었다 — 감사 트리거가 계속 성립한다.
