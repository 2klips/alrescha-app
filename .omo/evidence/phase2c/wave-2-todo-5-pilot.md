# Phase 2C todo 5 — GitHub 실기 파일럿 (2026-08-20/21)

G2가 열려(사용자가 App 등록·설치·push) 실기 파일럿을 완주 시도했다. **install → 연결 → push → webhook → 스캔 → 실데이터 그래프까지 도달**했고, 그 과정에서 **픽스처가 구조적으로 잡을 수 없는 결함 2건**이 드러났다. `analyze` 이후는 구현 자체가 없어 도달 불가로 확정됐다.

## 도달한 지점

| 단계 | 결과 |
| --- | --- |
| App 등록·권한·이벤트 | Actions/Checks/Contents/Metadata read-only, `push`·`check_run`·`workflow_run` — `assertMinimalGitHubPermissions`가 실 App 권한을 통과 |
| install → 콜백 → 레포 선택 | `github_installations`·`github_available_repositories`·`repositories` 행 생성 (installation 154681535, `2klips/LostArk_Scheduler`) |
| push → smee → webhook | 서명 검증 통과, `github_webhook_deliveries` 3건(push·check_run·workflow_run의 `completed`만; 나머지는 202 ignored) |
| run·job 생성 | run 3건, job 6건(run당 scan+analyze) |
| **scan 잡 실행** | **아티팩트 370개·graph_nodes 370개 저장**, `last_scanned_commit_sha` 갱신, 재실행 시 0행(멱등) |
| 커밋 카드 | `assurance=full` — ADR-015의 구분이 실 GitHub 관측 데이터에서 성립(로컬 인제스트는 `graph-only`) |
| analyze → findings → receipt | **도달 불가 — 구현 없음** |

## 결함 1 — GitHub 스캔 경로는 한 번도 저장에 성공한 적이 없다

`RepositoryScanStore.apply`가 플랜을 `${JSON.stringify(plan)}::jsonb`로 넘겼다. postgres.js는 보간된 문자열을 **jsonb 객체가 아니라 문자열 스칼라**로 보낸다:

```
${JSON.stringify(plan)}::jsonb → jsonb_typeof = 'string', ->>'touchedRows' = null
${sql.json(plan)}::jsonb       → jsonb_typeof = 'object', ->>'touchedRows' = '370'
```

그 결과 `apply_repository_scan` 안에서 `plan->>'treeSha'`와 `plan->>'touchedRows'`가 모두 null이 되어 **"변경 없는 커밋" 가드가 발동, 0을 반환하고 아무것도 쓰지 않는다.** 예외도 로그도 없다. 실측: 플랜 아티팩트 370개 → `store.apply` **0** → DB 0행. `sql.json`으로 고친 뒤 → **371** → DB 370행.

**왜 지금까지 안 잡혔나 (세 겹의 사각지대):**

1. 워커 루프를 실행하는 프로덕션 코드가 아예 없었다(아래 결함 2) — 이 코드는 한 번도 돌지 않았다.
2. 로컬 인제스트 경로는 같은 SQL 함수를 쓰지만 **PostgREST rpc로 객체를 넘긴다** → 정상 동작. 그래서 "두 경로 동등"이 참인 줄 알았다.
3. DB 테스트 하네스가 **PGlite**라 파라미터가 postgres.js 인코딩을 거치지 않는다 — 이 계층의 버그는 원리적으로 재현되지 않는다.

회귀 테스트는 그래서 DB가 아니라 **이음매**를 고정한다(`apps/worker/src/repository-scan-store.test.ts`): 태그드 템플릿을 가로채 플랜이 문자열로 넘어가면 실패. 위반 심기로 재증명(원래 코드로 되돌리면 1건 실패, 복원하면 통과).

## 결함 2 — 워커에 실행 진입점도, analyze 핸들러도 없다

`runWorkerOnce`는 Phase 2B부터 있었지만 **테스트 밖에서 호출하는 코드가 없다.** 핸들러 테이블을 구성하는 지점도, Dockerfile도, fly.toml도 없다. 계획 스냅샷의 "워커: 스캔·분석·판단·코칭이 잡 큐에 배선됨"은 **잡이 enqueue된다는 뜻이지 처리된다는 뜻이 아니었다.**

구현 현황을 실측하면:

- `scan` — `runRepositoryScan` + `RepositoryScanStore` 있음 (러너만 없었음)
- `judge`·`coach` — `createJudgmentJobHandler`/`createCoachingJobHandler` 있음
- **`analyze` — 핸들러 없음.** 규칙 엔진 `analyzeRepositoryAssurance`는 코어에 있지만 큐에 연결되지 않았다
- **`receipts` — 프로덕션 어디에도 행을 쓰는 코드가 없다** (테스트 insert 1곳뿐)

`apps/worker/src/run-local.ts`(신규)가 로컬 드레인 루프다. 구현된 핸들러만 등록하고 나머지는 명시적으로 실패시킨다 — 침묵으로 건너뛰지 않고 커밋 카드에 사유가 드러나게. 실제로 analyze 잡은 `No worker handler is implemented for 'analyze' jobs`로 재시도 상태가 된다.

**따라서 todo 5의 수용 기준 중 `full` 보증 카드까지는 충족, receipt 발급·검증은 기능 미구현으로 도달 불가다.** 이건 파일럿의 실패가 아니라 파일럿이 밝혀낸 사실이다.

## 결함 3 — 같은 출처 가드가 호스트 별칭에서 깨진다

`apps/web/app/api/github/repositories/route.ts:10`이 `Origin` 헤더와 `new URL(request.url).origin`을 비교하는데, Next dev의 `request.url`은 Host 헤더와 무관하게 서버가 바인딩한 호스트로 정규화된다. 실측:

```
Origin: http://127.0.0.1:3000 → {"error":"invalid_origin"}  (403)
Origin: http://localhost:3000 → {"error":"unauthorized"}    (401, 가드 통과)
```

즉 사용자가 `127.0.0.1`로 접속하면 **상태 변경 POST가 전부 403**이다. 픽스처 테스트는 요청 URL과 Origin을 같은 문자열로 만들어 넣으므로 구조적으로 못 잡는다. 파일럿은 `localhost`로 우회했고, **가드 자체는 아직 고치지 않았다** — 프로덕션 도메인이 확정되는 Wave 4에서 허용 출처를 명시 설정으로 바꾸는 것이 맞다.

부수적으로 `NEXT_PUBLIC_APP_URL`만 `localhost`였고 나머지(GitHub 콜백·Supabase site_url·Playwright baseURL)는 `127.0.0.1`이었다 → `127.0.0.1`로 정렬했다.

## OQ-017 — GitHub 로그인이 최소 권한 App과 양립 불가

Supabase GitHub provider가 콜백에서 `GET /user/emails`를 호출하는데 App에 계정 권한이 없어 **403 `Resource not accessible by integration`**. 그 권한을 켜면 `assertMinimalGitHubPermissions`가 초과로 거부한다. `email_optional`로도 안 된다(호출 자체가 403). 상세와 선택지는 `spec/OPEN_QUESTIONS.md` OQ-017. 파일럿은 하네스 세션(`tests/e2e/helpers/session.ts`와 같은 방식)으로 우회했고 **제품의 GitHub 로그인 경로는 미검증**으로 남는다.

## 운영에서 배운 것

- **배달은 다시 받을 수 있다.** GitHub은 App webhook 배달을 보관하고 재전송한다 → `scripts/replay-github-deliveries.ts`(신규). 노트북에서 도는 파일럿은 터널·서버·Docker가 수시로 죽는데, 그때마다 다시 push할 필요가 없다. 함정 둘: ⑴ **배달 id가 `Number.MAX_SAFE_INTEGER`를 넘어** `JSON.parse`가 반올림한다 → 전부 404. 원문 텍스트에서 id를 문자열로 뽑는다. ⑵ push가 check/workflow보다 **먼저** 도착해야 한다 → 오래된 것부터 간격을 두고 재전송.
- **스캐너가 이 레포에서 뽑은 분류**: `code_metadata` 368, `claude` 1, `agents` 1. `docs/` 아래 마크다운 수십 개는 spec/adr/todo 어디에도 걸리지 않았다 — 분류 규칙이 경로·파일명 패턴에 묶여 있다는 실데이터 관측. 버그로 단정하지 않고 기록만 남긴다.

## 검증

- vitest **730/731**(1 skip = win32 심링크) · Playwright **111/111**
- lint(`--max-warnings=0`)·typecheck·`format:check` green
- `verify-scope-boundaries.ts` **PASS: 12 boundaries, 233 files** · `adr-guardrails.ts` exit 0
- 실기: 아티팩트 370 · graph_nodes 370 · run 3 · scan job 3건 succeeded · 카드 `assurance=full`

## 남은 것

1. **analyze 핸들러 + receipt 발급 구현** — todo 5의 미달 부분이자 별도 작업 단위. 규칙 엔진은 있으므로 "큐 연결 + receipt 기록"이 범위다.
2. **같은 출처 가드 수정**(결함 3) — Wave 4 도메인 확정과 함께.
3. **OQ-017 판정** — 로그인 전용 OAuth App 분리가 기본 후보(사람 준비물).
4. 워커 프로덕션화(진입점·컨테이너·배포) — Wave 4.
