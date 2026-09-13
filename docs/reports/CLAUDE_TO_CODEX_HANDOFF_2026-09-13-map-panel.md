# Claude → Codex 배포 인수인계: todo 13 남은 다섯 항목 — 레이아웃 워밍·`/app/map` 힘 패널·Obsidian 옵션·도메인 앵커·style/config 레이어

작성: 2026-09-13 · 대상: Alrescha 배포를 담당하는 Codex
상태: **배포 대기 — 웹 머지만.** 마이그레이션·워커·환경변수 무변경.
브랜치: `phase4/wave-b-todo-13` (`main@c0d8aea` 기준) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/todo-13.md`](../../.omo/evidence/phase4/todo-13.md) ("Completed — 2026-09-13" 절), 프론트 로그 [`docs/frontend/logs/2026-09-13-map-panel-parity.md`](../frontend/logs/2026-09-13-map-panel-parity.md).

## 1. 왜

todo 13은 아홉 항목 중 넷만 끝난 채 열려 있었다(2026-09-07). 남은 다섯은 전부 "맵을 조종하는 패널" 쪽이었다: 레이아웃이 매 로드마다 나선에서 다시 시작했고, `/app/map`에는 힘 패널이 없었으며, Obsidian의 표시 옵션·그룹·프리셋·핀이 없었고, 도메인 앵커 슬라이더가 없었고, `style`·`config` 레이어는 노드가 분류를 모른다는 이유로 빠져 있었다. 이 PR이 다섯을 닫는다.

## 2. 변경 파일과 동작

| 파일                                                                                                                          | 동작                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/lib/graph/layout-store.ts`, `app/ui/layout-warmup.ts` (신규)                                                        | 안정된 레이아웃을 IndexedDB에 `layout:<workspace>:<commit>`로, 핀을 `pins:<workspace>`로 저장. 마운트 전에 읽어(1.5s 데드라인, 지나면 콜드 시작) 워커가 warm 시작. 순수 인코딩/디코딩은 손상 레코드를 통째로 거부. IndexedDB 거부 시 메모리 폴백.             |
| `apps/web/lib/graph/{simulation-protocol,force-simulation,worker-runtime}.ts`                                                 | start 메시지에 `initialPositions`(transferable, NaN=미지)와 노드별 `anchors`. warm 시작은 reheat alpha(0.3)에서. `ForceConfig.domainAnchorStrength`(0–0.05, 기본 0) — 0보다 클 때만 `forceX/forceY` 등록이라 기본 레이아웃은 바이트 동일.                     |
| `apps/web/lib/graph/domain-anchors.ts` (신규)                                                                                 | Data Brain 영역별 앵커를 원 위에 배치(`graphNodeArea`와 같은 답).                                                                                                                                                                                             |
| `apps/web/lib/graph/render-frame.ts`, `pixi-backend.ts`, `engine.ts`                                                          | 레이어 7종(`config`·`style`은 노드 `classification`으로), `availableLayers`. 표시 옵션(고아·화살표·노드 크기·링크 두께·그룹)을 프레임에서 적용 — `setDisplay`는 재시작 없음. 화살표는 스타일 그룹당 fill 1회. 지속 핀 API(`pinNodeAt/unpinNode/pinnedNodes`). |
| `apps/web/lib/graph/graph-panel-settings.ts`, `app/ui/graph-force-panel.tsx`                                                  | 설정에 표시 옵션·로컬 깊이·그룹(≤8, 토큰 6종)·프리셋(≤8) 추가, 저장소 값 클램프. 패널 섹션: 힘(+도메인 앵커)·표시·그룹·프리셋. 기본값 복원은 프리셋을 지우지 않는다.                                                                                          |
| `apps/web/app/ui/graph-layer-toggles.tsx` (신규), `dashboard-screen.tsx`, `app/app/(shell)/map/map-screen.tsx`                | 공용 레이어 토글(해당 노드 없는 레이어는 비활성 + 사유). `/app/map`: 필터=가시성(전체 그래프 + `visibleNodeIds`), 기존 공변경·개념 토글은 레이어로 흡수(테스트 id 유지), 힘 패널 팝오버, 인스펙터 핀 토글, 워밍 게이트·저장.                                  |
| `apps/web/lib/map/workspace-map.ts`, `lib/dashboard/graph-model.ts`, `lib/strings/dashboard.ts`, `styles/screens/map-hud.css` | `GraphNode.classification`, 문구, 스타일.                                                                                                                                                                                                                     |
| 테스트                                                                                                                        | `tests/graph-display.test.ts`(13)·`graph-layout-store.test.ts`(9) 신규, `graph-visibility.test.ts` +2, `graph-force-panel.test.tsx` +2(슬라이더 수 5→9 명시), `tests/e2e/map-panel.spec.ts`(6) 신규, `brain-map.spec.ts` +2.                                  |

core·워커·MCP·SQL·의존성 무변경.

## 3. 테스트·게이트 (브랜치 팁)

- `pnpm lint` clean · `pnpm typecheck` clean · `pnpm test` 194 files / 1,796 passed / 1 skipped · `scripts/verify-scope-boundaries.ts` PASS · `git diff --check` clean.
- Playwright 전체: 166 passed / 1 skipped / 0 failed. `map-panel.spec.ts` 6/6(`/app/map` 실스캔 위: 패널 값 유지·필터=가시성·config 레이어 켜짐/style 비활성·고아 정확 개수·핀 새로고침 유지·레이아웃 저장+warm 마운트), `brain-map.spec.ts` 데모 +2(비활성 레이어·프리셋 왕복).
- 브라우저가 가르친 것 둘(제품 결함 아님): 툴바 `.arr-focus`와 범례는 80rem 아래에서 접히는데 Playwright 기본 뷰포트가 정확히 1280이라 새 스펙은 1440으로 고정했다. 그룹 스와치 토큰은 legacy 팔레트 검사에 걸려 `accent-fg`/`danger-fg`로 바꿨다.

## 4. 배포 필요 사항

- **마이그레이션** — 없음.
- **웹 배포** — **필요**(Vercel, 머지 시 자동).
- **워커 재배포** — 없음.
- **환경변수** — 없음.

**절차: 웹 머지만.**

1. PR을 merge commit으로 머지 → Vercel 배포 확인.
2. 검증(크레딧 0): `/app/map`에서 ⑴ 검색창에 타이핑해도 노드가 제자리(레이아웃 재시작 없음) ⑵ "레이아웃 설정" 팝오버가 열리고 링크 거리 슬라이더 값이 새로고침 뒤 유지 ⑶ 레이어 토글 7개 중 이 레포에 없는 것은 비활성(제목에 사유) ⑷ 노드 선택 → "이 노드 고정" → 새로고침 뒤에도 고정(스테이지 `data-pinned-count="1"`) ⑸ 두 번째 로드에서 스테이지 `data-warm-start="true"`.
3. 데모 `/map`도 같은 패널이 열리고 프리셋 저장/적용이 되는지 한 번.
4. `pnpm ops:health`: 변화 없음이 정상.

## 5. 롤백 지점

- 웹: 이전 Vercel 배포로 되돌린다. 데이터 변경 없음. 브라우저 IndexedDB(`alrescha-graph-layout`)와 localStorage(`alrescha-graph-panel`)에 남는 값은 이전 코드가 무시하거나 클램프한다.

## 6. 예상과 다른 점

- 워밍은 commit 단위 키라 레코드가 commit마다 쌓인다. 크기는 작고(노드당 8바이트) 정리는 후속.
- 화살표는 그리기만 한다 — 캔버스 엣지 클릭은 todo 10 메모 그대로 미구현.
- 그룹은 색칠만 하고 필터하지 않는다(Obsidian은 검색어 소스로도 쓴다).
- todo 12가 잰 zoom 히치는 그대로다.

## PR

- TBD_PR_URL — 커밋 1건: `feat(map): visibility filters, persisted layout, deterministic collapse, layer toggles, and Obsidian option parity`. 머지만 필요하다(§4).
