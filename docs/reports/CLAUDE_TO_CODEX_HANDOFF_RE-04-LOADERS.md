# Claude → 배포 Codex 인계 — RE-04 화면 로더 행 한도 (`/app/progress`·`/app/inspection`·홈·`/app/harness`)

작성 2026-09-24 KST · 로그 [`2026-09-24-screen-loaders-row-cap.md`](../frontend/logs/2026-09-24-screen-loaders-row-cap.md) · 선행 [지도 인계](CLAUDE_TO_CODEX_HANDOFF_RE-04-MAP.md) §6의 "다른 화면의 예산 없는 읽기"

**상태: LOCAL_VERIFIED.** 웹 전용이다(마이그레이션·워커·MCP 도구·카탈로그 변경 없음). 푸시·PR·배포 없음. 수치는 전부 로컬(PGlite + 실제 마이그레이션 + PostgREST 에뮬레이터, 로그인한 소유자로 row security 적용)이며 **운영 수치가 아니다.**

**현재(2026-09-25):** PR #37로 머지(`a01d45f`)·웹 배포(main `9f253e4`). §5의 운영 읽기 검증은 아직 하지 않았다.

## 1. SHA와 작업 공간

| 항목              | 값                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| 기준              | `81be59f` — `research/re-04-map-row-cap` 끝(로컬·미푸시). 그 아래 RE-04 cost `1aa7bd0`, main `488c0c4`   |
| 브랜치 / worktree | `research/re-04-loader-row-cap` / `C:/Users/axz14/Desktop/Project/Arr/re-04-loaders`                     |
| `fd72e38`         | 에뮬레이터가 화면 로더의 요청 모양을 읽음(`like`, `HEAD` count, json 경로 select). `ilike` 거부는 그대로 |
| `02b94c6`         | 네 로더를 행 한도 너머로 — 예산 없는 읽기는 예산 없이, 순서는 그대로                                     |
| 이 커밋           | 이 인계·frontend 로그·WORKLOG 한 줄                                                                      |
| 푸시 / PR         | **없음** — 승인 없는 push 금지                                                                           |

**스택이다.** `git fetch` 후 확인(2026-09-24, 작업 시작 시): `origin/main`은 `d8ade83`(PR #31)이고 RE-04 cost·map 브랜치는 아직 main에 없다. 그래서 map 브랜치 위에 쌓았다(`table-pages.ts`·에뮬레이터를 쓴다). 머지 순서는 **RE-04 cost → map → 이 브랜치**. `git merge-tree --write-tree`로 이 브랜치가 `origin/main`(`d8ade83`), RE-04 cost 끝 `df89846`(map에 없는 커밋), `research/re-04-stats-row-cap` `7dde5e7`과 각각 충돌 없이 합쳐지는 것을 확인했다. 합친 트리로 테스트를 돌리지는 않았다. stats 브랜치는 `PageRequest`를 받기만 하고 만들지 않으므로 이번에 추가한 필드와 부딪히지 않는다.

공유 루트(`app`)는 건드리지 않았다 — checkout/reset/stash/clean·`git add .` 없음, `RESEARCH_WORKBOARD.md`도 편집하지 않았다(읽기만; §7의 줄을 보드에 붙일지는 사용자 결정). 작성권: UI 트랙의 9개 파일(`home-screen.tsx` 등)은 건드리지 않았다. `journey.ts`는 실행 계획상 Claude 쪽이고, 빌더·내보낸 행 타입이 그대로라 UI 쪽 미커밋 변경과 겹치지 않는다.

## 2. 무엇이 바뀌었나

PostgREST는 `max_rows`(Supabase 기본·`supabase/config.toml` = 1,000)보다 많은 행을 말없이 자른다. 아래 읽기는 한 요청에 테이블 전체를 달라고 하고 돌아온 것을 전부로 여겼다. 이제 모두 페이지로 읽는다: 첫 페이지에 exact count, **테넌트 조건은 모든 페이지에**, 새 예산은 없다. 예산이 있는 읽기(100·50·20·1)는 요청 1개 그대로다. 한도 아래 테이블은 여전히 요청 1개다.

1. **`/app/progress`(`loadWorkspaceProgressReport`).** requirements·`implements` 엣지·todos → id 페이지. 커버리지 원장은 개수라 잘린 페이지가 화면의 모든 수치를 줄여 보고했다. todos는 이제 id 순(쓴 순서)으로 들어온다 — 전에는 순서를 요청하지 않았으므로, 칸반 열 안의 순서가 바뀔 수 있다.
2. **`/app/inspection`(`loadWorkspaceInspectionDashboard`).** 문서(`adr`·`instruction`·`spec`·`todo`)와 todos 개수 → id 페이지. 위험 행은 map 브랜치에서 이미 페이지였다. 화면 쪽 `page.tsx`의 judge jobs·judgments는 이번 범위 밖(§6).
3. **홈(`loadWorkspaceJourney`).** repositories·`mcp_tokens` → id 페이지. repositories는 `newestCreatedFirst`로 최신 생성 순으로 되돌린다 — 지도의 `newestFirst`를 `lib/shell/current-repository.ts`로 옮긴 것이라, 같은 시각에 만든 저장소가 여럿이어도 **홈과 지도가 같은 현재 저장소를 고른다.** `HEAD` count 셋·installations(1)·jobs(20)는 그대로다.
4. **`/app/harness`.** 읽기를 `lib/harness/harness-rows.ts`(`readHarnessRows`)로 옮겼다. instruction 파일은 페이지가 보여 주던 **DB의 `order by path`를 유지**한다. DB collation은 구두점·대소문자를 무시할 수 있어 TS 정렬로 재현할 수 없다(doc_pages 마이그레이션이 `collate "C"`를 쓴 이유와 같다). 그래서 `(path, id)` 위치 페이지로 읽는다(id는 두 저장소가 공유하는 경로의 동점만 가른다). 이 읽기는 예산이 없는데 `readRowsByPosition`은 그런 읽기를 거부한다(기존 테스트 유지). 그래서 새 `readEveryRowByPosition`을 썼다: 첫 페이지는 limit 없이 전과 같은 요청(동점 id와 count 추가)이고, 이후 range의 끝은 첫 페이지가 받은 exact count다(`PageRequest.total`). 저장소 이름은 id 페이지다.

공통 부품: `row-pages.ts`의 `PageRequest`에 `total` 추가(기존 읽기의 요청은 불변), `table-pages.ts`에 `readEveryRowByPosition`, `current-repository.ts`에 `newestCreatedFirst`.

## 3. 측정

**수정 전 red** — 에뮬레이터 cap 10, `drifted-demo`를 두 저장소에 투영 + 한도 너머 시드(`tests/screen-loaders-row-cap.test.ts`):

| 화면             | 수정 전(cap 10)                                                        | 한도 없음 = 수정 후(cap 10)                  |
| ---------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| progress         | 활성 requirement 8, 커버 4 → **50%**, todos 3/10                       | 19, 14 → **74%**, todos 7/27                 |
| inspection       | 문서 10, todos 3/10                                                    | 문서 63, todos 7/27                          |
| 홈               | 저장소 10, 활성 토큰 5, 현재 `local/seeded-0009`                       | 저장소 25, 활성 토큰 12, `local/seeded-0023` |
| harness          | 파일 10                                                                | 파일 31, DB `(path, id)` 순                  |
| 실제 한도(1,000) | 활성 requirement 800, 커버 600, todos·instruction 1,000, 활성 토큰 500 | 880, 660, 1,100, 550                         |

한도가 없어도 이전 harness 읽기는 두 저장소가 공유하는 경로의 순서를 DB 임의 순서로 남겼다(이번에 id로 고정).

**파일럿 쪽 기대치.** 지도 probe와 같은 방법(`488c0c4` 트리 → `scanRepository` → `apply_repository_scan`)으로 세면 문서 90행, instruction 파일 4행으로 한도보다 한참 적다. requirements·todos·`implements`는 analyze 잡이 쓰므로 로컬 재구성에서는 0이고, 이전 기록(`todo-16` 증거)에는 활성 requirement 127개가 있다. 토큰·저장소 수는 운영 값이라 세지 않았다. **따라서 파일럿에서는 배포 후에도 수치가 그대로인 것이 정상이다.** 이 수정은 1,000행을 넘는 작업 공간을 위한 것이다. 운영 개수는 읽지 않았다.

비용: 한도 아래에서 각 읽기는 전과 같이 요청 1개다. 페이지 읽기는 첫 페이지에서 `count(*)`를 1회 더 실행하고, 한도를 넘으면 1,000행마다 순차 요청이 1개씩 는다. 지연은 측정하지 않았다.

## 4. 실행한 명령·결과 (격리 worktree — 커밋 CI 아님)

| 명령                                                   | 결과                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm lint`                                            | clean                                                                                        |
| `pnpm typecheck`                                       | root + 6 projects clean                                                                      |
| `pnpm test`                                            | **220 files / 2,043 passed / 1 skipped** (기준 `81be59f`: 219 / 2,026 / 1, 차이는 신규 17건) |
| `pnpm vitest run tests/screen-loaders-row-cap.test.ts` | 9/9. 수정 전 코드로 8/9 실패(나머지 1건은 픽스처가 한도를 넘는지 보는 검사) — §3의 red 수치  |

기존 테스트의 단언은 하나도 바꾸지 않았다. `table-pages.test.ts`는 import만 늘었고 `readRowsByPosition`의 거부 테스트는 그대로다.

## 5. 배포 Codex에게 — 남은 검증 (전부 읽기 전용)

**배포 범위:** 웹만. 마이그레이션·워커 없음, **full 재스캔 금지**. push·PR·merge(=Vercel 배포)는 사용자 승인 사항이고, 순서는 §1(RE-04 cost → map → 이 브랜치)을 따른다.

0. **(선택, 배포 전) 운영 `max_rows` 확인.** cost·map 인계 0번과 같은 확인이다(대시보드, 읽기만).
1. **(선택, 사용자 승인) 파일럿 개수 확인.** requirements, todos, `implements` 엣지, `mcp_tokens`, repositories, instruction·문서 artifacts의 `count(*)`를 읽기만 한다. 1,000을 넘는 테이블이 있으면 그 화면의 수치는 배포 후 **달라져야 한다.** 없으면 수치가 그대로인 것이 정상이다.
2. **배포 후** `/app`, `/app/progress`, `/app/inspection`, `/app/harness`가 200을 돌려주고 수치가 배포 전과 같아야 한다(파일럿이 한도 아래일 때). progress 열 안의 todo 순서가 id 순으로 바뀌는 것은 정상이다.
3. 실패는 상태·경로·라벨만 기록한다. 롤백은 `02b94c6` revert다(단독으로 되돌릴 수 있다. `fd72e38`은 테스트 헬퍼뿐이다).

## 6. 이번에 하지 않은 것 — 다음 후보

아래는 대략적인 스윕(`apps/web`의 `.from(...)` 중 limit·single·head·쓰기가 없는 읽기)으로 찾아 코드를 읽어 확인만 한 목록이다. 고치지 않았다.

| 읽기                           | 위치                                                                    | 비고                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| repositories(헤더 현재 저장소) | `lib/shell/context.ts`                                                  | 예산 없음. `created_at desc` 동점은 DB 순이라 홈·지도(id desc)와 동점 규칙이 다를 수 있다           |
| repositories                   | `app/app/(shell)/settings/{ai,mcp}/actions.ts`                          | 같은 규칙                                                                                           |
| repositories(이름)             | `lib/commits/commit-cards-report.ts`, `lib/receipts/receipts-report.ts` | 이름 조회. 잘리면 카드의 저장소 이름이 빠진다                                                       |
| judge jobs·judgments           | `app/app/(shell)/inspection/page.tsx`                                   | 최신 순으로 읽고 대상별 최신만 쓴다. 보여 주는 requirement 8개로 대상 필터를 거는 편이 맞을 수 있다 |
| coach jobs                     | `app/app/(shell)/team/page.tsx`                                         | 같은 모양                                                                                           |
| library_items                  | `lib/library/library-store.ts`                                          | `content_snapshot`까지 담은 목록                                                                    |
| github_available_repositories  | `app/app/connect/github/repositories/page.tsx`                          | 저장소가 1,000개를 넘는 org 설치에서는 picker 목록이 잘린다                                         |
| stats                          | `lib/stats/pilot-report.ts`                                             | 별도 브랜치 `research/re-04-stats-row-cap`                                                          |

행 한도와는 별개로, progress의 receipts 읽기(limit 100)는 `summary` 전체를 가져온다(B-01과 같은 바이트 비용 문제).

## 7. 보드에 붙일 줄 (사용자가 원하면)

```text
claim: task=RE-04/screen-loaders-row-cap owner=Claude branch/worktree=research/re-04-loader-row-cap @ ../re-04-loaders base_sha=81be59f (research/re-04-map-row-cap tip, on RE-04 cost 1aa7bd0, on main 488c0c4) files=apps/web/lib/{progress/progress-report,inspection/inspection-report,home/journey,harness/harness-rows,shell/current-repository,map/workspace-map}.ts, apps/web/app/app/(shell)/harness/page.tsx, apps/web/lib/supabase/{row-pages,table-pages}{,.test}.ts, apps/web/lib/shell/current-repository.test.ts, tests/{screen-loaders-row-cap,postgrest-pglite}.test.ts, tests/helpers/postgrest-pglite.ts, docs/reports/CLAUDE_TO_CODEX_HANDOFF_RE-04-LOADERS.md, docs/frontend/{logs/2026-09-24-screen-loaders-row-cap.md,WORKLOG.md} started_at=2026-09-24 KST
handoff: implementation_sha=02b94c6 emulator=fd72e38 docs=+handoff tests=220 files/2,043 passed/1 skipped · 격리 worktree(커밋 CI 아님) red(cap 10)=progress 8/19 req·4/8 커버(50%→74%)·todos 10/27, inspection 문서 10/63, 홈 저장소 10/25·토큰 5/12, harness 10/31; 실제 한도=req 800/880·todos·instruction 1,000/1,100·토큰 500/550 pilot(로컬 488c0c4)=문서 90·instruction 4(한도 아래, 수치 불변 예상) unverified=운영 max_rows·운영 개수·합친 트리 테스트 next_owner=배포 Codex(RE-04 cost → map → 이 브랜치 웹 배포 → 네 화면 200·수치 불변)
```

## 8. 다음에 실행할 첫 명령

```bash
git -C C:/Users/axz14/Desktop/Project/Arr/re-04-loaders log --stat 81be59f..HEAD
```

읽기 리뷰 순서: `apps/web/lib/supabase/row-pages.ts` → `table-pages.ts`(`readEveryRowByPosition`) → `apps/web/lib/progress/progress-report.ts` → `apps/web/lib/inspection/inspection-report.ts` → `apps/web/lib/home/journey.ts`·`lib/shell/current-repository.ts` → `apps/web/lib/harness/harness-rows.ts` → `tests/screen-loaders-row-cap.test.ts`.
