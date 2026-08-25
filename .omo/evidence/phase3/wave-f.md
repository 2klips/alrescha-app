# Phase 3 Wave F — 동결 실험 시도 3 + 신규 표면 벤치 사전등록 (2026-08-25)

**결과 한 줄:** v3 시도 3은 완주했으나 **Anthropic 월 사용 한도(시도 1과 동일 원인)로 재차 무효** — Wave F의 두 todo 모두 실행이 사람 게이트 뒤로 갔고, 이번 세션은 그 게이트가 열리는 즉시 전 실험을 순차 실행할 수 있는 상태(하네스·사전등록·측정 정의 전부 잠금)를 만들었다.

## todo 14 — 동결 실험 실행 (미완: 게이트 차단)

### v3 시도 3 (실측)

- 프리플라이트 스모크(1과제×1반복×양 공급자) 6/6 → 착수. `--concurrency=2`(시도 2 조건 유지).
- 600/600 시행, 139 실패: **sonnet 115건 = Anthropic 400 "specified API usage limits"(복구 2026-09-01 00:00 UTC)**, sonnet 스키마 위반 23건(시도 2의 30건과 일관된 정당한 실측), luna 429 잔여 1건(사실상 해소).
- 시도 2의 재실행 조건(크레딧 충전)은 충족돼 있었으나 **시도 1의 조건(월 한도 상향)이 미충족** — 한도가 실행 도중 소진됐다. 상세·예비 신호(인용 금지)·시도 4 조건: `.omo/evidence/benchmark-v3.md` §15.
- 보존: `results.v3.attempt3.{json,md}`. 릴리스 이름은 계속 공석 — `verify-benchmark-report.ts` PASS + `pendingReleases: ["v3"]` 확인.

### VIBE 112시행 — 실모델 경로 구현 완료 (실행 대기)

- 사전등록이 미정의로 남긴 "지표↑ 관측 방법"을 **실행 전 보충으로 잠금**: `benchmarks/vibe/measurement-preregistration.md` (v3 개정 1 선례 — 실행 전 개정 유효). 동결 항목(그리드 112·지시문·채택 규칙·숨긴 정답)은 불변.
  - V1: 답변의 **코퍼스 실존 경로 인용 수**로 관측(주입 지시가 유도하는 행동의 직접 관측).
  - V2~V7: QA형 하네스에서 지표 이동 관측 불가 → **정확도 악화 시 폐기 가능, 채택은 불가** — **OQ-020 등록**(세션형 하네스가 생겨야 채택 게이트 통과 가능; 팀 표면 전제와 연결).
- `scripts/vibe-injection-experiment.ts --real`: v3와 동일 어댑터(강제 tool-use·provider usage만), data-brain 군 컨텍스트 캐시, 판정은 `judgeVerdicts`(결정론) → `gate-results.json` 갱신 + `vibe-injection.real.{json,md}` 게시. 유닛 테스트 5건(쌍대 집계·실패 쌍 제외·V1 3분기·V2~V7 2분기·쌍 0 = pending).
- 실행 후 갱신 필요(메모): `apps/web/lib/team/fixtures.ts`의 `publishedGate()` 미러 + `tests/vibe-index.test.ts` "all pending" 단언 — 게시 파일 기준으로 재작성.

### 기법 4종 실모델 재측정 — 구현 완료 (실행 대기)

- `scripts/bench-techniques.ts --real` → `measureTechniquesReal`: 같은 A/B를 실모델로 — 회수율 = 실답변 required-fact 채점, 토큰 = provider 보고 usage, 동일 컨텍스트는 호출 1회 공유(dry-run과 같은 구조, 리포트에 명시). 산출: `techniques.real.{json,md}`에 dry-run 등록 델타 대비 표.

## todo 15 — 신규 표면 벤치 (사전등록 완료·실행 대기)

- **사전등록**: `benchmarks/graph-surface/preregistration.v1.json` — 커밋으로 다이제스트 잠금(테스트가 로더 해시 = 파일 SHA-256 = 드라이런 리포트 기록 해시를 상호 고정).
  - 질문 세트: **동결 v3 매니페스트의 answer-manifest 12과제 재사용**(픽스처 4 + 실레포 8, 다이제스트 핀) — 신규 질문 발명 없음 = 유출·조작 여지 제거.
  - 2군: `file-exploration`(list/grep/read — grep 반증 연구를 의식한 강한 베이스라인) vs `graph-surface`(get_graph_schema·repo_map·search_nodes(PPR)·get_neighbors·get_node_content·memory_read). 공유 툴은 submit_answer 하나(테스트로 고정).
  - 96시행(12과제 × 2군 × 2모델 × 2반복), 턴 캡 10, 출력 캡 사전등록. **1차 지표 = 시행당 모델 호출 수(턴)** — "에이전트 턴 수 절감"이 판매 논리라는 리서치 결론 그대로. 품질 비열등(PASS율 −5pp), 판정 무관 게시.
  - 메모리 픽스처는 코퍼스 파일에서 유도 가능한 사실만(출처 병기) — 두 군의 도달 가능 정보 동일 유지.
- **하네스**: `scripts/graph-surface-benchmark/` — 코퍼스→워크스페이스(+결정론 유도 엣지: md 링크 `references`·TS 상대 import `imports`, 미해석 폐기) + 멀티턴 에이전트 루프(Anthropic messages tool_use 루프 · OpenAI responses `previous_response_id` 체인) + PASS/PARTIAL/FAIL 채점(동결 채점기 재사용) + 집계·판정·렌더.
- **드라이런 96/96, 0 실패** (`results.dry-run.{json,md}` 게시 — 모의라 릴리스 불가 명시). 테스트 10건(다이제스트 잠금·위조 거부·엣지 유도·메모리 주입·군별 툴 게이트·캡·집계·가설 판정 경계·모의 루프).

## 게이트 (세션 종료)

- lint ✅ · typecheck ✅ · vitest **869 passed / 1 skipped (116 파일)** ✅ · scope boundaries PASS(12경계·262파일) · verify-benchmark-report PASS(`pendingReleases: ["v3"]`). Playwright 미실행 — 웹 UI 무변경(스크립트·벤치·게시 파일만).

## 다음 세션 (게이트 열리면 — 사용자: Anthropic 콘솔 월 한도 상향 또는 9/1 리셋)

한 창에서 순차 실행: ⑴ `pnpm bench:databrain --concurrency=2` (sonnet ~4.5M 토큰 예상) ⑵ `pnpm bench:vibe --real` ⑶ `pnpm bench:techniques --real` ⑷ `pnpm bench:graph-surface` → 게이트 판정 → 통과 시 사이트 정확도 주장 복원(site/index.html:512-514, ADR-012 절차) → gate 미러(fixtures.ts)·vibe-index 테스트 갱신 → 체크박스·evidence·커밋.

---

# 추기 (2026-08-25 같은 날, 한도 상향 후) — Wave F 실행 완주

사용자가 Anthropic 월 한도를 상향 → 프리플라이트 6/6 → **벤치 4종 순차 실행 전부 완료**. Wave F 종결.

## todo 14 — 완료

- **v3 시도 4 = 유효 릴리스**: 600/600, 실패 32 전량 스키마 위반(인프라 0). **게이트 pooled/luna/sonnet 3스코프 전면 MET** — pooled Δ정확도 +8.69pp [3.86, 13.43]·토큰 −67.39% [63.67, 70.19]. 세 스코프 모두 정확도 CI 하한 > 0. F5 감사가 v3를 1급 릴리스로 검증. 상세: `.omo/evidence/benchmark-v3.md` §16.
- **ADR-012 복원 이행**: site/index.html 정확도 주장 복원(구간 병기, "+5pp 목표 구간 통과는 아직 아님" 명기, v2 리포트 공개 유지) — site 레포 별도 커밋.
- **VIBE 112시행**: 112/112(실패 10 — 쌍 제외·게시). 판정: **V1 채택**(인용 Δ+0.625 AND 정확도 Δ+0.042), **V5·V6 폐기**(주입이 숨긴 정답 정확도를 낮춤 — Goodhart 게이트가 설계대로 작동한 첫 실측), V2·V3·V4·V7 pending(OQ-020 — 관측 불가라 채택 불가). `vibe-injection.real.{json,md}` + `gate-results.json` 게시. 노출 배선 자동 반영: `/team` VIBE 위젯이 V1만 렌더 — `fixtures.ts` 미러·`vibe-index`·`team-view` 테스트를 게시 파일 기준으로 갱신.
- **기법 4종 실측**(`techniques.real.{json,md}`): id-first Δtokens −12.1%(등록 −14.2%와 정합)이나 **Δrecall −12.5pp(등록 0과 불일치)**, static-prefix Δrecall −8.3pp. → **defaultOn 재검토 대상 기록**(소표본 16시행/기법이라 자동 뒤집기 없음 — 리포트 명기대로 기본값 변경은 별도 판단, 후속 과제로 남김). compaction-safe는 recall +16.0pp로 등록(+16.7pp)과 정합.

## todo 15 — 완료

- 96/96, 실패 0. **판정: NOT MET** — 1차(턴): graph 6.5 vs 파일 탐색 4.48(Δ+2.02, 미충족), 품질: PASS율 0.771 vs 0.854(Δ−8.3pp, 비열등 미충족). **판정과 무관하게 게시**(`results.v1.{json,md}`).
- 모델별 결: sonnet은 graph 군이 품질 우위(0.833 vs 0.792)·입력 토큰 24% 절감(490k vs 645k)·턴 동급, luna는 graph 군이 크게 열세(7.83턴·0.708). CBM 논문의 "그래프 단독은 일반 질문에서 파일 탐색에 진다" 경계 조건이 우리 표면에서도 재현 — 그래프를 유일 경로가 아니라 라우팅 폴스루로 설계한 기존 방침(route_query)을 강화하는 실측. 표면 개선(예: repo_map 시드 개선, search_nodes 랭킹) 후 재실행은 후속 페이즈 판단.

## 남긴 후속

1. 기법 defaultOn 재검토(id-first·static-prefix recall 하락 실측) — 표본 확대 재측정 후 판단.
2. graph-surface 표면 개선 → 벤치 재실행(사전등록 v2로 — v1 결과는 불변 게시).
3. V2~V7 세션형 하네스(OQ-020) — 팀 표면 착수 전제.
