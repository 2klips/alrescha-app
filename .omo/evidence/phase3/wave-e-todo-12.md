# Phase 3 Wave E todo 12 — 마케팅 사이트(site/index.html) 지식그래프 리뉴얼 (2026-08-23)

사이트 레포(`2klips/arr`) 커밋과 짝: `feat(site): renew the landing around the knowledge graph`.

## 메시지 재편

- 히어로: "레포를 연결하면, 살아있는 지식그래프." + "당신의 AI 에이전트가 읽고, 기록하는 세컨드 브레인". 검증(주장이 아니라 증거)은 §05 PROOF LAYER로 강등 유지 — 제거 아님(드리프트·영수증은 후순위 유지 기능).
- 섹션 축: 01 지식그래프(2-패스 빌드 + 신뢰도 시각 문법 표) → 02 에이전트가 읽는다(repo_map·PPR·라우팅) → 03 에이전트가 기록한다(메모리 블록·bi-temporal — 차별점) → 04 라이브 발광 → 05 증명 레이어 → 06 화면 → 07 원칙 → 08 가격. 전부 Phase 3 Wave A–D에서 실물로 구현된 표면만 서술.
- 히어로 그래프 = 경량 인라인 SVG 데모: 구조 엣지(실선, 포커스 방향 색), AI 개념 노드·엣지(점선), 에이전트 기록 노드·엣지(점점선), 뉴런 발광 애니메이션, repo_map/memory_write 활동 피드 2줄. `prefers-reduced-motion` 존중.

## ADR-012 주장 체크리스트 (수동 점검, 페이지의 모든 수치 전수)

| 수치 | 위치 | 분류 | 판정 |
| --- | --- | --- | --- |
| token −55.97%, 95% CI 36.7–67.7%, 108 trials | 스탯 스트립 1칸 + §02 본문 | 자체 실측 | ✅ 허용 — CI 병기 + 리포트 원문 링크 (ADR-012 결정 2) |
| 정확도 +3.66pp | §02 본문 | 자체 실측(강등) | ✅ "신뢰구간이 넓어 아직 이득을 주장하지 않습니다 · v3 재검증 중" 문구 그대로 (ADR-012 결정 1) |
| 10× 토큰↓ · 툴콜 2.1배↓ | 스탯 스트립 + §02 인용 카드 | 외부 인용 | ✅ 출처 병기 (codebase-memory-mcp, arXiv:2603.27277) + "Arr의 측정값이 아닙니다" 명시 |
| −86% 비용 · 4.2 라운드 | 〃 | 외부 인용 | ✅ 출처 병기 (LocAgent, ACL 2025) |
| −42% 토큰 · +12pp (66% vs 54%) | 〃 | 외부 인용 | ✅ 출처 병기 (NanoNets Graft, SWE-bench Verified) |
| 노드 370 | 히어로 HUD 칩 | 실기 파일럿 실측 | ✅ 푸터에 "노드 370개는 실기 파일럿 실측" 명시 (`.omo/evidence/phase2c/wave-2-todo-5-pilot.md`) |
| 개념 18 · 에이전트 기록 12 · est. 1,840 tokens · 영수증 카드 수치 | 히어로/목업 | 예시 데이터 | ✅ 푸터 고지 "그래프 미리보기의 지표는 예시 데이터입니다" + est.에 "가정 명시, 범위 추정" |
| repo_map·PPR·메모리 블록의 자체 효율 수치 | 없음 | — | ✅ 벤치 Wave F(사전등록) 통과 전 게시 금지 준수 — 신규 표면엔 외부 인용만 |

## 토큰 통일 (docs/design-tokens.md)

- `site/tokens.css`에 §3.4 방향 포커스 토큰 `--focus-out`/`--focus-in` 추가(두 테마, 앱과 동일 값) — 히어로 그래프의 "의존한다/의존받는다" 엣지·범례가 참조. 텍스트에는 사용하지 않음(-text 자매 없음 규칙 준수).
- 작은 유색 텍스트는 전부 `-text` 자매(§3.2): `.hg-feed .tool/.write`, `.stats .v.ok/.ext`, `.cite .num`, SVG 개념/노트 라벨의 `fill="var(--info-text)"`·`var(--inferred-text)` 등.
- 색 리터럴은 `tokens.css` 밖에 0건 (`grep '#[0-9A-Fa-f]{3,8}'` — 유일 매치 `#0042`는 영수증 번호 텍스트).

## 수용 기준 검증

- 감사 하네스: `audit-site.mjs`(arr-app의 playwright+@axe-core/playwright로 정적 서빙 후 감사, 스크래치 스크립트 — 결과물은 이 디렉터리).
- 두 테마 렌더: dark `bg rgb(11,14,20)` / light stamp + `bg rgb(250,247,241)` — 부트 스크립트 정상.
- axe `color-contrast` (WCAG AA): **두 테마 violations 0** — `wave-e-todo-12/axe-color-contrast.json`.
- 스크린샷 4종 갱신: `wave-e-todo-12/site-{dark,light}-{hero,full}.png`.
