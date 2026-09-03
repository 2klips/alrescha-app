# 후속 — `/app/receipts` 실 receipt 상세 표면 + OPEN_QUESTIONS 상태 드리프트 정리 (2026-09-02)

OQ-022 ⑴(읽기 측 레거시 수용)로 프로덕션 receipt 28건이 전부 검증 가능해진 직후, 그 receipt를 실제로 보여 주는 표면을 만들었다. 지금까지 `/app/commits`의 "Receipt 보기"는 **데모 체인 `/receipts?receipt=<실 id>`로 보냈고**(fixture에 없는 id → 데모 첫 항목 표시), 셸 헤더의 receipt 링크도 `/app/commits`로 우회하고 있었다.

## 설계

- **로더** `apps/web/lib/receipts/receipts-report.ts`: `buildWorkspaceReceipts(rows, repositories)`는 순수·비동기 — 행마다 `summary.statement`를 `storedInTotoStatementSchema`로 파싱하고 `verifyInTotoStatement(statement, digest)`를 **서버에서** 실행해 `verification`(verified/tampered/invalid + `toolName`)을 붙인다. 파싱 실패·digest 없음은 **invalid로 남겨 표시**(버리지 않음 — 읽을 수 없는 receipt도 증거). `stale` = 레포의 `last_scanned_commit_sha`가 receipt commit과 다름. 발견 델타는 commits 보드의 `receiptFindings` 재사용. `loadWorkspaceReceipts`는 세션 클라이언트(RLS `receipts_select_member`)로 최근 50건 + repositories.
- **표면** `apps/web/app/app/(shell)/receipts/page.tsx` + `apps/web/app/ui/receipts-board.tsx`: 서버 컴포넌트(클라이언트 상태 없음). 레일은 `?receipt=<id>` 링크 목록(`aria-current`), 상세는 데모 `ReceiptDetail`과 같은 골격(`receipt-detail`·`receipt-fields`·`digest-panel`·`receipt-verdict`)에 레포·발급 시각·**발급 도구(tool.name/version)**·커버리지·발견 델타를 더했다. 검증 배지는 데모의 "검증 버튼 → pending" 대신 **렌더 시점에 계산된 결과**를 바로 보인다(§13 "receipt는 검증 가능해야 한다"를 표면이 스스로 증명). `toolName !== "alrescha"`면 **"리네임 이전 발급"** 표식. verified일 때만 evidence 판정(verified n · inferred m)이 열린다.
- **배선**: `CommitAnalysisBoard`에 `receiptsPath` prop(기본 `/receipts`, 워크스페이스 보드는 `/app/receipts`) → 실 카드의 "Receipt 보기"가 실 receipt로 간다. 셸 컨텍스트 `receiptsHref` → `/app/receipts`. 워크스페이스 nav records 그룹에 Receipts 추가. e2e 인증 화면 목록(`helpers/app-screens.ts`)·warm-up 라우트·한국어 카피 정책 목록에 신규 파일 등록.
- 카피는 `ASSURANCE.receipts.live`(한국어 우선 정책 통과). 데모 `/receipts`는 그대로 데모.

## 검증

- `apps/web/lib/receipts/receipts-report.test.ts` 5건: 저장 digest 재검증·필드 보존 / 레거시 `arr` receipt verified + `toolName "arr"` / 변조 → tampered / 스키마 불일치·digest 없음 → invalid(표시 유지) / stale 판정·레포 행 부재 시 id 폴백.
- `apps/web/app/ui/receipts-board.test.tsx` 5건: 빈 상태 / 링크 목록·선택 1건 / verified 판정·델타·commit 카드 링크 / 레거시 표식 + "arr 0.1.0" / invalid 표시·이슈 목록·판정 잠금.
- 게이트 수치와 e2e 결과는 아래·커밋 메시지 참조.

## OPEN_QUESTIONS 상태 드리프트 정리 (같은 커밋)

- OQ-004 → resolved(obsolete): 대상 `.arr-home`·`--arr-amber`가 코드에 없음.
- OQ-009 → resolved(ADR-010 §2): 임시 결정(텍스트 전용 파생 토큰)이 그대로 확정됐던 것.
- OQ-011 → resolved(ADR-012): 정확도 주장 철회·토큰 주장 유지. v3 실행은 판정이 아니라 실행 과제.
- 남은 open: OQ-012(낮은 우선순위), OQ-019, OQ-020, **OQ-021(pack kind — 사용자 판단 필요)**.

## e2e (로컬 Supabase, 2026-09-03)

- `tests/e2e/receipts.spec.ts` 신설 2/2: 빈 워크스페이스 → 빈 상태(데모 체인 아님) / 시드된 receipt 2건(현행 발급자 @ 최신 commit, `arr` 발급자 @ 이전 commit) → 레일 링크 2, 최신 상세 `data-verification="verified"`·판정 `verified 3 · inferred 1`·델타 `+2 / -1 · 열린 Findings 5건`·commit 카드 링크 → 레거시 클릭 시 `?receipt=` URL·verified·"리네임 이전 발급"·`arr 0.1.0`·stale 배너 → `/app/commits?run=`의 "Receipt 보기"가 `/app/receipts?receipt=<실 id>`. 스크린샷 `live-receipts/receipts-{current,legacy}-verified.png`.
- 인증 화면 순회에 `app-receipts` 편입: screens-theme(다크·라이트) · a11y-contrast(다크·라이트 AA 위반 0) 통과. 세 스펙 합계 **65 passed**.
- 운영 메모: Docker Desktop이 `sailor-ingest.sock: The file cannot be accessed by the system`으로 기동 실패 — `%LOCALAPPDATA%\Docker\run\`의 AF_UNIX 소켓 잔재는 Windows 쪽(del·Remove-Item·fsutil·move)으로는 지워지지 않고 `wsl -d docker-desktop -e sh -c "rm -f /mnt/host/c/…/Docker/run/*"`로 지우면 즉시 기동한다.

## 프로덕션 확인 (2026-09-03, 사용자 로그인 세션 · Chrome)

- `/app/receipts`: **Statement 32건**(28 + 이후 push 4). 최신 `416a847` — `digest 검증됨`, 기대·계산 digest 일치(`c91fb418…`), 발급 도구 `alrescha 0.1.0`, 커버리지 `요구사항 92 · 구현 verified 84 · 테스트 verified 0`, 판정 `verified 0 · inferred 30`, commit 카드 링크 동작. 헤더 "영수증" 링크 href `/app/receipts`.
- 레거시 `?receipt=01M11RD61P71AHRX525315EKAE`(`00d8f27`, 2026-08-27): **`digest 검증됨`** + **"리네임 이전 발급"** + 발급 도구 `arr 0.1.0` + 체인 시작점 + stale 배너 — OQ-022 ⑴이 실 표면에서 성립.
- **발견한 결함**: stale 배너가 "현재 commit **00d8f27**보다 이전"이라고 receipt 자신의 commit을 말했다(저장소의 최신 스캔 commit 416a847이어야 함). 보드가 `receipt.commitSha`를 넘기고 있었고 e2e도 같은 값을 기대해 통과했다 → `WorkspaceReceipt.headCommitSha`(레포 `last_scanned_commit_sha`) 추가, 배너는 그것을 표시, 단위·e2e 기대값 수정(보드 테스트 +1).
- 미조치 관찰: 레일이 32건이라 `?receipt=`로 깊은 항목을 열면 선택 항목이 스크롤 밖에 있다(기능 영향 없음, 후속 후보).
- 수정 배포 확인(`253782c`, Vercel success): 같은 레거시 receipt의 stale 배너가 **"현재 commit 253782c보다 이전입니다"** — 저장소의 최신 스캔 commit을 가리킨다.

## 후속 ⑵ — 딥링크 스크롤 + 레일 검증 요약 (2026-09-03)

위의 "미조치 관찰"(레일 32건에서 `?receipt=`로 오래된 항목을 열면 선택 항목이 스크롤 밖)을 처리했다. 서버 렌더 설계는 그대로 두고, 선택 신호도 계속 `aria-current` 하나다.

### 설계

- **레일 열이 sticky·1뷰포트**: `receipts-board.tsx`의 `aside > div.receipt-rail-sticky`가 `position: sticky; top: calc(var(--contextstrip-h) + 1.3rem); max-height: calc(100dvh - var(--contextstrip-h) - 2.6rem)`인 flex 열이고, 목록 `nav.receipt-list--live`만 `flex: 1 1 auto; min-height: 0; overflow-y: auto`로 **자기 안에서** 스크롤한다. `aside` 자체는 계속 stretch → 레일 배경·구분선은 페이지 전체 높이를 유지한다. 900px 이하 스택 레이아웃에서는 static으로 되돌린다(데스크톱 전용 트랙).
- **클라이언트 아일랜드** `apps/web/app/ui/receipt-rail-scroll.tsx`: `"use client"` + `useEffect` 한 개. `.receipt-list a[aria-current="true"]`를 찾아 `scrollIntoView({ block: "nearest" })`를 한 번 호출하고 `null`을 렌더한다. `block: "nearest"`라서 이미 보이는 항목은 그대로 두고, 레일을 위해 문서를 스크롤하지도 않는다. 보드는 서버 컴포넌트 그대로다.
- **레일 검증 요약**: 로더에 순수 함수 `countVerifications(receipts)` 추가 — 로더가 **이미 계산한** verification만 집계하므로 요약이 상세와 어긋난 판정을 말할 수 없다. 카피 `ASSURANCE.receipts.live.verificationSummary` → `verified 30 · 변조 0 · 무효 0`(한국어 우선 정책 통과: 허용 용어는 `verified` 뿐). 빈 워크스페이스에서는 렌더하지 않는다.

### 첫 시도에서 드러난 결함

목록(`nav`)만 sticky로 만들었더니, 스크롤 0에서 목록 상단이 레일 헤더(약 120px) 아래에서 시작해 **하단이 뷰포트 밖으로 약 99px 넘쳤다**. 그 결과 `scrollIntoView`가 문서까지 스크롤했고, 상세 제목이 sticky 셸 크롬에 가렸다 — e2e는 통과했지만 스크린샷에서 확인됐다. 헤더까지 포함한 **레일 열 전체**를 sticky·고정 높이로 바꾸니 스크롤 0에서 이미 제자리(`top`이 자연 위치와 정확히 일치)라 문서가 전혀 움직이지 않는다.

### 검증

- 단위 +5: `receipts-report.test.ts` 2건(집계 verified 2 / tampered 1 / invalid 1, 빈 목록 0), `receipts-board.test.tsx` 3건(레일 스크롤박스 클래스 + 선택 항목, 요약 `verified 2 · 변조 0 · 무효 1`, tampered 1건 집계). 빈 상태 테스트에 "요약 줄 없음" 단언 추가.
- e2e +1: `tests/e2e/receipts.spec.ts`에 receipt 30건(run 없음)을 시드하고 가장 오래된 것으로 딥링크 → 선택 항목 `toBeInViewport`, 레일 첫 항목 `not.toBeInViewport`(레일이 실제로 스크롤됐다는 뜻), 상세 `toBeInViewport`(문서는 안 움직였다는 뜻), 요약 `verified 30 · 변조 0 · 무효 0`. 기존 라이브 테스트에는 `verified 2 · 변조 0 · 무효 0` 단언 추가. 스크린샷 `live-receipts/receipts-deep-link-in-view.png`.
- **네거티브 컨트롤**: `scrollIntoView` 호출만 지우고 돌리면 선택 항목이 `viewport ratio 0`으로 실패 — 새 e2e가 실제로 이 결함을 잡는다. 확인 후 되돌렸다.

### 게이트

- `pnpm lint` 통과, `pnpm typecheck` 통과(웹 포함 6개 프로젝트), `pnpm exec vitest run` **138 파일 / 1023 passed | 1 skipped**.
- e2e(로컬 Supabase): `receipts` · `screens-theme` · `a11y-contrast` 합계 **66 passed**(직전 65 + 신규 1). `app-receipts`는 다크·라이트 테마 순회와 AA 대비 위반 0을 그대로 통과한다.
