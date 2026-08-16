# Projected cost of the real v3 benchmark run

Derived, not guessed. Inputs: this v3 dry run (exact context characters per arm),
`results.dry-run.json` + `results.real.json` (the committed v2 pair, same harness).

## Step 1 — per-arm calibration from the committed v2 pair

`ratio = real input tokens / dry-run input tokens` over the same 108 v2 trials.

| Arm | v2 trials | v2 dry-run input | v2 real input | ratio | v2 real mean output/trial |
| --- | ---: | ---: | ---: | ---: | ---: |
| checkout | 36 | 125718 | 136695 | 1.0873 | 222.6 |
| full-dump | 36 | 230772 | 336087 | 1.4564 | 267.4 |
| data-brain | 36 | 56103 | 56261 | 1.0028 | 207.1 |

## Step 2 — projection per model and arm

`projected input = v3 dry-run input × ratio`, `projected output = trials × v2 mean output/trial`.

| Model | Arm | Trials | v3 dry-run input | Projected input | Projected output | Projected total |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gpt-5-nano-2025-08-07 | checkout | 100 | 795020 | 864437 | 22261 | 886698 |
| gpt-5-nano-2025-08-07 | full-dump | 100 | 2006780 | 2922593 | 26736 | 2949329 |
| gpt-5-nano-2025-08-07 | data-brain | 100 | 215925 | 216533 | 20711 | 237244 |
| claude-sonnet-5 | checkout | 100 | 795020 | 864437 | 22261 | 886698 |
| claude-sonnet-5 | full-dump | 100 | 2006780 | 2922593 | 26736 | 2949329 |
| claude-sonnet-5 | data-brain | 100 | 215925 | 216533 | 20711 | 237244 |

## Step 3 — totals

| Model | Provider | Trials | Projected tokens |
| --- | --- | ---: | ---: |
| gpt-5-nano-2025-08-07 | openai | 300 | 4073271 |
| claude-sonnet-5 | anthropic | 300 | 4073271 |
| **all** | — | **600** | **8146542** |

Registered protocol: 20 tasks × 5 repeats × 3 arms × 2 models = 600 trials.

## Assumptions and their limits

- The calibration ratio was measured on OpenAI `gpt-5-nano` only. The Anthropic projection reuses it, so Anthropic token counts are an order-of-magnitude estimate, not a measurement; the real run reports each provider's own usage.
- Output tokens are projected from the v2 real run's per-arm mean. A model that writes longer files or answers will exceed it.
- Retries (HTTP 429/5xx) re-send input; the projection counts one attempt per trial.
- No monetary cost is projected: per-model prices are not recorded in this repository, and unmeasured numeric claims are forbidden (ADR-005, WORK_SPEC §3-8).
