# Data Brain efficacy benchmark

Full deterministic trial data: [./results.v3.smoke.json](./results.v3.smoke.json)

## Run contract

- Mode: `real`
- Schema version: `2`
- Generated: `2026-08-16T15:22:19.738Z`
- Manifest SHA-256: `ffffb0a973cef8d6c2946086d136289561961419c7210c52562e1741253bf6ba`
- Token accounting: Each provider's own reported usage.input_tokens and usage.output_tokens are authoritative (OpenAI Responses API, Anthropic Messages API); no local tokenizer estimate is substituted.
- Confidence method: Seeded nonparametric bootstrap, percentile method: 2000 resamples with replacement over the per-trial units, 95% interval, mulberry32 PRNG seeded by FNV-1a of the aggregate key. Failed trials stay in the resampling pool with score 0.
- Protocol: 20 pre-registered tasks (10 realistic-repository, 10 fixture) × 5 trials × 3 arms × 2 models = 600 registered trials; 3 executed.
- Overrides: tasks=fixture-implement-remaining-session-ms; repeats=1; models=gpt-5-nano-2025-08-07
- Skipped model: `claude-sonnet-5` (anthropic) — Excluded by a command-line model override.
- Prompt and retrieved context are identical across models for a given task and arm. Only repository-context retrieval differs between arms.
- Failed trials remain in denominators with score 0 and their recorded token counts.

## Model coverage

| Model | Provider | Status | Trials | Skip reason |
| --- | --- | --- | ---: | --- |
| gpt-5-nano-2025-08-07 | openai | executed | 3 |  |
| claude-sonnet-5 | anthropic | skipped | 0 | Excluded by a command-line model override. |

## Hypothesis gate

Gate is evaluated against the interval, not the point estimate: non-inferiority holds when the accuracy-delta lower bound clears the -5pp margin, the improvement goal holds when it clears +5pp, and the token target holds when the token-reduction lower bound clears 30%.

| Scope | Paired units | Accuracy Δ | Accuracy 95% CI | Token reduction | Token 95% CI | Non-inferior | +5pp goal | Token target | Gate |
| --- | ---: | ---: | --- | ---: | --- | --- | --- | --- | --- |
| all models (pooled) | 1 | 0.00pp | [0.00, 0.00] | -13.95% | [-13.95, -13.95] | yes | no | no | NOT MET |
| gpt-5-nano-2025-08-07 | 1 | 0.00pp | [0.00, 0.00] | -13.95% | [-13.95, -13.95] | yes | no | no | NOT MET |

- Pooled result: **NOT MET**.
- Iteration plan: inspect failed/low-score task rows, tighten evidence ranking/context-pack selection, then rerun the unchanged pre-registered manifest. Product claims remain limited to these measured results.

## Arm totals

| Model | Arm | Trials | Mean score | Mean 95% CI | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all models (pooled) | checkout | 1 | 1.000 | [1.00, 1.00] | 100.00% | 1337 | 233 | 1570 | 9 | 3842 | 0 |
| all models (pooled) | full-dump | 1 | 0.000 | [0.00, 0.00] | 0.00% | 720 | 406 | 1126 | 0 | 5522 | 0 |
| all models (pooled) | data-brain | 1 | 1.000 | [1.00, 1.00] | 100.00% | 1562 | 227 | 1789 | 10 | 4425 | 0 |
| gpt-5-nano-2025-08-07 | checkout | 1 | 1.000 | [1.00, 1.00] | 100.00% | 1337 | 233 | 1570 | 9 | 3842 | 0 |
| gpt-5-nano-2025-08-07 | full-dump | 1 | 0.000 | [0.00, 0.00] | 0.00% | 720 | 406 | 1126 | 0 | 5522 | 0 |
| gpt-5-nano-2025-08-07 | data-brain | 1 | 1.000 | [1.00, 1.00] | 100.00% | 1562 | 227 | 1789 | 10 | 4425 | 0 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 1.000 | 1570 | 9 | 3842 | 0 |
| fixture-implement-remaining-session-ms | full-dump | 0.000 | 1126 | 0 | 5522 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 1789 | 10 | 4425 | 0 |

## Every trial

| Task | Model | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 1337 | 233 | 1570 | 9 | 3842 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 0.000 | 720 | 406 | 1126 | 0 | 5522 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 1562 | 227 | 1789 | 10 | 4425 |  |
