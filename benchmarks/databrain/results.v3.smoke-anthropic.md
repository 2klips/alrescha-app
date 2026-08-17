# Data Brain efficacy benchmark

Full deterministic trial data: [./results.v3.smoke-anthropic.json](./results.v3.smoke-anthropic.json)

## Run contract

- Mode: `real`
- Schema version: `2`
- Generated: `2026-08-17T03:17:16.991Z`
- Manifest SHA-256: `7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7`
- Corpus commit: `2071a5ce1a9b88bb9025725319888b620914800c`
- Token accounting: Each provider's own reported usage.input_tokens and usage.output_tokens are authoritative (OpenAI Responses API, Anthropic Messages API); no local tokenizer estimate is substituted.
- Confidence method: Seeded nonparametric bootstrap, percentile method: 2000 resamples with replacement over the per-trial units, 95% interval, mulberry32 PRNG seeded by FNV-1a of the aggregate key. Failed trials stay in the resampling pool with score 0.
- Protocol: 20 pre-registered tasks (10 realistic-repository, 10 fixture) × 5 trials × 3 arms × 2 models = 600 registered trials; 3 executed.
- Overrides: tasks=fixture-implement-remaining-session-ms; repeats=1; models=claude-sonnet-5
- Skipped model: `gpt-5.6-luna` (openai) — Excluded by a command-line model override.
- Prompt and retrieved context are identical across models for a given task and arm. Only repository-context retrieval differs between arms.
- Failed trials remain in denominators with score 0 and their recorded token counts.

## Model coverage

| Model | Provider | Status | Trials | Skip reason |
| --- | --- | --- | ---: | --- |
| gpt-5.6-luna | openai | skipped | 0 | Excluded by a command-line model override. |
| claude-sonnet-5 | anthropic | executed | 3 |  |

## Hypothesis gate

Gate is evaluated against the interval, not the point estimate: non-inferiority holds when the accuracy-delta lower bound clears the -5pp margin, the improvement goal holds when it clears +5pp, and the token target holds when the token-reduction lower bound clears 30%.

| Scope | Paired units | Accuracy Δ | Accuracy 95% CI | Token reduction | Token 95% CI | Non-inferior | +5pp goal | Token target | Gate |
| --- | ---: | ---: | --- | ---: | --- | --- | --- | --- | --- |
| all models (pooled) | 1 | 0.00pp | [0.00, 0.00] | -21.38% | [-21.38, -21.38] | yes | no | no | NOT MET |
| claude-sonnet-5 | 1 | 0.00pp | [0.00, 0.00] | -21.38% | [-21.38, -21.38] | yes | no | no | NOT MET |

- Pooled result: **NOT MET**.
- Iteration plan: inspect failed/low-score task rows, tighten evidence ranking/context-pack selection, then rerun the unchanged pre-registered manifest. Product claims remain limited to these measured results.

## Arm totals

| Model | Arm | Trials | Mean score | Mean 95% CI | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all models (pooled) | checkout | 1 | 1.000 | [1.00, 1.00] | 100.00% | 2781 | 848 | 3629 | 9 | 8866 | 0 |
| all models (pooled) | full-dump | 1 | 0.000 | [0.00, 0.00] | 0.00% | 1811 | 1442 | 3253 | 0 | 15078 | 0 |
| all models (pooled) | data-brain | 1 | 1.000 | [1.00, 1.00] | 100.00% | 3286 | 1119 | 4405 | 10 | 10884 | 0 |
| claude-sonnet-5 | checkout | 1 | 1.000 | [1.00, 1.00] | 100.00% | 2781 | 848 | 3629 | 9 | 8866 | 0 |
| claude-sonnet-5 | full-dump | 1 | 0.000 | [0.00, 0.00] | 0.00% | 1811 | 1442 | 3253 | 0 | 15078 | 0 |
| claude-sonnet-5 | data-brain | 1 | 1.000 | [1.00, 1.00] | 100.00% | 3286 | 1119 | 4405 | 10 | 10884 | 0 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 1.000 | 3629 | 9 | 8866 | 0 |
| fixture-implement-remaining-session-ms | full-dump | 0.000 | 3253 | 0 | 15078 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 4405 | 10 | 10884 | 0 |

## Every trial

| Task | Model | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2781 | 848 | 3629 | 9 | 8866 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 1 | completed | 0.000 | 1811 | 1442 | 3253 | 0 | 15078 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3286 | 1119 | 4405 | 10 | 10884 |  |
