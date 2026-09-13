# Claude → Codex 배포 인수인계: 라이브 발광 브리지 + HUD 실데이터 (Phase 4 todo 15 · todo 24 마무리)

작성: 2026-09-13 · 대상: Alrescha 배포를 담당하는 Codex
상태: **프로덕션 배포·관측 완료 (2026-09-13)** — `202609130001` 적용·정책 1행 확인 후 PR #16 merge `5b8942a`, Vercel 성공. `search_index` 1회 → 새로고침 없이 발광 5개·피드 수신, HUD/inspection 위험 순위 일치. 승인된 임시 읽기 토큰 취소 완료, 크레딧 18 유지. Fly v20·환경변수 무변경, 큐 0·새 실패 0·기존 15 WARN. [프로덕션 기록](../../.omo/evidence/phase4/pr16-production-rollout-2026-09-13.md). 필수 후속 구현 없음; OQ-069 사용자 결정 대기.
브랜치: `phase4/todo-24-15` (`main@26b0d1d` 기준) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/todo-15.md`](../../.omo/evidence/phase4/todo-15.md), [`.omo/evidence/phase4/todo-24.md`](../../.omo/evidence/phase4/todo-24.md), 프론트 로그 [`docs/frontend/logs/2026-09-13-live-glow-bridge-hud.md`](../frontend/logs/2026-09-13-live-glow-bridge-hud.md).

## 1. 왜

D10: 호스티드 MCP 서버는 Phase 2A부터 툴 호출마다 `access_event`를 브로드캐스트했고 맵은 `window` 버스를 들었지만, 그 둘을 잇는 구독이 브라우저에 한 번도 없었다. 라이브 화면의 발광은 데모 재생 버튼으로만 켜졌고 HUD 지표는 상수였다. todo 15는 그 선을 잇고 HUD를 실데이터로 바꾼다. todo 24는 남아 있던 브라우저 수용 기준(두 테마 axe·실레포 ±10%)을 실측으로 닫았다.

## 2. 변경 파일과 동작

| 파일                                                                                                                                           | 동작                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/202609130001_access_events_channel_policy.sql`                                                                            | `realtime.messages`에 `select` 정책 1건: `authenticated`가 broadcast 프레임을, 토픽이 `workspace:<id>:access-events`이고 `public.is_workspace_member(<id>)`일 때만. **insert 정책 없음**(브라우저는 듣기만). `realtime.messages`가 없는 DB(PGlite·평범한 Postgres)에서는 no-op으로 기록. |
| `apps/web/lib/mcp/supabase-store.ts`                                                                                                           | `publishAccessEvent`가 **private 토픽**으로 `httpSend`. public 발행은 private 구독자에게 도달하지 않음을 프로브로 확인했다. service role은 정책을 우회하므로 서버 발행은 그대로 성공한다.                                                                                                |
| `apps/web/lib/realtime/{access-events,supabase-bridge}.ts`, `app/ui/workspace-realtime-bridge.ts`                                              | 브라우저가 private 채널을 구독해 6개 필드만 화이트리스트로 복사한 뒤 `window` 버스로 재전달. 테넌트·revoked 필터 2겹, 지수 백오프 재접속(1s→30s), `main[data-live-channel]`로 상태 노출.                                                                                                 |
| `apps/web/lib/map/workspace-map.ts`, `lib/inspection/inspection-report.ts`                                                                     | `WorkspaceMapModel.hud`(미해소 Findings·커버리지 basis·마지막 스캔 commit/신선도·위험 상위 3). 위험은 inspection 로더와 **같은 질의·같은 매핑**(추출한 `riskRowQueries`/`riskMapFromRows`/`loadWorkspaceRiskMap`). `implements` 엣지는 패밀리 예산 밖의 별도 카운트 질의.                |
| `apps/web/app/app/(shell)/map/map-screen.tsx`, `styles/screens/map-hud.css`, `lib/strings/map.ts`                                              | 레일에 HUD 칩 3개(출처 문장 포함)·위험 상위 목록·채널 상태 문구.                                                                                                                                                                                                                         |
| `apps/web/lib/dashboard/{graph-model,demo-harness}.ts`, `app/ui/{dashboard-screen,overview-screen}.tsx`, `lib/strings/{dashboard,overview}.ts` | 데모 상수(4·84·71·1,840) 제거 → 픽스처에서 유도(5·75%·50%·80, no-CI는 `측정 안 됨`). 데모 하네스 행을 공유 모듈로 이동. 데모 라우트 e2e 단언은 유지(문구만 함수 호출로).                                                                                                                 |
| `tests/e2e/{live-glow,instruction-cost,dashboard-hud,dashboard,pilot-flow}.spec.ts`, 단위 테스트 4종                                           | 수용 기준 테스트. 아래 §3.                                                                                                                                                                                                                                                               |
| `spec/BUILD_PLAN_PHASE4.md`, `spec/OPEN_QUESTIONS.md`(OQ-069), `.omo/evidence/phase4/todo-{15,24}.md`, `docs/frontend/{WORKLOG.md,logs/…}`     | 체크박스·근거·로그.                                                                                                                                                                                                                                                                      |

core·워커·MCP 패키지·의존성 무변경. `packages/mcp` 계약(툴 22종·stateless)은 손대지 않았다.

## 3. 테스트·게이트 (브랜치 팁)

- `pnpm lint` clean · `pnpm typecheck` clean(root+workspaces) · `pnpm test` **192 files / 1,769 passed / 1 skipped** · `scripts/verify-scope-boundaries.ts` PASS(12 boundaries, 367 files) · `git diff --check` clean.
- Playwright: `live-glow.spec.ts` 3/3 — 실 토큰 `search_index` → 새로고침 없이 발광(27s), 타 워크스페이스 JWT의 private 조인 `CHANNEL_ERROR` + 그 맵은 계속 어둡다(22.6s), HUD 칩 = `loadWorkspaceMap` 결과(칩별 동등). `instruction-cost.spec.ts` 8/8 — `/app/harness`·`/app/stats` 두 테마 axe 위반 0(4파일), 이 레포 로컬 스캔의 표 합계 = 저장 `size_bytes`(행별) · 토큰 = 바이트/4 ±10% 이내. 전체 스위트: 158 passed / 1 skipped / 0 failed.
- 로컬 DB: `202609130001` 적용(`scripts/migrate.ts`), `access_events_channel_member_read` 정책 존재 확인.

## 4. 배포 필요 사항

- **마이그레이션** — **필요**: `202609130001_access_events_channel_policy.sql` (프로덕션 Supabase, `pnpm db:migrate` — 값 출력 금지). 정책 1건 추가만, 데이터 변경 없음, 기존 정책 무변경.
- **웹 배포** — **필요**(Vercel, 머지 시 자동).
- **워커 재배포** — 없음.
- **환경변수** — 없음. Realtime은 이미 켜져 있다(브로드캐스트를 Phase 2A부터 서버가 보내고 있었다).

**절차: 마이그레이션 → 웹 머지.** 순서가 중요하다: 웹이 먼저 나가면 브라우저가 private 조인을 시도하는데 정책이 없어 `CHANNEL_ERROR`로 재접속만 반복한다(발광 없음, 다른 화면은 정상). 반대로 마이그레이션이 먼저 나가면 현행 웹은 구독을 하지 않으므로 아무 변화가 없다 — 안전한 순서다.

1. 프로덕션 Supabase에 `pnpm db:migrate`. 확인: `select policyname from pg_policies where schemaname='realtime' and tablename='messages';` → `access_events_channel_member_read` 1행.
2. PR을 merge commit으로 머지 → Vercel 배포 확인.
3. 검증(프로덕션, 크레딧 0): 본인 워크스페이스에서 `/app/map`을 열고 피드 옆 배지가 `실시간 수신 중`으로 바뀌는지 본다(`main[data-live-channel="live"]`). 발급된 MCP 토큰으로 `search_index`를 1회 호출(Claude Code·Codex 어느 클라이언트든) → 새로고침 없이 노드가 빛나고 피드에 `search_index` 행이 보인다. 이 호출은 결정론 툴이라 크레딧을 쓰지 않는다.
4. HUD: 레일의 `미해소 Findings`·`구현 커버리지`(basis 문구)·`마지막 스캔`(commit 7자 + 경과)·`위험 상위` 목록이 `/app/inspection`의 위험 위젯과 같은 파일을 같은 순서로 보이는지 확인.
5. `pnpm ops:health`: 변화 없음이 정상(잡·큐 무관).

## 5. 롤백 지점

- 웹: 이전 Vercel 배포로 되돌리면 구독이 사라진다. 정책은 남아 있어도 무해하다(읽기 정책일 뿐).
- 정책: `drop policy access_events_channel_member_read on realtime.messages;` — 적용된 마이그레이션 파일은 수정하지 않고, 필요하면 새 파일로 드롭한다.
- 데이터 변경 없음.

## 6. 예상과 다른 점

- 발광 프레임은 서버가 **private 토픽**으로 보내야 도달한다. 이전 코드(public)는 구독자가 없었기 때문에 티가 나지 않았을 뿐이다.
- revoked 토큰 집합은 페이지 로드 시점 스냅샷이다(OQ-069). 폐기된 토큰은 서버가 호출을 거부하므로 새 프레임이 오지 않는다.
- 데모 `/map`의 숫자가 바뀌었다(4·84%·71%·1.8k → 5·75%·50%·80). 상수를 픽스처 유도로 바꾼 결과이며 의도된 변화다.
- Codex가 같은 체크아웃에서 동시에 편집한 두 파일(`.omo/evidence/phase4/pr14-production-rollout-2026-09-13.md`, `docs/reports/CLAUDE_TO_CODEX_HANDOFF_2026-09-13-enrich-archive.md`)은 PR #16에 포함하지 않았다. 사용자 요청에 따라 Codex의 이번 프로덕션 기록 커밋에 함께 보존한다.

## PR

- <https://github.com/2klips/alrescha-app/pull/16> — 커밋 3건: todo 24(`f3de893`), todo 15(`46826da`), 인계 문서(`e652064`). 마이그레이션 적용 후 merge commit `5b8942a`로 머지 완료(2026-09-13).
