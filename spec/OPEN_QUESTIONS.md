# Open Questions

구현 중 발견한 스펙 모순·불명확 사항을 여기에 기록한다. (에이전트가 유일하게 수정할 수 있는 spec/ 문서)

형식:

```
## OQ-001 — <제목>
- 발견: <할일 번호 / 파일>
- 내용: <무엇이 모순/불명확한가, 관련 스펙 인용>
- 임시 결정: <어떤 기본값으로 진행했나 + 근거>
- 상태: open | resolved(<ADR/답변 참조>)
```

---

## OQ-001 — 최소 인덱스 PR에 필요한 GitHub Contents 쓰기 권한

- 발견: Task 16 / `spec/WORK_SPEC.md` §12, guardrail 9
- 내용: 사양은 `contents:read` + 선택적 `pull_requests:write`만 허용한다. GitHub REST의 PR 생성은 Pull requests(write)로 가능하지만, 제안 브랜치 생성과 `AGENTS.md`/`CLAUDE.md` 반영은 Contents(write)가 필요하다. Pull requests(write)만으로 새 diff를 만들 수 없다.
- 임시 결정: 권한을 확대하지 않는다. PR 제안 로직은 주입된 GitHub 경계로 완전 테스트하고, 실제 권한이 부족하면 diff 복사 및 권한 안내만 제공한다. 실제 GitHub 호출이 403이면 같은 안전한 fallback으로 전환한다. `contents:write` 승인 전에는 직접 쓰기 경로를 활성화하지 않는다.
- 근거: https://docs.github.com/en/rest/repos/contents 및 https://docs.github.com/en/rest/pulls/pulls
- 상태: resolved(ADR-008 — contents:write를 선택 권한으로 승인, 인덱스 PR 기능 사용 시에만 요청)

## OQ-002 — Pretendard 자체 호스팅 방식: `next/font/local` vs 동적 서브셋 CSS

- 발견: Phase 2A Task 1 / `spec/BUILD_PLAN_PHASE2A_UI.md` todo 1, `apps/web/app/layout.tsx`
- 내용: 계획은 "Pretendard Variable(한국어 서브셋)을 `next/font/local`로 자체 호스팅"을 요구한다. 두 요구가 상충한다 — `next/font/local`은 `src` 항목당 파일 하나만 받고 `unicode-range`를 표현할 수 없어, 한국어 서브셋 대신 단일 `PretendardVariable.woff2` **2.0MB** 전체를 모든 방문자에게 내려보내야 한다.
- 임시 결정: `pretendard@1.3.9` 패키지의 동적 서브셋 스타일시트(92개 `unicode-range` 조각)를 node_modules에서 import한다. 이 레포가 이미 Fontsource로 쓰던 방식과 동일하며 CDN 미사용·자체 호스팅·`font-display: swap` 요건을 모두 만족하고 전송량이 훨씬 작다. 레이아웃 시프트는 `next/font`의 자동 폴백 대신 **실측 메트릭 오버라이드**(woff2의 `head`/`hhea` 테이블 직접 측정)로 처리했다.
- 근거: `apps/web/node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css`, `.omo/evidence/phase2a/task-1.md`
- 상태: open (Wave 4 번들 예산 측정 때 재확인 — 그때도 이 선택이 유리하면 계획 문구 개정을 제안)

## OQ-003 — 라이트 테마 `--muted`·파생 토큰 값이 ADR-009-3에 없음

- 발견: Phase 2A Task 1 / `apps/web/app/styles/tokens.css`
- 내용: ADR-009-3은 라이트("종이") 팔레트로 bg·surface·line·text와 브랜드/등급 색만 지정한다. 다크에 있는 `muted`(`#8A94A8`)의 라이트 대응값, 그리고 기존 화면이 쓰는 파생 역할(`--faint`, `--line-strong`, `--surface-2`, `--code-bg`, 채워진 버튼의 대비색)은 정의되어 있지 않다.
- 임시 결정: 라이트 `--muted: #5B6272` — `#FAF7F1` 배경 대비 **5.63:1**로 WCAG AA(4.5:1) 통과. 나머지 파생값도 같은 램프에서 보간했다(`--faint #8A8F9E`, `--line-strong #CFC6B4`, `--surface-2 #F3EFE7`). 전부 `tokens.css` 한 곳에만 존재하므로 ADR이 값을 확정하면 한 파일 수정으로 끝난다.
- 근거: WCAG 2.2 대비 계산(상대휘도 0.9320 vs 0.1243), `spec/DECISIONS-ADR.md` ADR-009-3
- 상태: open (Wave 4 axe-core 대비 검사에서 재검증)

## OQ-004 — 랜딩 화면의 보라(inferred)·청록(test) 색이 Ink & Seal에서 한 색으로 합쳐짐

- 발견: Phase 2A Task 1 / `apps/web/app/globals.css` (`.arr-home`)
- 내용: 랜딩은 inferred를 보라(`#5f35c9`), test 노드를 청록(`#068aa6`)으로 구분해 쓰고 있었다. ADR-009-3은 inferred와 test 노드 색을 **둘 다 amber**로 규정하므로, 토큰화하면 두 의미가 같은 색이 된다.
- 임시 결정: 둘 다 `--arr-amber`(라이트 inferred `#B07A14`)로 매핑했다. ADR이 상위이므로 색은 합치되, 두 요소는 라벨·형태(범례 아이콘 모양, 체인 단계 번호)로 계속 구분된다. 색만으로 정보를 전달하지 않으므로 접근성 회귀는 아니다.
- 근거: `spec/DECISIONS-ADR.md` ADR-009-3(노드 색 규약), `spec/WORK_SPEC.md` §5.1
- 상태: open (todo 8 화면 재스타일 때 형태 구분이 충분한지 눈으로 확인 필요)

## OQ-005 — todo 5·6의 Playwright 수용 기준이 todo 7보다 먼저 올 수 없음

- 발견: Phase 2A Task 5 / `spec/BUILD_PLAN_PHASE2A_UI.md` todo 4~7, 의존성 매트릭스
- 내용: todo 5는 "Playwright가 3단계 줌을 오가며 라벨 개수 밴드와 Near 뱃지 노출을 검증", todo 6은 "글로우 버스트 e2e"를 요구한다. 그런데 Pixi 스테이지를 실제 라우트(대시보드)에 붙이는 일은 todo 7(대시보드 셸·HUD 재스타일)이고, 의존성 매트릭스도 7이 5·6에 **의존**한다고 명시한다. 즉 계획대로면 todo 5·6 시점에 e2e가 붙을 화면이 존재하지 않는다. 또한 현재 e2e(`tests/e2e/live-graph.spec.ts`)는 SVG 렌더러의 `.graph-node.pulse`·`[data-node-id] .node-core` 셀렉터를 검증하므로, HUD 작업 없이 렌더러만 갈아끼우면 기존 e2e가 깨진다.
- 임시 결정: Wave 2에서는 LOD 밴드·라벨 그리드 선택·뱃지 노출·클러스터 접힘/펼침·글로우 상태 머신·코얼레싱을 **결정론적 vitest 단위 테스트**로 전량 검증하고(엔진은 순수 계층으로 분리되어 있어 캔버스 스크린샷보다 강한 보증), 브라우저 e2e는 todo 7에서 스테이지를 붙일 때 같은 단언을 화면 위에서 재확인하도록 넘긴다. `BrainMapStage`는 `data-lod`, `data-canvas-nodes`, `data-testid="graph-force-panel"`, `data-force-key`, `data-glow-*` 훅을 이미 노출해 두었으므로 todo 7은 셀렉터를 새로 만들 필요가 없다.
- 근거: `.omo/evidence/phase2a/task-5.md`, `.omo/evidence/phase2a/task-6.md`, `tests/graph-lod.test.ts`, `tests/graph-glow.test.ts`
- 상태: resolved(Phase 2A Task 7 — `tests/e2e/brain-map.spec.ts`가 LOD 3단계·라벨 밴드·힘 패널 영속·글로우 버스트·WebGL 폐기를 실제 캔버스 위에서 검증. `.omo/evidence/phase2a/task-7.md` 참조)

## OQ-006 — 캔버스 노드의 클릭·키보드 접근 수단이 스펙에 없음

- 발견: Phase 2A Task 7 / `apps/web/app/ui/brain-map-stage.tsx`, `spec/WORK_SPEC.md` §5.2-①
- 내용: WORK_SPEC은 "노드 드래그, 클릭 시 로컬 그래프 포커스, 더블클릭으로 증거 상세 진입"을 요구한다. 그런데 WebGL 캔버스는 접근성 트리도 클릭 타깃도 없다. 캔버스 히트테스트로 포인터만 살리면 키보드·스크린리더 경로가 사라지고, 반대로 sr-only 목록만 두면 마우스 경로가 사라진다. 스펙은 어느 쪽도 규정하지 않는다.
- 임시 결정: **투명 DOM 히트 레이어** 하나로 통합했다. 노드당 버튼 1개(`data-node-id`, 이름 = `라벨 · 유형 · 등급`)를 렌더러의 화면 변환으로 10Hz마다 해당 노드 위에 배치한다. 포인터·키보드·보조기술·e2e가 모두 같은 요소를 쓴다. 노드 수가 많아지면 차수 상위 `HIT_TARGET_LIMIT = 600`개로 제한하며(렌더러는 전부 그린다), 이 상한은 3,000노드 이상에서 Far 줌 슈퍼노드 접기와 함께 재검토가 필요하다. 노드 드래그는 이번 범위에서 구현하지 않았다(기존 SVG 대시보드에도 없었고 계획의 "기능 추가 금지"에 걸린다).
- 근거: `.omo/evidence/phase2a/task-7.md`, `apps/web/app/ui/brain-map-stage.test.tsx`, `tests/e2e/brain-map.spec.ts`
- 상태: open (Wave 4 a11y 검사에서 히트 레이어 상한과 키보드 순회 비용을 재검증)

## OQ-007 — HUD 카드가 레일·인스펙터와 다른 스태킹 컨텍스트에 있음

- 발견: Phase 2A Task 7 / `apps/web/app/globals.css` (`.graph-force-panel`, `.arr-metric-evidence`)
- 내용: 전면 그래프 구성상 그래프 플레이트(`.arr-proof-panel`)가 워크스페이스 전 셀을 덮고, 레일·인스펙터·활동 피드가 그 위에 반투명 패널로 얹힌다. 그래프 안쪽에 사는 카드(힘 패널, 지표 근거 패널)는 z-index를 아무리 올려도 레일·인스펙터 **아래**로 깔린다 — 서로 다른 스태킹 컨텍스트이기 때문이다. 실제로 힘 패널의 접기 버튼과 근거 패널의 닫기 버튼이 클릭 불가 상태였다(Playwright가 잡아냄).
- 임시 결정: 두 카드를 레일·인스펙터 사이 "빈 통로"에 고정 배치했다(힘 패널 = 우하단 `right: 22.5rem`, 근거 패널 = 좌상단 `left: 17.5rem`). 통로 폭은 레일 16rem·인스펙터 21rem에 묶여 있으므로 이 세 수치는 함께 움직여야 한다. 힘 패널은 `max-height: min(20rem, calc(100% - 12rem))` + 내부 스크롤로 낮은 뷰포트에서 제어 스트립을 침범하지 않게 했다.
- 근거: `tests/e2e/dashboard-hud.spec.ts`, `tests/e2e/brain-map.spec.ts`, `.omo/evidence/phase2a/task-7.md`
- 상태: open (HUD를 워크스페이스 그리드의 형제로 끌어올리면 통로 상수가 사라진다 — Wave 4 이후 정리 후보)
