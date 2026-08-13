# Task 20 — Data Brain efficacy benchmark

## Result

- Final real run: 12 pre-registered tasks × 3 arms × 3 trials = 108/108 completed, 0 provider failures.
- Fixed model/version: `gpt-5-nano-2025-08-07`.
- Checkout: mean score `0.643519`, `131654` total model-reported tokens.
- Data Brain: mean score `0.648148`, `63177` total model-reported tokens.
- Accuracy delta: `+0.4629pp`; non-inferiority gate passed.
- Token reduction: `52.012852%`; 30% target passed.
- Full human report: [results.real.md](../../../benchmarks/databrain/results.real.md).
- Full trial data: [results.real.json](../../../benchmarks/databrain/results.real.json).
- Mock report: [results.dry-run.md](../../../benchmarks/databrain/results.dry-run.md).

## Acceptance evidence

- `pnpm vitest run tests/databrain-benchmark.test.ts`: 13/13 passed.
- Coverage includes manifest rejection, minimum protocol, all three graders, isolated fresh-copy implementation tests, arm isolation, model-reported token accounting, provider failure persistence, rate-limit retry timing, full 108-trial dry run, and Markdown report generation.
- `pnpm bench:databrain --dry-run`: 108/108 trials, 0 failed.
- `pnpm bench:databrain --concurrency=1`: 108/108 real trials, 0 failed.
- JSON parses successfully, contains exactly 108 trials, and Markdown links the full JSON report.
- API-key-pattern scan of the committed report returned false. `.env.local` remains ignored and uncommitted.
- Product token-comparison UI links the full committed benchmark report.

## Protocol notes

- All arms use the same task prompt and pinned model; only supplied repository context changes.
- Checkout uses scripted file search/read, full-dump uses the documentation corpus, and Data Brain invokes `search_index`, `get_artifact`, and `request_context_pack`.
- Golden fixture manifests are excluded from every arm.
- Failed trials remain in report denominators with score zero; no trial is selected or removed.
- Real token totals come only from OpenAI Responses API `usage.input_tokens` and `usage.output_tokens`.
