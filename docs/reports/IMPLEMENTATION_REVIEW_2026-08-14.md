# SpecProof 1차 구현 검증 보고서

**검증일:** 2026-08-14 · **검증 대상:** `origin/agent/arr-homepage-redesign` (315 files, +46,857 lines) · **검증자:** 기획 세션 (Claude)

## 1. 종합 판정

**기획(spec v3.3, 22개 할일)은 전량 구현·검증되었고, 테스트도 전부 통과한다.** 벤치마크는 설계된 정직성 원칙대로 작동해 "토큰 목표는 초과 달성, 정확도 게이트는 미달"을 수치 그대로 기록했다 — 이것이 다음 연구과제의 출발점이다.

| 검증 항목 | 결과 |
|---|---|
| BUILD_PLAN 체크 | 27/27 (할일 22 + 최종 게이트 F1~F5) |
| Lint / Typecheck | ✅ 통과 (eslint --max-warnings=0, tsc 전 패키지) |
| 단위·통합 테스트 | ✅ **244/244** (55 파일) — 최초 3개 실패는 Windows CRLF 변환으로 인한 digest 불일치였고, LF 재체크아웃 후 전부 통과 (코드 결함 아님) |
| E2E (Playwright 8 spec) | 구현·evidence 존재(F3). 이번 검증에서 로컬 재실행은 하지 않음 |
| Evidence | `.omo/evidence/` 23건 + F1~F5 감사 테스트 커밋 5건 |
| OPEN_QUESTIONS | 1건 (OQ-001, 아래 §4) |

## 2. 기획 대비 구현 확인 (요구사항 → 실물)

- **구조:** 계획 그대로 pnpm 모노레포 — `apps/web`(Next.js), `apps/worker`, `packages/core`(엔진), `packages/mcp` + `supabase/`, `fixtures/drifted-demo/`, `benchmarks/databrain/`.
- **화면 9종 전부 존재:** 온보딩·그래프 메인 대시보드·findings·harness(+lint)·graph(증거 상세)·receipts·progress·library·settings(mcp/ai/privacy)·stats — WORK_SPEC §5의 IA와 1:1 대응.
- **가드레일이 테스트로 강제됨:** `scope-fidelity`(금지 경로 부재), `security-audit`, `plan-compliance`(Must-have↔테스트 매핑), `release-hardening` 등이 스위트에 포함되어 전부 green. verified/inferred 분리·원본 코드 비저장·advisory-only 쓰기·MCP stateless 제약이 코드가 아니라 테스트로 증명된다.
- **Data Brain·발광·진척·라이브러리:** search_index/query_brain/get_artifact/context pack, access-event 실시간 그래프 발광(live-graph e2e 존재), 구조화 log_progress+todo 보드, 라이브러리 저장/조회 — ADR-004~006 반영 확인.

## 3. Data Brain 효율 벤치마크 (실측, 2026-08-14)

- 프로토콜 준수: 12과제 × 3회 × 3군(checkout / full-dump / data-brain) = 108 trial, `gpt-5-nano`, 실패 trial 분모 포함, 토큰은 API 리포트 기준.
- **토큰: -55.28% (목표 -30% 초과 달성)** — data-brain 총 59,456 vs checkout 132,938 vs full-dump 276,879.
- **정확도: -7.04pp (비열등 마진 -5pp 미달 → 게이트 NOT MET)** — mean score 0.574 vs checkout 0.644.
- 원인 분해 (과제×군 표 기준):
  1. `fixture-implement-password-reset`: data-brain 0.000 vs checkout 1.000 — **팩/색인이 정답 문서를 빠뜨린 회수 실패**로 추정. 최우선 조사 대상.
  2. `real-answer-github-permissions`: data-brain 0.000 vs full-dump 1.000 — 실레포 규모에서 색인 랭킹이 정답 문서를 못 찾음.
  3. `judge-*` 2개 과제는 **세 군 모두 0.000** — 군 간 차이가 아니라 과제 채점기(grader) 또는 과제 설계 문제일 가능성. 채점기 검증 필요.
  4. 그 외 과제 다수에서 data-brain은 checkout과 동점(1.000)이면서 토큰만 절약 — 컨셉 자체는 유효하다는 신호.
- 이 두 과제(1·2)만 회복해도 정확도는 비열등 범위로 들어올 가능성이 높다.

## 4. 남은 연구과제

1. **[최우선] 벤치마크 반복(iteration):** password-reset·github-permissions의 회수 실패 원인 분석 → 색인 랭킹/팩 선정 개선 → 동일 매니페스트 재실행. 게이트 통과 전까지 제품·사이트에 효율 주장 게시 금지(원칙 준수 중).
2. **judge 과제 채점기 검증:** 전 군 0점은 채점기 결함 신호. grader 로직·기대 매니페스트 점검.
3. **OQ-001 (권한 결정 필요):** 인덱스 PR 생성에 `contents:write`가 실제로 필요. 현재는 권한 확대 없이 "diff 복사 + 권한 안내" fallback으로 구현됨. 제품 결정 필요 — ① contents:write를 선택 권한으로 승인(설치 시 설명) 또는 ② fallback 유지.
4. **E2E 로컬/CI 재실행 체계:** Playwright 스위트를 CI에서 상시 실행하는 파이프라인 미구성.
5. **Phase B~D 준비물:** GitHub App 실등록, Supabase 클라우드, 배포(Vercel/Fly.io), 실사용 MCP 검증 — IMPLEMENTATION_GUIDE §2 체크리스트 그대로 남아 있음.

## 5. 보완 필요 사항 (발견)

1. **브랜치 미머지:** 구현 전체가 `agent/arr-homepage-redesign` 브랜치에만 있고 `main`은 문서 2커밋 상태. 머지 결정 필요.
2. **제품명 불일치:** 마지막 커밋이 앱 홈을 **"Arr · Proof, before merge"**로 리브랜드(로고 포함). 그러나 마케팅 사이트·spec 문서·레포명은 여전히 SpecProof. 네이밍 확정 및 전면 정합화 필요.
3. **`.gitattributes` 부재:** 이번 CRLF 사고의 근본 원인. `* text=auto eol=lf` 추가로 digest 테스트의 플랫폼 독립성 확보 권장.
4. **README 상태 표기 구식:** "Wave 1–5 [ ]"로 남아 있음 — 실제는 전량 완료.
5. **병렬 기획 폴더 발견:** `Project/agent-context-platform-plan-2026-08-09/` — 같은 문제 공간을 다룬 별도 세션의 기획 문서 9종(제품명 미정, "조건부 GO — 검증 먼저" 판정). 현재 spec과 결이 다르나, **"효과 미검증" 경고가 이번 벤치마크 결과와 일치**한다는 점은 주목할 가치. 통합·아카이브 결정 필요.

## 6. 결론

기획 → 구현 전달 체계(WORK_SPEC + BUILD_PLAN + GUIDE)는 의도대로 작동했다: 코딩 에이전트는 22개 할일을 수용 기준·가드레일 테스트와 함께 완수했고, 모순은 OPEN_QUESTIONS로 보고했으며, 벤치마크 미달을 숨기지 않고 기록했다. 다음 단계는 기능 추가가 아니라 **벤치마크 정확도 회복(연구과제 1·2)과 출시 준비물(Phase B~D)**이다.
