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
- 상태: open — **Wave 4에서 해소하지 못했다.** todo 9의 axe-core 대비 검사는 히트 레이어를 명시적으로 제외했다(투명 버튼이 캔버스 위에 겹쳐 있어 axe가 배경색을 계산할 수 없고, 결과가 violation이 아니라 incomplete로 나온다). `HIT_TARGET_LIMIT = 600`의 키보드 순회 비용도 측정하지 않았다 — 600개 탭 스톱은 스크린리더 사용자에게 실사용 불가에 가깝고, 캔버스 노드용 대체 탐색(검색·허브 칩·방향키 순회)이 필요한지는 여전히 미결이다. Phase 2B a11y 작업으로 넘긴다.

## OQ-007 — HUD 카드가 레일·인스펙터와 다른 스태킹 컨텍스트에 있음

- 발견: Phase 2A Task 7 / `apps/web/app/globals.css` (`.graph-force-panel`, `.arr-metric-evidence`)
- 내용: 전면 그래프 구성상 그래프 플레이트(`.arr-proof-panel`)가 워크스페이스 전 셀을 덮고, 레일·인스펙터·활동 피드가 그 위에 반투명 패널로 얹힌다. 그래프 안쪽에 사는 카드(힘 패널, 지표 근거 패널)는 z-index를 아무리 올려도 레일·인스펙터 **아래**로 깔린다 — 서로 다른 스태킹 컨텍스트이기 때문이다. 실제로 힘 패널의 접기 버튼과 근거 패널의 닫기 버튼이 클릭 불가 상태였다(Playwright가 잡아냄).
- 임시 결정: 두 카드를 레일·인스펙터 사이 "빈 통로"에 고정 배치했다(힘 패널 = 우하단 `right: 22.5rem`, 근거 패널 = 좌상단 `left: 17.5rem`). 통로 폭은 레일 16rem·인스펙터 21rem에 묶여 있으므로 이 세 수치는 함께 움직여야 한다. 힘 패널은 `max-height: min(20rem, calc(100% - 12rem))` + 내부 스크롤로 낮은 뷰포트에서 제어 스트립을 침범하지 않게 했다.
- 근거: `tests/e2e/dashboard-hud.spec.ts`, `tests/e2e/brain-map.spec.ts`, `.omo/evidence/phase2a/task-7.md`
- Wave 4 추가 관찰(Task 9): 이 배치는 생각보다 훨씬 취약했다. 1280×720에서 힘 패널 상단과 제어 스트립 사이 **실측 여유는 4px**였다 — `calc(100% - 12rem)`이 제어 스트립을 "플레이트 상단에서 고정 오프셋"으로 가정했는데, 그 오프셋은 사실 **제목 밴드 높이를 따라 움직인다**. 그래서 h1에 한 줄을 더한 것만으로 스트립이 19px 내려와 접기 버튼을 덮었고, `force panel values survive a reload`가 간헐 실패했다. 여유를 `calc(100% - 16rem)`(실측 26px)으로 넓히고, `tests/e2e/brain-map.spec.ts`에 세 해상도에서 두 상자가 교차하지 않고 접기 버튼이 실제로 클릭 가능한지 확인하는 기하 회귀 테스트를 넣었다.
- 상태: open — 26px 여유도 여전히 상수 튜닝이다. 근본 해법은 처음 제안대로 **HUD를 워크스페이스 그리드의 형제로 끌어올려** 통로 상수(16rem·21rem·22.5rem·16rem)를 없애는 것. Phase 2B 정리 후보.

## OQ-008 — 두 테마 화면 순회에서 빠지는 라우트: `/auth/*`(500)와 `/app/*`(인증 필요)

- 발견: Phase 2A Task 8 / `tests/e2e/screens-theme.spec.ts`
- 내용: todo 8 수용 기준은 "Playwright가 각 화면을 두 테마로 순회"다. 그런데 두 종류의 라우트가 이 환경에서 순회 불가다. ⑴ `/app/*`는 살아 있는 Supabase 세션이 필요하다. ⑵ `/auth/login`·`/auth/auth-code-error`는 **500**을 반환한다 — 테마 부트 스크립트조차 실행되지 않아 `data-theme`이 비어 있다. `apps/web/app/auth`의 마지막 커밋은 `ca3a0d0`(Phase 2A 이전)이므로 이번 단계의 회귀가 아니라 환경 변수 공백이다.
- 임시 결정: 순회 대상에서 두 라우트군을 빼고 공개 라우트 10개만 검증했다(대시보드·findings·lint·receipts·progress·harness·library·evidence 상세·onboarding·404). 해당 화면의 카피 변환 자체는 `tests/korean-strings.test.ts`가 파일 단위로 강제하고, 컴포넌트 렌더링은 각 화면의 vitest가 덮는다. 브라우저 상의 테마 확인은 Supabase가 붙는 Wave 4로 넘긴다.
- 부수 관찰: 테마 토글은 대시보드·assurance 화면·progress에만 있다. `/graph`, `/harness`, `/library`, `/onboarding`에는 헤더 토글이 없어 그 화면에서는 테마를 바꿀 수 없다(저장된 설정은 따른다). 계획 todo 2의 수용 기준은 3개 화면만 요구하므로 이번 범위에서 추가하지 않았다.
- 근거: `tests/e2e/screens-theme.spec.ts`, `.omo/evidence/phase2a/task-8.md`
- 상태: open — **Wave 4에서도 해소하지 못했다.** Supabase가 이 환경에 여전히 없어서 `/auth/*`는 500, `/app/*`는 세션 부재로 접근 불가다. 따라서 todo 9의 axe-core 대비 검사도 계획이 지정한 두 화면(`/`, `/findings`)만 덮으며, 인증 화면군의 대비는 **검증되지 않았다**(토큰 단위 대비 테스트가 간접적으로만 덮는다). Supabase 프로젝트가 붙는 Phase D 준비물이 필요하다.

## OQ-009 — ADR-009-3 라이트 팔레트가 작은 텍스트에서 WCAG AA를 통과하지 못함

- 발견: Phase 2A Task 9 / `tests/e2e/a11y-contrast.spec.ts`, `apps/web/app/styles/tokens.css`
- 내용: axe-core 대비 검사에서 `/findings` 라이트 테마가 **22건 violation**을 냈다. 원인의 대부분은 파생 토큰이 아니라 **ADR-009-3이 못 박은 값 자체**다 — 종이 흰색(`#FFFFFF`/`#FAF7F1`/`#F3EFE7`) 위에서 `--verified #1E8A5E`는 3.77~4.33:1, `--inferred #B07A14`는 3.25~3.72:1, `--brand #D6402E`는 3.95~4.53:1, `--info #3B6FDB`는 4.08~4.68:1이다. 이 색들을 9~11px 모노 뱃지(`.grade-badge`, `.severity-label`, `.commit-chip`)가 텍스트 색으로 쓰기 때문에 AA(4.5:1) 미달이다. 다크 테마의 같은 색들은 전부 4.95:1 이상으로 통과한다.
- 임시 결정: **ADR 값은 건드리지 않았다**(ADR = WORK_SPEC > 계획). 대신 `tokens.css`에 텍스트 전용 파생 토큰을 추가했다 — `--brand-text #C43A2B`(4.59:1), `--verified-text #177A52`(4.65:1), `--inferred-text #8F6310`(4.62:1), `--info-text #3766CA`(4.68:1). 다크에서는 기본 토큰의 별칭일 뿐이다. 그래프 노드 색·점·링·틴트·테두리는 여전히 ADR 값을 쓰므로 팔레트의 정체성은 그대로고, 텍스트만 어두운 형제 색을 쓴다. 파생 별칭(`--ok-text`, `--warn-text`, `--broken-text`, `--accent-text`)도 같이 뒀다.
- 근거: `.omo/evidence/phase2a/task-9.md`, `.omo/evidence/phase2a/task-9/axe-contrast-*.json`, `tests/design-tokens.test.ts`(`token contrast` 스위트)
- 상태: open — ADR-009-3이 "라이트 팔레트는 큰 면적·그래프용, 작은 텍스트는 파생 색"을 명시하도록 개정할지, 아니면 라이트 값 자체를 AA 통과값으로 바꿀지 기획 판단이 필요하다. 마케팅 사이트도 같은 팔레트를 쓰므로 (`docs/design-tokens.md`) 결정이 양쪽에 걸린다.

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
- 게이트: lint·typecheck 무결점, vitest **416/416**, playwright **49/49**, `pnpm --filter @arr/web build` 성공. 가드레일 재검증 결과는 `.omo/evidence/naming-cleanup.md`.

## OQ-011 — 벤치마크 v3: 신뢰구간 게이트가 v2 결과를 뒤집는다 (기획 판단 필요)

- 발견: 벤치마크 v3 하네스 작업 (RESEARCH_AGENDA §3) / `benchmarks/databrain/tasks.v3.json`, `.omo/evidence/benchmark-v3.md`
- 내용: v3는 게이트를 **점추정이 아니라 신뢰구간 하한**으로 판정한다 (비열등 = 정확도 Δ 95% CI 하한 ≥ -5pp, 개선 목표 = 하한 ≥ +5pp, 토큰 = 절감률 CI 하한 ≥ 30%). 이 규칙을 **v2 실측 데이터에 그대로 적용해 보면**(같은 시드 부트스트랩, 쌍대 단위 36개) 정확도 Δ = +3.66pp, **95% CI [-6.19, +14.27]pp → 비열등 하한 미달**, 토큰 절감 55.97%, CI [36.71, 67.70]% → 토큰 목표는 통과. 즉 **v2가 "게이트 MET"으로 공개한 근거는 점추정 기준이었고, v3 기준에서는 정확도 쪽이 통과하지 못한다.** 원인은 효과가 사라져서가 아니라 표본이 작아서다(쌍대 단위 36개). v3는 과제 12→20, 반복 3→5, 모델 1→2로 쌍대 단위를 200개까지 늘려 구간을 좁힌다(같은 효과 크기가 유지되면 하한은 대략 -1pp 부근까지 올라온다 — 추정이며 실측 아님).
- 임시 결정: v2 리포트(`results.real.{json,md}`)와 그 사전등록 매니페스트(`tasks.json`)는 **불변으로 동결**했다. 사후에 판정 규칙을 바꿔 과거 리포트를 다시 채점하지 않는다(ADR-005의 "측정된 그대로 공개"). v3는 별도 사전등록(`tasks.v3.json`, SHA-256은 evidence에 기록)으로 두고, 실제 실행 전까지 F5 감사에서 "pending"으로만 보고한다.
- 기획 판단이 필요한 것: ⑴ **v2 인용 문구를 그대로 둘 것인가** — 현재 파일럿 통계 화면·리포트는 "정확도 +3.66pp"를 v2 리포트 링크와 함께 인용한다. v3 기준에서 그 수치의 불확실성이 -6.19pp까지 걸친다는 사실을 같이 표기할지, 아니면 v3 실행 결과가 나올 때까지 정확도 주장만 내릴지. ⑵ v3 실행 후 **공개 릴리스를 v3로 교체할지, v2와 병행 게시할지** (F5 감사는 두 릴리스를 모두 검증하도록 확장해 두었다).
- 근거: `benchmarks/databrain/results.real.json`(v2 원시 시행), `scripts/databrain-benchmark/statistics.ts`(시드 부트스트랩), `.omo/evidence/benchmark-v3.md`
- 상태: open — v3 실제 실행은 예산 승인 대기(예상 ~8.15M 토큰, 아래 evidence 참조).

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
- 상태: resolved(ADR-013 — ⑴ 채택. 로컬 인제스트는 메타데이터만으로 허용, local-cli 경계를 "원본 코드 전송·저장 금지"로, team-ui 경계를 "ADR-011 음성 테스트 없이는 팀 표면 추가 금지"로 교체. **가드레일 스캐너·WORK_SPEC §12 개정 구현은 아직 미착수** — 위반 심기 재증명과 함께 Phase 2B 구현 세션에서 수행)
