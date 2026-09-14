# Claude → Codex 배포 인수인계: todo 19 마감 — 진행 다이제스트·finding 상세·제외 보드·인스펙터 카드·concept MCP 노출

작성: 2026-09-14 · 대상: Alrescha 배포를 담당하는 Codex
상태: **배포 대기 — 웹 머지만.** 마이그레이션·워커·환경변수 무변경. 사용자 지시로 머지·배포는 보류 중이며, 이 문서는 그 뒤에 쓰는 절차다.
브랜치: `phase4/wave-d-todo-19` (`phase4/oq-070-tasks-v4` 위에 쌓임 → PR #19가 먼저 머지되어야 한다) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/todo-19.md`](../../.omo/evidence/phase4/todo-19.md) ("2026-09-14" 두 절), 프론트 로그 [`docs/frontend/logs/2026-09-14-inspection-dismiss-progress-digest.md`](../frontend/logs/2026-09-14-inspection-dismiss-progress-digest.md).

## 1. 왜

todo 19의 2026-09-06 패스는 뷰모델에서 멈췄다: 다이제스트·확인 필요 목록·finding 상세·제외 섹션이 계산은 됐지만 어떤 컴포넌트도 읽지 않았고 `apps/web/app`에 `dismiss`가 하나도 없었다. ⑴(concept 요약·모듈 카드·concept MCP 노출)은 미착수였다. 이 PR이 둘 다 닫는다.

## 2. 변경 파일과 동작

| 파일                                                                                                                     | 동작                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/ui/progress-dashboard.tsx`                                                                                 | 다이제스트 3창(오늘·최근 7일·마지막 방문 이후 — 방문 기록 없는 뷰어는 0이 아니라 문장), 확인 필요 목록(stale·blocked, 오래된 순, 사유 없는 blocked는 그렇다고 말함).                                                              |
| `apps/web/app/ui/inspection-view.tsx`                                                                                    | finding 상세 블록(span·확신+등급·근거·권장 조치·증거 노드 — 저장된 provenance만), 여덟 번째 위젯 `제외한 문제`(사유 병기, 빈 상태는 `제외한 발견 없음`).                                                                          |
| `apps/web/app/app/(shell)/inspection/{actions,page}.tsx`                                                                 | `dismissFinding` 서버 액션(세션 사용자로 `dismiss_finding` — security invoker, 사유 필수, 함수의 상태 답변을 상태 줄로), 열린 발견 옆 사유 입력 + `제외` 버튼, `?dismiss=` 배너.                                                  |
| `apps/web/app/ui/inspector-card.tsx`, `apps/web/app/api/map/inspect/route.ts`, `apps/web/lib/map/inspect-card.ts` (신규) | `/app/map` 노드 선택 시 카드: 공유 아티팩트 카드(`get_artifact`·`/app/inspection`과 같은 빌더), 모듈 카드(`explain_module`과 같은 군집·멤버 digest — ready/stale/pending), concept 카드. 라우트는 세션 클라이언트로 읽음(RLS).    |
| `packages/mcp/src/{store,graph-tools,data-brain,local-workspace}.ts`, `apps/web/lib/mcp/supabase-store.ts`               | `concept` 노드 타입 + 합성 관계 6종을 MCP 어휘에 — `query_brain`·`get_neighbors`·`trace_path`·`get_artifact` 폴백(`contentGrade: inferred`)·쓰기 앵커. 호스티드 스토어가 `concepts`를 semantic 밴드에서 읽음.                     |
| `packages/mcp/src/hosted.test.ts`                                                                                        | 카탈로그 래칫 3,076 → 3,131(상한 3,150), 이력 기록.                                                                                                                                                                               |
| `scripts/graph-surface-benchmark/product-surface.ts`, `scripts/bench-graph-surface.ts`, `tests/graph-surface-v3.test.ts` | 카탈로그 잠금을 `assertCatalogPinned`로 — v3 핀(`a3d569…`)은 이제 출하 카탈로그(`c76b6a5c…`)와 달라 거부하며, 테스트가 그 거부를 단언한다. 게시된 v3 리포트 감사는 자기 핀으로 PASS.                                              |
| `apps/web/app/ui/brain-map-stage.tsx`                                                                                    | 히트 타깃에 `data-node-path`.                                                                                                                                                                                                     |
| 문구·스타일·픽스처·테스트                                                                                                | `lib/strings/{inspection,progress,map}.ts`, `styles/screens/{inspection,progress,map-hud}.css`, `lib/inspection/fixtures.ts`(데모에 제외된 finding 1건), e2e 3종 신규(`inspection-dismiss`·`map-inspector-cards`)+확장, 단위 +20. |

core·워커·SQL·의존성 무변경. MCP 어휘 확장은 `packages/mcp`이므로 Vercel 웹 배포에 포함된다(MCP 엔드포인트는 웹 앱 라우트).

## 3. 테스트·게이트 (브랜치 팁)

- `pnpm lint` clean · `pnpm typecheck` clean · `pnpm test` 198 files / 1,841 passed / 1 skipped · `scripts/verify-scope-boundaries.ts` PASS · `git diff --check` clean · `verify-benchmark-report.ts` PASS(4 릴리스).
- Playwright: `inspection-dismiss.spec.ts` 1/1(라이브), `map-inspector-cards.spec.ts` 1/1(라이브, 두 테마 axe violation 0), `inspection.spec.ts` 4/4, `progress.spec.ts` 2/2, `a11y-contrast.spec.ts` 40/40, `a11y-keyboard.spec.ts` 1/1, `map-panel.spec.ts`·`brain-map.spec.ts` 회귀 green.

## 4. 배포 필요 사항

- **마이그레이션** — 없음(`dismiss_finding`은 `202609060009`로 이미 적용됨). **웹 배포** — **필요**(Vercel, 머지 시 자동). **워커** — 없음. **환경변수** — 없음.

**절차: 웹 머지만.** PR #19(`tasks.v4`)를 먼저 머지한 뒤 이 PR을 merge commit으로 머지 → Vercel 배포 확인.

검증(크레딧 0):

1. `/app/progress`: 다이제스트 3창이 보이고 첫 방문이면 "이 화면을 연 기록이 없습니다", 새로고침 뒤 세 번째 창이 건수로 바뀜(`touch_screen_view`). 멈춰 있는 항목 절이 있음.
2. `/app/inspection`: 열린 발견 옆에 사유 입력 + `제외`. 실제 발견 1건에 사유를 적어 제외 → `?dismiss=done` 배너, `제외한 문제` 위젯에 사유와 함께 남고 열린 목록에서 사라짐. (이 행위는 데이터 변경이다 — 되돌리려면 DB에서 status를 open으로 돌려야 하니, 파일럿에서 실제로 제외해도 괜찮은 발견을 고른다.)
3. `/app/map`: 파일 노드 선택 → 경로 아래 카드(kind·unit·domain 칩, export 이름, 요약 없음 문장 또는 inferred 요약, 모듈 상태). concept 노드가 있으면 선택 → 요약이 inferred 배지 아래.
4. MCP(승인된 read 토큰 1회, 선택): `query_brain {filter:{types:["concept"]}}`가 concept을 답하는지. enrich를 돌린 적 없는 워크스페이스면 0건이 정상.
5. `pnpm ops:health`: 변화 없음이 정상.

## 5. 롤백 지점

- 웹: 이전 Vercel 배포로. 제외한 finding은 데이터에 남는다(`dismissed` 상태) — 롤백해도 되돌지 않는다.

## 6. 예상과 다른 점

- graph-surface v3의 카탈로그 핀이 출하 카탈로그와 달라졌다. 설계된 거부이며 재실행은 v4 사전등록(OQ-071).
- `index_entries` CHECK에 concept 타입이 없어 `search_index`는 concept을 못 찾는다(`query_brain`·이웃은 찾음). 카드에서 모듈 요약을 생성하는 버튼은 없다(`explain_module`의 일).

## PR

- https://github.com/2klips/alrescha-app/pull/20 — 커밋 2건: `feat(app): render the progress digest and attention list, finding detail, and a finding dismissal with its board`(`a22dc94`), `feat(app): inspector cards on the map and the concept layer through the MCP tools`(`956aca8`). PR #19 다음에 머지.
