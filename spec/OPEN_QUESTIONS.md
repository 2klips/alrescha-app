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
- 상태: resolved(Phase 2A Task 9 — 실측으로 선택 확정). 프로덕션 빌드에서 `/`가 실제로 내려받는 폰트는 **woff2 서브셋 12개 285.1KB**, `/findings`는 **7개 156.8KB**다(`scripts/measure-route-bundle.ts`). 단일 `PretendardVariable.woff2` 전체는 2.0MB이므로 동적 서브셋이 첫 방문에서 ~7배 유리하고, 화면마다 실제로 쓰는 유니코드 범위만 받는다. 계획 문구("`next/font/local`로 자체 호스팅")를 "자체 호스팅 + 유니코드 서브셋"으로 개정할 것을 제안한다.

## OQ-003 — 라이트 테마 `--muted`·파생 토큰 값이 ADR-009-3에 없음

- 발견: Phase 2A Task 1 / `apps/web/app/styles/tokens.css`
- 내용: ADR-009-3은 라이트("종이") 팔레트로 bg·surface·line·text와 브랜드/등급 색만 지정한다. 다크에 있는 `muted`(`#8A94A8`)의 라이트 대응값, 그리고 기존 화면이 쓰는 파생 역할(`--faint`, `--line-strong`, `--surface-2`, `--code-bg`, 채워진 버튼의 대비색)은 정의되어 있지 않다.
- 임시 결정: 라이트 `--muted: #5B6272` — `#FAF7F1` 배경 대비 **5.63:1**로 WCAG AA(4.5:1) 통과. 나머지 파생값도 같은 램프에서 보간했다(`--faint #8A8F9E`, `--line-strong #CFC6B4`, `--surface-2 #F3EFE7`). 전부 `tokens.css` 한 곳에만 존재하므로 ADR이 값을 확정하면 한 파일 수정으로 끝난다.
- 근거: WCAG 2.2 대비 계산(상대휘도 0.9320 vs 0.1243), `spec/DECISIONS-ADR.md` ADR-009-3
- 상태: resolved(Phase 2A Task 9). 라이트 `--muted #5B6272`는 axe-core 검사와 토큰 단위 대비 테스트를 모두 통과했다(최악 배경 `--surface-2 #F3EFE7` 기준 **5.33:1**). 다만 같은 램프에서 보간했던 **`--faint`는 두 테마 모두 AA 실패**였다 — 다크 `#5A6478`는 코드 하이라이트 행에서 2.57:1, 라이트 `#8A8F9E`는 `--surface-2`에서 2.82:1. 각각 `#848EA2`(최악 4.63:1), `#666C7B`(최악 4.58:1)로 올렸고 `text > muted > faint` 순서는 유지된다. `tests/design-tokens.test.ts`의 `token contrast` 스위트가 이 성질을 이제 강제한다.

## OQ-004 — 랜딩 화면의 보라(inferred)·청록(test) 색이 Ink & Seal에서 한 색으로 합쳐짐

- 발견: Phase 2A Task 1 / `apps/web/app/globals.css` (`.arr-home`)
- 내용: 랜딩은 inferred를 보라(`#5f35c9`), test 노드를 청록(`#068aa6`)으로 구분해 쓰고 있었다. ADR-009-3은 inferred와 test 노드 색을 **둘 다 amber**로 규정하므로, 토큰화하면 두 의미가 같은 색이 된다.
- 임시 결정: 둘 다 `--arr-amber`(라이트 inferred `#B07A14`)로 매핑했다. ADR이 상위이므로 색은 합치되, 두 요소는 라벨·형태(범례 아이콘 모양, 체인 단계 번호)로 계속 구분된다. 색만으로 정보를 전달하지 않으므로 접근성 회귀는 아니다.
- 근거: `spec/DECISIONS-ADR.md` ADR-009-3(노드 색 규약), `spec/WORK_SPEC.md` §5.1
- 상태: **resolved(obsolete, 2026-09-02 상태 드리프트 정리)**. 질문의 대상이던 `.arr-home` 랜딩과 `--arr-amber` 매핑은 Phase 2A의 전면 그래프 대시보드(dashboard-screen)와 Alrescha 리브랜딩을 거치며 코드에서 사라졌다(`apps/web/app/globals.css`에 해당 선택자·토큰 없음). 현행 화면은 inferred/test를 색이 아니라 라벨·형태로 구분하며 screens-theme·a11y-contrast 순회를 통과한다(OQ-008·009 참조). 더 이상 판단할 대상이 없어 종료.

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
- 상태: **resolved(Phase 2B todo 14, 2026-08-17)** — ⑴ 히트 레이어를 **roving tabindex** 복합 위젯으로 전환: 탭 정지 600개 → **1개**, 방향키(←→↑↓·Home·End)로 노드 순회, `role="toolbar"` + 한국어 접근 이름. 순회 비용은 `tests/e2e/a11y-keyboard.spec.ts`가 실측해 `.omo/evidence/phase2b/todo-14/keyboard-traversal.json`에 기록. ⑵ axe 감사 범위에 히트 레이어 편입(`a11y-contrast.spec.ts`의 제외 목록에서 제거 — 캔버스만 제외 유지). 버튼은 가시 텍스트가 없어 color-contrast 오판 대상이 아니며, 감사는 위반 0으로 통과.

## OQ-007 — HUD 카드가 레일·인스펙터와 다른 스태킹 컨텍스트에 있음

- 발견: Phase 2A Task 7 / `apps/web/app/globals.css` (`.graph-force-panel`, `.arr-metric-evidence`)
- 내용: 전면 그래프 구성상 그래프 플레이트(`.arr-proof-panel`)가 워크스페이스 전 셀을 덮고, 레일·인스펙터·활동 피드가 그 위에 반투명 패널로 얹힌다. 그래프 안쪽에 사는 카드(힘 패널, 지표 근거 패널)는 z-index를 아무리 올려도 레일·인스펙터 **아래**로 깔린다 — 서로 다른 스태킹 컨텍스트이기 때문이다. 실제로 힘 패널의 접기 버튼과 근거 패널의 닫기 버튼이 클릭 불가 상태였다(Playwright가 잡아냄).
- 임시 결정: 두 카드를 레일·인스펙터 사이 "빈 통로"에 고정 배치했다(힘 패널 = 우하단 `right: 22.5rem`, 근거 패널 = 좌상단 `left: 17.5rem`). 통로 폭은 레일 16rem·인스펙터 21rem에 묶여 있으므로 이 세 수치는 함께 움직여야 한다. 힘 패널은 `max-height: min(20rem, calc(100% - 12rem))` + 내부 스크롤로 낮은 뷰포트에서 제어 스트립을 침범하지 않게 했다.
- 근거: `tests/e2e/dashboard-hud.spec.ts`, `tests/e2e/brain-map.spec.ts`, `.omo/evidence/phase2a/task-7.md`
- Wave 4 추가 관찰(Task 9): 이 배치는 생각보다 훨씬 취약했다. 1280×720에서 힘 패널 상단과 제어 스트립 사이 **실측 여유는 4px**였다 — `calc(100% - 12rem)`이 제어 스트립을 "플레이트 상단에서 고정 오프셋"으로 가정했는데, 그 오프셋은 사실 **제목 밴드 높이를 따라 움직인다**. 그래서 h1에 한 줄을 더한 것만으로 스트립이 19px 내려와 접기 버튼을 덮었고, `force panel values survive a reload`가 간헐 실패했다. 여유를 `calc(100% - 16rem)`(실측 26px)으로 넓히고, `tests/e2e/brain-map.spec.ts`에 세 해상도에서 두 상자가 교차하지 않고 접기 버튼이 실제로 클릭 가능한지 확인하는 기하 회귀 테스트를 넣었다.
- 상태: **resolved(Phase 2B todo 14, 2026-08-17)** — 처음 제안한 근본 해법 그대로: 두 HUD 카드를 **`.arr-hud-channel`(워크스페이스 그리드의 형제, 가운데 컬럼 점유)**로 승격했다. 그리드가 기하를 소유하므로 카드가 레일·인스펙터와 충돌하는 것이 구조적으로 불가능해졌고, 통로 상수 `right: 22.5rem`/`left: 17.5rem`은 삭제(채널 기준 1.5rem). `BrainMapStage`는 `settings`/`onSettingsChange`/`onLodReport` 프롭으로 외부 HUD에 상태를 위임한다(내부 패널 경로도 하위 호환 유지). 차단 상태에서는 채널이 힘 패널을 렌더하지 않아 복구 버튼을 가리지 않는다(e2e가 잡아낸 회귀를 즉시 수정). 컨트롤 스트립과의 세로 여유(`max-height` reserve)는 남지만 `brain-map.spec.ts` 기하 회귀 테스트가 감시한다.

## OQ-008 — 두 테마 화면 순회에서 빠지는 라우트: `/auth/*`(500)와 `/app/*`(인증 필요)

- 발견: Phase 2A Task 8 / `tests/e2e/screens-theme.spec.ts`
- 내용: todo 8 수용 기준은 "Playwright가 각 화면을 두 테마로 순회"다. 그런데 두 종류의 라우트가 이 환경에서 순회 불가다. ⑴ `/app/*`는 살아 있는 Supabase 세션이 필요하다. ⑵ `/auth/login`·`/auth/auth-code-error`는 **500**을 반환한다 — 테마 부트 스크립트조차 실행되지 않아 `data-theme`이 비어 있다. `apps/web/app/auth`의 마지막 커밋은 `ca3a0d0`(Phase 2A 이전)이므로 이번 단계의 회귀가 아니라 환경 변수 공백이다.
- 임시 결정: 순회 대상에서 두 라우트군을 빼고 공개 라우트 10개만 검증했다(대시보드·findings·lint·receipts·progress·harness·library·evidence 상세·onboarding·404). 해당 화면의 카피 변환 자체는 `tests/korean-strings.test.ts`가 파일 단위로 강제하고, 컴포넌트 렌더링은 각 화면의 vitest가 덮는다. 브라우저 상의 테마 확인은 Supabase가 붙는 Wave 4로 넘긴다.
- 부수 관찰: 테마 토글은 대시보드·assurance 화면·progress에만 있다. `/graph`, `/harness`, `/library`, `/onboarding`에는 헤더 토글이 없어 그 화면에서는 테마를 바꿀 수 없다(저장된 설정은 따른다). 계획 todo 2의 수용 기준은 3개 화면만 요구하므로 이번 범위에서 추가하지 않았다.
- 근거: `tests/e2e/screens-theme.spec.ts`, `.omo/evidence/phase2a/task-8.md`
- 상태: open — **Wave 4에서도 해소하지 못했다.** Supabase가 이 환경에 여전히 없어서 `/auth/*`는 500, `/app/*`는 세션 부재로 접근 불가다. 따라서 todo 9의 axe-core 대비 검사도 계획이 지정한 두 화면(`/`, `/findings`)만 덮으며, 인증 화면군의 대비는 **검증되지 않았다**(토큰 단위 대비 테스트가 간접적으로만 덮는다). Supabase 프로젝트가 붙는 Phase D 준비물이 필요하다.
- Phase 2B todo 14 재점검(2026-08-17): 환경 재확인 결과 `.env.local`에는 AI API 키만 있고 Supabase 설정이 없다 — **여전히 사람 준비물 차단**. OQ-006·OQ-007은 해소됐고, 이 항목만 Phase 2B의 알려진 한계로 CHANGELOG에 명기한 채 open으로 남긴다. Supabase 프로젝트가 연결되면 `screens-theme`·`a11y-contrast` 순회에 `/auth/*`·`/app/*`를 추가하는 것이 남은 전부다.
- 상태: **resolved(Phase 2C todo 4, 2026-08-18)**. 사용자가 Docker Desktop을 설치해 로컬 Supabase 스택을 기동했다(마이그레이션 21개 적용). ·가 처음으로 실제 렌더되어 **· 두 순회에 편입**했고, 양 테마 AA 위반 0으로 통과한다. **는 여전히 남는다** — 로그인 수단이 GitHub OAuth뿐이라 실제 세션을 만들려면 GitHub App(G2)이 필요하다. 그 잔여분은 Wave 2 실기 파일럿으로 이관하며, 이 항목은 원래 질문("두 테마 순회에서 빠지는 라우트")의 몫이 닫힌 것으로 종료한다.

## OQ-009 — ADR-009-3 라이트 팔레트가 작은 텍스트에서 WCAG AA를 통과하지 못함

- 발견: Phase 2A Task 9 / `tests/e2e/a11y-contrast.spec.ts`, `apps/web/app/styles/tokens.css`
- 내용: axe-core 대비 검사에서 `/findings` 라이트 테마가 **22건 violation**을 냈다. 원인의 대부분은 파생 토큰이 아니라 **ADR-009-3이 못 박은 값 자체**다 — 종이 흰색(`#FFFFFF`/`#FAF7F1`/`#F3EFE7`) 위에서 `--verified #1E8A5E`는 3.77~~4.33:1, `--inferred #B07A14`는 3.25~~3.72:1, `--brand #D6402E`는 3.95~~4.53:1, `--info #3B6FDB`는 4.08~~4.68:1이다. 이 색들을 9~11px 모노 뱃지(`.grade-badge`, `.severity-label`, `.commit-chip`)가 텍스트 색으로 쓰기 때문에 AA(4.5:1) 미달이다. 다크 테마의 같은 색들은 전부 4.95:1 이상으로 통과한다.
- 임시 결정: **ADR 값은 건드리지 않았다**(ADR = WORK_SPEC > 계획). 대신 `tokens.css`에 텍스트 전용 파생 토큰을 추가했다 — `--brand-text #C43A2B`(4.59:1), `--verified-text #177A52`(4.65:1), `--inferred-text #8F6310`(4.62:1), `--info-text #3766CA`(4.68:1). 다크에서는 기본 토큰의 별칭일 뿐이다. 그래프 노드 색·점·링·틴트·테두리는 여전히 ADR 값을 쓰므로 팔레트의 정체성은 그대로고, 텍스트만 어두운 형제 색을 쓴다. 파생 별칭(`--ok-text`, `--warn-text`, `--broken-text`, `--accent-text`)도 같이 뒀다.
- 근거: `.omo/evidence/phase2a/task-9.md`, `.omo/evidence/phase2a/task-9/axe-contrast-*.json`, `tests/design-tokens.test.ts`(`token contrast` 스위트)
- 상태: **resolved(ADR-010 §2, 2026-08-16 — 팔레트 유지 + 텍스트 전용 파생 토큰 채택)**. ADR-009-3 값은 개정하지 않고 텍스트에는 `--*-text` 형제 토큰을 쓴다(마케팅 사이트 교체 시 동일 규칙). 임시 결정이 그대로 확정된 것이라 코드 변경 없음. 상태 드리프트 정리 2026-09-02.

## OQ-010 — 제품명이 Arr로 바뀐 뒤에도 코드·픽스처·패키지명에 SpecProof가 남아 있음

- 발견: Phase 2A Task 9 / 레포 전역
- 내용: ADR-008에서 제품명이 **Arr**로 확정되고 레포도 `2klips/arr` · `2klips/arr-app`인데, 코드에는 이전 이름이 광범위하게 남아 있다. ⑴ 워크스페이스 패키지명 `specproof`, `@specproof/web`, `@specproof/core`, `@specproof/mcp`. ⑵ 데모 레포 문자열 `specproof/drifted-demo`와 기본 레포 `2klips/specproof-app`(`apps/web/lib/strings/onboarding.ts`, `apps/web/lib/library/demo.ts`, e2e 스펙 다수). ⑶ `spec/IMPLEMENTATION_GUIDE.md` 제목과 README 푸터의 "© 2026 SpecProof". ⑷ evidence 디렉터리 `.omo/evidence/docshub-product-strategy/`(더 이전 이름). 사용자에게 보이는 ⑵는 온보딩 첫 화면에 그대로 노출된다.
- 임시 결정: **이번 웨이브에서 고치지 않았다.** 계획의 "기능 추가·삭제 금지"와 "todo 9/10이 요구하는 것 외 변경 금지"에 걸리고, 패키지명 변경은 `pnpm-workspace`·import 경로·픽스처·`tests/plan-compliance.test.ts`의 경로 상수까지 건드리는 별도 작업이다. 다만 발견 사실은 여기에 기록한다.
- 근거: `apps/web/lib/strings/onboarding.ts:51`, `apps/web/app/ui/onboarding-flow.tsx:41`, `package.json`, `README.md`
- 상태: **resolved (ADR-010-3 전용 리네임 작업, 2026-08-16 — 커밋 `f2e4dcc`·`87842ca`·`7cf6873`·`07d474c`)**

### OQ-010 처리 결과 (2026-08-16)

- **⑵ 사용자 노출 문자열 (1순위, 완료):** `specproof/drifted-demo` → `arr/drifted-demo`, `2klips/specproof-app` → `2klips/arr-app` (문자열 모듈 3종·온보딩 플로우·라이브러리 데모 시드·그래프 모델 기본값·보증 픽스처·stats 링크). 산문 제품명도 Arr로: `AGENTS.md`, `docs/PRIVACY.md`, `docs/PILOT_RECRUITMENT.md`, 인덱스 PR 제목·본문, 관리 인덱스 제목, MCP realm·툴 설명. 사용자가 읽는 식별자: 관리 인덱스 마커 `<!-- ARR:BEGIN/END -->`, 인덱스 PR 브랜치 `arr/minimal-index-*`, MCP 서버명 `arr`·리소스 URI `arr://`, receipt `predicateType` `https://arr.dev/receipt/v1`, 파일럿 통계 내려받기 파일명·schemaVersion, `ARR_MCP_URL` 환경변수.
- **⑴ 패키지명 (2순위, 완료):** 루트 `specproof` → `arr`, `@specproof/{web,worker,core,mcp}`·`@specproof/drifted-demo` → `@arr/*`. import·`workspace:` 참조·`CORE_PACKAGE_NAME`/`MCP_PACKAGE_NAME` 상수·루트 `dev` 스크립트·`playwright.config.ts` webServer 명령을 같은 커밋에서 함께 변경. `pnpm-workspace.yaml`은 디렉터리 glob이라 변경 불필요, tsconfig path alias는 존재하지 않는다. `node_modules/@specproof` 잔여 심링크를 삭제해 누락된 import가 조용히 해석되지 않도록 했다.
- **내부 식별자 (3순위, 완료):** `DEMO_WORKSPACE_ID`, AI 판단 툴명 `arr_judgment`, `arrReceiptPredicateSchema`, 마이그레이션 advisory lock `arr_migrations`, 벤치마크·테스트 임시 디렉터리 접두어.
- **남긴 것 (의도적):** ⑶ `spec/`·`docs/adr/`·`docs/reports/`·`benchmarks/`·`CHANGELOG.md`·`.omo/`는 **역사 기록**이므로 손대지 않았다 (`spec/IMPLEMENTATION_GUIDE.md` 제목 포함). README 3행의 "Arr(구 SpecProof)"는 개명 사실을 알리는 문장이지 잔여 네이밍이 아니다 — 푸터는 이미 "© 2026 Arr". ⑷ `.omo/evidence/docshub-product-strategy/` 디렉터리명도 역사 기록이라 유지. `scripts/verify-plan-coverage.ts`의 `<!-- specproof-coverage:start/end -->` 마커는 짝이 되는 마커가 `.omo/plans/docshub-product-strategy.md`(역사 기록)에 있어 함께 바꿀 수 없으므로 그대로 뒀다 — **이 하나가 유일한 잔여 `specproof` 문자열이다.**
- **판단이 필요한 잔여 항목:** MCP 설정 화면의 대체 호스트명을 `https://app.arr.app`·`https://mcp.arr.app`으로, receipt `predicateType`을 `https://arr.dev/receipt/v1`로 바꿨다. 둘 다 **소유가 확인되지 않은 자리표시자 도메인**이다(이전 `specproof.app`/`specproof.dev`도 마찬가지였다). 실제 도메인이 정해지면 다시 손봐야 한다.
- **잔여 항목 판정 (2026-08-17 사용자 결정):** 도메인은 **솔루션이 완성된 뒤 구매·확정**한다. 그 전까지 자리표시자를 유지하며, 확정 시 수정 지점은 두 곳 — MCP 설정 화면 호스트명, receipt `predicateType`(`packages/core/src/assurance/receipts.ts`의 `https://arr.dev/receipt/v1`). predicateType 변경은 **기존 receipt 다이제스트와의 호환을 깨므로**, 실데이터 receipt가 쌓이기 전(도메인 확정 직후)에 한 번에 처리해야 한다.
- 게이트: lint·typecheck 무결점, vitest **416/416**, playwright **49/49**, `pnpm --filter @arr/web build` 성공. 가드레일 재검증 결과는 `.omo/evidence/naming-cleanup.md`.

## OQ-011 — 벤치마크 v3: 신뢰구간 게이트가 v2 결과를 뒤집는다 (기획 판단 필요)

- 발견: 벤치마크 v3 하네스 작업 (RESEARCH_AGENDA §3) / `benchmarks/databrain/tasks.v3.json`, `.omo/evidence/benchmark-v3.md`
- 내용: v3는 게이트를 **점추정이 아니라 신뢰구간 하한**으로 판정한다 (비열등 = 정확도 Δ 95% CI 하한 ≥ -5pp, 개선 목표 = 하한 ≥ +5pp, 토큰 = 절감률 CI 하한 ≥ 30%). 이 규칙을 **v2 실측 데이터에 그대로 적용해 보면**(같은 시드 부트스트랩, 쌍대 단위 36개) 정확도 Δ = +3.66pp, **95% CI [-6.19, +14.27]pp → 비열등 하한 미달**, 토큰 절감 55.97%, CI [36.71, 67.70]% → 토큰 목표는 통과. 즉 **v2가 "게이트 MET"으로 공개한 근거는 점추정 기준이었고, v3 기준에서는 정확도 쪽이 통과하지 못한다.** 원인은 효과가 사라져서가 아니라 표본이 작아서다(쌍대 단위 36개). v3는 과제 12→20, 반복 3→5, 모델 1→2로 쌍대 단위를 200개까지 늘려 구간을 좁힌다(같은 효과 크기가 유지되면 하한은 대략 -1pp 부근까지 올라온다 — 추정이며 실측 아님).
- 임시 결정: v2 리포트(`results.real.{json,md}`)와 그 사전등록 매니페스트(`tasks.json`)는 **불변으로 동결**했다. 사후에 판정 규칙을 바꿔 과거 리포트를 다시 채점하지 않는다(ADR-005의 "측정된 그대로 공개"). v3는 별도 사전등록(`tasks.v3.json`, SHA-256은 evidence에 기록)으로 두고, 실제 실행 전까지 F5 감사에서 "pending"으로만 보고한다.
- 기획 판단이 필요한 것: ⑴ **v2 인용 문구를 그대로 둘 것인가** — 현재 파일럿 통계 화면·리포트는 "정확도 +3.66pp"를 v2 리포트 링크와 함께 인용한다. v3 기준에서 그 수치의 불확실성이 -6.19pp까지 걸친다는 사실을 같이 표기할지, 아니면 v3 실행 결과가 나올 때까지 정확도 주장만 내릴지. ⑵ v3 실행 후 **공개 릴리스를 v3로 교체할지, v2와 병행 게시할지** (F5 감사는 두 릴리스를 모두 검증하도록 확장해 두었다).
- 근거: `benchmarks/databrain/results.real.json`(v2 원시 시행), `scripts/databrain-benchmark/statistics.ts`(시드 부트스트랩), `.omo/evidence/benchmark-v3.md`
- 상태: **resolved(ADR-012, 2026-08-17 — 정확도 주장 철회·토큰 주장 유지, 구간 병기 필수)**. ⑴ 사이트 헤드라인의 "+3.66pp"는 강등(리포트에는 유지, "v3에서 재검증 중" 표기), ⑵ v2 리포트는 불변 공개·v3는 나란히 게시. 남는 것은 v3 **실행**(예산 승인, 예상 ~8.15M 토큰)이며 이는 판정이 아니라 실행 과제라 RESEARCH_AGENDA 쪽에 남긴다. 상태 드리프트 정리 2026-09-02.

## OQ-012 — v3 실레포 과제에 test-pass 채점기가 없다

- 발견: 벤치마크 v3 과제 설계 / `benchmarks/databrain/tasks.v3.json`
- 내용: 실레포(`.`) 과제 10개는 전부 answer-manifest(8) 또는 findings-manifest(2)다. 구현(test-pass) 과제는 여전히 픽스처 레포에만 있다. 이유는 채점 격리 비용이다 — `runIsolatedImplementationTests`는 과제 레포 디렉터리를 **시행마다 통째로 복사**한 뒤 vitest를 돌리는데, 이 레포는 `.git`·`.next`·`test-results`를 빼도 수백 MB 규모라 시행 60회 복사는 드라이런을 몇 분에서 수십 분으로 늘린다. 따라서 "대규모 코퍼스에서의 검색 난이도"는 실레포 Q&A/감사 과제로 측정하고, "구현 성공률"은 픽스처에서 측정한다.
- 임시 결정: 현행 유지. 실레포 구현 과제가 필요해지면 ⑴ 복사 대신 스파스 체크아웃/하드링크 복사, 또는 ⑵ 이 레포 안의 자족적 하위 패키지(자체 `vitest.config.ts` 보유)를 별도 realistic 레포로 등록하는 방식이 선택지다.
- 근거: `scripts/databrain-benchmark/implementation-runner.ts`
- 상태: open (낮은 우선순위)

## OQ-013 — Phase 2B todo 3(`arr push` CLI)가 local-cli 스코프 가드레일과 충돌 (기획 판단 필요)

- 발견: Phase 2B Wave 1 착수 조사 / `scripts/verify-scope-boundaries.ts:147-168`, `tests/scope-fidelity.test.ts:20-26`
- 내용: `BUILD_PLAN_PHASE2B.md` todo 3은 로컬 인제스트 CLI(`arr push`)를 요구하지만, 스코프 가드레일 `local-cli`가 CLI의 존재 자체를 기계적으로 금지한다 — 경로에 `/cli/` 포함, `package.json`의 `"bin"` 키, `#!/usr/bin/env node` 셰뱅이 전부 실패 처리된다. 근거는 ADR-002 §5 "로컬 CLI 드리프트 체커: 2단계로 연기"와 WORK_SPEC §12(비목표)다. Phase 2B가 그 "2단계"라고 읽을 수 있으나, 가드레일과 WORK_SPEC 비목표 항목은 갱신되지 않았고, AGENTS.md는 가드레일 약화를 금지한다. 에이전트가 임의로 경계를 풀 수 없는 구조이므로 진행 불가.
- 필요한 결정: ⑴ ADR 개정으로 local-cli 경계를 해제하고, 금지 대상을 "CLI 존재"에서 **"원본 코드 전송/저장"**으로 교체할지 (todo 3의 Must NOT과 raw-code-persistence 가드레일이 이미 후자를 커버) ⑵ 아니면 todo 3을 재연기할지. ⑴ 선택 시 가드레일 개정은 삭제가 아니라 대체여야 하며(약화 금지), 위반 심기 테스트로 새 경계를 재증명해야 한다.
- 임시 결정: todo 3은 착수하지 않고 보류. Wave 1의 todo 1은 완료, todo 2는 이 결정과 무관하게 진행 가능.
- 상태: resolved(ADR-013 — ⑴ 채택. 로컬 인제스트는 메타데이터만으로 허용, local-cli 경계를 `raw-source-upload`(원본 코드 전송 금지)로, team-ui 경계를 `unguarded-team-surface`(ADR-011 음성 테스트 마커 3종 없이는 팀 표면 추가 금지)로 교체. **구현 완료** — 위반 심기 재증명 포함, `.omo/evidence/phase2b/adr-013-guardrail.md` 참조. WORK_SPEC 비목표 개정은 §16에 반영 — OQ 본문이 "§12"로 지칭한 섹션의 현행 번호는 §16이다. todo 3 착수 가능)

## OQ-014 — `runs.status`·`started_at`·`completed_at`을 쓰는 프로덕션 경로가 없다

- 발견: Phase 2B todo 2 (커밋별 분석 카드) / `supabase/migrations/202608100002_evidence_graph_domain.sql:186-208`, `202608100004_worker_credit_lifecycle.sql`
- 내용: `runs` 테이블은 `status('pending'→'running'→'succeeded'/'failed'/'cancelled')`·`started_at`·`completed_at`을 정의하지만, **어떤 프로덕션 코드도 이 컬럼들을 갱신하지 않는다.** webhook 인제스트는 `pending`으로 생성만 하고, `claim_next_job`/`finish_job`은 `jobs` 행만 만진다. 유일한 writer는 설치 해지 경로(`202608100009:213-219`, `cancelled` 설정)다. 그 결과 ⑴ `apps/web/lib/stats/pilot-report.ts:169-173`은 `status='succeeded'`인 run을 조회하므로 실데이터에서는 **구조적으로 빈 화면**이다(현재는 e2e 시드가 직접 넣은 행만 잡힌다). ⑵ todo 2의 커밋 카드도 run 상태를 신뢰할 수 없어 **잡 상태에서 유도**하도록 구현했다.
- 임시 결정: 커밋 카드는 `jobs`의 상태·타임스탬프에서 상태/소요 시간을 유도한다(`packages/core/src/runs/analysis-cards.ts`). 이는 데이터 정합상 안전하지만, `runs` 컬럼들은 여전히 죽은 상태다.
- 필요한 결정: ⑴ `finish_job`/`claim_next_job`이 소속 run의 상태를 함께 전이시키는 마이그레이션을 추가할지(pilot-report가 살아난다), ⑵ 아니면 `runs.status`를 파생 뷰로 대체하고 컬럼을 폐기할지. ⑴이면 "run의 모든 잡 종료 시 성공/실패 판정" 규칙을 SQL로 명문화해야 한다.
- 상태: resolved(⑴ 채택, 2026-08-17 사용자 판정 — `202608170001_run_lifecycle.sql`. 첫 claim이 run을 `running`+`started_at`(1회), 마지막 잡 종결 시 `failed > cancelled > succeeded` 우선순위로 판정+`completed_at`. 재시도 requeue는 비종결. run 행 `for update` 잠금으로 동시 종결 직렬화, 모든 경로가 잡→run 순서로 잠가 데드락 없음. 해지 경로의 `cancelled` 의미 보존, `pending`/`running` 밖의 run은 부활 금지. 커밋 카드의 잡 기반 유도는 이중 장부(회귀 신호)로 유지. `tests/run-lifecycle.test.ts` 8케이스, `.omo/evidence/phase2b/oq-014-run-lifecycle.md`)

## OQ-015 — tree-sitter 채택은 의존성 결정이 필요하다 (기획 판단 필요)

- 발견: Phase 2B todo 7 ⑵ / `packages/core/src/ingest/repository-scanner.ts` `extractSymbols`
- 내용: 계획은 "tree-sitter 다언어 AST를 심볼 추출의 1순위로 승격, 정규식은 폴백"을 요구한다. 그런데 tree-sitter 도입은 두 경로뿐이다 — ⑴ 네이티브 바인딩(`tree-sitter` + 언어별 그래머): node-gyp 빌드가 필요해 Windows 개발 환경·CLI 배포(`arr push`가 로컬에서 스캔)에 부담 ⑵ wasm(`web-tree-sitter` + 그래머 wasm): 그래머당 수백 KB의 바이너리를 레포/패키지에 실어야 한다. 어느 쪽이든 공급망·크기·빌드 복잡도가 걸린 의존성 결정이라 에이전트가 임의로 정하지 않았다.
- 임시 결정: 추출기를 **엔진 체인**으로 구조화했다 — `extractSymbols(path, source)`가 언어별 엔진을 고르고, ts/js는 기존 TypeScript 컴파일러 **AST**(진짜 AST 파싱), Python·Go는 결정론적 구조 파서(폴백 계층)로 처리한다. 언어별 픽스처 테스트(ts + python + go)는 수용 기준을 충족하며, tree-sitter가 채택되면 엔진 하나를 갈아끼우는 구조다(`SymbolExtractionEngine` 판별자 노출).
- 필요한 결정: ⑴ wasm 경로 채택(크기 비용 감수) ⑵ 네이티브 경로 채택(빌드 비용 감수) ⑶ 현행 체인 유지(코드 언어 추가 시 구조 파서 확장). CLI(`packages/cli`)가 같은 스캐너를 로컬 실행한다는 점이 배포 판단에 걸린다.
- 상태: **resolved(ADR-014, 2026-08-17 — ⑶ 채택)**. 결정적 논거: tree-sitter를 "있으면 쓰는" 선택적 의존성으로 넣으면 같은 커밋이 환경에 따라 다른 심볼을 낳아 **ADR-013의 CLI/GitHub 동등성 보장을 깬다** → 전면 채택 아니면 미채택뿐이고, 전면 채택 비용(네이티브 node-gyp / wasm 수 MB)이 현재 측정된 수요를 넘는다. 대신 **심볼 provenance**를 도입: 아티팩트가 `metadata.symbolEngine`(`typescript-ast`/`python-structural`/`go-structural`, 비코드 null)으로 정밀도 출처를 밝히고, `metadata`는 병합 저장이라 판단 잡 요약이 재스캔에서 살아남는다(`202608170006_symbol_engine.sql`, `tests/scanner-extensions.test.ts`). 재검토 트리거는 ADR-014-5에 명시.

## OQ-016 — 로컬 인제스트 경로는 findings·receipt를 만들 수 없다 (아키텍처 제약)

- 발견: 후속 배선 작업(로컬 인제스트 run 생성) / `packages/cli`, `apps/web/app/api/ingest/local/route.ts`
- 내용: `arr push`는 스캔(구조·메타데이터)만 수행하고 업로드한다. 그런데 **드리프트 분석과 receipt는 파일 본문을 필요로 한다** — GitHub 경로는 워커가 설치 토큰으로 본문을 일시 조회해 분석하지만, 로컬 경로의 서버는 본문을 받지도 저장하지도 않는다(ADR-013 불변). 따라서 서버는 로컬 인제스트 커밋에 대해 findings를 산출할 수 없고, findings 없는 receipt는 **근거 없는 증명서**가 되므로 발급해서도 안 된다.
- 임시 결정: 로컬 인제스트는 **run만** 기록한다(`record_local_ingest_run` — trigger_kind `manual`, 서버 측정 타임스탬프, 커밋당 멱등). receipt는 만들지 않으며, 그 부재를 테스트로 고정했다. 커밋 카드는 잡 없는 run에 대해 저장된 run 상태를 신뢰하도록 확장했다(OQ-014 루프 완결).
- 필요한 결정: ⑴ **CLI가 분석까지 로컬 수행**하고 findings 메타데이터(+스팬)를 업로드 → 서버가 receipt 발급. 원본 비저장을 유지하면서 기능 동등에 가장 가깝지만, 분석 엔진을 CLI에 싣고 두 경로의 결정론 동등성을 다시 증명해야 한다. ⑵ 로컬 경로는 "그래프만" 제공하고 보증(findings·receipt)은 GitHub 연결 시에만 — 현행이며, ADR-013 §5의 "GitHub 유도"와 정합한다. ⑶ 사용자가 CI 아티팩트를 업로드하면 그것으로 부분 보증.
- 상태: **resolved(ADR-015, 2026-08-17 — ⑵ 채택)**. 결정적 논거 둘: ⑴은 **검증 불가**(룰 엔진을 공유해 결정론을 맞춰도 "그 코드가 그 커밋에 실제로 돌았음"을 서버가 확인할 수 없다 → receipt가 제출물을 그대로 찍는 공증이 된다)이고 **영구 재계산 불가**(룰 개정 시 GitHub 경로는 본문 재조회로 전량 재분석하지만 로컬 findings는 갱신 수단이 없어 화석이 된다)다. 대신 ⑵를 정식 설계로 승격하며 세 가지를 함께 넣었다 — ⓐ 커밋 카드 `assurance`(`full`/`graph-only`) provenance로 부재의 이유를 노출 ⓑ `client-submitted-assurance` 스코프 경계 스캐너로 재개방 차단(위반 심기 재증명) ⓒ CLI·카드의 GitHub 업그레이드 유도(ADR-013 §5). ⑶은 기각이 아니라 **보류** — 현행 CI 증거는 서버가 GitHub Artifact API로 직접 가져와 출처가 보장되며, 사용자 업로드 확장은 OIDC 계열 출처 증명이 선행돼야 한다(재검토 트리거는 ADR-015에 명시).

## OQ-017 — Supabase GitHub 로그인이 최소 권한 GitHub App과 양립하지 않는다

- 발견: Phase 2C todo 5 실기 파일럿(2026-08-18) / `supabase/config.toml` `[auth.external.github]`, `packages/core/src/github/app-permissions.ts`
- 내용: 제품 로그인은 `signInWithOAuth({ provider: "github" })` 하나뿐이고(`apps/web/app/auth/login/sign-in-button.tsx`), Supabase의 GitHub provider는 콜백에서 **반드시 `GET /user/emails`를 호출한다.** 등록한 GitHub App의 자격증명으로 이 경로를 태우면 GitHub이 **403 `Resource not accessible by integration`**을 돌려주고 로그인이 `Error getting user profile from external provider`로 실패한다(실측 로그, `supabase_auth_app`). 원인은 App에 계정 권한 **Email addresses**가 없다는 것인데, 그 권한을 켜면 `/app`의 permissions에 `email:read`가 실려 **`assertMinimalGitHubPermissions`가 "초과"로 거부**한다 — 즉 로그인을 살리는 유일한 App 설정이 레포의 하드 룰(최소 권한 프로필)과 정면으로 충돌한다. `email_optional = true`로도 해결되지 않는다: 이메일이 비어서 실패하는 게 아니라 호출 자체가 403이기 때문이다.
- 임시 결정: 파일럿은 로그인 경로를 우회해 진행한다(`tests/e2e/helpers/session.ts`가 만드는 Supabase 이메일 세션). GitHub App 권한은 최소 프로필 그대로 두고, 가드레일도 손대지 않는다. **제품의 GitHub 로그인 경로는 미검증 상태로 남는다.**
- 필요한 결정: ⑴ **로그인용 OAuth App을 따로 등록**하고 Supabase provider에는 그 자격증명을 쓴다 — GitHub App은 레포 접근 전용으로 최소 권한 유지. 앱이 둘이 되지만 두 권한 모델(계정 신원 / 레포 접근)이 실제로 다른 것이라 분리가 정직하다. ⑵ GitHub App에 Email addresses 권한을 추가하고 `assertMinimalGitHubPermissions`의 프로필을 확장한다 — 가드레일 약화이므로 ADR 개정과 위반 심기 재증명이 필요하다. ⑶ Supabase provider를 버리고 GitHub App user token을 직접 교환하는 자체 로그인 라우트를 만든다(`/api/github/callback`이 이미 하는 일과 겹친다).
- 상태: **resolved (2026-08-25 사용자 지시로 ⑴ 채택)**. 근거: ⑴만이 가드레일(`assertMinimalGitHubPermissions`·adr-guardrails)을 한 글자도 건드리지 않는다 — 계정 신원(로그인)과 레포 접근은 실제로 다른 권한 모델이므로 앱 분리가 정직하다. ⑵는 가드레일 약화(ADR 개정 필요), ⑶은 기존 `/api/github/callback`과 역할이 겹치는 자체 auth 재발명이라 기각. 처리: `supabase/config.toml`의 provider 자격증명을 전용 변수 `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET`로 분리(App 자격증명 재사용 금지 주석 명문화), `email_optional` 우회 제거(OAuth App은 `/user/emails`를 정상 서빙), `docs/DEPLOYMENT_CHECKLIST.md`에 OAuth App 등록 절차 추가. **남은 사람 준비물:** GitHub OAuth App 등록 + 두 환경 변수 설정 — 등록 전까지 GitHub 로그인 실기 검증은 계속 보류(테스트 이메일 세션 우회는 유지).

## OQ-018 — 구현된 receipt 포맷이 WORK_SPEC §13과 다르다

- 발견: Phase 2C todo 5 후속(analyze 핸들러 구현, 2026-08-21) / `packages/core/src/assurance/receipts.ts`, `spec/WORK_SPEC.md` §13
- 내용: §13은 규범 포맷을 이렇게 정한다 — subject에 `{"name":"git:commit","digest":{"sha1":…}}`가 포함되고, `predicateType`은 `https://specproof.app/attestation/analysis/v1`, predicate는 `tool`·`analyzedAt`·`findings{opened,resolved,open_total}`·`coverage{requirements,implVerified,testVerified}`·`evidenceGrades{verified,inferred}`, 그리고 `signatures: []`. **구현된 `arrReceiptPredicateSchema`는 다르다** — subject는 `sha256`만 허용하는 strict object라 `git:commit`(sha1) 항목을 표현할 수 없고, `predicateType`은 `https://arr.dev/receipt/v1`, predicate는 `commitSha`·`evidence{inferred,verified}`·`previousReceiptDigest`·`repository`·`runId`이며 `signatures` 필드가 없다. 충돌 우선순위상 WORK_SPEC이 위이므로 **구현이 스펙을 벗어난 상태**다.
- 임시 결정: analyze 핸들러는 **구현된 스키마 그대로** 발급한다. 포맷을 지금 바꾸면 ⑴ 기존 receipt 테스트·다이제스트가 전부 깨지고 ⑵ OQ-010이 Wave 4로 예약해둔 `predicateType` 변경과 충돌한다. §13이 요구하는 `findings{opened,resolved,open_total}`는 predicate가 아니라 **`receipts.summary`에 저장**했다 — 커밋 카드가 읽는 곳이 거기이고(`receiptFindings`), 그래서 화면 기능은 스펙대로 동작한다. `coverage`는 아직 어디에도 없다.
- 필요한 결정: ⑴ **스펙에 맞춰 구현 개정**(subject에 sha1 커밋 항목 허용, predicate 확장, `signatures: []` 추가) — Sigstore 서명을 마이그레이션 없이 붙일 수 있어야 한다는 §13 요구를 지키려면 이쪽이다. ⑵ **구현을 정본으로 삼고 §13 개정** — 단, `coverage`·`analyzedAt` 같은 정보가 사라지는 손실을 감수할지 판단 필요. ⑶ 현행 유지(스펙-구현 불일치를 남김) — 비권장.
- 상태: **resolved (2026-08-22 사용자 판정 — 하이브리드)**. 판정 근거 셋: ⓐ §13의 predicateType(`specproof.app`)은 구 제품명 초안으로 OQ-010 리네임이 이미 대체했다 — 이 항목은 구현이 정본이었다. ⓑ §13이 statement 안에 그린 `signatures: []`는 자기 요구("마이그레이션 없이 Sigstore")와 충돌한다 — in-toto v1의 서명은 statement 밖 DSSE envelope이며, 현행 구현(서명 없는 canonical statement + digest)이 그 요구를 지키는 유일한 형태다. ⓒ 실질 손실 4종(git:commit sha1 subject·tool·analyzedAt·coverage)은 digest가 어차피 깨지는 Wave 4 predicateType 확정 시점에 한 번에 추가하면 이중 파괴가 없다. 처리: **현행 구현을 운영 v1 정본으로 §13 개정**(사용자 지시로 직접 수정 — DSSE 서명 모델·summary의 findings 델타·Wave 4 예약 필드 명시), 개정 전 발급된 로컬 dev receipt는 Wave 4 개정 시 폐기. Wave 4 작업 목록에 predicateType 교체 + 예약 필드 4종 추가가 함께 묶였다(§13 "Wave 4 예약" 절이 체크리스트).

## OQ-019 — tree-sitter 재판정 (다언어 구조 엣지의 전제)

- 발견: Phase 3 방향 수정 리서치(2026-08-23) / `spec/RESEARCH_KG_FUSION_2026-08-23.md`, `spec/DECISIONS-ADR.md` ADR-014
- 내용: ADR-014는 tree-sitter를 미채택했다 — 선택적 네이티브 의존성이 ADR-013의 "로컬·GitHub 경로 동등성"을 깨기 때문. 그러나 이번에 조사한 참고 프로젝트(codebase-memory-mcp 158문법, Graft 21언어)와 논문 계열(RepoGraph·Aider repo-map 등) 전원이 tree-sitter 기반이고, Phase 3 Wave B의 import/call 엣지는 기존 엔진 체인(TS 컴파일러 API + 구조 파서)으로는 TS/JS 외 언어에서 한계가 있다. 쟁점: **WASM 배포(`web-tree-sitter` — Graft가 광역 티어 폴백으로 실사용)라면 네이티브 의존성 문제가 사라져 ADR-014의 기각 논거가 소멸하는가.**
- 임시 결정: Wave B는 tree-sitter 없이 기존 엔진 체인으로 TS/JS(해석 `resolved` + 이름 매칭 `reference`)와 Python/Go import까지만 추출한다. `symbolEngine` provenance는 유지.
- 필요한 결정: ⑴ `web-tree-sitter`(WASM)를 엔진 체인의 새 단계로 추가 — 네이티브 빌드 없이 다언어 확장, ADR-014는 "네이티브 tree-sitter 미채택"으로 좁혀 개정. ⑵ 현행 유지 — TS/JS 중심 시장이면 다언어 call 엣지는 수요 확인 전 불요. ⑶ 서버 측(워커) 한정 네이티브 tree-sitter — 로컬 CLI 경로와의 동등성 재검토 필요.
- 상태: open. Wave B 완료 후 TS/JS 외 언어 수요가 확인되는 시점에 판정. ⑴이 기본 후보 — Graft의 실사용 선례가 있고 가드레일·동등성을 건드리지 않는다.

## OQ-020 — VIBE 지표 이동은 QA형 벤치 하네스에서 관측 불가 (V2~V7)

- 발견: Phase 3 Wave F todo 14 — VIBE 주입 A/B 실모델 실행 준비(2026-08-25) / `scripts/vibe-injection-experiment.ts`, `benchmarks/vibe/measurement-preregistration.md`
- 내용: ADR-011-7의 채택 규칙("지표↑ AND 정확도↑")은 시행 안에서 지표값을 관측할 수 있음을 전제하지만, todo 13이 사전등록한 하네스는 QA형(숨긴 정답 4과제)이라 커밋·영수증·프롬프트 로그가 생기지 않는다. V1은 주입 지시가 유도하는 행동(증거 인용)을 답변에서 직접 관측할 수 있으나, V2(발견 해소)·V3(요구사항 증명)·V4(프롬프트 루브릭)·V5(receipt 연속성)·V6(verified commit)·V7(프롬프트 검증 가능성)은 세션형 하네스(에이전트가 실제로 커밋·기록을 남기는) 없이는 지표 이동을 관측할 수 없다.
- 임시 결정: 실행 전 측정 정의 보충(`measurement-preregistration.md`, SHA 잠금)으로 고정 — V1은 코퍼스 실존 경로 인용률로 관측, V2~V7은 정확도 악화 시 폐기(rejected)할 수 있으나 이 하네스에서는 채택(adopted)될 수 없고 측정값과 함께 pending 유지. 그리드·지시문·채택 규칙 자체는 불변.
- 필요한 결정: V2~V7의 Goodhart 게이트를 통과시키려면 세션형 하네스(작업 단위: 코드 변경 → 커밋 → 영수증 생성까지 시뮬레이트)를 새로 사전등록해야 한다. 팀 표면 노출(ADR-013 `unguarded-team-surface`)의 전제이기도 하므로, 팀 기능 착수 시점에 설계 판정.
- 상태: open.

## OQ-021 — 'pack' 잡 kind는 생산자·의미가 정의된 적이 없다

- 발견: Phase 2C todo 5 잔여 러너 구현(2026-08-31) / `supabase/migrations/202608100004_worker_credit_lifecycle.sql`(kind 화이트리스트), `apps/worker/src/run-local.ts`
- 내용: 'pack'은 Phase 1 BUILD_PLAN("scan/analyze/judge/pack jobs")부터 큐 화이트리스트에 예약됐지만, 이를 enqueue하는 코드·소비 스펙·테스트가 저장소 어디에도 없다. WORK_SPEC §12는 컨텍스트 팩을 **온디맨드·읽기 전용** MCP 선택(`request_context_pack` — READ_ONLY 주석, 영속 쓰기 없음)으로 확정했고, 최소 인덱스는 advisory PR 액션이다 — 어느 쪽도 큐 잡을 요구하지 않는다.
- 임시 결정: 워커는 `reservedPackHandler`(`apps/worker/src/reserved-jobs.ts`)를 등록한다 — 클레임된 pack 잡은 이 OQ를 가리키며 큰 소리로 실패한다(조용한 스킵 금지). 아무것도 enqueue하지 않으므로 실환경 영향은 없다.
- 필요한 결정: ⑴ kind 회수 — 새 마이그레이션으로 `enqueue_job` 화이트리스트에서 'pack' 제거(기존 마이그레이션 수정 금지 규칙 준수) ⑵ 생산자 정의 — 예: 커밋 후 워크스페이스 팩 사전계산(§12의 온디맨드 원칙과 충돌하므로 스펙 개정 필요) ⑶ 현행 예약 유지.
- 상태: open. 기본 후보는 ⑴ — 예약 kind는 미래 요구가 구체화되면 그때 다시 추가하는 편이 정직하다.

## OQ-022 — 리네임 이전에 발급된 프로덕션 receipt 12건이 정본 검증기에서 `invalid`가 된다

- 발견: judge·coach enqueue 표면 프로덕션 반영 후 receipt 검증 경로 점검(2026-09-02) / `packages/core/src/assurance/receipts.ts`(`2615910`), 프로덕션 `receipts.summary.statement` 실측
- 내용: `2615910`(Arr 호환 별칭 제거)이 receipt 스키마의 `tool.name`을 `z.literal("alrescha")`로 좁히고, 테스트에서 "리네임 이전 receipt는 계속 검증 가능"이라는 단언을 삭제하고 **레거시 `"arr"` 문장은 throw한다**는 단언으로 교체했다. 프로덕션에는 `tool.name = "arr"`인 receipt **12건**(2026-08-27~09-01 14:36)과 `"alrescha"` 1건이 있다. 현재 실제 영향은 없다 — 발급 체인은 `digest` 컬럼만 읽고(`latestReceiptDigest`), 라이브 웹·MCP는 저장된 statement를 스키마로 재검증하지 않으며, `verifyInTotoStatement`는 데모 fixture 화면에서만 호출된다. 그러나 커밋 카드의 실 receipt 상세(알려진 후속 과제)가 정본 검증기로 저장 statement를 검증하는 순간, 12건은 `verified`가 아니라 `invalid`("tool.name must be alrescha")로 읽힌다. 데이터 쪽 수정은 불가능하다 — `tool.name`은 canonicalize되는 statement 안에 있어 값을 바꾸면 digest가 어긋나 `tampered`가 된다(WORK_SPEC §13 불변성 그 자체).
- 임시 결정: 현행 유지(코드 무변경). 발급은 `"alrescha"`, 검증 경로는 아직 없음.
- 필요한 결정: ⑴ **읽기 측 스키마 분리** — 발급은 `literal("alrescha")`를 유지하되 `verifyInTotoStatement`는 `enum(["arr","alrescha"])`로 레거시를 수용(§13 "receipt는 계속 검증 가능해야 한다"를 지키는 유일한 길; 별칭 제거 커밋의 검증 테스트 단언을 되살림) ⑵ 12건을 레거시로 표시(`status`)하고 검증 대상에서 제외 — 정직하지만 §13 취지에 어긋남 ⑶ 현행 유지 — 실 receipt 상세 표면을 만들 때 다시 판단.
- 상태: **resolved (2026-09-02 사용자 지시로 ⑴ 구현)**. 발급 스키마(`inTotoStatementSchema`, `literal("alrescha")`)는 불변, 읽기 전용 `storedInTotoStatementSchema`(`RECEIPT_TOOL_NAMES = ["arr","alrescha"]`)를 신설해 `verifyInTotoStatement`가 그것으로 파싱·다이제스트 — 결과에 `toolName` 추가. 프로덕션 receipt 28건(arr 12 · alrescha 16)을 읽기 전용으로 내보내 실제 검증기로 **28/28 verified** 실측. 워커 재배포·마이그레이션 없음. 실 receipt 상세 표면은 별도 작업. 증빙 `.omo/evidence/phase2c/followup-receipt-legacy-read.md`.

## OQ-023 — 요구사항이 프로덕션에서 영속화되지 않아 요구사항 표면들이 비어 있다

- 발견: 요구사항 중의성 판단 표면 프로덕션 반영 후 스모크 준비(2026-09-02) / `packages/core/src/assurance/requirements.ts`(`extractRequirements`), `supabase/migrations/202608100002_evidence_graph_domain.sql`(`requirements` 테이블), 프로덕션 실측
- 내용: `requirements` 테이블과 `graph_nodes.kind = 'requirement'`는 데이터 모델에 있고 읽는 쪽(`/map` 워크스페이스 맵, MCP `supabase-store`, 새 판정 패널)도 있지만, **쓰는 쪽이 없다** — 워커의 scan(`apply_repository_scan`)·analyze(`PostgresAnalysisStore`)·로컬 인제스트 어디도 `public.requirements`에 insert하지 않는다(테스트 시드만). analyze는 `extractRequirements`로 요구사항을 **일시 추출**해 `missing-implementation` 등 finding을 내지만 요구사항 자체는 버린다. 프로덕션 실측: spec 아티팩트 17건·graph_nodes 585건(artifact 499·rationale 86) 중 requirement 노드 0, `requirements` 0행. 결과적으로 요구사항 중의성 판단 표면은 정확히 구현·배포됐으나 대상이 0건이고, 맵의 요구사항 레이어·MCP 요구사항 데이터도 비어 있다.
- 임시 결정: 표면은 유지(테이블이 채워지는 순간 동작 — DB 테스트로 증명됨). 프로덕션 스모크는 영속화 전까지 불가로 기록.
- 필요한 결정: ⑴ **analyze에서 추출한 요구사항을 영속화** — `graph_nodes`(kind requirement, provenance span) + `requirements`(statement·source_span·status)에 upsert, 사라진 요구사항은 `superseded`/`withdrawn`으로 전이(하드룰: 모든 노드에 provenance; 문장은 스펙 문서 텍스트라 원본 코드 본문 금지 규칙과 무관) ⑵ scan 단계에서 영속화(spec 아티팩트 파싱 시점) ⑶ 현행 유지(요구사항 표면들을 데모 전용으로 남김) — 비권장.
- 상태: **resolved (2026-09-02 사용자 지시로 ⑴ 구현)**. analyze 핸들러가 `prepareAssuranceContexts`의 추출 결과를 `PostgresAnalysisStore.reconcileRequirements`로 영속화 — `graph_nodes`(kind requirement) + `requirements`(source_artifact_id·statement·source_span{path,startLine,endLine,origin}·status) upsert, 사라진 요구사항은 `superseded`(삭제 금지 — 판정·엣지 대상 보존). 식별자는 `deterministicUlid(ws|repo|경로|REQ코드 ?? 문장)`로 재분석 수렴. 마이그레이션 불필요. 증빙 `.omo/evidence/phase2c/followup-requirement-persistence.md`.

## OQ-024 — MCP 툴 등록의 잔여 요청당 비용을 없애려면 핸들러 인자 타입을 포기해야 한다

- 발견: 성능 리서치 중기 과제 MT-10 구현 중(2026-09-03) / `packages/mcp/src/hosted.ts`, `.omo/evidence/perf/mt-10.md`
- 내용: `createMcpHandler`는 요청마다 서버 팩토리를 호출한다. MT-10에서 22개 툴 정의와 66개 인라인 `z.object`를 모듈 스코프로 호이스트해 지배적 비용(동일 형태 스키마 44개 생성 실측 7.287ms)을 제거했고, `tools/call` p50 3.242ms → 1.415ms로 측정됐다. 남은 것은 `new McpServer` + `registerTool` × 22 = 실측 약 2.041ms/요청이며 이는 SDK 내부 비용이다. 리서치 보고서의 제안대로 `z.toJSONSchema` 사전 계산 + SDK의 `fromJsonSchema()` 등록으로 이를 없앨 수 있으나, `fromJsonSchema<T = unknown>`이므로 22개 핸들러 전부가 인자 타입을 잃는다(현재는 zod 스키마에서 추론된 타입으로 정적 검사됨).
- 임시 결정: 호이스트까지만 적용하고 `registerTool` 잔여 비용은 남긴다. 타입 안전성을 조용히 맞바꾸지 않는다.
- 필요한 결정: ⑴ 현행 유지 — 약 2ms/요청을 정적 타입 검사의 대가로 수용(기본값) ⑵ `fromJsonSchema` 등록으로 전환하되 각 핸들러에 명시적 인자 타입 주석을 달아 검사를 복원 ⑶ 요청당 서버 재구축 자체를 없애는 상류 SDK 변경을 기다린다(팩토리는 SDK 계약이라 이 저장소에서 단독으로 바꿀 수 없음)
- 상태: open

## OQ-025 — 파일럿에 자격증명 없는 알림 수단이 없다

- 발견: 배포 체크리스트 실측·운영 항목 구현(2026-09-03) / `docs/DEPLOYMENT_CHECKLIST.md` "Alert on repeated invalid webhook signatures and cross-tenant/RLS errors", `docs/DEPLOYMENT_RUNBOOK.md` §10.3
- 내용: 체크리스트는 **알림**(alert)을 요구하지만, 거절된 webhook(반복 서명 불일치)과 RLS 거부는 저장 전에 끝나므로 DB에서 보이지 않고 콘솔 로그에만 남는다. 그 로그를 사람 없이 감시하려면 Vercel **Log Drains**(Pro 이상) 또는 Fly metrics → Grafana/Alertmanager 같은 외부 수신점이 필요하고, 둘 다 **새 자격증명과 비용**을 부른다. 현재 프로덕션은 Vercel Hobby·Fly personal·Supabase 무료 조합이다. 따라서 지금 구현된 것은 알림이 아니라 **사람이 돌리는 점검**(`pnpm ops:health`)과 콘솔 감시 절차다 — 항목의 문자적 요구("alert on")는 미충족이다.
- 임시 결정: 자격증명이 필요 없는 범위만 구현했다 — DB에서 보이는 7개 신호는 `scripts/ops-health.ts`가 종료 코드로 판정하고(`alert` 3종은 관측 가능한 불변식 위반), 보이지 않는 3종은 런북 §10.2에 위치·검색어·판독법을 적었다. Fly의 앱 사망 이메일과 Vercel의 배포 실패 알림(둘 다 기본 켜짐)이 현재의 유일한 무인 알림이다. 체크리스트 항목은 이 범위로 체크하고 한계를 명시했다.
- 필요한 결정: ⑴ **파일럿 동안 현행 유지** — 워크스페이스 1개·운영자 1명 규모에서는 하루 1회 수동 점검이 실질적으로 충분하고, `ops-health`의 alert 3종이 조용한 실패(prune 미동작·감사 유실·리스 누수)를 잡는다. ⑵ Vercel Log Drains 또는 Fly metrics 스택 도입 — 비용·자격증명 승인 필요(GUIDE §2 Phase 단위 준비물). ⑶ `ops-health`를 GitHub Actions 스케줄로 돌려 실패 시 이슈 생성 — **CI가 없다는 별개 문제**(OQ-026)와 프로덕션 `DATABASE_URL`을 Actions 시크릿에 넣는 판단이 함께 필요하다.
- 상태: open. ⑴이 기본값으로 진행 중. 두 번째 워크스페이스가 붙거나 운영자가 매일 볼 수 없게 되는 시점이 재판정 트리거.

## OQ-026 — 자동 게이트를 강제하는 CI가 없다

- 발견: 배포 체크리스트 실측(2026-09-03) / `docs/DEPLOYMENT_CHECKLIST.md` "Automated gate", 레포에 `.github/` 부재
- 내용: 체크리스트의 "Automated gate"는 `pnpm install --frozen-lockfile` 이하 6개 명령을 요구하고 `AGENTS.md`는 "세션 종료 시 lint/typecheck/test green"을 하드룰로 둔다. 그런데 레포에 워크플로가 없다 — 게이트는 **에이전트/운영자의 로컬 머신에서만** 돈다. 그 결과 ⑴ 락파일 고정은 관행일 뿐 강제되지 않고 ⑵ `main` 푸시는 게이트 통과 여부와 무관하게 Vercel 배포를 트리거하며(Vercel 빌드 성공 ≠ 테스트 통과) ⑶ 체크리스트의 "Pin reviewed … lockfile" 항목은 파일이 존재한다는 것 이상을 보장하지 못한다.
- 임시 결정: 현행 유지. 게이트는 커밋마다 로컬에서 돌리고 수치를 커밋 메시지에 남긴다(기존 관행). 체크리스트 항목은 실측된 핀 값으로 체크하되 "No CI enforces `--frozen-lockfile`"를 항목과 알려진 한계에 명시했다.
- 필요한 결정: ⑴ **GitHub Actions에 게이트 워크플로 추가** — 자격증명 불필요(단위 테스트는 PGlite, e2e는 별도 판단). `main` 보호 규칙과 함께 도입해야 실효가 있다. ⑵ Vercel의 Ignored Build Step으로 게이트 실패 시 배포 차단 — Vercel 빌드 안에서 테스트를 돌리는 형태, 빌드 시간·한도 영향. ⑶ 현행 유지 — 운영자 1명 규모에서는 로컬 게이트가 실질적으로 동등하다는 판단.
- 상태: open. e2e가 로컬 Supabase·Docker에 의존하므로 ⑴을 하더라도 단위·lint·typecheck만 CI로 올리고 e2e는 로컬에 남기는 분할이 현실적 후보.

## OQ-027 — BYOK가 체크리스트에서는 필수, 런북에서는 선택이다

- 발견: 배포 체크리스트 실측(2026-09-03) / `docs/DEPLOYMENT_CHECKLIST.md` "Configure server-only secrets", `docs/DEPLOYMENT_RUNBOOK.md` §5·§6, `flyctl secrets list -a arr-worker`
- 내용: 체크리스트는 `BYOK_ENCRYPTION_KEY`를 서버 전용 시크릿 6종의 하나로 **필수처럼** 나열하고 `docs/SECURITY_CHECKLIST.md`도 "BYOK ciphertext is stored separately"를 점검 항목으로 둔다. 반면 런북은 Vercel·Fly 양쪽에서 이 값을 **선택(BYOK 사용 시)**으로 표시한다. 프로덕션 실측 결과 워커에는 이 시크릿이 **없다**(Vercel 쪽은 이 에이전트가 읽을 수 없었다). 즉 문서 두 개가 같은 값의 필수성에 대해 다르게 말하고, 실제 배포는 런북 쪽을 따르고 있다.
- 임시 결정: 런북을 실태로 인정하고 체크리스트 항목을 체크했다 — 필수 5종은 기능으로 존재를 증명했고, `BYOK_ENCRYPTION_KEY`는 "파일럿에 BYOK 경로가 없으므로 필수가 아니다"라고 항목에 명시했다. 가드레일·코드는 손대지 않았다.
- 필요한 결정: ⑴ **파일럿 범위에서 BYOK를 명시적으로 미제공으로 선언**하고 체크리스트에서 조건부 항목으로 내린다(런북·PRIVACY·SECURITY_CHECKLIST의 BYOK 문구도 "제공 시" 조건부로 통일) — 지금의 실태와 일치. ⑵ BYOK를 파일럿 기능으로 확정하고 `BYOK_ENCRYPTION_KEY`를 양쪽 환경에 설정한 뒤 암호문 분리·평문 비유출을 프로덕션에서 실증한다 — 체크리스트·SECURITY_CHECKLIST 문구는 그대로. ⑶ 현행 유지(문서 불일치 존속) — 비권장.
- 상태: open. `/app/settings`에 BYOK 표면이 실제로 노출되는지가 판정 입력 — 노출된다면 ⑵ 외의 선택지는 정직하지 않다.

## OQ-028 — 3개 테이블에 `force row level security`가 빠져 있다

- 발견: 배포 체크리스트 실측 중 RLS 커버리지 확인(2026-09-03) / `supabase/migrations/202608170003_rationale_nodes.sql`, `202608240002_concept_graph.sql`, `202608240003_module_summaries.sql`, 프로덕션 `pg_class` 실측
- 내용: 프로덕션 `public` 스키마의 테이블 43개 전부 RLS가 켜져 있지만 `relforcerowsecurity`는 **40개만** 참이다. 빠진 셋은 `concepts`·`module_summaries`·`rationales`이고, 원본 마이그레이션 3건이 `alter table … enable row level security`만 쓰고 `force row level security` 줄을 누락한 것이 원인이다(나머지 마이그레이션은 두 줄을 쌍으로 쓴다 — 레포 관행). 실질 노출은 아니다: `force`는 **테이블 소유자에게** RLS를 적용하는 스위치이고, 앱 경로는 `authenticated`(RLS 적용됨) 또는 `service_role`(어차피 bypass)로 접근하므로 교차 테넌트 경로가 열리지는 않는다. 그러나 소유자 롤로 무엇이든 연결되는 순간(마이그레이션·수동 조회·향후 DB 함수) 세 테이블만 정책이 무시된다.
- 임시 결정: 이번 작업 범위(체크리스트 정합·운영 항목)에서 제외하고 기록만 남겼다. 세 테이블은 `docs/SECURITY_CHECKLIST.md`가 RLS 격리를 명시적으로 요구하는 대상(evidence·credits·MCP 토큰·access events·`security_audit_events`)에 포함되지 않으므로 배포 항목을 막지 않는다.
- 필요한 결정: ⑴ **관행에 맞추는 마이그레이션 추가** — 세 테이블에 `force row level security`를 켜고 `ALL_MIGRATIONS`에 등록, RLS 격리 테스트에 세 테이블을 편입. 작고 되돌릴 수 있으며 관행 이탈을 없앤다(기본 후보). ⑵ 관행 자체를 재검토 — `force`가 실제로 무엇을 막는지 판정하고 필요 없다면 40개에서 빼는 방향으로 통일. ⑶ 현행 유지 — 이탈을 문서로만 남김, 비권장.
- 상태: open. ⑴은 별도 작업 단위로 분리했다(이 세션의 범위를 넘는 보안 의미 변경이므로 테스트 동반이 필요).

## OQ-029 — 레포 연결만으로는 첫 스캔이 인큐되지 않는다 (WORK_SPEC §4.1-4 미구현)

- 발견: Phase 4 사전 조사(2026-09-03) / `spec/RESEARCH_GRAPH_SECONDBRAIN_2026-09-03.md` §4.3, `apps/web/lib/github/connect-repository.ts`, `apps/web/lib/github/onboarding-store.ts:102-140`, `supabase/migrations/202608100004_worker_credit_lifecycle.sql:511-520`
- 내용: `scan`·`analyze` 잡을 인큐하는 유일한 코드는 `ingest_github_webhook_event`(push/check_run/workflow_run 웹훅)다. 레포 연결(`connectSelectedRepository` → `saveSelectedRepository`)은 `repositories` upsert와 감사 이벤트만 남긴다. WORK_SPEC §4.1-4 "레포 선택 → 첫 스캔이 백그라운드 잡으로 시작"은 구현되지 않았고, 따라서 **더 이상 푸시가 없는 완성된 레포는 연결해도 영원히 빈 그래프**다. 오늘의 유일한 우회는 더미 커밋 푸시다.
- 임시 결정: 현행 유지(코드 무변경). 사용자에게는 "연결 후 한 번 푸시"를 안내.
- 필요한 결정: ⑴ **연결 직후 백필 스캔** — `enqueue_backfill_scan(workspace, repo, head_sha)` SQL 함수(멱등 키 `backfill:<repoId>:<headSha>`)를 연결 성공 경로에서 호출하고, 같은 함수를 "다시 스캔" 버튼과 MCP `request_rescan`이 재사용. scan/analyze는 `enqueue_job`이 credit_cost≠0을 거부하므로 구조상 0크레딧(하드룰 ⑦ 자동 준수) ⑵ 웹훅 전용 유지 + 온보딩 카피로 "첫 푸시" 유도 ⑶ 설치(`installation`/`installation_repositories`) 이벤트에서 인큐 — 단 이벤트는 레포 목록만 싣고 HEAD sha가 없어 별도 조회 필요.
- 상태: open. 기본 후보 ⑴ — `BUILD_PLAN_PHASE4.md` Wave C todo 11.

## OQ-030 — 로컬 인제스트(`alrescha push`) 레포는 analyze·enrich를 받을 수 없다

- 발견: Phase 4 사전 조사(2026-09-03) / `supabase/migrations/202608170002_local_ingest.sql:147-160`(`ensure_local_repository`가 `installation_id` 미기록), `apps/worker/src/run-local.ts:144-151`(`join public.github_installations` → "repository … is not connected" throw)
- 내용: 로컬 경로는 `apply_repository_scan`으로 artifacts·graph_nodes·index_entries·imports/calls까지는 채우지만, 워커의 소스 팩토리가 GitHub 설치를 전제하므로 analyze(요구사항·findings)와 enrich(요약·concept)는 영원히 돌지 않는다. ADR-015는 receipt 부재를 이미 확정했지만, **요약·concept 부재**는 ADR-015의 범위(보증) 밖이며 판정된 적이 없다.
- 임시 결정: 현행 유지. CLI 출력의 "GitHub 연결 시 보증이 열린다" 안내를 "분석·요약도 열린다"로 정확히 하는 것만 허용.
- 필요한 결정: ⑴ **로컬 서빙 모드** — `alrescha serve --local <dir>`: 로컬 스캔 → `InMemoryMcpStore`(이미 export) → stdio MCP, enrich는 BYOK 키가 있을 때만 프로바이더 직접 호출(산문 검증기 동일). 서버 본문 전송 없음 → 하드룰 ③ 준수 ⑵ 호스티드 워커가 로컬 레포를 분석 — 본문 전송이 필요해 하드룰 ③·ADR-013 위반 위험, 기각 후보 ⑶ 현행 유지(로컬 경로는 그래프 전용 가교).
- 상태: open. 기본 후보 ⑴ — Wave C todo 12.

## OQ-031 — 심볼(함수·클래스) 노드 1급화는 읽기 상한·클러스터 임계와 충돌한다

- 발견: Phase 4 사전 조사(2026-09-03) / R4 §3.2·§3.8 ④, `apps/web/lib/map/workspace-map.ts:162,543-545`(`MAP_CLUSTER_THRESHOLD 600`, `NODE_LIMIT 2000`, `EDGE_LIMIT 6000`), `packages/core/src/ingest/code-links.ts:397`(엣지는 `(kind, sourcePath, targetPath)`당 1개)
- 내용: 심볼은 `artifacts.exported_symbols`·`index_entries.symbols`에만 있고 `graph_nodes` 행이 아니다. 따라서 "함수↔함수" 엣지는 원리적으로 불가능하고 call 엣지는 파일↔파일로 집계되어 `utils.ts`류 허브가 헤어볼을 만든다. 심볼을 노드로 승격하면 파일럿 370파일 레포에서 노드가 수천 개로 늘어 읽기 상한(2,000)과 클러스터 임계(600)를 즉시 넘고, 현재 `clusterGraph`는 `type:grade` 15개 슈퍼노드를 인접 인덱스 사슬로 잇는 임의 구조다(`graph-model.ts:433-467`).
- 임시 결정: Wave A~E는 파일·폴더·문서·요구사항·개념 계층만으로 진행(심볼 노드 없음). 파일↔파일 `calls` provenance의 심볼 목록(≤8)은 인스펙터에 표시.
- 필요한 결정: ⑴ **계층 LOD 로딩** — 기본 로드는 파일 레벨(폴더 접힘 포함 ≤ 2,000), 포커스·확대 시 해당 파일의 심볼과 `declares`·심볼 `calls`를 `get_neighbors`형 부분 쿼리로 로드, 슈퍼노드는 폴더/모듈 기반으로 교체 ⑵ 심볼을 노드로 두되 맵은 파일 레벨만 렌더하고 MCP만 심볼 레벨 노출 ⑶ 현행 유지(심볼은 메타데이터).
- 상태: open. 기본 후보 ⑴ — Wave F todo 18의 전제. 다언어 심볼 정밀도는 OQ-019와 결합.

## OQ-032 — 지시 블록은 id-first를 강제하지만 기법 실측은 id-first를 off로 권고했다

- 발견: Phase 4 사전 조사(2026-09-03) / `apps/web/lib/mcp/instruction-blocks.ts:24-37`, `packages/mcp/src/repo-map.ts:223`(`flow: search_nodes → get_neighbors/trace_path → get_node_content (ids first, bodies last)`), `benchmarks/databrain/techniques.real.md`(id-first −26.84% 토큰·−2.78pp 회수율 → off), `benchmarks/graph-surface/results.v1.md`·`results.v2.md`(NOT MET: 턴 +2.0–2.3, PASS −8.3–−12.5pp), `.omo/evidence/phase3/followups-2026-08-25.md` §3
- 내용: 실측은 두 방향에서 같은 말을 한다 — ⓐ id-first 계층 로딩은 토큰을 크게 줄이지만 회수율을 깎는다(사전등록 게이트 "하락 = off") ⓑ 그래프군은 다단계 프로토콜(schema→map→search→neighbors→content) 때문에 최소 3–4턴을 강제해 파일 탐색(grep 1–2회)에 턴·정확도에서 지고, 일부 모델은 턴 캡을 소진한다(정지 문제). 그런데 제품이 출하하는 지시 블록·`get_graph_schema.text`·5종 그래프 툴은 id-first를 기본 경로로 강제하고, 최소 인덱스 PR은 전혀 다른 워크플로(`request_context_pack` 우선)를 지시한다.
- 임시 결정: 문안 무변경. Wave E 전까지 지시 블록은 현행.
- 필요한 결정: ⑴ **하나의 워크플로로 통일하고 id-first를 관계형 질의로 한정** — 기본 진입은 `search_index`(발췌 포함), 관계·영향·경로 질의만 그래프 툴, 3회 조회 후 미해결이면 파일 탐색으로 폴스루한다는 정지 규율을 문안에 포함; 두 생성기(`instruction-blocks.ts`·`minimal-index.ts`)가 같은 상수를 참조 ⑵ Graphify식 훅 strict(파일 읽기 차단) — 정지 문제를 악화시킬 위험이 크므로 옵트인 스니펫으로만 ⑶ 현행 유지 + v3 벤치로 먼저 측정.
- 상태: open. 기본 후보 ⑴ + v3 사전등록에 "설치된 지시 블록" 포함 — Wave E todo 16·17.

## OQ-033 — `doc_page`(사람이 읽는 AI 문서 페이지)와 WORK_SPEC §1.6 ② "주문형 서빙 전용" 문구

- 발견: Phase 4 사전 조사(2026-09-03) / R4 §3.6·§4.5 G3, `spec/WORK_SPEC.md:66`(② LLM Wiki — "주문형 서빙 전용 — 정적 파일에 절대 인라인하지 않음"), 하드룰 ③·⑤
- 내용: 사용자는 MCP가 완성된 레포를 문서로 정리해 그래프 뷰에서 보이길 원한다. 현재 산문 3종(파일·모듈·concept 요약)은 MCP 또는 그래프 라벨로만 노출되고 사람이 읽는 페이지·노드 타입·라우트가 없다. `doc_page`를 그래프 노드 + 웹 라우트 + MCP 툴로 서빙하는 것은 "정적 파일 인라인 금지"(⑤)와 충돌하지 않는다 — 레포 파일로 커밋하지 않고 주문형으로 서빙하며, 본문은 이미 저장된 산문의 조합이므로 원본 코드 비저장(③)도 자동 준수한다. 다만 §1.6 ②의 "문서 간 상호링크·백링크 그래프 + 문서별 요약·관련문서 캐시"라는 정의는 **생성된 페이지**를 명시적으로 포함하지 않는다.
- 임시 결정: `doc_page`는 `inferred` CHECK 제약·`source_node_ids NOT NULL`·코드 스니펫 금지 검증기로 설계하고(Wave D todo 14), §1.6 ② 문구는 개정하지 않는다(에이전트는 spec 수정 불가).
- 필요한 결정: ⑴ WORK_SPEC §1.6 ②에 "생성된 문서 페이지(`inferred`, 근거 노드 필수, 저장 산문만 조합)는 LLM Wiki 레이어의 일부이며 주문형 서빙 대상"을 추가(사용자 결정) ⑵ 현행 문구로 충분하다고 판정 ⑶ 위키 페이지를 비목표로 되돌림.
- 상태: open. 기본 후보 ⑴.

## OQ-034 — `.alrescha.json` 레이아웃 관례 설정과 "facet은 읽기 시점 유도, 저장 사본은 드리프트한다" 원칙

- 발견: Phase 4 사전 조사(2026-09-03) / `packages/core/src/ingest/artifact-facets.ts:3-10,44-53,92`, `spec/BUILD_PLAN_PHASE2D_UI.md` todo 4의 구현 판단, ADR-013
- 내용: facet은 경로 규약에서 읽기 시점에 유도되며(사본 드리프트 방지, 두 경로 동등성 자명), 규약은 이 레포의 모노레포 관례(`apps/web/`·`apps/`·`packages/`)로 하드코딩되어 있다. 다른 레이아웃은 `unclassified`가 되고 `deriveBrainArea`가 이를 `backend`로 흡수해 밴드가 2개로 붕괴한다. `database` 도메인은 어휘에 없다. 관례를 레포별로 설정 가능하게 하려면 설정의 출처와 저장 위치를 정해야 한다.
- 임시 결정: Wave A todo 4는 ⓐ 기본 관례를 일반화(`frontend/ backend/ server/ api/ src/app/ prisma/ migrations/ …`)하고 ⓑ `unclassified`를 `기타`로 정직 표시하며 ⓒ `.alrescha.json`은 **레포 내 파일**로만 받아 스캐너가 아티팩트로 읽고 커밋 sha와 함께 `repositories.layout_config`에 저장, `deriveArtifactFacets`에 선택 인자로 주입한다(설정 없는 레포는 기본값 — 회귀 스냅샷 불변).
- 필요한 결정: ⑴ 위 임시 결정을 정식화 — 설정은 커밋에 묶인 아티팩트이므로 "저장 사본 드리프트"가 아니라 "커밋의 일부"이고, CLI/GitHub 두 경로가 같은 커밋에서 같은 파일을 보므로 ADR-013 동등성 유지 ⑵ DB(워크스페이스 설정 UI)만 허용 — CLI 경로가 설정을 볼 수 없어 동등성 위반, 기각 후보 ⑶ 설정 불허, 기본 관례 일반화만.
- 상태: open. 기본 후보 ⑴.

## OQ-035 — co_changed 백필과 ADR-013 동등성

- 발견: Phase 4 은하수 설계 판정(2026-09-04) / `spec/RESEARCH_GALAXY_MONETIZATION_2026-09-04.md` §2.3·§2.5, `apps/web/lib/github/webhook-store.ts:31-44`, `supabase/migrations/202608230003_file_co_changes.sql:45-88`, `apps/web/lib/map/workspace-map.ts:443-470`
- 내용: co_changed는 오늘도 `record_push_co_changes`가 웹훅 배달(inserted)에서만 기록되어 CLI(`alrescha push`) 레포에는 존재하지 않는다 — 이미 두 경로가 불평등하다. 통합 설계는 정적 패밀리가 못 잇는 doc↔sql↔css 사이클의 원천으로 co_changed를 쓰되 기존 레포의 히스토리 백필(GitHub commits API 최근 N커밋)을 제안했는데, 이는 GitHub 경로 전용이라 ADR-013(두 경로 동일 그래프)의 비대칭을 키운다.
- 임시 결정: 백필 없음. co_changed는 웹훅 누적분만 읽기 시점 유도(표시 전용·토글, PageRank·MCP 기본 제외).
- 필요한 결정: ⑴ 플랜에 `coChanges[]`를 실어 CLI(로컬 git log)와 서버(GitHub commits API)가 동일 규칙(최근 400커밋·커밋당 2–50파일·sha 정렬)으로 계산하고 플랜 바이트 동등성 테스트로 고정 ⑵ co_changed를 "표시 전용 파생층"으로 규정해 동등성 계약 밖에 둔다(현행 확장) ⑶ 백필을 GitHub 경로 전용 옵션으로 두고 CLI 카드에 부재를 표기.
- 상태: open. 기본 후보 ⑵ — ADR-015가 로컬 경로를 "그래프 전용 가교"로 규정한 정신과 정합.

## OQ-036 — `tests` relation의 의미와 영수증 `implVerified` 라벨 — verified 정의가 제품 안에 둘이다

- 발견: Phase 4 설계 판정·감사 반박(2026-09-04) / `apps/web/lib/map/workspace-map.ts:168`(SUPPORTING_RELATIONS), `packages/core/src/assurance/rules.ts:610-655`(assuranceCoverage implVerified = 체크박스 또는 명시 심볼), `apps/web/lib/strings/assurance.ts:161-162`, `tests/workspace-map.test.ts:200`
- 내용: ⑴ 통합 설계는 테스트 파일→대상 파일 import에서 `tests` 엣지를 파생한다(reference 0.6). `tests`는 `SUPPORTING_RELATIONS`에 속해 있어 이름만으로는 "실행 증거"처럼 읽힐 수 있다 — 승격 자체는 소스가 evidence 노드일 때만 일어나 구조상 막히지만, `impact_of`가 이를 커버리지로 읽으면 하드룰 ①의 정신에 닿는다. ⑵ 영수증은 체크박스(사용자 주장)를 "구현 verified"로 세는 반면 맵은 실행 증거 없이는 verified를 주지 않는다 — 같은 단어가 두 의미로 쓰인다.
- 임시 결정: `tests`는 reference 0.6·method `test-import`로 기록하고 "아티팩트 소스 tests 엣지는 verified를 만들지 않는다"를 테스트로 고정. 영수증 라벨은 현행 유지.
- 필요한 결정: ⑴ relation 이름을 `covers`(구조 관계)로 분리하고 `tests`는 실행 증거 엣지 전용으로 예약; 영수증의 `implVerified`를 "체크됨(사용자 주장)"으로 라벨 정정 ⑵ 이름 유지 + method로 구분 + 카피 정정 ⑶ 현행 유지.
- 상태: open. 기본 후보 ⑴.

## OQ-037 — `layoutOnly` 엣지와 도메인 forceX/forceY 앵커는 "그래프 엣지가 아닌 레이아웃 입력"이다 — 하드룰 ②의 적용 범위

- 발견: Phase 4 설계 판정(2026-09-04) / `spec/RESEARCH_GALAXY_MONETIZATION_2026-09-04.md` §2.5·§2.6, WORK_SPEC §3-2
- 내용: 통합 설계는 `contains`를 힘장 전용(`GraphData.layoutOnly`, near에서만 α 0.08)으로 두고, 파일→domain은 엣지로 만들지 않는 대신(차수 300 허브 = 헤어볼) 옵트인 forceX/forceY 앵커(강도 ≤0.05, 기본 off)로 카테고리 방향을 준다. contains는 저장 엣지(provenance `{reason:'path containment', tier:'resolved'}`)라 하드룰 ②를 지키지만, 앵커는 저장되지 않는 레이아웃 입력이며 "그래프에 없는 링크가 레이아웃을 정한다"는 회색지대다.
- 임시 결정: 앵커·layoutOnly 플래그를 `GraphData` 타입으로 격리하고 MCP·인스펙터·표에 노출하지 않는다. 기본 off.
- 필요한 결정: ⑴ WORK_SPEC §3-2에 "provenance 요구는 저장 엣지(`edges` 행)에 적용되며 렌더 레이아웃 입력은 엣지가 아니다"는 한 문장을 추가(사용자 결정) ⑵ 앵커를 금지하고 카테고리는 색·허브·접힘으로만 ⑶ 현행 격리 유지.
- 상태: open. 기본 후보 ⑴.

## OQ-038 — 읽기 상한의 패밀리별 재설계 (OQ-031 확장)

- 발견: Phase 4 설계 판정(2026-09-04) / `apps/web/lib/map/workspace-map.ts:543-545`(NODE_LIMIT 2,000·EDGE_LIMIT 6,000·FEED 20), `apps/web/lib/mcp/supabase-store.ts:457-525`(loadWorkspace 상한 없음)
- 내용: 통합 설계의 이 레포 추정은 엣지 ~4,000(contains ~890 포함)이고 전형 800파일 레포는 ~3,200이지만, 설계 4안의 전형 레포 추정치 7,570처럼 단일 EDGE_LIMIT 6,000을 넘는 경우가 있다. 설계 1은 5,000/20,000 일괄 상향을 제안했으나 이는 OQ-031 판정을 선점한다. 또한 MCP `loadWorkspace`는 상한·필터 없이 전량을 읽어 어떤 설계든 엣지가 5k로 늘면 모든 툴 호출 비용이 된다.
- 임시 결정: 파일 레벨 NODE_LIMIT 2,000 유지. 허브는 별도 쿼리·별도 상한(directory ≤300·route ≤100·db_object ≤100·section ≤100). 엣지는 `edges.family`로 패밀리별 상한(structure 6,000·doc 6,000·hierarchy 6,000·database 3,000·route 1,000·statistical 3,000·semantic 3,000) 병렬 쿼리. MCP는 structure+evidence+semantic만 기본 로드, hierarchy/database/route는 툴 호출 시 부분 쿼리.
- 필요한 결정: ⑴ 위 임시 결정을 정식화하고 파일 1,800+ 레포의 레벨 0(허브 + 병합 엣지) RPC 도입 시점을 정한다 ⑵ 단일 상한을 8,000 등으로 상향 ⑶ 컬럼형 `load_graph_view` RPC로 전환(패밀리별 쿼리 TTFB 측정 후).
- 상태: open. 기본 후보 ⑴.

## OQ-039 — 프로덕션 아티팩트에 본문이 없어 enrich(크레딧) 전에는 MCP·검색·팩이 내용을 서빙하지 못한다 (제품 결정)

- 발견: Phase 4 기능 감사 반박·비평(2026-09-04) / `apps/web/lib/mcp/supabase-store.ts:479-481`(select에 content 없음), `:613-614`(`content: metadata.summary ?? ""`), `supabase/migrations/202608100002_evidence_graph_domain.sql:54-74`(artifacts 컬럼), `202608240001_enrich_pass.sql:338-352`, `packages/mcp/src/data-brain.ts:162`(발췌 = content.slice), `packages/core/src/context/context-pack.ts:118-120`(estimateTokens 최소 1), `docs/DEPLOYMENT_CHECKLIST.md:96-97`(프로덕션 access event 1건)
- 내용: 하드룰 ③(원본 코드 비저장)의 직접 귀결로 `artifacts`에는 본문 컬럼이 없고, MCP 스토어는 enrich 잡이 쓴 `metadata.summary`(≤1,500자, inferred) 또는 빈 문자열을 content로 합성한다. 따라서 enrich를 돌리지 않은(=크레딧을 쓰지 않은) 워크스페이스에서 `get_node_content`·`get_artifact`·`search_index` 발췌·`request_context_pack` 본문·TODO.md 체크박스 읽기가 전부 비고, `/app/stats`의 "전체 덤프 대비 k% 감소"는 문서 개수 비율로 퇴화한다. WORK_SPEC §1.6 ③④가 말하는 "결정론·크레딧 0" 색인은 경로·제목·헤딩·심볼명까지이고 "내용"은 크레딧 뒤에 있다. 이는 토큰 미터 정직성·todo 읽기·위험 컨텍스트·첫인상(T2FV)·벤치 대표성(픽스처 본문 코퍼스로 측정한 v2)을 동시에 흔든다.
- 임시 결정: 현행 유지. 문서·계획에서 "무료 사용자의 MCP는 enrich 전 내용이 없다"를 명시. graph-surface v3는 프로덕션 형태(요약 전용 스토어)로 그래프군을 구성한다.
- 필요한 결정: ⑴ **결정론 발췌 서빙** — 문서는 헤딩·체크박스·요구사항 문장(이미 저장) 등 구조 요소를, 코드는 심볼명·span을 요약 없이 서빙(하드룰 ③ 무충돌: 본문이 아니라 구조 메타데이터) ⑵ **첫 enrich 1회 무료**(Pro 포함 크레딧 또는 무료 티어 1회) ⑶ 문서(마크다운)에 한해 본문 저장을 허용하는 ADR 개정 — 코드가 아니므로 하드룰 ③ 문구 재검토 ⑷ 현행 유지(빈 화면 수용).
- 상태: open. 기본 후보 ⑴+⑵ 병행 — 사용자 결정 필요(과금·스펙 문구에 걸림).

## OQ-040 — 가격 티어·게이트·결제 경로 (사용자 결정)

- 발견: Phase 4 상업성 조사·비평(2026-09-04) / `spec/RESEARCH_GALAXY_MONETIZATION_2026-09-04.md` §3·§4.6, WORK_SPEC §15(`:450` "MVP는 과금 코드 없이 원장만"), §16 결제 비목표, `supabase/migrations/202608100009_release_hardening.sql:2-5`(Free/Pro 차이 중 구현된 유일한 것 = 보존 기간), `apps/web/app/api/mcp/route.ts`(레이트 리밋 없음)
- 내용: 시장은 그래프·MCP·위키를 무료로 기대하고(OSS 상품화), 좌석당 돈을 내는 것은 PR/머지 시점 판정($24–72)과 호스팅·자동 재인덱싱·팀 동기화($29–30)다. 컨텍스트 MCP 단독 호스티드는 솔로 $10–30(중앙값 ~$19). 개발자 대상 프리미엄 전환 중앙값 ~5%, AI 네이티브 GRR 40%($50 미만 23%). BYOK=0 크레딧은 드문 관대함(차별점이자 매출 상한). 제품에는 plan 컬럼·게이트·결제 경로·레포 수 제한·MCP 레이트 리밋이 없다.
- 임시 결정: 없음(구현 착수 안 함). 계획은 "그래프 뷰·결정론 스캔·MCP 읽기는 무료, 판정·호스팅·동기화·히스토리·팀이 유료"를 전제로 작성.
- 필요한 결정: ⑴ 티어 — Free(프라이빗 레포 1개·파일 수 캡·결정론 전부·BYOK 무제한·만료 없는 소량 판정 크레딧·수동 재스캔) / Pro $20(연납 $17; 레포 5개·푸시마다 자동 재스캔·히스토리 무제한·포함 크레딧·위험 상세·자동 재판정·내보내기) / Team flat $60–100(5석·공유 크레딧·공유 메모리·대시보드) ⑵ 크레딧 단위 — 토큰이 아니라 결과 단위(판정 1건=1크레딧, 심층 impact 3크레딧), 실행 전 예상 표시, 초과 시 "중단" 기본, 결정론 기능은 계속 동작하는 점진적 저하 ⑶ 온보딩 — 카드 없는 옵트인 프리미엄 + 14일 리버스 트라이얼, 한도 도달 시 인앱 업그레이드 ⑷ 게이트 구현 순서(plan 컬럼·레포 수·보존·크레딧 소진 동작·MCP 레이트 리밋)와 결제 제공자 — §16 비목표 재판정.
- 상태: open. 사용자 결정 전까지 계획의 "유료 번들" 절은 정의만 담는다.

## OQ-041 — 스펙 없는 레포의 요구사항 부트스트랩 — 드리프트(유료 차별화)가 타깃 사용자에게 없다

- 발견: Phase 4 비평(2026-09-04) / `packages/core/src/assurance/rules.ts:411,438,570,634`(`classification === "spec"` 게이트), `packages/core/src/assurance/requirements.ts:48-56`(체크박스·수용 기준에서만 추출), `.omo/evidence/phase2c/wave-2-analyze-receipt.md:33`(파일럿 370파일 findings 0)
- 내용: 6종 드리프트 룰은 spec 분류 문서 위에서만 발화하고 요구사항은 마크다운 체크박스·수용 기준에서만 추출된다. enrich는 요약·concept만 만들고 요구사항을 만들지 않으며 doc_page도 마찬가지다. 타깃(§1.3 코드 못 읽는 솔로 바이브 코더)의 전형 레포는 README·TODO·대화 기록뿐이라 findings 0·요구사항 0·커버리지 "미측정"이 기본 상태다 — 유료 차별화가 alrescha-app 같은 스펙 보유 레포 전용이 된다. 또한 룰의 오탐 구조(미체크 태스크마다 medium, 산문 스펙의 unproven-claim 대량 발화)는 한 번도 측정되지 않았다.
- 임시 결정: 위험 지도는 구조 신호(untested-code·팬인·공변경)로 문서 없는 레포에서도 뜨게 한다(Wave A todo 1b·Wave D). 요구사항 부트스트랩은 착수하지 않는다.
- 필요한 결정: ⑴ **요구사항 초안 잡**(inferred) — README·TODO·라우트·테스트 이름에서 후보 요구사항을 만들고 사용자가 확인한 것만 `requirements`에 승격(승격은 사용자 액션, 문서 PR은 advisory) ⑵ README·TODO 체크박스를 spec 룰의 대상으로 승격(`=== "spec"` 완화) — 오탐률 측정이 선행 ⑶ 드리프트를 "스펙 있는 레포 전용"으로 포지셔닝하고 카피를 바꾼다 ⑷ 현행 유지.
- 상태: open. 기본 후보 ⑴ + 기존 6룰 정밀도 사전등록 측정(alrescha-app 자체 분석). 사용자 결정 필요(제품 포지셔닝).

## OQ-042 — 라이브 화면이 레포 단위가 아니라 워크스페이스 평면이다 (WORK_SPEC §5.1 `/app/[repo]/…` 미구현)

- 발견: Phase 4 비평(2026-09-04) / `apps/web/app/ui/shell-nav-data.ts:84-107`, `apps/web/lib/stats/pilot-report.ts:133-140`, `apps/web/lib/progress/progress-report.ts:192-197`, `apps/web/lib/inspection/inspection-report.ts:195-222`(최신 run sha를 전 레포 문서 신선도에 적용), `apps/web/lib/receipts/receipts-report.ts:141-147`, `supabase/migrations/202608100002_evidence_graph_domain.sql:294-304`(access_events에 repository_id 없음), `202608100010_progress_dashboard.sql:139-155`(progress_event todo repository_id NULL)
- 내용: §5.1은 `/app/[repo]/…`를 규정하지만 라이브 내비와 모든 로더는 `.eq("workspace_id")`만 건다. 레포가 하나일 때는 문제가 없지만 Pro "무제한 레포"를 팔면 두 번째 레포를 붙이는 순간 진행·점검·통계·영수증 데이터가 섞인다. 네 감사가 각자 minor로 적었으나 합치면 blocker다.
- 임시 결정: 현행 유지. v6 통합 마이그레이션에 `access_events.repository_id`·`progress_events.repository_id`를 추가한다(로더 변경은 별도).
- 필요한 결정: ⑴ §5.1대로 라우트를 `/app/[repo]/…`로 전환(내비·로더 전면) ⑵ 라우트는 유지하고 상단 레포 선택기 + 모든 로더에 `repository_id` 필터 ⑶ 워크스페이스=레포 1개로 제품 정의를 바꾼다(§15 재판정).
- 상태: open. 기본 후보 ⑵(Codex 프론트 트랙 후보). 사용자 결정 필요.

## OQ-043 — 문서 노트화의 기본 포함 범위와 `.omo/evidence` 같은 로그 디렉터리

- 발견: Phase 4 설계 판정(2026-09-04) / `spec/RESEARCH_GALAXY_MONETIZATION_2026-09-04.md` §2.4, `packages/core/src/ingest/repository-scanner.ts:157-215`(GitHub 경로에 dot-dir 제외 없음), `packages/cli/src/local-source.ts:21-28`(CLI만 IGNORED_SEGMENTS)
- 내용: "모든 md를 노트로" 하면 이 레포의 `.omo/evidence` 91개가 doc→file 참조 수백 개를 만들어 문서 성단이 화면을 다시 지배할 수 있다(진짜 인용이긴 하다). 또한 GitHub 스캔 경로에는 dot-dir 제외가 없고 CLI 로컬 소스에는 있어 `.omo` 같은 디렉터리에서 두 경로의 플랜이 달라진다(ADR-013 회귀 후보).
- 임시 결정: 기본 ignore 목록(output/·coverage/·dist/·lockfile·node_modules)을 두 경로 공통 상수로 고정하고, `.alrescha.json`의 `ignore`·`layers.hidden`으로 레포별 조정. `.omo`류 로그 디렉터리는 기본 포함하되 `layers.hidden` 기본값 후보로 표기.
- 필요한 결정: ⑴ 기본 ignore를 "빌드 산출물만"으로 최소화하고 로그 디렉터리는 사용자가 숨긴다 ⑵ 점 디렉터리(`.omo`·`.claude`·`.agents` 제외)를 기본 제외 ⑶ 문서 밀도 상한(문서 노드 ≤N)으로 자동 접기.
- 상태: open. 기본 후보 ⑴ + 두 경로 ignore 규칙 동등성 테스트.

## OQ-044 — `untested-code`의 발화 단위: 파일마다 finding인가, 레포 배너인가

- 발견: Phase 4 Wave A todo 1 / `packages/core/src/assurance/rules.ts`(`untested-code` 룰), `spec/WORK_SPEC.md` §9(“missing-test — CI 미연결 레포는 일괄 배너로 안내, 개별 스팸 금지”), `spec/RESEARCH_GALAXY_MONETIZATION_2026-09-04.md` §4.3 품질 바(“문서 없는 레포에서도 코드 파일 ≥100이면 위험 상위 10이 비어 있지 않음”)
- 내용: 두 문서가 반대 방향을 가리킨다. §9는 증거가 통째로 없는 레포에 개별 finding을 만들지 말라 하고, R5 §4.3은 문서가 없는 레포에서도 위험 목록이 비지 않아야 한다고 요구한다. 테스트가 하나도 없는 레포에서 룰을 파일마다 발화시키면 "전부 미테스트"라는 한 문장이 수백 개 행이 된다.
- 임시 결정: 파일마다 발화한다. R5의 품질 바가 요구하는 것이 정확히 그 레포의 비어 있지 않은 위험 목록이고, §9의 스팸 금지는 `missing-test`(요구사항 단위)에 대한 규정이기 때문이다. 대신 오탐을 경로 규칙으로 묶었다 — 테스트 파일 자체·설정·`.d.ts`·생성 파일·모듈 진입점(`index.*`/`__init__.py`)은 발화하지 않고, export가 하나도 없는 파일도 제외한다. 실측: 이 레포 코드 아티팩트 477개 중 103건(21.6%), drifted-demo 2건, layout-variants 6·5건.
- 필요한 결정: ⑴ 현행 유지(파일마다) ⑵ 레포에 테스트 파일이 0이면 발화하지 않고 배너 하나로 대체 ⑶ 발화는 유지하되 표시 계층에서 집계(위험 지도 상위 N + "그 외 n건") — Wave D todo 21의 위험 지도 빌더에서 결정.
- 상태: open. 기본값 ⑴로 진행. 정밀도는 미측정이므로 카피는 R5 §4.3대로 "위험 후보"에 머문다.

## OQ-045 — 요구사항→코드 `implements` 파생이 심볼 이름 하나뿐이다 (실측 커버리지 6%)

- 발견: Phase 4 Wave A todo 1 / `packages/core/src/assurance/rules.ts`(`requirementImplementationLinks`·`explicitImplementationSymbols`), `spec/RESEARCH_GALAXY_MONETIZATION_2026-09-04.md` §2.5(“implements … 이 레포 ~120”)
- 내용: 파생 규칙은 기존 `missing-implementation` 룰이 쓰던 것과 같다 — 요구사항 문장 안의 camelCase 토큰 중 **선언 파일이 유일한** 심볼. 이 레포 실측은 요구사항 127개 중 링크 8개(고유 대상 6개)로, R5 §2.5의 추정 ~120과 한 자릿수 차이다. 원인은 이 레포 스펙 문장이 심볼이 아니라 경로·클래스명·메서드명(최상위 export가 아님)을 인용하기 때문이다. 그 결과 `/app/progress`의 요구사항 커버리지는 "미측정"에서 벗어나지만 6%라는 낮은 수치로 읽힌다 — 구현률이 아니라 링크율인데 화면 라벨은 "요구사항 커버리지"다.
- 임시 결정: 심볼 소유 방식만 채택했다. 경로 인용(요구사항 span 안의 코드 참조 토큰) 방식을 실측해 봤으나 이 레포에서 +4건에 그쳐 복잡도 대비 이득이 없었다. PascalCase(컴포넌트·클래스·타입)까지 넓히면 `missing-implementation`의 발화 조건도 함께 변하므로 이번 범위에서 제외했다.
- 필요한 결정: ⑴ 파생을 넓힌다(PascalCase 심볼 + 요구사항 span 안의 경로 참조 + 메서드 심볼 저장) — `missing-implementation` 정밀도 영향 측정이 선행 ⑵ 지표 라벨을 "구현 링크율"로 정정해 낮은 수치가 오독되지 않게 한다 ⑶ 현행 유지하고 Wave D의 finding 상세에서 "링크 없음"을 개별 요구사항 단위로 노출한다.
- 상태: open. 기본 후보 ⑵(카피 정정은 Wave D todo 19 범위) + R5 §4.2 품질 바(implements 정밀도 ≥0.80, 사람 라벨) 측정 후 ⑴ 재판정.

## OQ-046 — `unknown` 노드와 `rationale` 노드의 도메인·색이 아직 없다

- 발견: Phase 4 Wave A todo 1 / `apps/web/lib/dashboard/graph-model.ts`(`NODE_TYPE_CLASSIFICATION`), `apps/web/lib/graph/render-frame.ts`(`NODE_TOKEN_BY_TYPE`), `spec/BUILD_PLAN_PHASE4.md` Wave A todo 4(도메인 6종·`node-database` 등 신규 토큰)
- 내용: `GraphNodeType`에 `rationale`·`unknown`을 추가했지만 `graphNodeArea`는 `BrainArea` 4종(frontend·backend·docs·tests)만 안다. 두 종류 모두 `code_metadata`로 area를 유도하므로 rationale은 자신이 붙은 코드 파일의 도메인을 따르고(의도한 수정), `unknown`은 경로로 유도돼 frontend/backend 중 하나로 들어간다 — "미분류"라고 부르면서 도메인은 하나 고르는 셈이다. 색도 기존 토큰을 빌려 쓴다(rationale=`node-code`, unknown=`border-muted`).
- 임시 결정: 그대로 둔다. todo 4가 `unclassified→기타`를 도입하면서 같은 자리를 다시 만지고, 스프라이트·범례는 Wave B todo 12 소관이다. `unknown`은 로더 정렬 정합으로 0건이어야 하며 todo 3의 수용 기준이 그것을 단언한다.
- 필요한 결정: todo 4에서 `unknown`을 `기타` 도메인으로 보내고 전용 토큰을 줄지, 아니면 `unknown` 자체를 렌더에서 숨기고 카운트로만 노출할지.
- 상태: open. todo 3·4에서 함께 판정.

## OQ-047 — `.alrescha.json`의 나머지 필드(`layout`·`layers.hidden`·`todoFiles`·`progressDocs`)를 누가 언제 읽는가

- 발견: Phase 4 Wave A todo 2 / `packages/core/src/ingest/repository-config.ts`(이번에 신설, `ignore`만 해석), `spec/BUILD_PLAN_PHASE4.md` Wave A todo 2("`.alrescha.json ignore/layers.hidden`")와 todo 4("`.alrescha.json`(`layout`·`ignore`·`layers.hidden`·`todoFiles`·`progressDocs`)을 아티팩트로 읽어 커밋 sha와 함께 `repositories.layout_config` 저장")
- 내용: 두 todo가 같은 파일을 나눠 갖는다. todo 2에서 `ignore`는 **스캔 결과를 바꾸므로** 지금 해석해야 했다(그러지 않으면 OQ-043의 "레포가 `.omo`를 빼는 방법"이 존재하지 않는다). 나머지 네 필드는 소비자가 아직 없다 — `layers.hidden`은 Wave B의 레이어 토글이, `layout`·`todoFiles`·`progressDocs`는 todo 4의 `repositories.layout_config`가 있어야 의미를 갖는다. 지금 저장하면 아무도 읽지 않는 설정이 DB에 남는다.
- 임시 결정: `ignore`만 스캐너가 해석한다(트리에서 읽고 분류 전에 적용, 두 경로 동일). 나머지는 todo 4로 미룬다. 파싱 실패·미지원 필드는 조용히 빈 설정으로 취급한다 — 설정 파일 오타가 스캔을 죽이지 않는다.
- 필요한 결정: ⑴ todo 4가 같은 모듈을 확장해 전체 설정을 파싱하고 `layout_config`에 커밋 sha와 함께 저장(기본 후보) ⑵ 설정 전체를 플랜에 실어 올리고 서버는 저장만(플랜 스키마 확대 — strict 스키마 동기 비용) ⑶ `ignore`도 서버 설정으로 옮긴다(ADR-013 동등성 위반 — 기각).
- 상태: **resolved(Wave A todo 4, 2026-09-05)** — ⑴ 채택. `repository-config.ts`가 전체 어휘를 파싱하고, 파싱된 값이 플랜에 실려 `repositories.layout_config`에 커밋 sha와 함께 저장된다. `layout`은 즉시 소비되고(도메인 유도), `layersHidden`·`todoFiles`·`progressDocs`는 저장만 — 소비자는 각각 Wave B 레이어 토글과 todo 5의 todo 파서다.

## OQ-048 — 문서 노트화 이후 `.omo` 문서가 최대 허브가 됐다 (실측)

- 발견: Phase 4 Wave A todo 2 실측 / `.omo/evidence/phase4/graph-density-2026-09-05.md`
- 내용: OQ-043의 임시 결정("`.omo`류 로그 디렉터리는 기본 포함")대로 스캔했더니 이 레포에서 doc→file 엣지 **657건 중 470건이 `.omo/evidence/**`에서 나왔다**(제외 시 187건). 수용 기준의 "doc→file ≥300"은 `.omo` 포함으로만 충족된다. 최대 차수 노드는 `spec/OPEN_QUESTIONS.md`(101)이고 상위 10위에 `.omo/evidence/naming-cleanup.md`(29)가 들어온다 — 증거 로그가 실제로 코드를 많이 인용하기 때문이며 링크 자체는 전부 진짜다(경로가 트리에 존재).
- 임시 결정: 그대로 둔다. 링크가 거짓이 아니고, 빼는 수단(`.alrescha.json ignore`)이 이번 todo에서 동작하며, 화면에서 접는 수단(레이어 토글)은 Wave B에 있다.
- 필요한 결정: ⑴ 현행 유지 + Wave B 레이어 토글 기본값에서 `.omo`류를 접기 ⑵ 이 레포에 `.alrescha.json`을 추가해 자기 그래프에서 제외(제품 기본값은 불변) ⑶ 기본 ignore에 점 디렉터리를 추가(OQ-043 선택지 ⑵ 재검토 — 두 경로 동등성은 이제 공통 상수가 보장하므로 순수 제품 판단).
- 상태: open. 밀도 게이트(todo 8)가 실측치를 다시 잴 때 함께 판정.

## OQ-049 — 통과 디렉터리 접기(파일 0·자식 1)를 어디서 하는가

- 발견: Phase 4 Wave A todo 3 / `supabase/migrations/202609050002_directory_nodes.sql`(모든 조상 디렉터리를 노드로 만든다), `spec/BUILD_PLAN_PHASE4.md` Wave A todo 3("통과 디렉터리(파일 0·자식 1)는 로더가 접음")
- 내용: 계획은 접기를 로더(표시 계층)에 맡긴다. 이번 todo는 **저장은 충실하게**(모든 조상 디렉터리 + `contains`) 두고 접기는 구현하지 않았다. 이유 셋: ⑴ 접으면 로더가 `contains` 엣지를 재배선해야 하는데(조부모가 손자를 입양) 그 결과는 Wave B의 `hierarchyAssignment`가 어차피 다시 계산한다 ⑵ MCP `get_neighbors`·그래프 툴은 저장된 트리를 그대로 읽으므로 표시용 접기와 저장 트리가 갈리면 에이전트와 화면이 다른 계층을 본다 ⑶ 이 레포 실측 142개 디렉터리 중 통과 디렉터리는 소수이고, 접지 않아도 노드 예산(300)에 여유가 있다.
- 임시 결정: 저장은 충실, 접기는 미구현. `MAP_HIERARCHY_FOLD_THRESHOLD`(3,000)는 "클라이언트가 계층으로 접어야 한다"만 보고하고 접기 자체는 todo 12 소관이다.
- 필요한 결정: ⑴ Wave B todo 12의 `hierarchyAssignment`가 통과 디렉터리 접기를 함께 처리(기본 후보) ⑵ 로더가 접고 MCP는 저장 트리를 읽는다(두 계층이 갈림 — 비추) ⑶ SQL이 아예 만들지 않는다(저장 트리가 실제 트리와 달라짐 — 비추).
- 상태: open. 기본 후보 ⑴, todo 12에서 판정.

## OQ-050 — db_object의 정체성이 스키마 한정자를 버린 이름 하나다

- 발견: Phase 4 Wave A′ todo 7 / `packages/core/src/ingest/schema-links.ts`(`bareName`), `supabase/migrations/202609060001_database_objects.sql`(`db_objects_workspace_repository_name_unique`)
- 내용: `public."todos"`·`todos`·`analytics.todos`가 모두 `todos` 한 노드로 접힌다. 이유는 실용적이다 — 마이그레이션은 같은 테이블을 어떤 줄에서는 한정자와 함께, 어떤 줄에서는 없이 쓰고, 코드 리터럴(`.from('todos')`)에는 한정자가 아예 없다. 한정자를 정체성에 넣으면 이 레포에서 FK·`queries` 대부분이 서로 다른 노드로 갈라진다. 대가는 멀티스키마 레포에서의 충돌이다: `public.events`와 `analytics.events`가 한 노드가 되고, 두 번째로 읽힌 마이그레이션이 `source_path`를 덮어쓴다.
- 임시 결정: 한정자를 버린 소문자 이름이 정체성. 이 레포는 전부 `public`이라 지금은 무손실이다.
- 필요한 결정: ⑴ `search_path`가 하나인 레포는 현행 유지, 스키마가 둘 이상 검출되면 그때 한정자를 붙인다(기본 후보 — 이름 규칙이 레포마다 달라지는 비용) ⑵ 항상 `schema.name`으로 저장하고 코드 리터럴은 `public`으로 가정해 매칭(가정이 틀리면 조용히 잘못된 엣지) ⑶ 현행 유지 + 충돌 시 finding 발행.
- 상태: open. 멀티스키마 레포를 실제로 스캔할 때 판정.

## OQ-051 — `queries` 엣지가 파일 단위라 호출 지점이 하나만 남는다

- 발견: Phase 4 Wave A′ todo 7 실측 / `packages/core/src/ingest/schema-links.ts`(`resolveSchemaLinks`의 `path|name` 중복 제거)
- 내용: 한 파일이 같은 테이블을 20번 읽어도 엣지는 하나고, 남는 span은 **첫 번째 줄**이다. 이 레포 실측 158개 `queries` 엣지가 40개 파일에서 나왔다 — 호출 지점 단위였다면 수천 개가 되고 database 밴드가 구조 밴드를 덮는다. 대신 "이 파일의 어느 함수가 `findings`를 건드리는가"에는 답하지 못한다. 같은 자리에 `.rpc('f')`도 있는데, 이것은 사실 함수 **호출**이면서 관계 이름은 `queries`다 — `calls`는 파일→심볼 관계라 재사용할 수 없었다.
- 임시 결정: 파일 단위 1엣지, span은 첫 호출 지점. 밀도가 먼저다.
- 필요한 결정: ⑴ 현행 유지 + `provenance`에 호출 횟수만 추가(기본 후보) ⑵ 심볼 엔진이 있는 언어에서 심볼→테이블로 올린다(파일 노드가 아닌 심볼 노드가 그래프에 없어 선행 작업 필요) ⑶ `.rpc()`를 별도 관계로 분리.
- 상태: open. 밀도 게이트(todo 8)가 실측치를 다시 잴 때 함께 판정.

## OQ-052 — `impact_of`의 기본 의미를 언제 directional로 바꾸는가

- 발견: Codex 보완 설계 P0-C / [REMEDY §7.3](../docs/reports/REMEDY_DESIGN_2026-09-06.md), `packages/mcp/src/graph-tools.ts`(`impactOf`), `spec/BUILD_PLAN_PHASE4.md` todo 22-⑷
- 내용: 현재 `impactOf`는 **무방향 depth-2 이웃**을 "영향"이라고 부른다. `A imports B`, `C imports B`일 때 A를 고치면 C가 영향에 들어온다 — C는 A를 모른다. 올바른 dependency impact는 `imports`/`calls`의 **역방향 도달**이고, doc `references`·`contains`·유사도는 전파 통로가 아니다. 다만 기존 응답(`transitiveNodeIds`)의 의미를 설명 없이 바꾸면 이미 그 값을 쓰는 클라이언트·벤치·계약 테스트가 조용히 다른 답을 받는다.
- 임시 결정: `mode`(`related-neighborhood` 기본 · `dependency-impact` opt-in)로 **호환 이행**한다. 새 UI·하네스는 새 mode를 쓰고, 기존 결과에는 related-neighborhood임을 응답에 적는다.
- 필요한 결정: ⑴ 계약 테스트와 실클라이언트(Claude Code·Codex·Cursor) 관측 뒤 todo 22에서 기본값을 `dependency-impact`로 전환(기본 후보) ⑵ 두 mode를 영구히 유지하고 기본은 그대로(호출자가 계속 잘못된 기본을 받는다) ⑶ 즉시 전환하고 `semanticsVersion`으로만 알린다(기존 계약 테스트가 깨진다).
- 상태: open. todo 22에서 판정.

## OQ-053 — 읽기 일관성(`dataRevision`)을 도입할지, 도입하면 어느 writer가 증분하는가

- 발견: Codex 보완 설계 P0-B / [REMEDY §5.3~§5.4](../docs/reports/REMEDY_DESIGN_2026-09-06.md), `apps/web/lib/mcp/supabase-store.ts`(`loadWorkspace`), `apps/web/lib/map/workspace-map.ts`
- 내용: 페이지를 나눠 읽으면 페이지 사이에 데이터가 바뀔 수 있다. 단일 SELECT의 snapshot 보장은 그 페이지까지고, PG 17 기본 Read Committed에서는 같은 트랜잭션의 연속 SELECT도 다른 시점을 본다 — 기존 조회를 VOLATILE PL/pgSQL 함수로 감싸는 것으로는 해결되지 않는다. 해결책은 revision fence(읽기 전후 같은 revision 확인) 또는 immutable generation인데, 둘 다 **writer 쪽 규율**을 요구한다: read-visible 변경과 revision UPDATE가 같은 트랜잭션이어야 하고, `access_events`·`last_used_at` 같은 읽기 부수 기록은 넣으면 안 된다(읽기가 자기 자신을 무효화한다). 커밋 SHA는 대용이 될 수 없다 — 같은 커밋에서 enrich·CI·todo 상태가 바뀐다.
- 임시 결정(폐기): 도입하지 않고 불완전한 조회를 정직하게 보고만 한다.
- 필요한 결정: ⑴ repo 공통 revision 하나 + workspace memory revision 하나로 시작(종류별 counter를 늘리지 않는다) ⑵ generation 기반 immutable snapshot ⑶ 계속 도입하지 않고 페이지 사이 변경은 재시작으로만 처리.
- 상태: **resolved(보완 S6, 2026-09-06)** — ⑴ 채택. `repositories.data_revision`과 `workspaces.memory_revision` 둘뿐이고, 두 writer(`apply_repository_scan`은 커밋을 발행하는 바로 그 UPDATE에서, `apply_artifact_summaries`는 실제로 행이 바뀐 경우에만)가 **자기 트랜잭션 안에서** 증분한다. `access_events`·`last_used_at`는 증분하지 않는다 — 넣으면 읽기가 자기를 무효화한다. `read_edge_page(… expected_revision)`가 fence이고, 어긋나면 행 대신 `revisionChanged`와 현재 revision을 돌려준다. 워크스페이스 로드는 읽기 전후 revision을 비교해 `revision-fenced`인지 `unproven`인지 보고한다. ⑵는 미채택 — 과거 조회 수요가 없고, 없는 generation을 커밋 SHA로 꾸미지 않으려고 `graphGeneration`은 명시적 null이다. 재시도 루프는 미구현(정직한 보고까지만) — [evidence](../.omo/evidence/phase4/remedy-s6.md).

## OQ-054 — `.alrescha.json`가 확장할 수 있는 것이 접두어인가 패턴인가

- 발견: Phase 4 Wave A′ todo 8 / `packages/core/src/ingest/section-links.ts`(`DEFAULT_SECTION_TOKEN_PREFIXES`·`prefixesOf`), `packages/core/src/ingest/repository-config.ts`(`sectionTokens`), `spec/BUILD_PLAN_PHASE4.md` todo 8("`.alrescha.json`로 확장 가능")
- 내용: 계획은 ID 토큰 집합을 레포 설정으로 넓힐 수 있다고만 말한다. 가장 표현력 있는 형태는 정규식이지만, `.alrescha.json`은 **스캔 대상 레포가 쓴 파일**이고 그 정규식은 트리의 모든 문서 위에서 돌아간다 — catastrophic backtracking 하나로 스캔이 멈춘다. 그래서 받는 것은 리터럴 접두어(`"RFC"`)뿐이고, 패턴은 `\bRFC-?\d{1,4}\b`로 이쪽이 조립한다. 대가는 `ISSUE_1234`나 `[JIRA-12]` 같은 다른 모양을 표현할 수 없다는 것이다.
- 임시 결정: 리터럴 접두어만. `^[A-Z][A-Z0-9]{0,7}$`를 통과하지 못하는 값은 조용히 버린다(설정 오타가 스캔을 죽이지 않는다 — OQ-047의 규칙).
- 필요한 결정: ⑴ 접두어 유지 + 필요하면 구분자(`_`·` `)만 옵션으로 추가(기본 후보) ⑵ 안전한 부분집합 DSL(문자 클래스·자릿수 범위만) ⑶ 타임아웃·길이 제한을 건 정규식 허용(재귀 백트래킹은 타임아웃으로 못 막는 경우가 있다 — 비추).
- 상태: open. 다른 토큰 관례를 쓰는 실레포를 스캔할 때 판정.

## OQ-055 — 증분 스캔이 소유 목록을 이번 플랜에서만 읽는다 (`queries` 엣지 누락)

- 발견: Phase 4 Wave A′ todo 8 작업 중 todo 7 재검토 / `packages/core/src/ingest/schema-links.ts`(`resolveSchemaLinks`의 `owned` 필터)
- 내용: `queries`는 "소유 테이블 목록에 있는 이름만"이고, 그 목록은 **이번 플랜의 `schemaObjects`**다. 증분 스캔에서 코드 파일만 바뀌면 마이그레이션은 다시 읽히지 않으므로 `schemaObjects`가 비고, `.from('findings')`는 필터에서 떨어진다 — 같은 커밋인데 full relink면 엣지가 있고 증분이면 없다(D2류 결함). todo 8의 section은 이 함정을 피해 설계했다: TS는 자기 홈만 걸러내고 소유 판정은 **SQL이 영속된 `sections`와 조인**해서 한다.
- 임시 결정: todo 7 동작을 그대로 둔다. 완화책은 이미 있다 — todo 16이 `link_schema_version` 불일치에서 자동 full relink를 건다.
- 필요한 결정: ⑴ `resolveSchemaLinks`의 `queries` 필터를 걷어내고 SQL 조인이 소유를 판정하게 한다(section과 같은 모양 — 플랜에 남의 테이블 이름이 실린다) ⑵ 증분 스캔이 schema 분류 파일을 항상 다시 읽는다(fetch 수·`scan-fetch-concurrency` 기대값 변경) ⑶ 현행 유지 + 밀도 게이트가 두 모드의 엣지 수 차이를 단언.
- 상태: open. ⑴이 기본 후보. todo 16의 재스캔 작업에서 함께 판정.

## OQ-056 — 밀도 임계값을 어디에 걸 것인가 (픽스처가 너무 작다)

- 발견: Phase 4 Wave A′ todo 8 실측 / `tests/graph-density.test.ts`, `spec/BUILD_PLAN_PHASE4.md` 밀도 목표표
- 내용: 계획은 "픽스처 2종에서 평균 차수 ≥3·고아 ≤10%"라고 적었지만, 실측하면 `drifted-demo`는 27노드/19엣지/차수 **1.41**·고아 12/17, `next-fastapi`는 34노드/47엣지/차수 **2.76**·고아 6/22이다. 15파일에 import 3개인 데모는 **작아서** 성긴 것이지 추출기가 망가져서가 아니다. 임계값을 픽스처가 통과하도록 낮추면 게이트가 아무것도 막지 못한다(테스트 약화 금지). 반면 같은 임계값의 출처인 이 레포는 **1,253노드/5,213엣지/차수 8.32/고아 4.2%/삼각형 2,533**으로 여유롭게 통과한다.
- 임시 결정: 임계값(차수 ≥3·고아 ≤10%·삼각형 >0)은 **이 레포**에 건다. 픽스처는 ⑴ 실측값을 회귀 베이스라인으로 고정하고 ⑵ 내용상 있어야 할 엣지 패밀리 전수를 단언한다 — 34노드 평균이 못 잡는 추출기 고장을 이쪽이 잡는다.
- 필요한 결정: ⑴ 현행 유지(기본 후보) ⑵ `next-fastapi`를 "전형 800파일" 규모에 가깝게 키운다(계획의 목표 열이 그 규모를 말한다 — 손으로 쓰면 비싸고, 생성하면 가짜다) ⑶ 실레포 스냅샷을 픽스처로 커밋(라이선스·크기·비밀 문제).
- 상태: open. ⑵는 Wave C의 실레포 온보딩에서 실물 데이터가 생긴 뒤 재검토.
