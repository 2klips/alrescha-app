# F5 efficacy benchmark audit

Date: 2026-08-14

## Result

PASS under the ADR-005/F5 contract. The real benchmark was rerun without dry-run mode, all 108 pre-registered trial slots are present exactly once, raw-trial measurements reproduce every published aggregate, and app/README efficiency claims remain traceable to the committed report.

The hypothesis gate is **NOT MET**: Data Brain reduced model-reported tokens by `55.275392%`, but accuracy changed by `-7.037pp`, below the `-5pp` non-inferiority margin. The report publishes these values unchanged and includes the required iteration plan. No passing result is claimed.

## Reproduction

```text
pnpm bench:databrain
Data Brain real: 108/108 trials, 1 failed.
Reports: benchmarks/databrain/results.real.{json,md}
Exit 0
```

- Generated: `2026-08-14T12:44:32.602Z`
- Model/version: `gpt-5-nano-2025-08-07`
- Manifest SHA-256: `fc9f23049679ab559a610324db1a7b3359a62969fb03374c6871907f89c2a662`
- Token accounting: OpenAI Responses API `usage.input_tokens` and `usage.output_tokens`; no local tokenizer estimate substituted.
- Protocol: 12 tasks × 3 arms × 3 trials = 108 trials.

One Data Brain trial for `real-answer-mcp-contract` exhausted provider retry handling with an HTTP 429. It remains in the committed report as a failed, zero-score trial with zero tokens and is included in every denominator. It was not removed or rerun selectively.

## Measured arm totals

| Arm        | Trials | Mean score | Pass rate | Total tokens | Tool calls | Wall ms | Failed |
| ---------- | -----: | ---------: | --------: | -----------: | ---------: | ------: | -----: |
| checkout   |     36 |   0.644444 |  58.3333% |       132938 |        303 |   95761 |      0 |
| full-dump  |     36 |   0.513889 |  41.6667% |       276879 |          0 |  135759 |      0 |
| data-brain |     36 |   0.574074 |  52.7778% |        59456 |        366 |   93915 |      1 |

Full task/arm and every-trial tables: [results.real.md](../../../../benchmarks/databrain/results.real.md). Raw deterministic record: [results.real.json](../../../../benchmarks/databrain/results.real.json).

## Automated audit

```text
pnpm exec tsx scripts/verify-benchmark-report.ts
PASS efficacy benchmark: 108/108 trials, -7.037pp accuracy, 55.275392% token reduction, 112 claim files
Exit 0
```

The verifier checks:

- real mode, pinned model, manifest digest, protocol counts, and unique task/arm/trial coverage;
- aggregates and hypothesis values independently recomputed from raw trials;
- deterministic Markdown/JSON agreement, model/token assumptions, all required tables, and the missed-gate iteration plan;
- every efficiency claim in `apps/` or `README.md` links `benchmarks/databrain/results.real.md`;
- static token/accuracy claims never exceed measured results.

Negative tests cover missing trials, dry-run substitution, per-trial model drift, aggregate tampering, missing tokenizer assumptions, missing claim links, and exaggerated token/accuracy claims. The audit also validates non-negative measurements, prompt-digest identity across arms, and completed/failed record consistency.

```text
pnpm vitest run tests/efficacy-benchmark.test.ts tests/databrain-benchmark.test.ts
Test Files  2 passed (2)
Tests       22 passed (22)
Exit        0
```

Full regression: `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass; the full unit suite covers 55 files and 244 tests.

## Iteration plan

1. Inspect the failed/low-score Data Brain task rows, starting with `real-answer-mcp-contract`, `fixture-answer-session-policy`, and drift-judgment tasks.
2. Tighten deterministic evidence ranking and context-pack selection without changing the pre-registered task manifest or arm prompts.
3. Reduce retry pressure by running the unchanged protocol at lower concurrency, then publish the full rerun regardless of outcome.
4. Keep product claims limited to the current measured report until accuracy non-inferiority passes.
