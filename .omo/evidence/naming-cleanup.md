# Naming cleanup — SpecProof → Arr (OQ-010 / ADR-010-3)

**날짜:** 2026-08-16 · **브랜치:** `main` (푸시하지 않음)
**커밋:** `f2e4dcc` → `87842ca` → `7cf6873` → `07d474c`
**기준 커밋:** `b31ff99` (테스트 416, Playwright 49)

---

## 1. 무엇을 바꿨나

### 1순위 — 사용자 노출 문자열 (`f2e4dcc`)

| 항목 | 이전 | 이후 | 위치 |
|---|---|---|---|
| 데모 레포 라벨 | `specproof/drifted-demo` | `arr/drifted-demo` | `lib/strings/onboarding.ts`, `app/ui/onboarding-flow.tsx`, `lib/library/demo.ts`, e2e |
| 기본 레포 라벨 | `2klips/specproof-app` | `2klips/arr-app` | `lib/strings/{onboarding,assurance,progress}.ts`, `lib/dashboard/graph-model.ts`, `lib/assurance/fixtures.ts` |
| 벤치마크 링크 | `github.com/2klips/specproof-app/...` | `github.com/2klips/arr-app/...` | `app/app/stats/pilot-stats-dashboard.tsx` |
| 산문 제품명 | SpecProof | Arr | `AGENTS.md`, `docs/PRIVACY.md`, `docs/PILOT_RECRUITMENT.md`, `fixtures/drifted-demo/AGENTS.md` |
| 인덱스 PR | "add SpecProof minimal context index" / `specproof/minimal-index-*` | "add Arr minimal context index" / `arr/minimal-index-*` | `packages/core/src/context/index-pr-proposal.ts` |
| 관리 인덱스 마커 | `<!-- SPECPROOF:BEGIN/END -->` | `<!-- ARR:BEGIN/END -->` | `packages/core/src/context/minimal-index.ts` (상수도 `ARR_INDEX_*`) |
| MCP 서버 정체성 | 서버명 `specproof`, realm `SpecProof MCP`, `specproof://workspace/...` | `arr`, `Arr MCP`, `arr://workspace/...` | `packages/mcp/src/hosted.ts` |
| Receipt predicate | `https://specproof.dev/receipt/v1` | `https://arr.dev/receipt/v1` | `packages/core/src/assurance/receipts.ts` |
| 통계 내려받기 | `specproof-pilot-stats.json` / `specproof.pilot-stats.v1` | `arr-pilot-stats.json` / `arr.pilot-stats.v1` | `apps/web/lib/stats/export.ts` |
| 환경변수·대체 호스트 | `SPECPROOF_MCP_URL`, `app.specproof.app`, `mcp.specproof.app` | `ARR_MCP_URL`, `app.arr.app`, `mcp.arr.app` | `app/app/settings/mcp/actions.ts` |

부수 효과로 다시 계산해야 했던 결정적 값:

- `fixtures/drifted-demo/recordings/github/webhooks/*.json` 의 `x-hub-signature-256`
  (본문의 `full_name`이 바뀌어 HMAC이 달라짐) — `recording-metadata.json` 의
  `webhookSecret` 으로 재서명.
- `fixtures/drifted-demo/expected-artifacts.json` 의 `AGENTS.md` digest
  `e80d92a9…` → `818a1e1c…` (파일 본문의 제품명이 바뀜).
- `tests/korean-strings.test.ts` 의 `TECHNICAL_TOKENS`: 넓은 `specproof` 토큰을
  더 좁은 `arr-app` · `arr/drifted-demo` 두 개로 **교체**했다. 감지기를 약화시키지
  않기 위해 맨 `arr` 토큰은 쓰지 않았다 (다른 영단어 속 `arr`를 지워버린다).

### 2순위 — 패키지명 (`87842ca`)

- 루트 `package.json` `name`: `specproof` → `arr`
- `@specproof/web` · `@specproof/worker` · `@specproof/core` · `@specproof/mcp`
  · `@specproof/drifted-demo` → `@arr/*` (56개 파일: 모든 import,
  `workspace:` 의존성, `CORE_PACKAGE_NAME`/`MCP_PACKAGE_NAME` 상수와 그 단언)
- filter 대상: 루트 `dev` 스크립트와 `playwright.config.ts` webServer 명령
- `pnpm install` 로 워크스페이스 재링크 → `pnpm-lock.yaml` 갱신.
  `node_modules/@specproof` 잔여 심링크 디렉터리 3곳을 삭제해, 놓친 import가
  구 이름으로 조용히 해석되는 상황을 원천 차단했다.
- **변경 불필요로 확인된 것:** `pnpm-workspace.yaml` 은 `apps/*`·`packages/*`·
  `fixtures/*` 디렉터리 glob이라 패키지명을 참조하지 않는다. tsconfig에는 path
  alias가 없다(해석은 워크스페이스 링크 전용).
- **plan-compliance 경로 상수 확인:** `.omo/plans/docshub-product-strategy.md`
  의 커버리지 매니페스트는 `apps/web/...` 같은 **디렉터리 경로**만 참조하고
  패키지명은 참조하지 않는다. 따라서 패키지 리네임과 함께 고칠 경로 상수는
  없었다 — 확인 결과를 아래 §3에 실측으로 남긴다.

### 3순위 — 내부 식별자 (`7cf6873`)

`DEMO_WORKSPACE_ID` → `workspace-arr-demo` · AI 판단 툴명 `arr_judgment` ·
`arrReceiptPredicateSchema` · 마이그레이션 advisory lock `arr_migrations` ·
벤치마크/테스트 임시 디렉터리 접두어 `arr-*`.

### 후속 수정 (`07d474c`)

`apps/web/lib/assurance/fixtures.ts` 의 receipt `expectedDigest` 3개 중 2개를
재계산했다. 데모 receipt는 정규화된 statement에 대한 SHA-256을 미리 박아두는데,
`predicateType` 과 `repository`/`subject.name` 이 바뀌면서 정규형이 달라져
`receipt-current` 가 "tampered" 로 판정되고 있었다.

- `receipt-current`: `8b8e940f…` → `e039d2e6…`
- `receipt-previous`: `47440141…` → `40bc6190…`
- `receipt-tampered`: 설계상 `receipt-current` 의 digest를 그대로 쓴다(자기 statement와
  불일치해야 하므로). 그 관계를 유지했다.

**이건 vitest가 잡지 못한다** — `npx playwright test` 만 잡는다
(`tests/e2e/findings.spec.ts`, `tests/e2e/pilot-flow.spec.ts`). 픽스처 digest를
단언하는 vitest 테스트가 없다는 뜻이며, 리뷰 세션이 판단할 갭이다.

---

## 2. 의도적으로 남긴 것 (역사 기록)

건드리지 않은 경로 — 이들은 "그때 무슨 일이 있었나" 의 기록이다:

- `spec/` 전체 (`OPEN_QUESTIONS.md` 의 OQ-010 항목만 예외적으로 갱신).
  `spec/IMPLEMENTATION_GUIDE.md` 제목의 "SpecProof" 포함.
- `docs/adr/*`, `docs/reports/IMPLEMENTATION_REVIEW_2026-08-14.md`
- `benchmarks/databrain/*`
- `CHANGELOG.md`
- `.omo/evidence/**`, `.omo/plans/**` (`docshub-product-strategy` 라는 더 이전
  제품명 디렉터리명 포함)
- git 히스토리

추가로 남긴 판단 항목:

1. **`README.md:3` "Arr(구 SpecProof) 애플리케이션 구현 레포"** — 잔여 네이밍이
   아니라 개명 사실을 알리는 문장이다. 푸터는 이미 `© 2026 Arr`.
2. **`scripts/verify-plan-coverage.ts` 의 `<!-- specproof-coverage:start/end -->`
   마커** — 짝이 되는 마커가 `.omo/plans/docshub-product-strategy.md` 안에 있다.
   이름을 바꾸려면 역사 기록인 계획 문서를 고쳐야 하고, 한쪽만 바꾸면 가드레일이
   **조용히 무력화**된다(매니페스트를 못 찾아 항상 fail → 아무도 안 고치면 무시됨).
   그래서 양쪽 다 그대로 뒀다. **레포에 남은 유일한 `specproof` 문자열이다**
   (`scripts/verify-plan-coverage.ts:6`, `:117`).

검증:

```
$ git ls-files | xargs grep -il specproof   # 역사 경로 제외 후
README.md                       (개명 고지 문장)
scripts/verify-plan-coverage.ts (매니페스트 마커 — 위 2번)
```

---

## 3. 가드레일 재검증 (rename이 감지기를 죽이지 않았다는 증거)

### 3.1 분석기 CLI — 현재 레포에서 실행

```
$ npx tsx scripts/verify-scope-boundaries.ts
PASS scope fidelity: 11 boundaries, 172 files, 0 forbidden paths        exit=0

$ npx tsx scripts/verify-plan-coverage.ts .omo/plans/docshub-product-strategy.md
PASS plan coverage: 22 must-haves, 10 must-nots, 22 evidence files      exit=0

$ npx tsx scripts/verify-benchmark-report.ts
PASS efficacy benchmark: 108/108 trials, 3.664pp accuracy,
     55.968875% token reduction, 145 claim files                        exit=0

$ npx tsx scripts/security-audit.ts
FAIL security audit: 1 high/critical findings
- high span-rendering-injection apps/web/app/layout.tsx:29 …            exit=1
```

`scripts/adr-guardrails.ts` 는 CLI main이 없는 라이브러리다. 그 규칙들은
`verify-scope-boundaries` 의 5개 boundary 매핑과 `tests/adr-guardrails.test.ts`
로 노출된다 (§3.3에서 실측).

> **주의 — 리뷰 세션이 확인할 것:** `security-audit` 의
> `apps/web/app/layout.tsx:29` 지적은 **이번 리네임 이전부터 있던 것**이다.
> 기준 커밋 `b31ff99` 를 별도 worktree로 체크아웃해 같은 명령을 돌려 동일한
> 1건이 나오는 것을 확인했다. 이 리네임이 만든 문제가 아니며, 이번 작업 범위에서
> 고치지 않았다.

### 3.2 씨앗 위반(seeded violation)을 심고 실제로 실패하는지 확인

레포에 실제 위반 파일을 임시로 심고 CLI를 돌린 뒤 지웠다.

```
seed: apps/web/app/teams/page.tsx           (team-ui)
seed: packages/core/src/__seeded_violation.ts (raw-code-persistence)

$ npx tsx scripts/verify-scope-boundaries.ts
apps/web/app/teams/page.tsx:1:1 [team-ui] Team and organization UI is outside
  the single-user MVP scope.
packages/core/src/__seeded_violation.ts:1:23 [raw-code-persistence] Raw
  source-code persistence is forbidden outside an allowlisted transient path.
FAIL scope fidelity: 2 forbidden path(s)                                exit=1

$ npx tsx scripts/security-audit.ts
FAIL security audit: 2 high/critical findings                           exit=1
- (기존 layout.tsx 1건)
- critical transient-fetch-boundary packages/core/src/__seeded_violation.ts:1
```

plan coverage — 진짜 계획 문서를 변형한 사본으로:

```
변형 A: "provenance-required" boundary 제거
FAIL plan coverage (1)
- must-not: WORK_SPEC boundary missing: provenance-required             exit=1

변형 B: 커버리지 매니페스트 마커 제거
FAIL plan coverage (1)
- plan: missing specproof coverage JSON manifest                        exit=1
```

씨앗 파일은 전부 제거했고 `git status` 가 깨끗함을 확인했다.

### 3.3 가드레일 테스트 스위트 — 45/45 (음성 케이스 전수)

```
tests/scope-fidelity.test.ts       11개 boundary 전부 "rejects <boundary>" 통과
                                   + "accepts the current MVP product surface"
tests/adr-guardrails.test.ts       raw-code-persistence / doc-body-inlining /
                                   repo-write-outside-pr-proposal / network-in-core
                                   / MCP Sampling / merge·기본브랜치 변형 거부
tests/security-audit.test.ts       webhook 위조·토큰 평문 로깅·RLS 누락·원본 코드
                                   저장·span HTML 주입 거부 (허용 케이스 2건 포함)
tests/plan-compliance.test.ts      guardrail 제거 거부, proof kind 위조 거부,
                                   품질 게이트 약화 금지
tests/evidence-coverage.test.ts    evidence 파일 누락 거부
tests/efficacy-benchmark.test.ts   8개 음성 케이스 (미등록 시행·모델 불일치·집계
                                   불일치·토크나이저 가정 누락·과대 주장 등)

Tests  45 passed (45)
```

---

## 4. 게이트 실측

| 게이트 | 기준(`b31ff99`) | 이후(`07d474c`) |
|---|---|---|
| `pnpm lint` | clean | **clean** |
| `pnpm typecheck` | clean (6개 프로젝트) | **clean** |
| `pnpm test` | 64 files / **416** tests | 64 files / **416** tests |
| `npx playwright test` | 49 | **49 passed (19.3s)** |
| `pnpm --filter @arr/web build` | (구 이름) | **성공** |

`pnpm format:check` 는 **실행하지 않았다** (지시). 참고로 기준 커밋에서도 이미
202개 파일이 prettier 미준수라 게이트가 아니다.

---

## 5. 리뷰 세션이 푸시 전에 확인할 것

1. **`npx playwright test` 가 `.omo/evidence/**` 의 스크린샷·axe JSON 23개를
   덮어쓴다** (`pilot-flow.spec.ts`, `screens-theme.spec.ts` 등이 evidence 경로에
   직접 기록한다). 역사 기록 보존 규칙에 따라 매 실행 후 `git checkout --
   .omo/evidence` 로 되돌렸다. 커밋에는 포함되지 않았다. e2e를 다시 돌리면 또
   더러워지므로 푸시 전 `git status` 를 확인할 것.
   `apps/web/next-env.d.ts` 도 dev/build 모드에 따라 왔다갔다 하므로 동일.
2. **자리표시자 도메인.** `app.arr.app` · `mcp.arr.app` · `https://arr.dev/receipt/v1`
   는 소유 확인이 안 된 도메인이다(구 `specproof.app`/`.dev` 도 마찬가지였다).
   실제 도메인이 정해지면 다시 손봐야 한다.
3. **`predicateType` 은 데이터 계약이다.** 이미 발행된 receipt가 어딘가에
   저장돼 있다면 `https://specproof.dev/receipt/v1` 로 검증에 실패한다. 파일럿
   전이고 마이그레이션에 receipt 본문이 없어 문제 없다고 판단했지만, 클라우드
   Supabase에 데이터가 있다면 확인이 필요하다.
4. **관리 인덱스 마커 `SPECPROOF:` → `ARR:`.** 사용자 레포의 `AGENTS.md` 에 이미
   구 마커가 박혀 있다면, 새 제안은 그것을 갱신하지 않고 **덧붙인다**
   (`applyManagedIndex` 는 마커가 0개면 append). 실사용 설치가 없다고 보고
   진행했다.
5. **`arr_migrations` advisory lock 이름 변경.** 구 빌드와 새 빌드가 동시에
   마이그레이션을 돌리면 서로를 막지 못한다. 배포가 하나뿐이라 무해하다고 봤다.
6. **`security-audit` 의 `layout.tsx:29` 지적은 선재 결함**이다(§3.1). 이번
   작업에서 손대지 않았다 — 별도 처리 여부는 리뷰 판단.
7. **픽스처 digest를 지키는 vitest 테스트가 없다.** receipt `expectedDigest`
   3개는 Playwright만 검증한다. 같은 사고가 재발하기 쉬운 지점이다.
