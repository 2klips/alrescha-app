# 벤치마크 v3 — 하네스 확장 + 드라이런 + 비용 추정 (2026-08-17)

**범위:** RESEARCH_AGENDA §3 ⑵~⑷ (실레포 과제 확대 · 다모델 · 반복 5회와 신뢰구간). **실제 다모델 실행은 하지 않았다** — 예산 승인 대기.

## 1. 무엇을 만들었나

| 파일 | 역할 |
|---|---|
| `benchmarks/databrain/tasks.v3.json` | v3 **사전등록 매니페스트** (schema 2). 20과제 × 5반복 × 3군 × 2모델 = 600 시행 |
| `scripts/databrain-benchmark/statistics.ts` | 시드 부트스트랩(percentile) 신뢰구간 — 감사에서 재현 가능 |
| `scripts/databrain-benchmark/cost-estimate.ts` | 드라이런 + 커밋된 v2 쌍에서 실행 비용을 **유도** |
| `scripts/databrain-benchmark/model.ts` | Anthropic Messages API 어댑터 추가 (기존 OpenAI 어댑터 유지) |
| `scripts/databrain-benchmark/benchmark.ts` | 다모델 실행 · 모델별 집계 · 구간 기반 게이트 · override 기록 |
| `scripts/verify-benchmark-report.ts` | F5 감사가 **두 릴리스**(schema 1 동결 · schema 2 신규)를 모두 검증 |

**동결 원칙:** `tasks.json`(schema 1)과 `results.real.{json,md}`는 한 바이트도 건드리지 않았다. 매니페스트 다이제스트는 파싱된 객체의 `JSON.stringify` 해시이므로, 로더의 v1 경로는 객체 형태·키 순서까지 그대로 보존했다. v1 마크다운 렌더러도 동결(`renderBenchmarkMarkdownV1`)했고 스키마로 분기만 추가했다.

- `tasks.json` 파일 SHA-256: `e1dc4352d19a123c739c5437b2882629c05a506f7db377cf5899258759ae7553`
- **`tasks.v3.json` 파일 SHA-256: `a4b0444190fa484c7ce76690b69e38d316e42ab76bd0acb71714ef9496e6f12b`**
- **v3 매니페스트 다이제스트(리포트에 기록되는 값, 파싱 객체 해시): `ffffb0a973cef8d6c2946086d136289561961419c7210c52562e1741253bf6ba`**

## 2. 과제 인벤토리 (20개, 사전등록)

| 코퍼스 | 개수 | 유형 · 채점기 |
|---|---|---|
| `fixtures/drifted-demo` (픽스처) | 10 | implementation 4 (**test-pass**) · question-answering 4 (**answer-manifest**) · drift-judgment 2 (**findings-manifest**) |
| `.` (이 레포 = 실레포) | **10** | question-answering 8 (**answer-manifest**) · policy-audit 2 (**findings-manifest**) |

실레포 비중 2 → **10** (요구치 6 이상). 코퍼스 분류는 별도 필드가 아니라 사전등록된 `repository` 값에서 유도한다(`fixtures/` 접두 = 픽스처) — 실제로 읽는 코퍼스와 어긋날 수 없다. 로더가 `realistic < 6`이면 매니페스트를 거부한다.

신규 실레포 과제 8개와 정답 근거(전부 레포 내 실측 문자열):

| 과제 | 정답 근거 |
|---|---|
| `real-answer-job-queue-claim` | `for update skip locked`·`claim_next_job`·`heartbeat_at`·`lease_expires_at` (`supabase/migrations/202608100004_*.sql`, `apps/worker/src/queue.ts`) |
| `real-answer-graph-renderer` | `graphology`·`d3-force`·`pixi.js`·Web Worker (`apps/web/package.json`, `apps/web/lib/graph/force-simulation.ts`) |
| `real-answer-receipt-statement` | `https://in-toto.io/Statement/v1`·`https://arr.dev/receipt/v1`·digest (`packages/core/src/assurance/receipts.ts`) |
| `real-answer-credit-honesty` | 결정론 분석 0크레딧 · 실패 시 `refund` 원장 이벤트 · `idempotencyKey` (`supabase/migrations/…_worker_credit_lifecycle.sql`, `packages/core/src/data/schemas.ts`) |
| `real-answer-index-pr-limits` | advisory PR 제안 단일 경로 · `<!-- ARR:BEGIN … -->` · 30줄 상한 (`packages/core/src/context/minimal-index.ts`) |
| `real-answer-evidence-grade-rule` | `verified`/`inferred`/inferred-only 체인 상한 `medium` (`packages/core/src/assurance/rules.ts`) |
| `real-audit-mcp-tool-surface` | 등록된 툴 7종 + 미끼 4종 (`packages/mcp/src/hosted.ts`) |
| `real-audit-finding-taxonomy` | finding type 6종 + 미끼 4종 (`packages/core/src/assurance/rules.ts`) |

설계 규칙: **프롬프트가 정답을 흘리지 않는다**(예: "verified/inferred"라는 단어를 프롬프트에 쓰지 않고 "실행 증거가 있을 때의 라벨"로 묻는다). 감사(policy-audit) 과제는 참·거짓이 섞인 **닫힌 후보 목록**을 주고 참인 것만 고르게 하므로, 전부 답하면 precision이 떨어져 F1이 깎인다(테스트로 고정). 새 유형 `policy-audit`은 `findings-manifest` 채점기에만 매핑된다.

## 3. 다모델 설계

- 매니페스트가 `models: [{id, provider}]`를 사전등록한다. 현재: `gpt-5-nano-2025-08-07`(openai), `claude-sonnet-5`(anthropic). schema 2는 **서로 다른 provider 2개 이상**을 강제한다.
- Anthropic 어댑터: `POST https://api.anthropic.com/v1/messages`, 헤더 `x-api-key` + `anthropic-version: 2023-06-01`, `max_tokens: 4096`. 구조화 출력은 OpenAI JSON 스키마와 **바이트 단위로 같은 스키마**를 가진 단일 툴(`databrain_benchmark_output`)을 `tool_choice: {type:"tool"}`로 강제해 얻는다 → 두 공급자가 같은 계약에 답한다.
- **토큰 회계는 각 공급자의 보고값만 쓴다** (`usage.input_tokens`/`usage.output_tokens`). 어느 경로에도 로컬 토크나이저 추정이 없다; id나 usage가 없으면 시행을 실패 처리한다.
- 429/5xx(+Anthropic 529)는 `retry-after`·본문 지연 힌트·지수 백오프로 최대 6회 재시도. 오류 메시지의 `sk-`/`sk-ant-` 패턴은 마스킹한다.
- **키가 없으면 그 모델만 깨끗하게 스킵**한다: `run.models[]`에 `status: "skipped"` + 사유가 남고, 마크다운에 `Skipped model: ...` 줄이 찍히며, `expectedTrialCount`가 실행분으로 줄어든다(등록분은 `registeredTrialCount`로 따로 보존). 전 모델이 스킵되면 그때만 실패한다.
- 군별 컨텍스트는 모델과 무관하게 (task, arm)으로 캐시되어 **두 모델이 완전히 같은 컨텍스트**를 받는다.

## 4. 신뢰구간과 게이트

- 방법: **시드 비모수 부트스트랩(percentile), 2,000회 재표집, 95%**. PRNG는 mulberry32, 시드는 집계 키의 FNV-1a — 그래서 F5 감사가 원시 시행에서 구간을 **재계산해 대조**할 수 있다(실패 시행도 점수 0으로 재표집 풀에 남는다).
- 쌍대 단위 = (과제, 모델, 반복 인덱스). 모든 군이 같은 과제·같은 프롬프트를 보므로 정확도 Δ와 토큰비는 쌍대 통계다. 균형 설계라 Δ 점추정은 기존 "군 평균 차"와 정확히 같다.
- **게이트를 구간으로 판정한다:** 비열등 = Δ CI **하한 ≥ -5pp**, 개선 목표 = 하한 ≥ +5pp, 토큰 목표 = 절감률 CI **하한 ≥ 30%**. v2의 점추정 판정보다 엄격하다(테스트를 약화시키지 않았다).
- 리포트는 pooled + 모델별로 집계·가설을 각각 싣는다.

**v2 데이터를 v3 규칙으로 재평가한 결과(참고용, v2 리포트는 불변):** 쌍대 단위 36개에서 정확도 Δ +3.66pp, **CI [-6.19, +14.27]pp → 비열등 하한 미달**. 토큰 절감 55.97%, CI [36.71, 67.70]% → 통과. 효과가 사라진 게 아니라 표본이 작다. v3는 쌍대 단위를 36 → **200**으로 늘린다(√ 기준 구간 폭 ≈ 2.4배 축소 기대 — 추정치, 실측 아님). 상세는 OQ-011.

## 5. 드라이런 (실측)

```
pnpm bench:databrain --dry-run --concurrency=4
Data Brain dry-run: 600/600 trials, 0 failed.        (24.0초)
```

- 산출물: `benchmarks/databrain/results.v3.dry-run.{json,md}` + `results.v3.dry-run.cost-estimate.md`
- 20과제 × 5반복 × 3군 × 2모델 = 600시행, 실패 0. 구현 과제 채점은 실제로 격리 vitest를 120회 돌린다.
- 드라이런 군별 입력 토큰(모의 규칙 = 문자수/4, 모델당): checkout 795,020 · full-dump 2,006,780 · data-brain 215,925.

## 6. 실행 비용 추정 (유도 과정 포함)

**1단계 — 커밋된 v2 쌍으로 군별 보정계수를 실측한다.** 같은 하네스·같은 모의 규칙이므로 `비율 = v2 실제 입력토큰 / v2 드라이런 입력토큰`(각 36시행):

| 군 | v2 드라이런 입력 | v2 실제 입력 | 비율 | v2 실제 평균 출력/시행 |
|---|---:|---:|---:|---:|
| checkout | 125,718 | 136,695 | **1.0873** | 222.6 |
| full-dump | 230,772 | 336,087 | **1.4564** | 267.4 |
| data-brain | 56,103 | 56,261 | **1.0028** | 207.1 |

**2단계 — v3 드라이런 입력에 곱하고, 출력은 v2 실측 평균으로 채운다.**
`projected input = v3 dry-run input × ratio`, `projected output = trials × v2 mean output/trial`.

| 모델 | 군 | 시행 | v3 드라이런 입력 | 예상 입력 | 예상 출력 | 예상 합 |
|---|---|---:|---:|---:|---:|---:|
| gpt-5-nano-2025-08-07 | checkout | 100 | 795,020 | 864,437 | 22,261 | 886,698 |
| gpt-5-nano-2025-08-07 | full-dump | 100 | 2,006,780 | 2,922,593 | 26,736 | 2,949,329 |
| gpt-5-nano-2025-08-07 | data-brain | 100 | 215,925 | 216,533 | 20,711 | 237,244 |
| claude-sonnet-5 | checkout | 100 | 795,020 | 864,437 | 22,261 | 886,698 |
| claude-sonnet-5 | full-dump | 100 | 2,006,780 | 2,922,593 | 26,736 | 2,949,329 |
| claude-sonnet-5 | data-brain | 100 | 215,925 | 216,533 | 20,711 | 237,244 |

**3단계 — 합계**

| 모델 | 공급자 | 시행 | 예상 토큰 |
|---|---|---:|---:|
| gpt-5-nano-2025-08-07 | openai | 300 | **4,073,271** |
| claude-sonnet-5 | anthropic | 300 | **4,073,271** |
| **전체** | — | **600** | **8,146,542** |

- v2 실행(108시행, ~47만 토큰) 대비 **약 17배**. 시행 수는 5.6배인데 토큰이 17배인 이유는 **실레포 과제 비중이 2/12 → 10/20으로 늘면서 full-dump 군의 컨텍스트가 커졌기 때문**이다: full-dump 한 군이 전체의 **72%**(2.95M/4.07M per model)를 먹는다.
- **가정과 한계(그대로 읽을 것):** ⑴ 보정계수는 gpt-5-nano에서만 실측했다 — Anthropic 예상치는 같은 비율을 재사용한 **자릿수 추정**이며 실제 실행은 각 공급자 보고값을 쓴다. ⑵ 출력 토큰은 v2 군별 평균 가정이다. ⑶ 재시도는 입력을 재전송하지만 시행당 1회로 계산했다. ⑷ **금액은 추정하지 않는다** — 모델별 단가가 레포에 기록되어 있지 않고, 측정 없는 수치 주장은 금지다(ADR-005 / WORK_SPEC §3-8).
- 예산을 줄이고 싶다면 선택지: full-dump 군을 실레포 과제에서만 축소(비교 공정성 훼손 — 권장하지 않음), 반복 5 → 3(구간이 다시 넓어짐), 모델 1종만 실행(스킵 경로는 이미 지원).

## 7. 스모크 (실모델, 실제 과금 발생분)

```
pnpm bench:databrain --tasks=fixture-implement-remaining-session-ms --repeats=1 \
  --models=gpt-5-nano-2025-08-07 --output-basename=results.v3.smoke --concurrency=3
Data Brain real: 3/3 trials, 0 failed.               (6.7초)
```

| 군 | 점수 | 입력 | 출력 |
|---|---:|---:|---:|
| checkout | 1.000 | 1,337 | 233 |
| full-dump | 0.000 | 720 | 406 |
| data-brain | 1.000 | 1,562 | 227 |
| **합** | — | **3,619** | **866** |

**실제 소모: 4,485 토큰** (gpt-5-nano, 3시행). 실경로 전체를 통과했다 — 실 API 호출 → 구조화 출력 파싱 → 격리 vitest 채점 → 리포트. full-dump가 0점인 것도 실측 그대로다(문서만 덤프하는 군은 `src/session.ts`의 관례를 못 봐 채점 테스트를 통과하지 못했다). 이 리포트는 `run.overrides`에 축소 사실이 기록되어 있어 **릴리스로 승격될 수 없다**(F5 감사가 거부).

## 8. F5 감사 (강화, 약화 없음)

- 감사는 이제 릴리스 2개를 검사한다: `v2`(tasks.json + results.real.*, schema 1) · `v3`(tasks.v3.json + results.v3.real.*, schema 2). v3 리포트가 아직 없으므로 현재는 `pendingReleases: ["v3"]`로만 보고하되, **사전등록 매니페스트 자체는 로드·검증**한다.
- 기존 9개 부정 테스트는 문구 하나 바꾸지 않고 통과한다. schema 2용 부정 테스트 8개 + 긍정 2개를 추가했고, 전부 **씨앗 결함이 있는 리포트에서 실패**하도록 되어 있다(마크다운은 변형 *후에* 렌더링해 결함이 마크다운 불일치에 가려지지 않게 했다):
  - 시행 누락 → `trial-coverage` / 공급자 위조 → `trial-integrity` / 측정되지 않은 CI 값 → `measurement-integrity` / 모델별 집계 위조 → `measurement-integrity` / override가 있는 릴리스 → `publication-integrity` / 사유 없는 스킵 → `run-contract` / 손으로 고친 마크다운 → `publication-integrity` / dry-run 리포트 → `run-contract`.
  - 긍정: 완전한 600시행 릴리스 통과, **키 없이 스킵된 모델이 있는 300시행 릴리스도 통과**(스킵이 사유와 함께 게시된 경우에 한해).
- schema 2 추가 검사: 등록 모델 전원이 executed/skipped로 계상 · 스킵에는 사유 필수 · `registeredTrialCount` 일치 · 실레포 과제 6개 이상 · pooled + 모델별 가설 게시 · CI 방법 문구 게시 · **override 비어 있어야 릴리스**.
- 정직성 규칙 유지: 실패 시행은 분모에 점수 0으로 남고, 매니페스트 다이제스트가 리포트에 기록되며, 게이트 통과 여부와 무관하게 측정값 그대로 게시된다.

## 9. 게이트 상태

- `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` **439/439** ✅ (416 → 439, 회귀 0) · `npx playwright test` **49/49** ✅
- `npx tsx scripts/verify-benchmark-report.ts` → `PASS efficacy benchmark: 108/108 trials, 3.664pp accuracy, 55.968875% token reduction, 145 claim files` + `Pending pre-registered releases (no real run yet): v3`

## 10. 리뷰 세션이 승인해야 할 것

1. **예산: 약 8.15M 토큰**(모델당 4.07M, 600시행). 승인 시 실행 명령은 `pnpm bench:databrain --concurrency=4` (키 2종 필요: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. 후자가 없으면 300시행·4.07M으로 자동 축소).
2. **`claude-sonnet-5` 모델 id 확정.** 스펙 기본값(IMPLEMENTATION_GUIDE §3)을 그대로 사전등록했다. 실제 호출로 검증한 적은 없다 — 존재하지 않는 id면 그 모델의 전 시행이 `provider_failure`로 기록되며(점수 0, 분모 유지) 정직하게 게시된다. 실행 전 id를 확인하는 편이 싸다.
3. **OQ-011**: v2 인용 문구(정확도 +3.66pp)를 v3 구간 기준의 불확실성과 함께 표기할지, v3 결과까지 내릴지.
4. 실행 후: `results.v3.real.*`가 생기면 F5 감사가 자동으로 v3를 1급 릴리스로 검증한다. 공개 릴리스를 v3로 교체할지 병행할지 결정 필요.

## 11. 남긴 개선 여지 (실행 전에 넣으면 좋은 것)

- **코퍼스 커밋 기록.** 실레포 과제의 컨텍스트는 실행 시점의 워킹트리에서 만들어진다(네트워크 접근은 없다 — 오프라인 재현 가능). 다만 리포트에는 실행 시각만 있고 **어느 커밋의 레포를 읽었는지**가 없다. 실행 전에 `run.corpusCommit`(= `git rev-parse HEAD`)을 리포트에 추가하고 F5 감사에서 필수화하면, "이 수치는 어느 커밋의 코퍼스에서 나왔나"가 영수증처럼 남는다(ADR-001의 provenance 원칙과 같은 결). 채점 자체는 매니페스트 기반이라 코퍼스가 변해도 재현 가능하지만, 회수 난이도는 코퍼스 상태에 따라 달라진다. 이번 세션에서는 스모크를 두 번 과금하지 않기 위해 넣지 않았다.
