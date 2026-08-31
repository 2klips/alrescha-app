# Wave 5 todo 11 — 최종 검증·핸드오프 (2026-08-31)

## 게이트 실측 (전부 이 세션에서 재실행)

- vitest: **935 passed / 1 skipped** (검증 중 신설한 합성면 대비 단언 2건 포함, 60.6s).
- Playwright e2e: **120 passed** (1.0m) — 로컬 Supabase 기동 상태에서 전체 스위트, 리그레션 수정 반영 후.
- `eslint . --max-warnings=0`: **clean**. `pnpm typecheck`(루트 + 워크스페이스 전체 `tsc --noEmit`): **clean**.
- `scripts/verify-scope-boundaries.ts`: **PASS — 12 boundaries, 285 files, 0 forbidden paths**.
- `scripts/adr-guardrails.ts`: **PASS**(무출력·exit 0). 위반 심기 재확인은 별도 수동 절차가 아니라 vitest에 상주하는 자가 테스트로 증명된다 — `tests/scope-fidelity.test.ts`·`tests/adr-guardrails.test.ts`가 위반을 심어 스캐너가 잡는지 단언하며, 위 933에 포함되어 그린.

## 게이트 재실행 중 발견·수정 (검증 자체의 산출물)

풀 스위트(120)는 2026-08-27(todo 9) 이후 처음 돌았고 — 그 사이 들어간 디자인 오버홀(08-28)과 성능 quick wins(08-30)의 잠복 리그레션 4건을 잡았다. 두 작업의 자체 게이트가 쓴 "full e2e 73·74"는 로컬 Supabase 없이 도는 부분집합이었다.

1. **`/findings` 다크 AA 위반(실사용자 영향)** — highlighted 코드 행의 줄번호(`--faint` #808b9f)가 9%-accent-over-surface 합성 배경(#1c253a)에서 4.44:1. tokens.css 주석의 "4.73:1" 주장은 다른 배경 가정이었고, `design-tokens.test.ts`의 표면 목록에 이 합성면이 없어 못 잡았다. 수정: highlighted 행 줄번호만 `--muted`로 한 단 승급(assurance.css) + **합성면 대비 단언을 토큰 테스트에 신설**(양 테마) + tokens.css 주석 정정. 테스트는 강화됐지 약화되지 않았다.
2. **맵 HUD force 패널이 컨트롤 스트립과 12.6px 겹침** (`brain-map.spec.ts`) — AppShell 패스가 스트립 버튼을 24px 플로어로 키우면서 스트립 하단이 기존 예비 공간(16rem)을 넘었다. 수정: `map-hud.css` 예비를 18rem으로(패널 상단 플로어 201.6px → 233.6px), 산식 주석 갱신.
3. **같은 패널이 맵 노드의 더블클릭을 가로챔** (`live-graph.spec.ts` 타임아웃) — 2와 같은 뿌리(패널이 2rem 더 위까지 확장). 예비 확대만으로 해소 확인.
4. **library 검색 버튼 로케이터 모호** — AppShell의 사이드바 팔레트 트리거("검색⌘K")와 필터 폼의 "검색" 제출 버튼이 같은 접근성 이름을 가져 strict mode 위반. 제품 정상 — 스펙 로케이터를 필터 폼(`LIBRARY.filters.aria`)으로 스코핑(약화 아님: 단언 대상 동일).

환경 발견 2건:

- **`.claude/worktrees/` 사본이 lint를 오염**: Claude Code 세션 worktree(전체 워킹트리 사본)가 메인 체크아웃 밑에 생기면, git exclude(`.git/info/exclude`)를 읽지 않는 ESLint가 사본까지 린트해 "multiple candidate TSConfigRootDirs" 파싱 에러 1,078건을 만든다. 제품 파일 단독 린트는 전부 깨끗함을 확인한 뒤 `eslint.config.mjs` ignores에 `.claude/**`를 추가(사유 주석 포함).
- e2e 120건 중 DB 기반 테스트는 로컬 Supabase가 꺼져 있으면 실패한다(스킵 로직 없음 — 의도). 이번 검증은 Docker Desktop + `npx supabase start`로 스택을 올린 상태에서 실행했다. 재기동 절차는 `wave-1-todo-4.md` 그대로 유효. **교훈: 풀 e2e 게이트는 반드시 스택을 올리고 돌릴 것 — 부분집합 그린을 풀 그린으로 읽지 말 것.**

## 체크박스 정리 (이 세션, 사실 대조 후)

- **todo 6 → [x]**: 벤치 v3는 Phase 3에서 동결 사전등록 그대로 실행 — 시도 4가 유효 릴리스(600/600, 3스코프 게이트 전면 MET, pooled Δ정확도 +8.69pp [3.86, 13.43] · 토큰 −67.39% [63.67, 70.19]), `verify-benchmark-report.ts` PASS, 사이트 정확도 주장 복원(`743ff8d`). 정본: `.omo/evidence/benchmark-v3.md` §16.
- **todo 7 → [x]**: VIBE 112시행 실행 — V1 adopted · V5/V6 rejected · 나머지 pending(OQ-020, QA형 하네스 관측 한계 — 실행 전 측정 정의 보충으로 잠금). 게시: `benchmarks/vibe/gate-results.json` · `vibe-injection.real.{json,md}`. 기법 4종 실모델 재측정·3반복 재판정(id-first·static-prefix·lazy-tool off, compaction-safe on): `.omo/evidence/phase3/followups-2026-08-25.md` §2.
- **todo 5 → 미체크 유지(주석 현행화)**: 파일럿 경로 자체는 로컬·프로덕션 양쪽에서 receipt까지 완주(todo 9, `00d8f27`), OQ-017은 2026-08-25 ⑴(로그인용 OAuth App 분리)로 해소. 남은 것은 `judge`·`coach`·`pack` 러너 3종뿐 — `apps/worker/src/run-local.ts`에서 `notImplemented` 확인(2026-08-31). enrich는 202608240001에서 이미 등록.

## 핸드오프 — 다음 페이즈 후보

- **CI 아티팩트 보증 ADR**(OIDC 출처 증명 설계): 계획서 원문대로 **수요 신호 후** 착수.
- todo 5 잔여 러너 3종(judge는 G3 크레딧 게이트) · 커밋 카드 실 receipt 상세 라우팅(현재 데모 fixture로 이동) · 커스텀 도메인 alias(레지스트라 잠금 해제 2026-10-25 이후, predicateType 불변) · OQ-019(tree-sitter WASM)·OQ-020(VIBE 세션형 하네스) 판정 · graph-surface v3 벤치(별도 사전등록).
- CHANGELOG에 Phase 2C 섹션 추가됨(이 커밋).
