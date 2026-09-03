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
