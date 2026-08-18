# arr-app — Phase 2C Work Plan: 실물 기동 — 실데이터 배선 · 실기 연동 · 동결 실험 실행 · 배포

> Governing decisions: `DECISIONS-ADR.md` — **ADR-015**(보증은 서버 관측 증거에만 — 로컬 인제스트는 그래프 전용), **ADR-014**(tree-sitter 미채택·심볼 provenance), **ADR-013**(스코프 경계 — 메타데이터 전용 인제스트·팀 표면 게이트), ADR-012(구간 게이트 통과 전 정확도 주장 철회), ADR-011(팀 프라이버시 7규칙).
> 전제 문서: `IMPLEMENTATION_GUIDE.md`(세션 규약·재량 기본값) → `WORK_SPEC.md`(규범·가드레일) → 이 계획. 충돌 우선순위: ADR = WORK_SPEC > 이 계획 > GUIDE.

## TL;DR (For humans)

Phase 2B까지 **모든 기능이 픽스처 기반으로 증명**됐다(vitest 666+, Playwright 66, 스코프 경계 12종). 2C는 새 기능이 아니라 **증명된 것을 실물에 연결하는 페이즈**다: ⑴ Supabase 실기동과 실데이터 로더 배선 ⑵ GitHub App 실기 1회 완주 ⑶ 동결된 실험 3종 실행(벤치 v3·VIBE 주입·기법 A/B — 크레딧 필요) ⑷ 배포와 도메인 확정. 각 웨이브는 **사람 준비물이 명시된 게이트** 뒤에 있고, 준비물이 없으면 그 웨이브를 건너뛰고 가능한 웨이브를 먼저 한다.

**Effort:** L (코드보다 연동·검증 중심) · **Risk:** Medium — 실물 연동에서 픽스처와 실제의 차이가 드러나는 것이 이 페이즈의 목적 그 자체다.

**Decisions locked (do not relitigate):**

- 로컬 인제스트는 그래프 전용 — findings·receipt를 클라이언트에서 받지 않는다(ADR-015, 스캐너 `client-submitted-assurance`가 강제).
- 벤치 v3·VIBE 주입은 **동결된 사전등록 그대로** 실행한다(`benchmarks/databrain/tasks.v3.json` 600시행, `benchmarks/vibe/` 112시행). 실행 전 과제·판정 기준 수정 금지.
- 정확도 주장은 v3 구간 게이트 통과 전까지 철회 상태 유지(ADR-012). 토큰 주장(−55.97%, CI 병기)만 게시.
- 도메인은 **솔루션 완성 후 구매·확정**(2026-08-17 사용자 결정, OQ-010). Wave 4 배포 시점에 처리.

---

## 상태 스냅샷 — 이 계획을 처음 받은 에이전트를 위해

**완료된 것 (재확인 불필요, git log와 `.omo/evidence/`가 증거):**

- Phase 2A(UI 전면 재구축) · Phase 2B(15/15) · 후속 배선(로컬 인제스트 run, MCP `record_prompt`, `/team` 화면) · ADR-013/014/015 판정 전부 완료.
- 열린 OPEN_QUESTIONS: **없음.** OQ-008은 Phase 2C todo 4에서 해소됐다(2026-08-18).
- 데모 데이터로 도는 공개 화면: `/commits` `/inspection` `/team` `/progress` `/graph` 등 전부. Supabase 로더가 이미 있는 것: commits·progress·stats·library·mcp·local-ingest. **없는 것: inspection·team** (`apps/web/lib/{inspection,team}/fixtures.ts`만 존재).
- 워커: 스캔·분석·판단(크레딧 과금·BYOK 0크레딧·실패 무과금)·코칭이 잡 큐에 배선됨. 마이그레이션은 `tests/helpers/database.ts`의 `ALL_MIGRATIONS`에 전부 등록.

**하드 룰 (기계 강제, 약화 금지):** `scripts/verify-scope-boundaries.ts` 12경계 + `scripts/adr-guardrails.ts`. 특히 — 원본 코드 본문 저장·전송 금지, 클라이언트 제출 findings/receipt 금지, verified는 실행 증거만, 실패 출력 무과금, 측정 없는 수치 금지, 테스트 약화 금지.

**세션 규약 (AGENTS.md):** 한 세션에 한 웨이브. todo당 커밋 + `.omo/evidence/phase2c/` 기록. 종료 시 lint/typecheck/test green. 스펙 모순 발견 시 `spec/OPEN_QUESTIONS.md` 기록 후 합리적 기본값으로 진행.

### 세션 시작 프롬프트 템플릿 (사용자가 복사해서 사용)

```
arr-app 레포에서 Phase 2C를 이어간다.
1. spec/IMPLEMENTATION_GUIDE.md → spec/WORK_SPEC.md → spec/BUILD_PLAN_PHASE2C.md를 읽어라.
2. BUILD_PLAN_PHASE2C의 체크박스와 git log·.omo/evidence/phase2c/로 진행 상태를 파악하라.
3. 이번 세션 범위: Wave {N}. 사람 준비물이 없으면 해당 todo를 건너뛰고 보고하라.
4. 각 todo는 수용 기준을 테스트로 통과시켜야 완료다. 완료 시 체크박스 갱신 + evidence 기록 + todo당 1커밋.
```

---

## 사람 준비물 게이트 (에이전트가 대신 만들 수 없는 것)

| 게이트                 | 필요한 것                                                                                                                                                                          | 막히는 웨이브       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **G1 — 로컬 Supabase** | ~~Docker Desktop + supabase CLI~~ → **2026-08-18 열림.** Docker Desktop 설치 후 `supabase start`로 마이그레이션 21개 적용. 재기동 절차는 `.omo/evidence/phase2c/wave-1-todo-4.md`. | ~~Wave 1~~ **해제** |
| **G2 — GitHub App**    | App 등록(GUIDE §2 Phase B 권한·이벤트), `.env`: `GITHUB_APP_ID`·`GITHUB_APP_PRIVATE_KEY`·`GITHUB_WEBHOOK_SECRET`, smee.io 채널                                                     | Wave 2              |
| **G3 — AI 크레딧**     | `ANTHROPIC_API_KEY` + 실행 예산 승인(벤치 v3 예상 ~8.15M 토큰 + VIBE 112시행 + 기법 A/B)                                                                                           | Wave 3              |
| **G4 — 배포 계정**     | Supabase 클라우드 프로젝트, Vercel(web), Fly.io(worker/MCP), **도메인 구매**(이 시점 사용자 결정)                                                                                  | Wave 4              |

**에이전트 규칙:** 게이트가 닫혀 있으면 그 웨이브를 통째로 보류하고 열려 있는 웨이브를 먼저 진행하라. 게이트 단위로 사용자에게 요청하고, 개별 키를 하나씩 조르지 말 것.

---

## Wave 1 — Supabase 실기동 · 실데이터 배선 _(G1)_

픽스처로 증명된 화면을 실제 DB 위에서 다시 증명한다. **로더는 "데모 폴백"이 아니라 별도 경로다** — 실데이터가 비어 있으면 데모가 아니라 빈 상태("증거 부족")를 보여야 한다.

- [x] **1. `/inspection` 실데이터 로더**
      `apps/web/lib/inspection/`에 Supabase 로더 신설 — 판단 잡 요약(`inferred` 라벨 유지), npm-audit 업로드 인제스트 경로(수집 전용 경계 유지), 배제 이력 읽기. 6위젯 전부 출처 라벨과 "증거 부족" 상태가 실데이터에서도 성립해야 한다.
      수용 기준: 로더 단위 테스트(실DB 헬퍼), 빈 워크스페이스 → 전 위젯 "증거 부족", RLS 교차 테넌트 차단, 데모 라우트(`?state=`)와 실데이터 라우트의 분리.
      Commit: `feat(inspection): load the dashboard from stored evidence`

- [x] **2. 배제 이력 수집 경로 (Phase 2B todo 8 이월)** _(순서 조정: 1번이 이 테이블을 읽으므로 2 → 1 순으로 진행)_
      MCP 툴 `record_ruled_out`(mcp:write) — 시도했다 배제한 가설을 append-only로 기록. 삭제·수정 API 없음(append-only가 스키마 수준 성질이어야 함). `/inspection` 위젯이 이 경로의 데이터를 읽는다.
      수용 기준: append-only 증명(UPDATE/DELETE 거부 테스트), 툴 계약 테스트, 테넌트 격리, access_event 발행 여부는 기존 write 툴 규약과 동일하게.
      Commit: `feat(mcp): record ruled-out attempts append-only`

- [x] **3. `/team` 실데이터 로더**
      `apps/web/lib/team/`에 Supabase 로더 — 구성원·역할, 프롬프트 기록 메타(동의 상태는 **본인 것만**), 코칭 결과, 기여도 집계, VIBE 게이트 판정. ADR-011 음성 성질이 로더 계층에서도 성립해야 한다: 타인 동의 상태·타인 원문이 쿼리 결과에 아예 없을 것.
      수용 기준: 역할별 가시성 테스트(양성·음성), 동의 상태 비노출을 로더 출력에서 증명, VIBE는 `benchmarks/vibe/gate-results.json`의 adopted만(현재 전부 pending → 0개), 솔로 워크스페이스 무영향.
      Commit: `feat(teams): load the team view from stored rows`

- [x] **4. Auth 실기동 + OQ-008 해소** _(2026-08-18 완료. 잔여 이관: `/app/*` 순회와 실데이터 화면 배선은 **로그인 수단이 GitHub OAuth뿐**이라 G2(GitHub App)가 필요 — Wave 2 todo 5로 옮긴다)_
      로컬 Supabase Auth(GitHub OAuth 또는 이메일)로 `/auth/*`·`/app/*` 화면을 실제로 띄우고 axe AA 명암비 검증을 CI 스위트에 편입. `/commits` 실데이터 경로에서 **graph-only 카드가 실DB run으로 렌더되는지** 이 기회에 확인(ADR-015 잔여 확인 항목 — 단위 증명은 `tests/local-ingest.test.ts`에 이미 있음).
      수용 기준: auth 화면 axe 통과가 Playwright 스위트에 편입, OQ-008 resolved 갱신, `arr push` → `/commits` graph-only 카드 e2e 1건.
      Commit: `fix(auth): verify contrast on live auth screens`

## Wave 2 — GitHub App 실기 완주 _(G2)_

녹화 픽스처로 만든 파이프라인을 실제 GitHub에 1회 완주시킨다. 목적은 기능 추가가 아니라 **픽스처와 실물의 차이 발견**이다.

- [ ] **5. 실기 파일럿: install → push → 카드 → receipt** _(Wave 1에서 이관된 잔여 포함: `/app/*` 두 테마 순회, `arr push` → `/commits` graph-only 카드 실데이터 e2e — 둘 다 로그인 세션이 있어야 한다)_
      실제 레포(2klips 소유 테스트 레포)에 App 설치 → push → webhook 수신(smee) → 스캔·분석 잡 → 커밋 카드 `full` 보증 → receipt 발급·검증까지 완주. 발견된 픽스처-실물 차이는 코드 수정이 아니라 **픽스처 갱신**으로 반영(녹화 절차를 evidence에 기록).
      수용 기준: 완주 스크린샷·receipt digest를 evidence로, 갱신된 녹화 픽스처로 기존 테스트 전부 green, 차이점 목록 문서화.
      Commit: `test(github): refresh recorded fixtures from a live run`

## Wave 3 — 동결 실험 실행 _(G3)_ — **사전등록 수정 금지**

- [ ] **6. 벤치마크 v3 본 실행 (600시행)**
      `benchmarks/databrain/tasks.v3.json` 그대로. 구간 게이트(ADR-012)로 정확도·토큰 판정 → 통과 시 사이트 정확도 주장 복원 절차(ADR-012에 정의), 미통과 시 철회 유지 + 결과 공개.
      수용 기준: 결과 다이제스트 잠금, 리포트 검증 스크립트(`scripts/verify-benchmark-report.ts`) 통과, 판정과 무관하게 결과 게시.
      Commit: `feat(bench): run the v3 benchmark and publish verdicts`

- [ ] **7. VIBE 주입 실험 (112시행) + 기법 실모델 A/B**
      주입 그리드 실행 → 지표별 채택/폐기 판정을 `benchmarks/vibe/gate-results.json`에 기록 — **adopted가 생기면 `/team` VIBE 위젯이 자동으로 렌더되기 시작한다**(픽스처-게시 파일 일치 테스트가 이미 강제). 기법 4종(id-first 등)의 dry-run 델타를 실모델로 재측정.
      수용 기준: 판정 기록이 게시 파일에 반영, 미채택 지표 비노출 유지, 실모델 델타가 리포트에 사전등록 대비로 기록.
      Commit: `feat(bench): judge vibe metrics and techniques on real models`

- [x] **8. 코칭 판단 잡 — 크레딧 원장 실연결** _(2026-08-18 완료. G3 불필요 — 원장 배선은 실모델 호출 없이 증명된다)_
      코칭 잡을 크레딧 원장에 실연결(판단 잡과 같은 라이프사이클). 이미 준비된 무과금 마커(`schema_invalid`)가 실경로에서 환불로 이어지는지 실증.
      수용 기준: 성공 과금·실패 환불·멱등(재시도 이중 과금 없음)을 실DB 테스트로, BYOK 0크레딧 경로.
      Commit: `feat(teams): charge coaching through the credit ledger`

## Wave 4 — 배포 · 도메인 _(G4)_

- [ ] **9. 프로덕션 기동**
      Supabase 클라우드 마이그레이션 적용, Vercel(web)·Fly.io(worker/MCP) 배포, 프로덕션 webhook URL 전환. 시크릿은 플랫폼 시크릿 스토어만(레포에 어떤 형태로도 커밋 금지).
      수용 기준: 프로덕션에서 Wave 2 파일럿 재완주, 헬스체크·롤백 절차 문서화.
      Commit: `chore(deploy): stand up production`

- [ ] **10. 도메인 확정 + OQ-010 잔여 수정**
      도메인 구매(사용자) 후 두 곳 수정: MCP 설정 화면 호스트명, receipt `predicateType`(`packages/core/src/assurance/receipts.ts`). **predicateType 변경은 기존 receipt 다이제스트 호환을 깨므로 실데이터 receipt가 쌓이기 전에 처리** — Wave 4에서 9번과 같은 세션에 한다.
      수용 기준: predicateType 변경 후 전체 receipt 테스트 green, OQ-010 잔여 resolved.
      Commit: `chore(domain): adopt the purchased domain`

## Wave 5 — 최종 게이트

- [ ] **11. 최종 검증·핸드오프**
      전체 vitest/Playwright green, 가드레일 12경계 무변경 증명(위반 심기 재확인), CHANGELOG Phase 2C 섹션, 다음 페이즈 후보(CI 아티팩트 보증 ADR — OIDC 출처 증명 설계 — 는 수요 신호 후) 기록.
      Commit: `chore(release): phase 2c verification`

---

## Must NOT have (전 페이즈 공통 + 2C 특유)

- 클라이언트 제출 findings·receipt 수용(ADR-015) — 실데이터 배선 중에도 인제스트 경로는 그래프 전용.
- 사전등록된 실험의 과제·판정 기준 수정. 실행 전 수정이 필요해 보이면 실행하지 말고 OPEN_QUESTIONS에 기록.
- 데모 픽스처를 실데이터 경로의 폴백으로 사용(빈 실데이터는 "증거 부족"으로).
- 시크릿·키의 레포 커밋(어떤 형태로도), 도메인 확정 전 predicateType 선변경.
- 동의 없는 프롬프트 수집, Goodhart 미통과 지표 노출, 원본 코드 저장, 측정 없는 수치, 테스트 약화.

## 검증 전략

Phase 2B와 동일(할일 = 구현+테스트, 수용 기준은 테스트로 판정) + **이 페이즈 특유: 실물이 픽스처와 다르면 그 차이가 1급 산출물이다.** 차이를 발견하면 ⑴ 픽스처를 실물에 맞게 갱신하고 ⑵ 차이의 원인을 evidence에 기록한다. 코드를 실물에 맞추는 변경은 기존 테스트를 깨는지 먼저 확인.

## 우선순위 제안

1. **Wave 1** (G1만 필요 — Docker는 로컬 준비물) — OQ-008까지 닫히면 열린 OQ가 0이 된다
2. **Wave 3** (G3 크레딧이 열리는 즉시 — 다른 웨이브와 독립)
3. **Wave 2** (G2 — Wave 1과 독립이라 준비물 순서에 따라 앞당겨도 됨)
4. **Wave 4 → 5** (G4 — 도메인 구매 포함, 마지막)

웨이브 간 의존은 4→(1,2) 뿐이다(프로덕션 기동은 실데이터 로더·실기 파일럿 선행). 1·2·3은 서로 독립이므로 **준비물이 열리는 순서대로** 진행하라.
