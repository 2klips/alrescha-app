# todo 6·7 — 토큰 효율 기법 + 스캐너 확장 (2026-08-17)

**범위:** BUILD_PLAN_PHASE2B Wave 2 후반부. 두 커밋: `feat(brain): apply measured token-efficiency techniques`, `feat(ingest): extract rationale, multi-language symbols, handoff files`.

## 1. todo 6 — 토큰 효율 기법 (측정 후 기본값)

| 층 | 파일 |
|---|---|
| 플래그 | `types.ts` — `TOKEN_TECHNIQUES` 4종 on/off, `NO_TECHNIQUES` |
| 컨텍스트 | `context.ts` — data-brain 빌더의 **측정 모드**(`techniques` 지정 시). **미지정 시 기존 컨텍스트 바이트 불변**(회귀 테스트로 고정) |
| 측정 | `techniques.ts` — 기법별 A/B: 토큰(dry-run 가정 ceil(chars/4), 가정 명기) + **필수 사실 회수율**(결정론 프록시 — dry-run mock은 컨텍스트 비민감이므로 모델 정확도 대신 회수율로 게이트) |
| 리포트 | `scripts/bench-techniques.ts` → `benchmarks/databrain/techniques.dry-run.{json,md}` (기법별 델타 표) |

기법 구현: ⑴ **id-first 계층 로딩** — 발췌 대신 노드 id 목록 + `get_node_content` 2건 ⑵ **정적 프리픽스** — 과제 무관 바이트 동일 프리앰블(캐시 가능 프리픽스 토큰 측정) ⑶ **툴 정의 지연 로드** — 13툴 카탈로그 → 실사용 툴만 ⑷ **compaction-safe** — 메타데이터 선행·콘텐츠 후행 + 노드 id 앵커 인덱스, 꼬리 보존 컴팩션 시뮬레이션으로 회수율 측정.

**측정 결과(dry-run, drifted-demo 픽스처 QA 6과제):**

| technique | Δtokens % | recall Δpp | 판정 |
|---|---|---|---|
| id-first-loading | **-14.22** | 0 | on |
| static-prefix | +2.03 | 0 (캐시 프리픽스 129tok) | on |
| lazy-tool-definitions | **-4.68** | 0 | on |
| compaction-safe-session | +4.06 | **+16.67**(컴팩션 후) | on |

게이트 규칙(테스트로 고정): **회수율 하락 시 무조건 off**; on이 되려면 토큰 감소·캐시 프리픽스·회수율 개선 중 하나를 실측으로 증명해야 한다. 실모델 A/B는 벤치 v3 크레딧 해제 시 schema-3 하네스로 재측정 가능.

## 2. todo 7 — 스캐너 확장

- **⑴ rationale 1급 노드:** `extractRationales` — `WHY:`/`NOTE:` 마커(+`ADR-\d+` 인용, 마커 없는 ADR 인용 주석은 `adr-reference`)를 주석 텍스트만(≤240자) 추출. 마이그레이션 `202608170003_rationale_nodes.sql` — `graph_nodes.kind`에 `rationale` 추가, `rationales` 테이블(RLS), `apply_repository_scan`이 rationale 노드 동기화(삭제·업서트) + **provenance(span)·confidence 1.0을 실은 `references` 엣지** 생성. **프로덕션 최초의 `edges` 생산 경로**다(todo 4·5에서 기록한 공백 일부 해소). 원본 코드 비저장 불변 — 주석 텍스트만.
- **⑵ 다언어 심볼:** `extractSymbols` 엔진 체인 — ts/js = TypeScript 컴파일러 **AST**, Python·Go = 결정론 구조 파서(폴백 계층; Python은 `_` 비공개 제외, Go는 대문자 수출 규칙). tree-sitter 승격은 **OQ-015**(의존성 결정 — wasm 크기 vs 네이티브 빌드 vs 현행 체인; CLI 로컬 실행이 판단에 걸림).
- **⑶ 핸드오프 파일:** `current-task.md`·`session-state.md`·`session-notes.md`·`handoff*.md`(임의 디렉터리, `.claude/` 포함) → `todo_progress` 분류.

## 3. 수용 기준 ↔ 테스트

| 수용 기준 | 테스트 |
|---|---|
| 기법별 on/off 플래그와 측정 | `tests/token-techniques.test.ts` — 4기법 각각의 컨텍스트 효과 + `measureTechniques` 4행 + **미지정 시 기존 출력 불변** |
| 리포트에 기법별 델타 표 | `renderTechniqueReport` 표 렌더 테스트 + 커밋된 `techniques.dry-run.md` |
| 정확도 하락 시 기본값 off | 게이트 규칙 테스트(recallΔ<0 → defaultOn=false) |
| 언어별 심볼 픽스처(ts/js + 2개 언어) | `tests/scanner-extensions.test.ts` — ts·python·go 픽스처, 엔진 판별자 |
| rationale 노드의 provenance | 추출 단위(라인·sourceKey·adrRef) + PGlite에서 `rationales` 행·`graph_nodes(kind rationale)`·엣지 provenance.span(path·startLine) 검증 + 재스캔 시 동기 삭제 |
| 핸드오프 → 진행 대시보드 경로 | 분류 7케이스 + 스캔→apply→`todos` 행→`buildWorkspaceProgressReport` 보드에 항목 표시(done 열 포함) |

## 4. 게이트

- vitest **613/614** (82 파일; 신규 — scanner-extensions 8, token-techniques 6) · 스캐너·인제스트·벤치 기존 스위트 무회귀 (동결 v3 다이제스트 회귀 포함)
- Playwright **60/60** · eslint·typecheck 무결점 · 스코프 스캐너 PASS(203 files)
- 로컬 인제스트 strict 스키마에 `rationales` 추가 — CLI/GitHub 동등성은 공유 apply 함수로 계속 구조 보장

## 5. 남긴 것

- OQ-015(tree-sitter 의존성) 기획 판단 대기.
- rationale 노드의 MCP/화면 표면(그래프 뷰 노출·`query_brain` 유형 추가)은 후속 — 저장·엣지까지가 이번 범위.
- 실모델 기법 A/B(schema-3 라우팅 실험과 함께)는 크레딧 해제 후.
