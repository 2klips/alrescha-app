# Data Brain efficacy benchmark

Full deterministic trial data: [./results.v3.real.json](./results.v3.real.json)

## Run contract

- Mode: `real`
- Schema version: `2`
- Generated: `2026-08-25T13:27:19.234Z`
- Manifest SHA-256: `7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7`
- Corpus commit: `0a47a05c1513838cba3de5250af8e8cd8406b0f0`
- Token accounting: Each provider's own reported usage.input_tokens and usage.output_tokens are authoritative (OpenAI Responses API, Anthropic Messages API); no local tokenizer estimate is substituted.
- Confidence method: Seeded nonparametric bootstrap, percentile method: 2000 resamples with replacement over the per-trial units, 95% interval, mulberry32 PRNG seeded by FNV-1a of the aggregate key. Failed trials stay in the resampling pool with score 0.
- Protocol: 20 pre-registered tasks (10 realistic-repository, 10 fixture) × 5 trials × 3 arms × 2 models = 600 registered trials; 600 executed.
- Overrides: none (full pre-registered protocol)
- Prompt and retrieved context are identical across models for a given task and arm. Only repository-context retrieval differs between arms.
- Failed trials remain in denominators with score 0 and their recorded token counts.

## Model coverage

| Model | Provider | Status | Trials | Skip reason |
| --- | --- | --- | ---: | --- |
| gpt-5.6-luna | openai | executed | 300 |  |
| claude-sonnet-5 | anthropic | executed | 300 |  |

## Hypothesis gate

Gate is evaluated against the interval, not the point estimate: non-inferiority holds when the accuracy-delta lower bound clears the -5pp margin, the improvement goal holds when it clears +5pp, and the token target holds when the token-reduction lower bound clears 30%.

| Scope | Paired units | Accuracy Δ | Accuracy 95% CI | Token reduction | Token 95% CI | Non-inferior | +5pp goal | Token target | Gate |
| --- | ---: | ---: | --- | ---: | --- | --- | --- | --- | --- |
| all models (pooled) | 200 | 3.01pp | [-2.06, 8.06] | 67.04% | [61.58, 71.08] | yes | no | yes | MET |
| gpt-5.6-luna | 100 | 3.18pp | [-3.60, 9.94] | 72.62% | [69.74, 75.09] | yes | no | yes | MET |
| claude-sonnet-5 | 100 | 2.83pp | [-5.23, 10.23] | 58.46% | [42.01, 68.42] | no | no | yes | NOT MET |

- Pooled result: **MET**.

## Arm totals

| Model | Arm | Trials | Mean score | Mean 95% CI | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all models (pooled) | checkout | 200 | 0.640 | [0.58, 0.70] | 57.50% | 1420053 | 57782 | 1477835 | 1340 | 1092690 | 48 |
| all models (pooled) | full-dump | 200 | 0.530 | [0.47, 0.59] | 42.00% | 3283331 | 78148 | 3361479 | 0 | 1986555 | 50 |
| all models (pooled) | data-brain | 200 | 0.670 | [0.61, 0.73] | 58.00% | 427206 | 59903 | 487109 | 2240 | 894176 | 41 |
| gpt-5.6-luna | checkout | 100 | 0.814 | [0.75, 0.88] | 73.00% | 872200 | 23025 | 895225 | 670 | 544762 | 0 |
| gpt-5.6-luna | full-dump | 100 | 0.707 | [0.63, 0.78] | 54.00% | 2417107 | 24490 | 2441597 | 0 | 1244018 | 1 |
| gpt-5.6-luna | data-brain | 100 | 0.846 | [0.79, 0.90] | 72.00% | 227535 | 17575 | 245110 | 1120 | 373182 | 0 |
| claude-sonnet-5 | checkout | 100 | 0.465 | [0.37, 0.55] | 42.00% | 547853 | 34757 | 582610 | 670 | 547928 | 48 |
| claude-sonnet-5 | full-dump | 100 | 0.352 | [0.27, 0.44] | 30.00% | 866224 | 53658 | 919882 | 0 | 742537 | 49 |
| claude-sonnet-5 | data-brain | 100 | 0.494 | [0.40, 0.59] | 44.00% | 199671 | 42328 | 241999 | 1120 | 520994 | 41 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 0.900 | 21660 | 90 | 50887 | 1 |
| fixture-implement-remaining-session-ms | full-dump | 0.200 | 22779 | 0 | 108291 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 30249 | 100 | 72682 | 0 |
| fixture-implement-refresh-session | checkout | 1.000 | 25067 | 90 | 49604 | 0 |
| fixture-implement-refresh-session | full-dump | 0.100 | 23313 | 0 | 122089 | 0 |
| fixture-implement-refresh-session | data-brain | 1.000 | 30101 | 90 | 68999 | 0 |
| fixture-implement-github-login | checkout | 1.000 | 44068 | 90 | 68506 | 0 |
| fixture-implement-github-login | full-dump | 1.000 | 22230 | 0 | 109866 | 0 |
| fixture-implement-github-login | data-brain | 1.000 | 30102 | 100 | 79251 | 0 |
| fixture-implement-password-reset | checkout | 0.900 | 19552 | 90 | 91383 | 1 |
| fixture-implement-password-reset | full-dump | 0.900 | 18425 | 0 | 101372 | 1 |
| fixture-implement-password-reset | data-brain | 0.800 | 29161 | 100 | 89847 | 0 |
| fixture-answer-session-policy | checkout | 0.900 | 24685 | 90 | 47341 | 1 |
| fixture-answer-session-policy | full-dump | 0.967 | 16945 | 0 | 63370 | 0 |
| fixture-answer-session-policy | data-brain | 0.933 | 27809 | 90 | 59984 | 0 |
| fixture-answer-audit-schema | checkout | 0.900 | 32330 | 90 | 26481 | 1 |
| fixture-answer-audit-schema | full-dump | 0.250 | 7385 | 0 | 83159 | 4 |
| fixture-answer-audit-schema | data-brain | 1.000 | 24259 | 100 | 45232 | 0 |
| fixture-answer-api-rule-conflict | checkout | 0.900 | 29537 | 90 | 59560 | 1 |
| fixture-answer-api-rule-conflict | full-dump | 0.800 | 12375 | 0 | 71488 | 2 |
| fixture-answer-api-rule-conflict | data-brain | 1.000 | 24629 | 120 | 53684 | 0 |
| fixture-answer-legacy-billing | checkout | 0.467 | 13444 | 90 | 51484 | 3 |
| fixture-answer-legacy-billing | full-dump | 0.500 | 15939 | 0 | 56140 | 0 |
| fixture-answer-legacy-billing | data-brain | 0.533 | 19265 | 90 | 50219 | 1 |
| fixture-judge-auth-drift | checkout | 0.258 | 13223 | 90 | 72508 | 3 |
| fixture-judge-auth-drift | full-dump | 0.406 | 17912 | 0 | 98866 | 1 |
| fixture-judge-auth-drift | data-brain | 0.627 | 26200 | 110 | 66302 | 0 |
| fixture-judge-instruction-doc-drift | checkout | 0.000 | 37710 | 90 | 93988 | 2 |
| fixture-judge-instruction-doc-drift | full-dump | 0.022 | 18493 | 0 | 103651 | 1 |
| fixture-judge-instruction-doc-drift | data-brain | 0.400 | 24529 | 110 | 35407 | 0 |
| real-answer-github-permissions | checkout | 0.900 | 222655 | 30 | 77112 | 0 |
| real-answer-github-permissions | full-dump | 1.000 | 640321 | 0 | 31475 | 0 |
| real-answer-github-permissions | data-brain | 1.000 | 35340 | 130 | 30608 | 0 |
| real-answer-mcp-contract | checkout | 1.000 | 226222 | 40 | 61942 | 0 |
| real-answer-mcp-contract | full-dump | 0.983 | 642705 | 0 | 154868 | 0 |
| real-answer-mcp-contract | data-brain | 1.000 | 48809 | 120 | 40873 | 0 |
| real-answer-job-queue-claim | checkout | 1.000 | 215220 | 60 | 36561 | 0 |
| real-answer-job-queue-claim | full-dump | 0.500 | 244116 | 0 | 44632 | 5 |
| real-answer-job-queue-claim | data-brain | 0.500 | 16918 | 120 | 22885 | 5 |
| real-answer-graph-renderer | checkout | 0.500 | 81945 | 50 | 25084 | 5 |
| real-answer-graph-renderer | full-dump | 0.500 | 243367 | 0 | 170663 | 5 |
| real-answer-graph-renderer | data-brain | 0.500 | 27466 | 130 | 18923 | 5 |
| real-answer-receipt-statement | checkout | 0.500 | 79471 | 60 | 55512 | 5 |
| real-answer-receipt-statement | full-dump | 0.333 | 245770 | 0 | 150240 | 5 |
| real-answer-receipt-statement | data-brain | 0.500 | 11701 | 110 | 16550 | 5 |
| real-answer-credit-honesty | checkout | 0.167 | 84258 | 40 | 43528 | 5 |
| real-answer-credit-honesty | full-dump | 0.400 | 243630 | 0 | 125458 | 5 |
| real-answer-credit-honesty | data-brain | 0.267 | 14555 | 120 | 35081 | 5 |
| real-answer-index-pr-limits | checkout | 0.100 | 69239 | 40 | 57079 | 5 |
| real-answer-index-pr-limits | full-dump | 0.333 | 243288 | 0 | 80290 | 5 |
| real-answer-index-pr-limits | data-brain | 0.333 | 13811 | 130 | 32164 | 5 |
| real-answer-evidence-grade-rule | checkout | 0.400 | 83742 | 40 | 37880 | 5 |
| real-answer-evidence-grade-rule | full-dump | 0.500 | 243187 | 0 | 100836 | 5 |
| real-answer-evidence-grade-rule | data-brain | 0.500 | 13066 | 120 | 17299 | 5 |
| real-audit-mcp-tool-surface | checkout | 0.500 | 81282 | 30 | 42130 | 5 |
| real-audit-mcp-tool-surface | full-dump | 0.400 | 195143 | 0 | 122527 | 6 |
| real-audit-mcp-tool-surface | data-brain | 0.000 | 22159 | 130 | 33868 | 5 |
| real-audit-finding-taxonomy | checkout | 0.500 | 72525 | 50 | 44120 | 5 |
| real-audit-finding-taxonomy | full-dump | 0.500 | 244156 | 0 | 87274 | 5 |
| real-audit-finding-taxonomy | data-brain | 0.500 | 16980 | 120 | 24318 | 5 |

## Every trial

| Task | Model | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1337 | 207 | 1544 | 9 | 4031 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1337 | 206 | 1543 | 9 | 3955 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1337 | 232 | 1569 | 9 | 3650 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1337 | 198 | 1535 | 9 | 3431 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1337 | 212 | 1549 | 9 | 3677 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2781 | 717 | 3498 | 9 | 6630 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2781 | 713 | 3494 | 9 | 6908 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2781 | 648 | 3429 | 9 | 5806 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2781 | 718 | 3499 | 9 | 6573 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 9 | 6226 | provider_failure |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 1 | completed | 0.000 | 720 | 454 | 1174 | 0 | 5792 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 2 | completed | 0.000 | 720 | 355 | 1075 | 0 | 4428 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 3 | completed | 0.000 | 720 | 497 | 1217 | 0 | 5956 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 4 | completed | 0.000 | 720 | 525 | 1245 | 0 | 6894 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 5 | completed | 0.000 | 720 | 565 | 1285 | 0 | 6652 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 1 | completed | 0.000 | 1811 | 1341 | 3152 | 0 | 14018 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1811 | 1608 | 3419 | 0 | 16634 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1811 | 1487 | 3298 | 0 | 15293 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 4 | completed | 0.000 | 1811 | 1695 | 3506 | 0 | 16687 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 5 | completed | 0.000 | 1811 | 1597 | 3408 | 0 | 15937 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1562 | 212 | 1774 | 10 | 3153 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1562 | 225 | 1787 | 10 | 4143 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1562 | 208 | 1770 | 10 | 3150 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1562 | 217 | 1779 | 10 | 3368 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1562 | 208 | 1770 | 10 | 4178 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3286 | 963 | 4249 | 10 | 10296 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3286 | 905 | 4191 | 10 | 9908 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3286 | 922 | 4208 | 10 | 10273 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3286 | 1003 | 4289 | 10 | 11410 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3286 | 1146 | 4432 | 10 | 12803 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1435 | 226 | 1661 | 9 | 3465 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1435 | 218 | 1653 | 9 | 4177 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1435 | 223 | 1658 | 9 | 3881 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1435 | 225 | 1660 | 9 | 3569 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1435 | 220 | 1655 | 9 | 3800 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2903 | 488 | 3391 | 9 | 6423 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2903 | 451 | 3354 | 9 | 6429 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2903 | 438 | 3341 | 9 | 5830 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2903 | 442 | 3345 | 9 | 5765 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2903 | 446 | 3349 | 9 | 6265 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 1 | completed | 0.000 | 731 | 519 | 1250 | 0 | 6845 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 2 | completed | 0.000 | 731 | 422 | 1153 | 0 | 5526 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 3 | completed | 0.000 | 731 | 398 | 1129 | 0 | 5508 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 4 | completed | 0.000 | 731 | 678 | 1409 | 0 | 8821 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 5 | completed | 0.000 | 731 | 635 | 1366 | 0 | 9178 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 1 | completed | 0.000 | 1820 | 1496 | 3316 | 0 | 16220 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 2 | completed | 0.000 | 1820 | 1557 | 3377 | 0 | 16657 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1820 | 1692 | 3512 | 0 | 18596 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 4 | completed | 0.000 | 1820 | 1637 | 3457 | 0 | 18147 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 5 | completed | 0.000 | 1820 | 1524 | 3344 | 0 | 16591 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1583 | 233 | 1816 | 9 | 3628 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1583 | 232 | 1815 | 9 | 3480 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1583 | 223 | 1806 | 9 | 3361 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1583 | 238 | 1821 | 9 | 3804 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1583 | 223 | 1806 | 9 | 3364 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3291 | 992 | 4283 | 9 | 11514 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3291 | 862 | 4153 | 9 | 9755 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3291 | 899 | 4190 | 9 | 9722 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3291 | 917 | 4208 | 9 | 9644 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3291 | 912 | 4203 | 9 | 10727 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2993 | 124 | 3117 | 9 | 2709 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2993 | 115 | 3108 | 9 | 2631 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2993 | 107 | 3100 | 9 | 2539 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2993 | 114 | 3107 | 9 | 2818 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2993 | 122 | 3115 | 9 | 2743 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 4840 | 770 | 5610 | 9 | 10228 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 4840 | 1015 | 5855 | 9 | 12904 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 4840 | 862 | 5702 | 9 | 11195 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 4840 | 963 | 5803 | 9 | 11871 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 4840 | 711 | 5551 | 9 | 8868 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 731 | 193 | 924 | 0 | 3633 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 731 | 223 | 954 | 0 | 3664 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 731 | 241 | 972 | 0 | 5300 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 731 | 217 | 948 | 0 | 4050 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 731 | 208 | 939 | 0 | 3533 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1817 | 1590 | 3407 | 0 | 17423 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1817 | 1910 | 3727 | 0 | 20709 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1817 | 1416 | 3233 | 0 | 14598 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1817 | 1723 | 3540 | 0 | 18486 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1817 | 1769 | 3586 | 0 | 18470 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1608 | 203 | 1811 | 10 | 3979 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1608 | 192 | 1800 | 10 | 3904 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1608 | 195 | 1803 | 10 | 4008 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1608 | 274 | 1882 | 10 | 4201 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1608 | 206 | 1814 | 10 | 3652 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3245 | 1178 | 4423 | 10 | 14078 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3245 | 889 | 4134 | 10 | 11548 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3245 | 944 | 4189 | 10 | 11432 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3245 | 832 | 4077 | 10 | 10778 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3245 | 924 | 4169 | 10 | 11671 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 929 | 253 | 1182 | 9 | 4074 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 929 | 284 | 1213 | 9 | 4831 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 929 | 272 | 1201 | 9 | 4381 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 929 | 247 | 1176 | 9 | 3709 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 929 | 289 | 1218 | 9 | 4395 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2183 | 1153 | 3336 | 9 | 13109 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2183 | 1239 | 3422 | 9 | 14054 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2183 | 1256 | 3439 | 9 | 14663 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 9 | 13541 | provider_failure |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2183 | 1182 | 3365 | 9 | 14626 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 754 | 255 | 1009 | 0 | 4636 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 754 | 227 | 981 | 0 | 4288 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 754 | 231 | 985 | 0 | 4294 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 754 | 226 | 980 | 0 | 4745 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 754 | 228 | 982 | 0 | 3826 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1855 | 1560 | 3415 | 0 | 16837 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1855 | 1504 | 3359 | 0 | 15509 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 15121 | provider_failure |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1855 | 1511 | 3366 | 0 | 15127 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1855 | 1493 | 3348 | 0 | 16989 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1462 | 196 | 1658 | 10 | 3748 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1462 | 226 | 1688 | 10 | 5163 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1462 | 185 | 1647 | 10 | 3535 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1462 | 230 | 1692 | 10 | 5396 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1462 | 184 | 1646 | 10 | 3622 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 1 | completed | 0.000 | 3023 | 1154 | 4177 | 10 | 14092 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3023 | 1124 | 4147 | 10 | 13694 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3023 | 1275 | 4298 | 10 | 15056 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 4 | completed | 0.000 | 3023 | 1160 | 4183 | 10 | 13665 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3023 | 1002 | 4025 | 10 | 11876 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1711 | 106 | 1817 | 9 | 2464 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1711 | 107 | 1818 | 9 | 1987 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1711 | 119 | 1830 | 9 | 1946 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1711 | 114 | 1825 | 9 | 2357 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1711 | 105 | 1816 | 9 | 2164 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 3314 | 617 | 3931 | 9 | 7643 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 9 | 8106 | provider_failure |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 3314 | 669 | 3983 | 9 | 7901 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 3314 | 497 | 3811 | 9 | 6400 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 3314 | 540 | 3854 | 9 | 6373 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 704 | 142 | 846 | 0 | 2732 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 704 | 202 | 906 | 0 | 3890 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 704 | 135 | 839 | 0 | 4436 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 704 | 153 | 857 | 0 | 2771 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 5 | completed | 0.667 | 704 | 151 | 855 | 0 | 2627 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1783 | 733 | 2516 | 0 | 9020 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1783 | 822 | 2605 | 0 | 10123 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1783 | 742 | 2525 | 0 | 9225 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1783 | 660 | 2443 | 0 | 9194 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1783 | 770 | 2553 | 0 | 9352 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1447 | 109 | 1556 | 9 | 2183 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1447 | 129 | 1576 | 9 | 2309 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1447 | 96 | 1543 | 9 | 2431 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1447 | 144 | 1591 | 9 | 3165 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1447 | 101 | 1548 | 9 | 2101 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 1 | completed | 0.667 | 3079 | 719 | 3798 | 9 | 8199 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3079 | 928 | 4007 | 9 | 10201 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3079 | 849 | 3928 | 9 | 8550 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3079 | 1068 | 4147 | 9 | 11172 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 5 | completed | 0.667 | 3079 | 1036 | 4115 | 9 | 9673 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2738 | 42 | 2780 | 9 | 1450 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2738 | 43 | 2781 | 9 | 1530 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2738 | 42 | 2780 | 9 | 1395 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2738 | 39 | 2777 | 9 | 1623 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2738 | 43 | 2781 | 9 | 1458 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 4337 | 281 | 4618 | 9 | 3731 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 4337 | 226 | 4563 | 9 | 3282 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 4337 | 269 | 4606 | 9 | 3457 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 9 | 4838 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 4337 | 307 | 4644 | 9 | 3717 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 1 | completed | 0.500 | 702 | 148 | 850 | 0 | 3022 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 2 | completed | 0.500 | 702 | 153 | 855 | 0 | 4542 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 3 | completed | 0.500 | 702 | 197 | 899 | 0 | 3393 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 4 | completed | 0.500 | 702 | 163 | 865 | 0 | 2904 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 5 | completed | 0.000 | 702 | 133 | 835 | 0 | 2566 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 1 | completed | 0.500 | 1772 | 1309 | 3081 | 0 | 14561 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 13454 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 13795 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 11772 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 13150 | provider_failure |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1377 | 40 | 1417 | 10 | 1308 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1377 | 42 | 1419 | 10 | 1268 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1377 | 43 | 1420 | 10 | 1268 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1377 | 42 | 1419 | 10 | 1412 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1377 | 40 | 1417 | 10 | 1522 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2844 | 590 | 3434 | 10 | 7623 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2844 | 554 | 3398 | 10 | 7750 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2844 | 637 | 3481 | 10 | 7050 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2844 | 675 | 3519 | 10 | 10292 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2844 | 491 | 3335 | 10 | 5739 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2160 | 109 | 2269 | 9 | 2261 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2160 | 133 | 2293 | 9 | 2841 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2160 | 143 | 2303 | 9 | 2438 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2160 | 113 | 2273 | 9 | 2134 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2160 | 114 | 2274 | 9 | 2435 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 3681 | 816 | 4497 | 9 | 9230 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 3681 | 1015 | 4696 | 9 | 10920 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 3681 | 782 | 4463 | 9 | 8354 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 9 | 10154 | provider_failure |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 3681 | 788 | 4469 | 9 | 8793 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 703 | 188 | 891 | 0 | 3382 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 703 | 226 | 929 | 0 | 11071 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 703 | 206 | 909 | 0 | 3930 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 703 | 212 | 915 | 0 | 3686 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 703 | 196 | 899 | 0 | 3981 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1784 | 811 | 2595 | 0 | 8547 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 9178 | provider_failure |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1784 | 774 | 2558 | 0 | 9233 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 8561 | provider_failure |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1784 | 895 | 2679 | 0 | 9919 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1271 | 138 | 1409 | 12 | 2751 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1271 | 124 | 1395 | 12 | 1941 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1271 | 150 | 1421 | 12 | 2386 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1271 | 95 | 1366 | 12 | 1987 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1271 | 107 | 1378 | 12 | 2556 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2751 | 771 | 3522 | 12 | 8041 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2751 | 762 | 3513 | 12 | 8021 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2751 | 769 | 3520 | 12 | 8105 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2751 | 845 | 3596 | 12 | 9576 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2751 | 758 | 3509 | 12 | 8320 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 1 | completed | 0.333 | 1313 | 75 | 1388 | 9 | 2159 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 2 | completed | 0.667 | 1313 | 72 | 1385 | 9 | 1975 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1313 | 93 | 1406 | 9 | 2848 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 4 | completed | 0.667 | 1313 | 148 | 1461 | 9 | 2641 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 5 | completed | 0.333 | 1313 | 64 | 1377 | 9 | 2328 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 9 | 6641 | provider_failure |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 9 | 9313 | provider_failure |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 9 | 9151 | provider_failure |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 4 | completed | 0.667 | 2699 | 611 | 3310 | 9 | 7850 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2699 | 418 | 3117 | 9 | 6578 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 1 | completed | 0.333 | 700 | 145 | 845 | 0 | 2724 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 2 | completed | 0.333 | 700 | 147 | 847 | 0 | 2739 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 3 | completed | 0.333 | 700 | 108 | 808 | 0 | 2086 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 4 | completed | 0.333 | 700 | 176 | 876 | 0 | 3708 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 5 | completed | 0.333 | 700 | 198 | 898 | 0 | 3995 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 1 | completed | 0.667 | 1772 | 520 | 2292 | 0 | 8507 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 2 | completed | 0.667 | 1772 | 610 | 2382 | 0 | 8816 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 3 | completed | 0.667 | 1772 | 513 | 2285 | 0 | 7487 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 4 | completed | 0.667 | 1772 | 504 | 2276 | 0 | 7504 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 5 | completed | 0.667 | 1772 | 658 | 2430 | 0 | 8574 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 1 | completed | 0.333 | 1188 | 107 | 1295 | 9 | 2549 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 2 | completed | 0.333 | 1188 | 202 | 1390 | 9 | 4068 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 3 | completed | 0.333 | 1188 | 90 | 1278 | 9 | 2185 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 4 | completed | 0.333 | 1188 | 101 | 1289 | 9 | 2188 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 5 | completed | 0.333 | 1188 | 78 | 1266 | 9 | 1878 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2604 | 549 | 3153 | 9 | 6888 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 2 | completed | 0.667 | 2604 | 581 | 3185 | 9 | 6957 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2604 | 592 | 3196 | 9 | 8369 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2604 | 609 | 3213 | 9 | 6964 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 9 | 8173 | provider_failure |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 1 | completed | 0.250 | 1057 | 96 | 1153 | 9 | 2339 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 2 | completed | 0.333 | 1057 | 454 | 1511 | 9 | 6430 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 3 | completed | 0.571 | 1057 | 593 | 1650 | 9 | 8385 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 4 | completed | 0.286 | 1057 | 93 | 1150 | 9 | 2152 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 5 | completed | 0.286 | 1057 | 92 | 1149 | 9 | 2679 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 1 | completed | 0.286 | 2378 | 853 | 3231 | 9 | 8496 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 2 | completed | 0.571 | 2378 | 1001 | 3379 | 9 | 10162 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 9 | 9993 | provider_failure |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 9 | 9870 | provider_failure |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 9 | 12002 | provider_failure |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 1 | completed | 0.286 | 760 | 604 | 1364 | 0 | 8582 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 2 | completed | 0.800 | 760 | 581 | 1341 | 0 | 9349 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 3 | completed | 0.667 | 760 | 271 | 1031 | 0 | 4541 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 4 | completed | 0.571 | 760 | 356 | 1116 | 0 | 5911 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 5 | completed | 0.333 | 760 | 550 | 1310 | 0 | 9100 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 1 | completed | 0.200 | 1877 | 1140 | 3017 | 0 | 13294 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 2 | completed | 0.400 | 1877 | 986 | 2863 | 0 | 11466 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 3 | completed | 0.400 | 1877 | 1163 | 3040 | 0 | 13016 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 13061 | provider_failure |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 5 | completed | 0.400 | 1877 | 953 | 2830 | 0 | 10546 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 1 | completed | 0.571 | 1313 | 538 | 1851 | 11 | 8374 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 2 | completed | 0.800 | 1313 | 373 | 1686 | 11 | 5605 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 3 | completed | 0.667 | 1313 | 461 | 1774 | 11 | 6308 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 4 | completed | 0.800 | 1313 | 292 | 1605 | 11 | 4462 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 5 | completed | 0.571 | 1313 | 485 | 1798 | 11 | 7323 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 1 | completed | 0.571 | 2837 | 577 | 3414 | 11 | 6184 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 2 | completed | 0.571 | 2837 | 663 | 3500 | 11 | 6973 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 3 | completed | 0.571 | 2837 | 722 | 3559 | 11 | 7291 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 4 | completed | 0.571 | 2837 | 702 | 3539 | 11 | 7021 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 5 | completed | 0.571 | 2837 | 637 | 3474 | 11 | 6761 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 1 | completed | 0.000 | 3308 | 580 | 3888 | 9 | 8770 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 2 | completed | 0.000 | 3308 | 577 | 3885 | 9 | 9303 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 3 | completed | 0.000 | 3308 | 570 | 3878 | 9 | 8723 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 4 | completed | 0.000 | 3308 | 556 | 3864 | 9 | 8591 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 5 | completed | 0.000 | 3308 | 572 | 3880 | 9 | 9065 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 9 | 10700 | provider_failure |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 2 | completed | 0.000 | 5260 | 808 | 6068 | 9 | 8654 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 9 | 10095 | provider_failure |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 4 | completed | 0.000 | 5260 | 798 | 6058 | 9 | 9740 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 5 | completed | 0.000 | 5260 | 929 | 6189 | 9 | 10347 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 1 | completed | 0.000 | 754 | 533 | 1287 | 0 | 8494 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 2 | completed | 0.000 | 754 | 627 | 1381 | 0 | 9732 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 3 | completed | 0.000 | 754 | 609 | 1363 | 0 | 9152 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 4 | completed | 0.222 | 754 | 607 | 1361 | 0 | 8611 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 5 | completed | 0.000 | 754 | 624 | 1378 | 0 | 8970 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 1 | completed | 0.000 | 1868 | 1036 | 2904 | 0 | 11538 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 11902 | provider_failure |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 3 | completed | 0.000 | 1868 | 894 | 2762 | 0 | 9786 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 4 | completed | 0.000 | 1868 | 1105 | 2973 | 0 | 11994 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 5 | completed | 0.000 | 1868 | 1216 | 3084 | 0 | 13472 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1419 | 122 | 1541 | 11 | 2220 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 2 | completed | 0.500 | 1419 | 113 | 1532 | 11 | 2715 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 3 | completed | 0.500 | 1419 | 141 | 1560 | 11 | 3311 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 4 | completed | 0.500 | 1419 | 151 | 1570 | 11 | 2302 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1419 | 151 | 1570 | 11 | 2613 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 1 | completed | 0.000 | 2990 | 357 | 3347 | 11 | 4250 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 2 | completed | 0.000 | 2990 | 360 | 3350 | 11 | 4286 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 3 | completed | 0.000 | 2990 | 344 | 3334 | 11 | 4510 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 4 | completed | 0.500 | 2990 | 337 | 3327 | 11 | 3798 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 5 | completed | 0.000 | 2990 | 408 | 3398 | 11 | 5402 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 15468 | 576 | 16044 | 3 | 10245 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 15468 | 571 | 16039 | 3 | 10694 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 15468 | 493 | 15961 | 3 | 7594 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 15468 | 567 | 16035 | 3 | 8686 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 15468 | 572 | 16040 | 3 | 9001 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 1 | completed | 0.800 | 28114 | 337 | 28451 | 3 | 5670 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 28114 | 337 | 28451 | 3 | 5752 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 3 | completed | 0.800 | 28114 | 210 | 28324 | 3 | 4317 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 4 | completed | 0.800 | 28114 | 715 | 28829 | 3 | 9231 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 5 | completed | 0.600 | 28114 | 367 | 28481 | 3 | 5922 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48582 | 44 | 48626 | 0 | 2085 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48582 | 52 | 48634 | 0 | 1686 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48582 | 44 | 48626 | 0 | 1397 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48582 | 44 | 48626 | 0 | 1502 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48582 | 44 | 48626 | 0 | 1657 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 79181 | 403 | 79584 | 0 | 6433 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 79181 | 164 | 79345 | 0 | 4156 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 79181 | 167 | 79348 | 0 | 3627 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 79181 | 384 | 79565 | 0 | 4916 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 79181 | 160 | 79341 | 0 | 4016 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2249 | 43 | 2292 | 13 | 2078 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2249 | 43 | 2292 | 13 | 2295 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2249 | 49 | 2298 | 13 | 1388 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2249 | 43 | 2292 | 13 | 1463 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2249 | 50 | 2299 | 13 | 1389 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 4563 | 294 | 4857 | 13 | 4682 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 4563 | 138 | 4701 | 13 | 3233 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 4563 | 138 | 4701 | 13 | 3425 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 4563 | 316 | 4879 | 13 | 7014 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 4563 | 166 | 4729 | 13 | 3641 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 16008 | 72 | 16080 | 4 | 2023 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 16008 | 88 | 16096 | 4 | 2594 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 16008 | 74 | 16082 | 4 | 2108 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 16008 | 78 | 16086 | 4 | 6049 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 16008 | 56 | 16064 | 4 | 2294 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 28282 | 782 | 29064 | 4 | 9289 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 28282 | 868 | 29150 | 4 | 9076 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 28282 | 940 | 29222 | 4 | 9753 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 28282 | 917 | 29199 | 4 | 9101 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 28282 | 897 | 29179 | 4 | 9655 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48560 | 134 | 48694 | 0 | 4937 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48560 | 160 | 48720 | 0 | 3279 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 3 | completed | 0.833 | 48560 | 122 | 48682 | 0 | 3672 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48560 | 139 | 48699 | 0 | 60590 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48560 | 114 | 48674 | 0 | 31776 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 79156 | 761 | 79917 | 0 | 10299 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 79156 | 528 | 79684 | 0 | 7379 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 79156 | 692 | 79848 | 0 | 13304 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 79156 | 541 | 79697 | 0 | 8456 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 79156 | 934 | 80090 | 0 | 11176 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 3269 | 67 | 3336 | 12 | 1951 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 3269 | 59 | 3328 | 12 | 1706 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 3269 | 109 | 3378 | 12 | 2898 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 3269 | 66 | 3335 | 12 | 2159 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 3269 | 70 | 3339 | 12 | 2056 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 5942 | 299 | 6241 | 12 | 3925 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 5942 | 520 | 6462 | 12 | 6534 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 5942 | 742 | 6684 | 12 | 8311 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 5942 | 446 | 6388 | 12 | 5594 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 5942 | 376 | 6318 | 12 | 5739 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 15404 | 42 | 15446 | 6 | 1809 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 15404 | 42 | 15446 | 6 | 1470 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 15404 | 42 | 15446 | 6 | 1363 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 15404 | 42 | 15446 | 6 | 1689 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 15404 | 42 | 15446 | 6 | 1595 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 27208 | 406 | 27614 | 6 | 6148 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 27208 | 270 | 27478 | 6 | 4691 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 27208 | 250 | 27458 | 6 | 4178 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 27208 | 609 | 27817 | 6 | 7490 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 27208 | 415 | 27623 | 6 | 6128 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48591 | 275 | 48866 | 0 | 4115 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48591 | 209 | 48800 | 0 | 3699 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48591 | 293 | 48884 | 0 | 7993 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48591 | 190 | 48781 | 0 | 5735 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48591 | 194 | 48785 | 0 | 20740 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 509 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 993 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 270 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 283 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 295 | provider_failure |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 3137 | 262 | 3399 | 12 | 4634 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 3137 | 234 | 3371 | 12 | 3828 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 3137 | 196 | 3333 | 12 | 3627 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 3137 | 256 | 3393 | 12 | 4626 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 3137 | 285 | 3422 | 12 | 4649 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 387 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 279 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 12 | 280 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 275 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 12 | 300 | provider_failure |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 16275 | 122 | 16397 | 5 | 2871 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 16275 | 127 | 16402 | 5 | 2366 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 16275 | 105 | 16380 | 5 | 2349 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 16275 | 102 | 16377 | 5 | 7935 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 16275 | 114 | 16389 | 5 | 7930 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 5 | 398 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 5 | 394 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 5 | 292 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 5 | 281 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 5 | 268 | provider_failure |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48577 | 107 | 48684 | 0 | 41574 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48577 | 75 | 48652 | 0 | 35769 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48577 | 78 | 48655 | 0 | 48417 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48577 | 112 | 48689 | 0 | 24476 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48577 | 110 | 48687 | 0 | 18157 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 484 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 406 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 261 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 260 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 859 | provider_failure |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 5378 | 113 | 5491 | 13 | 7056 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 5378 | 115 | 5493 | 13 | 2039 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 5378 | 112 | 5490 | 13 | 4483 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 5378 | 126 | 5504 | 13 | 1897 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 5378 | 110 | 5488 | 13 | 1772 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 13 | 449 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 13 | 369 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 13 | 276 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 13 | 272 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 13 | 310 | provider_failure |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 15748 | 133 | 15881 | 6 | 19026 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 15748 | 155 | 15903 | 6 | 13496 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 15748 | 134 | 15882 | 6 | 9955 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 15748 | 152 | 15900 | 6 | 2601 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 15748 | 157 | 15905 | 6 | 8983 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 6 | 424 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 6 | 246 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 6 | 260 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 6 | 262 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 6 | 259 | provider_failure |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 1 | completed | 0.667 | 48580 | 460 | 49040 | 0 | 5791 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 2 | completed | 0.667 | 48580 | 618 | 49198 | 0 | 55855 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 3 | completed | 0.667 | 48580 | 600 | 49180 | 0 | 24221 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 4 | completed | 0.667 | 48580 | 662 | 49242 | 0 | 24077 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 5 | completed | 0.667 | 48580 | 530 | 49110 | 0 | 38348 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 432 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 271 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 274 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 686 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 285 | provider_failure |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2217 | 140 | 2357 | 11 | 6763 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2217 | 141 | 2358 | 11 | 1879 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2217 | 127 | 2344 | 11 | 2554 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2217 | 133 | 2350 | 11 | 2473 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2217 | 75 | 2292 | 11 | 1297 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 11 | 472 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 11 | 271 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 11 | 280 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 11 | 276 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 11 | 285 | provider_failure |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 1 | completed | 0.333 | 16294 | 503 | 16797 | 4 | 7533 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 2 | completed | 0.333 | 16294 | 594 | 16888 | 4 | 8218 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 3 | completed | 0.333 | 16294 | 605 | 16899 | 4 | 10195 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 4 | completed | 0.333 | 16294 | 493 | 16787 | 4 | 7779 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 5 | completed | 0.333 | 16294 | 593 | 16887 | 4 | 8305 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 4 | 395 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 4 | 294 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 4 | 262 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 4 | 306 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 4 | 241 | provider_failure |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 1 | completed | 0.667 | 48584 | 104 | 48688 | 0 | 51208 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48584 | 96 | 48680 | 0 | 2043 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 3 | completed | 0.667 | 48584 | 264 | 48848 | 0 | 26658 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48584 | 157 | 48741 | 0 | 17973 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 5 | completed | 0.667 | 48584 | 89 | 48673 | 0 | 25849 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 409 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 356 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 270 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 253 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 439 | provider_failure |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 1 | completed | 0.333 | 2508 | 430 | 2938 | 12 | 8789 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 2 | completed | 0.333 | 2508 | 498 | 3006 | 12 | 7424 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 3 | completed | 0.667 | 2508 | 421 | 2929 | 12 | 6875 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 4 | completed | 0.667 | 2508 | 311 | 2819 | 12 | 4835 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 2508 | 355 | 2863 | 12 | 5638 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 377 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 245 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 12 | 257 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 248 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 12 | 393 | provider_failure |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 1 | completed | 0.000 | 13256 | 637 | 13893 | 4 | 19003 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 2 | completed | 0.000 | 13256 | 648 | 13904 | 4 | 9095 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 3 | completed | 0.667 | 13256 | 578 | 13834 | 4 | 8908 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 4 | completed | 0.000 | 13256 | 489 | 13745 | 4 | 9795 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 5 | completed | 0.333 | 13256 | 607 | 13863 | 4 | 8561 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 4 | 418 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 4 | 279 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 4 | 461 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 4 | 277 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 4 | 282 | provider_failure |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 1 | completed | 0.667 | 48579 | 77 | 48656 | 0 | 1758 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 2 | completed | 0.667 | 48579 | 82 | 48661 | 0 | 1817 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 3 | completed | 0.667 | 48579 | 78 | 48657 | 0 | 16456 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 4 | completed | 0.667 | 48579 | 78 | 48657 | 0 | 56917 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 5 | completed | 0.667 | 48579 | 78 | 48657 | 0 | 1778 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 536 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 255 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 242 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 247 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 284 | provider_failure |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 1 | completed | 0.667 | 2400 | 460 | 2860 | 13 | 6774 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 2 | completed | 0.667 | 2400 | 272 | 2672 | 13 | 4394 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 3 | completed | 0.667 | 2400 | 401 | 2801 | 13 | 9071 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 4 | completed | 0.667 | 2400 | 250 | 2650 | 13 | 4426 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 2400 | 428 | 2828 | 13 | 6022 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 13 | 343 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 13 | 403 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 13 | 246 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 13 | 240 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 13 | 245 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 16436 | 279 | 16715 | 4 | 6217 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 2 | completed | 0.667 | 16436 | 454 | 16890 | 4 | 9852 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 16436 | 345 | 16781 | 4 | 11812 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 4 | completed | 0.667 | 16436 | 215 | 16651 | 4 | 4288 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 5 | completed | 0.667 | 16436 | 269 | 16705 | 4 | 4175 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 4 | 487 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 4 | 318 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 4 | 235 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 4 | 244 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 4 | 252 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48589 | 45 | 48634 | 0 | 20209 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48589 | 50 | 48639 | 0 | 36993 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48589 | 45 | 48634 | 0 | 9594 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48589 | 52 | 48641 | 0 | 30266 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48589 | 50 | 48639 | 0 | 2194 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 433 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 310 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 278 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 273 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 286 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2489 | 102 | 2591 | 12 | 1915 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2489 | 114 | 2603 | 12 | 3796 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2489 | 114 | 2603 | 12 | 2157 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2489 | 161 | 2650 | 12 | 2254 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2489 | 130 | 2619 | 12 | 5599 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 353 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 271 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 12 | 281 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 327 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 12 | 346 | provider_failure |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 16133 | 138 | 16271 | 3 | 13510 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 16133 | 129 | 16262 | 3 | 3123 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 16133 | 121 | 16254 | 3 | 1999 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 16133 | 109 | 16242 | 3 | 8001 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 16133 | 120 | 16253 | 3 | 13777 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 3 | 434 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 3 | 263 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 3 | 310 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 3 | 331 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 3 | 382 | provider_failure |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48623 | 164 | 48787 | 0 | 14205 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48623 | 153 | 48776 | 0 | 34751 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48623 | 181 | 48804 | 0 | 2670 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 66874 | provider_failure |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48623 | 153 | 48776 | 0 | 2273 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 445 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 246 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 435 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 327 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 301 | provider_failure |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 1 | completed | 0.000 | 4384 | 47 | 4431 | 13 | 4382 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 2 | completed | 0.000 | 4384 | 44 | 4428 | 13 | 1364 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 3 | completed | 0.000 | 4384 | 50 | 4434 | 13 | 10099 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 4 | completed | 0.000 | 4384 | 45 | 4429 | 13 | 6877 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 5 | completed | 0.000 | 4384 | 53 | 4437 | 13 | 9449 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 13 | 390 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 13 | 382 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 13 | 335 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 13 | 270 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 13 | 320 | provider_failure |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 14437 | 68 | 14505 | 5 | 8238 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 14437 | 68 | 14505 | 5 | 12566 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 14437 | 68 | 14505 | 5 | 7079 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 14437 | 68 | 14505 | 5 | 7121 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 14437 | 68 | 14505 | 5 | 7549 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 5 | 447 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 5 | 282 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 5 | 268 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 5 | 291 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 5 | 279 | provider_failure |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48622 | 194 | 48816 | 0 | 28990 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48622 | 147 | 48769 | 0 | 18559 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48622 | 325 | 48947 | 0 | 20176 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48622 | 227 | 48849 | 0 | 2857 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48622 | 153 | 48775 | 0 | 15206 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 446 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 259 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 250 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 247 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 284 | provider_failure |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 3246 | 135 | 3381 | 12 | 2075 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 3246 | 133 | 3379 | 12 | 10057 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 3246 | 139 | 3385 | 12 | 2788 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 3246 | 139 | 3385 | 12 | 2151 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 3246 | 204 | 3450 | 12 | 5485 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 371 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 272 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 12 | 574 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 282 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 12 | 263 | provider_failure |
