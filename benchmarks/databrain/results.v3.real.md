# Data Brain efficacy benchmark

Full deterministic trial data: [./results.v3.real.json](./results.v3.real.json)

## Run contract

- Mode: `real`
- Schema version: `2`
- Generated: `2026-08-25T14:09:05.248Z`
- Manifest SHA-256: `7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7`
- Corpus commit: `74bdd6298252fcffa477d5bb56d92e4a1e1474f4`
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
| all models (pooled) | 200 | 8.69pp | [3.86, 13.43] | 67.39% | [63.67, 70.19] | yes | no | yes | MET |
| gpt-5.6-luna | 100 | 6.82pp | [0.92, 12.59] | 72.74% | [69.91, 75.15] | yes | no | yes | MET |
| claude-sonnet-5 | 100 | 10.56pp | [2.33, 18.56] | 63.86% | [57.71, 68.45] | yes | no | yes | MET |

- Pooled result: **MET**.

## Arm totals

| Model | Arm | Trials | Mean score | Mean 95% CI | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all models (pooled) | checkout | 200 | 0.749 | [0.70, 0.80] | 67.00% | 2186662 | 75138 | 2261800 | 1340 | 1256061 | 18 |
| all models (pooled) | full-dump | 200 | 0.729 | [0.67, 0.78] | 59.50% | 6312402 | 101232 | 6413634 | 0 | 1726067 | 10 |
| all models (pooled) | data-brain | 200 | 0.836 | [0.79, 0.88] | 67.50% | 656459 | 81099 | 737558 | 2240 | 1127318 | 4 |
| gpt-5.6-luna | checkout | 100 | 0.799 | [0.73, 0.86] | 71.00% | 874700 | 24165 | 898865 | 670 | 436921 | 0 |
| gpt-5.6-luna | full-dump | 100 | 0.742 | [0.68, 0.81] | 57.00% | 2484880 | 25373 | 2510253 | 0 | 690490 | 0 |
| gpt-5.6-luna | data-brain | 100 | 0.867 | [0.82, 0.91] | 70.00% | 227565 | 17437 | 245002 | 1120 | 327908 | 0 |
| claude-sonnet-5 | checkout | 100 | 0.700 | [0.62, 0.78] | 63.00% | 1311962 | 50973 | 1362935 | 670 | 819140 | 18 |
| claude-sonnet-5 | full-dump | 100 | 0.717 | [0.64, 0.79] | 62.00% | 3827522 | 75859 | 3903381 | 0 | 1035577 | 10 |
| claude-sonnet-5 | data-brain | 100 | 0.805 | [0.74, 0.87] | 65.00% | 428894 | 63662 | 492556 | 1120 | 799410 | 4 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 0.900 | 21955 | 90 | 57574 | 1 |
| fixture-implement-remaining-session-ms | full-dump | 0.300 | 23902 | 0 | 120291 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 30373 | 100 | 70014 | 0 |
| fixture-implement-refresh-session | checkout | 1.000 | 25564 | 90 | 53402 | 0 |
| fixture-implement-refresh-session | full-dump | 0.200 | 17024 | 0 | 117673 | 2 |
| fixture-implement-refresh-session | data-brain | 1.000 | 29884 | 90 | 64123 | 0 |
| fixture-implement-github-login | checkout | 1.000 | 44724 | 90 | 75567 | 0 |
| fixture-implement-github-login | full-dump | 1.000 | 21002 | 0 | 93525 | 0 |
| fixture-implement-github-login | data-brain | 1.000 | 29315 | 100 | 69399 | 0 |
| fixture-implement-password-reset | checkout | 0.900 | 19757 | 90 | 94780 | 1 |
| fixture-implement-password-reset | full-dump | 0.900 | 17507 | 0 | 94823 | 1 |
| fixture-implement-password-reset | data-brain | 0.900 | 29492 | 100 | 88056 | 0 |
| fixture-answer-session-policy | checkout | 0.900 | 24756 | 90 | 46551 | 1 |
| fixture-answer-session-policy | full-dump | 0.900 | 16509 | 0 | 54035 | 0 |
| fixture-answer-session-policy | data-brain | 0.833 | 23283 | 90 | 48301 | 1 |
| fixture-answer-audit-schema | checkout | 0.900 | 32376 | 90 | 37489 | 1 |
| fixture-answer-audit-schema | full-dump | 0.350 | 7235 | 0 | 73145 | 4 |
| fixture-answer-audit-schema | data-brain | 0.900 | 20887 | 100 | 47496 | 1 |
| fixture-answer-api-rule-conflict | checkout | 0.800 | 24778 | 90 | 55513 | 2 |
| fixture-answer-api-rule-conflict | full-dump | 1.000 | 16775 | 0 | 51911 | 0 |
| fixture-answer-api-rule-conflict | data-brain | 1.000 | 24410 | 120 | 53313 | 0 |
| fixture-answer-legacy-billing | checkout | 0.733 | 23384 | 90 | 50471 | 0 |
| fixture-answer-legacy-billing | full-dump | 0.533 | 16026 | 0 | 53576 | 0 |
| fixture-answer-legacy-billing | data-brain | 0.500 | 19116 | 90 | 50756 | 1 |
| fixture-judge-auth-drift | checkout | 0.288 | 20892 | 90 | 79194 | 1 |
| fixture-judge-auth-drift | full-dump | 0.404 | 21739 | 0 | 102512 | 0 |
| fixture-judge-auth-drift | data-brain | 0.660 | 25749 | 110 | 58227 | 0 |
| fixture-judge-instruction-doc-drift | checkout | 0.000 | 25480 | 90 | 89197 | 4 |
| fixture-judge-instruction-doc-drift | full-dump | 0.044 | 21664 | 0 | 98363 | 0 |
| fixture-judge-instruction-doc-drift | data-brain | 0.400 | 24505 | 110 | 35745 | 0 |
| real-answer-github-permissions | checkout | 0.660 | 223372 | 30 | 66861 | 0 |
| real-answer-github-permissions | full-dump | 1.000 | 645124 | 0 | 30703 | 0 |
| real-answer-github-permissions | data-brain | 1.000 | 35525 | 130 | 31754 | 0 |
| real-answer-mcp-contract | checkout | 1.000 | 226449 | 40 | 58847 | 0 |
| real-answer-mcp-contract | full-dump | 0.900 | 566560 | 0 | 113642 | 1 |
| real-answer-mcp-contract | data-brain | 1.000 | 48595 | 120 | 43777 | 0 |
| real-answer-job-queue-claim | checkout | 1.000 | 215680 | 60 | 41411 | 0 |
| real-answer-job-queue-claim | full-dump | 0.925 | 649207 | 0 | 148398 | 0 |
| real-answer-job-queue-claim | data-brain | 0.950 | 52416 | 120 | 75268 | 0 |
| real-answer-graph-renderer | checkout | 1.000 | 223077 | 50 | 36022 | 0 |
| real-answer-graph-renderer | full-dump | 1.000 | 645367 | 0 | 71136 | 0 |
| real-answer-graph-renderer | data-brain | 1.000 | 77555 | 130 | 57854 | 0 |
| real-answer-receipt-statement | checkout | 1.000 | 222420 | 60 | 43713 | 0 |
| real-answer-receipt-statement | full-dump | 0.600 | 570574 | 0 | 155202 | 1 |
| real-answer-receipt-statement | data-brain | 1.000 | 35410 | 110 | 33930 | 0 |
| real-answer-credit-honesty | checkout | 0.267 | 174121 | 40 | 102993 | 2 |
| real-answer-credit-honesty | full-dump | 0.933 | 649059 | 0 | 78007 | 0 |
| real-answer-credit-honesty | data-brain | 0.300 | 38384 | 120 | 101323 | 1 |
| real-answer-index-pr-limits | checkout | 0.200 | 166680 | 40 | 96023 | 1 |
| real-answer-index-pr-limits | full-dump | 0.600 | 568239 | 0 | 76350 | 1 |
| real-answer-index-pr-limits | data-brain | 0.667 | 40842 | 130 | 68669 | 0 |
| real-answer-evidence-grade-rule | checkout | 0.433 | 114327 | 40 | 88795 | 4 |
| real-answer-evidence-grade-rule | full-dump | 1.000 | 646057 | 0 | 36265 | 0 |
| real-answer-evidence-grade-rule | data-brain | 1.000 | 40561 | 120 | 49391 | 0 |
| real-audit-mcp-tool-surface | checkout | 1.000 | 226238 | 30 | 41379 | 0 |
| real-audit-mcp-tool-surface | full-dump | 1.000 | 646794 | 0 | 86921 | 0 |
| real-audit-mcp-tool-surface | data-brain | 0.609 | 62809 | 130 | 45446 | 0 |
| real-audit-finding-taxonomy | checkout | 1.000 | 205770 | 50 | 40279 | 0 |
| real-audit-finding-taxonomy | full-dump | 1.000 | 647270 | 0 | 69589 | 0 |
| real-audit-finding-taxonomy | data-brain | 1.000 | 48447 | 120 | 34476 | 0 |

## Every trial

| Task | Model | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1337 | 165 | 1502 | 9 | 2926 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1337 | 214 | 1551 | 9 | 6716 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1337 | 206 | 1543 | 9 | 3474 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1337 | 208 | 1545 | 9 | 3649 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1337 | 215 | 1552 | 9 | 3616 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2781 | 861 | 3642 | 9 | 9214 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2781 | 806 | 3587 | 9 | 7346 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2781 | 733 | 3514 | 9 | 6476 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2781 | 738 | 3519 | 9 | 6527 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 9 | 7630 | provider_failure |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 1 | completed | 0.000 | 720 | 683 | 1403 | 0 | 9161 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 2 | completed | 0.000 | 720 | 502 | 1222 | 0 | 7144 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 3 | completed | 0.000 | 720 | 418 | 1138 | 0 | 5466 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 4 | completed | 0.000 | 720 | 666 | 1386 | 0 | 7315 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 720 | 761 | 1481 | 0 | 8906 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 1 | completed | 0.000 | 1811 | 1607 | 3418 | 0 | 16289 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1811 | 1635 | 3446 | 0 | 16487 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 3 | completed | 0.000 | 1811 | 1770 | 3581 | 0 | 17712 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1811 | 1610 | 3421 | 0 | 15905 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 5 | completed | 0.000 | 1811 | 1595 | 3406 | 0 | 15906 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1562 | 239 | 1801 | 10 | 3349 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1562 | 226 | 1788 | 10 | 3269 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1562 | 217 | 1779 | 10 | 3226 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1562 | 223 | 1785 | 10 | 3098 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1562 | 213 | 1775 | 10 | 3225 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3286 | 826 | 4112 | 10 | 9067 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3286 | 1013 | 4299 | 10 | 11026 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3286 | 1158 | 4444 | 10 | 11349 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3286 | 976 | 4262 | 10 | 11084 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3286 | 1042 | 4328 | 10 | 11321 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1435 | 234 | 1669 | 9 | 4144 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1435 | 229 | 1664 | 9 | 4046 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1435 | 214 | 1649 | 9 | 3111 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1435 | 236 | 1671 | 9 | 3398 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1435 | 215 | 1650 | 9 | 3906 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2903 | 672 | 3575 | 9 | 8246 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2903 | 626 | 3529 | 9 | 8069 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2903 | 458 | 3361 | 9 | 5796 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2903 | 427 | 3330 | 9 | 5652 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2903 | 563 | 3466 | 9 | 7034 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 1 | completed | 0.000 | 731 | 447 | 1178 | 0 | 5479 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 2 | completed | 0.000 | 731 | 588 | 1319 | 0 | 6365 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 3 | completed | 0.000 | 731 | 740 | 1471 | 0 | 7876 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 731 | 552 | 1283 | 0 | 5716 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 5 | completed | 0.000 | 731 | 741 | 1472 | 0 | 8342 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 17372 | provider_failure |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 2 | completed | 0.000 | 1820 | 1762 | 3582 | 0 | 19225 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 14089 | provider_failure |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 4 | completed | 0.000 | 1820 | 1535 | 3355 | 0 | 16989 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1820 | 1544 | 3364 | 0 | 16220 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1583 | 209 | 1792 | 9 | 3681 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1583 | 233 | 1816 | 9 | 3454 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1583 | 221 | 1804 | 9 | 3157 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1583 | 233 | 1816 | 9 | 3325 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1583 | 227 | 1810 | 9 | 3383 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3291 | 883 | 4174 | 9 | 9713 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3291 | 1018 | 4309 | 9 | 10747 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3291 | 749 | 4040 | 9 | 8298 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3291 | 891 | 4182 | 9 | 9697 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3291 | 850 | 4141 | 9 | 8668 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2993 | 115 | 3108 | 9 | 2532 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2993 | 122 | 3115 | 9 | 2741 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2993 | 110 | 3103 | 9 | 3048 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2993 | 110 | 3103 | 9 | 3564 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2993 | 110 | 3103 | 9 | 2543 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 4840 | 638 | 5478 | 9 | 8387 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 4840 | 1153 | 5993 | 9 | 13951 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 4840 | 1109 | 5949 | 9 | 13178 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 4840 | 1123 | 5963 | 9 | 13566 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 4840 | 969 | 5809 | 9 | 12057 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 731 | 224 | 955 | 0 | 3655 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 731 | 243 | 974 | 0 | 3705 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 731 | 252 | 983 | 0 | 4048 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 731 | 238 | 969 | 0 | 3825 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 731 | 201 | 932 | 0 | 3741 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1817 | 1685 | 3502 | 0 | 18256 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1817 | 1184 | 3001 | 0 | 12244 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1817 | 1092 | 2909 | 0 | 11032 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1817 | 1523 | 3340 | 0 | 15570 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1817 | 1620 | 3437 | 0 | 17449 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1608 | 186 | 1794 | 10 | 3088 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1608 | 206 | 1814 | 10 | 3470 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1608 | 200 | 1808 | 10 | 3953 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1608 | 208 | 1816 | 10 | 3516 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1608 | 224 | 1832 | 10 | 3624 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3245 | 756 | 4001 | 10 | 9702 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3245 | 921 | 4166 | 10 | 11571 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3245 | 762 | 4007 | 10 | 10534 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3245 | 610 | 3855 | 10 | 8696 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3245 | 977 | 4222 | 10 | 11245 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 929 | 269 | 1198 | 9 | 4181 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 929 | 256 | 1185 | 9 | 3562 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 929 | 268 | 1197 | 9 | 6428 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 929 | 264 | 1193 | 9 | 4839 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 929 | 238 | 1167 | 9 | 3691 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 9 | 13059 | provider_failure |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2183 | 1241 | 3424 | 9 | 14495 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2183 | 978 | 3161 | 9 | 12290 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2183 | 1488 | 3671 | 9 | 17085 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2183 | 1378 | 3561 | 9 | 15150 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 754 | 233 | 987 | 0 | 10740 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 754 | 228 | 982 | 0 | 3233 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 754 | 215 | 969 | 0 | 3960 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 754 | 228 | 982 | 0 | 3368 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 754 | 234 | 988 | 0 | 3433 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1855 | 1328 | 3183 | 0 | 14292 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1855 | 1375 | 3230 | 0 | 15001 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1855 | 1180 | 3035 | 0 | 12440 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1855 | 1296 | 3151 | 0 | 13620 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 14736 | provider_failure |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1462 | 230 | 1692 | 10 | 3616 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1462 | 224 | 1686 | 10 | 3397 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1462 | 227 | 1689 | 10 | 3396 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1462 | 221 | 1683 | 10 | 4141 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1462 | 224 | 1686 | 10 | 3223 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 1 | completed | 0.000 | 3023 | 1155 | 4178 | 10 | 13321 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3023 | 1285 | 4308 | 10 | 15356 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3023 | 1155 | 4178 | 10 | 13504 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3023 | 1127 | 4150 | 10 | 12979 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3023 | 1219 | 4242 | 10 | 15123 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1711 | 107 | 1818 | 9 | 2955 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1711 | 105 | 1816 | 9 | 1854 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1711 | 107 | 1818 | 9 | 2274 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1711 | 106 | 1817 | 9 | 2251 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1711 | 115 | 1826 | 9 | 1952 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 3314 | 646 | 3960 | 9 | 7631 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 3314 | 625 | 3939 | 9 | 7498 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 3314 | 617 | 3931 | 9 | 7275 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 3314 | 517 | 3831 | 9 | 6460 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 9 | 6401 | provider_failure |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 1 | completed | 0.667 | 704 | 146 | 850 | 0 | 2325 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 2 | completed | 0.667 | 704 | 148 | 852 | 0 | 2354 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 704 | 94 | 798 | 0 | 1923 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 4 | completed | 0.667 | 704 | 126 | 830 | 0 | 2160 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 704 | 95 | 799 | 0 | 1973 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1783 | 855 | 2638 | 0 | 10263 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1783 | 835 | 2618 | 0 | 9816 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1783 | 708 | 2491 | 0 | 9195 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1783 | 627 | 2410 | 0 | 7970 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1783 | 440 | 2223 | 0 | 6056 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1447 | 102 | 1549 | 9 | 1789 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1447 | 98 | 1545 | 9 | 2027 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1447 | 113 | 1560 | 9 | 1845 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1447 | 99 | 1546 | 9 | 1936 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 1447 | 109 | 1556 | 9 | 2099 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3079 | 772 | 3851 | 9 | 7578 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3079 | 815 | 3894 | 9 | 8473 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 3 | completed | 0.667 | 3079 | 811 | 3890 | 9 | 8342 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 9 | 5396 | provider_failure |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3079 | 813 | 3892 | 9 | 8816 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2738 | 42 | 2780 | 9 | 1610 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2738 | 42 | 2780 | 9 | 1558 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2738 | 42 | 2780 | 9 | 1513 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2738 | 42 | 2780 | 9 | 10224 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2738 | 44 | 2782 | 9 | 2533 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 4337 | 303 | 4640 | 9 | 3831 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 4337 | 293 | 4630 | 9 | 4803 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 4337 | 245 | 4582 | 9 | 3241 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 4337 | 285 | 4622 | 9 | 3655 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 9 | 4521 | provider_failure |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 1 | completed | 0.500 | 702 | 190 | 892 | 0 | 2994 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 2 | completed | 0.500 | 702 | 190 | 892 | 0 | 2845 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 3 | completed | 0.500 | 702 | 166 | 868 | 0 | 2912 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 4 | completed | 0.500 | 702 | 182 | 884 | 0 | 3926 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 5 | completed | 0.500 | 702 | 181 | 883 | 0 | 3150 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 12940 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 10762 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1772 | 1044 | 2816 | 0 | 12377 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 10473 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 10766 | provider_failure |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1377 | 40 | 1417 | 10 | 1939 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1377 | 42 | 1419 | 10 | 2324 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1377 | 41 | 1418 | 10 | 1692 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1377 | 42 | 1419 | 10 | 1393 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1377 | 42 | 1419 | 10 | 1179 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2844 | 494 | 3338 | 10 | 5831 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2844 | 578 | 3422 | 10 | 6719 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 10 | 11263 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2844 | 633 | 3477 | 10 | 6971 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2844 | 714 | 3558 | 10 | 8185 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2160 | 99 | 2259 | 9 | 2012 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2160 | 104 | 2264 | 9 | 1883 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2160 | 113 | 2273 | 9 | 2664 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2160 | 109 | 2269 | 9 | 2505 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2160 | 116 | 2276 | 9 | 2131 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 3681 | 684 | 4365 | 9 | 7396 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 9 | 8994 | provider_failure |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 9 | 9420 | provider_failure |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 3681 | 876 | 4557 | 9 | 8693 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 3681 | 834 | 4515 | 9 | 9815 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 703 | 207 | 910 | 0 | 2972 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 703 | 128 | 831 | 0 | 2246 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 703 | 202 | 905 | 0 | 3053 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 703 | 128 | 831 | 0 | 2189 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 703 | 130 | 833 | 0 | 2009 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1784 | 760 | 2544 | 0 | 8666 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1784 | 744 | 2528 | 0 | 8088 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1784 | 685 | 2469 | 0 | 7814 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1784 | 640 | 2424 | 0 | 7267 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1784 | 716 | 2500 | 0 | 7607 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1271 | 138 | 1409 | 12 | 2634 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1271 | 117 | 1388 | 12 | 1826 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1271 | 118 | 1389 | 12 | 2031 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1271 | 108 | 1379 | 12 | 2175 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1271 | 101 | 1372 | 12 | 2156 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2751 | 802 | 3553 | 12 | 9060 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2751 | 670 | 3421 | 12 | 7708 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2751 | 720 | 3471 | 12 | 8948 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2751 | 850 | 3601 | 12 | 8826 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2751 | 676 | 3427 | 12 | 7949 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 1 | completed | 0.333 | 1313 | 78 | 1391 | 9 | 1976 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 2 | completed | 0.333 | 1313 | 139 | 1452 | 9 | 2371 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 3 | completed | 0.667 | 1313 | 77 | 1390 | 9 | 2255 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1313 | 142 | 1455 | 9 | 2642 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 5 | completed | 0.667 | 1313 | 166 | 1479 | 9 | 2671 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2699 | 570 | 3269 | 9 | 7372 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 2 | completed | 0.667 | 2699 | 519 | 3218 | 9 | 7566 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2699 | 536 | 3235 | 9 | 7867 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 4 | completed | 0.667 | 2699 | 644 | 3343 | 9 | 8602 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2699 | 453 | 3152 | 9 | 7149 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 1 | completed | 0.333 | 700 | 157 | 857 | 0 | 2466 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 2 | completed | 0.333 | 700 | 205 | 905 | 0 | 2880 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 3 | completed | 0.333 | 700 | 160 | 860 | 0 | 2988 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 4 | completed | 0.333 | 700 | 174 | 874 | 0 | 3101 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 5 | completed | 0.333 | 700 | 150 | 850 | 0 | 2501 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1772 | 570 | 2342 | 0 | 8047 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 2 | completed | 0.667 | 1772 | 544 | 2316 | 0 | 7739 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 3 | completed | 0.667 | 1772 | 719 | 2491 | 0 | 9946 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 4 | completed | 0.667 | 1772 | 459 | 2231 | 0 | 7033 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 5 | completed | 0.667 | 1772 | 528 | 2300 | 0 | 6875 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 1 | completed | 0.333 | 1188 | 115 | 1303 | 9 | 2285 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 2 | completed | 0.667 | 1188 | 118 | 1306 | 9 | 5314 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 3 | completed | 0.333 | 1188 | 92 | 1280 | 9 | 1720 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 4 | completed | 0.333 | 1188 | 78 | 1266 | 9 | 1746 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 1188 | 96 | 1284 | 9 | 1669 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 1 | completed | 0.667 | 2604 | 554 | 3158 | 9 | 8250 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 2 | completed | 0.667 | 2604 | 588 | 3192 | 9 | 8424 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 3 | completed | 0.667 | 2604 | 535 | 3139 | 9 | 6564 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 4 | completed | 0.667 | 2604 | 584 | 3188 | 9 | 6798 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 9 | 7986 | provider_failure |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 1 | completed | 0.286 | 1057 | 638 | 1695 | 9 | 8276 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 2 | completed | 0.286 | 1057 | 95 | 1152 | 9 | 1938 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 3 | completed | 0.000 | 1057 | 406 | 1463 | 9 | 5563 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 4 | completed | 0.333 | 1057 | 534 | 1591 | 9 | 6889 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 5 | completed | 0.286 | 1057 | 522 | 1579 | 9 | 6282 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 1 | completed | 0.286 | 2378 | 981 | 3359 | 9 | 10750 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 2 | completed | 0.500 | 2378 | 1006 | 3384 | 9 | 10193 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 9 | 10141 | provider_failure |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 4 | completed | 0.500 | 2378 | 1026 | 3404 | 9 | 10289 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 5 | completed | 0.400 | 2378 | 887 | 3265 | 9 | 8873 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 1 | completed | 0.333 | 760 | 498 | 1258 | 0 | 6422 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 2 | completed | 0.667 | 760 | 618 | 1378 | 0 | 7535 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 3 | completed | 0.667 | 760 | 577 | 1337 | 0 | 7377 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 4 | completed | 0.667 | 760 | 470 | 1230 | 0 | 6344 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 5 | completed | 0.500 | 760 | 598 | 1358 | 0 | 7253 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 1 | completed | 0.182 | 1877 | 1079 | 2956 | 0 | 12702 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 2 | completed | 0.200 | 1877 | 1274 | 3151 | 0 | 14085 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 3 | completed | 0.200 | 1877 | 1169 | 3046 | 0 | 14198 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 4 | completed | 0.400 | 1877 | 1074 | 2951 | 0 | 12660 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 5 | completed | 0.222 | 1877 | 1197 | 3074 | 0 | 13936 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 1 | completed | 0.800 | 1313 | 347 | 1660 | 11 | 4841 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 2 | completed | 0.800 | 1313 | 291 | 1604 | 11 | 3938 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 3 | completed | 0.800 | 1313 | 271 | 1584 | 11 | 4203 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 4 | completed | 0.800 | 1313 | 397 | 1710 | 11 | 5188 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 5 | completed | 0.444 | 1313 | 310 | 1623 | 11 | 4181 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 1 | completed | 0.571 | 2837 | 664 | 3501 | 11 | 7475 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 2 | completed | 0.667 | 2837 | 642 | 3479 | 11 | 7065 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 3 | completed | 0.571 | 2837 | 635 | 3472 | 11 | 6841 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 4 | completed | 0.571 | 2837 | 691 | 3528 | 11 | 6879 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 5 | completed | 0.571 | 2837 | 751 | 3588 | 11 | 7616 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 1 | completed | 0.000 | 3308 | 582 | 3890 | 9 | 9177 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 2 | completed | 0.000 | 3308 | 589 | 3897 | 9 | 7741 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 3 | completed | 0.000 | 3308 | 579 | 3887 | 9 | 7567 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 4 | completed | 0.000 | 3308 | 588 | 3896 | 9 | 8966 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 5 | completed | 0.000 | 3308 | 570 | 3878 | 9 | 8453 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 9 | 11267 | provider_failure |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 9 | 9924 | provider_failure |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 9 | 9686 | provider_failure |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 9 | 8182 | provider_failure |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 5 | completed | 0.000 | 5260 | 772 | 6032 | 9 | 8234 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 1 | completed | 0.000 | 754 | 639 | 1393 | 0 | 8134 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 2 | completed | 0.222 | 754 | 633 | 1387 | 0 | 8016 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 3 | completed | 0.000 | 754 | 884 | 1638 | 0 | 10336 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 4 | completed | 0.000 | 754 | 630 | 1384 | 0 | 8211 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 5 | completed | 0.000 | 754 | 484 | 1238 | 0 | 5668 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 1 | completed | 0.222 | 1868 | 944 | 2812 | 0 | 10529 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 2 | completed | 0.000 | 1868 | 1109 | 2977 | 0 | 12083 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 3 | completed | 0.000 | 1868 | 1084 | 2952 | 0 | 11042 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 4 | completed | 0.000 | 1868 | 1001 | 2869 | 0 | 11339 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 5 | completed | 0.000 | 1868 | 1146 | 3014 | 0 | 13005 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 1 | completed | 0.500 | 1419 | 132 | 1551 | 11 | 2421 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1419 | 131 | 1550 | 11 | 3189 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 3 | completed | 0.500 | 1419 | 182 | 1601 | 11 | 3326 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 4 | completed | 0.500 | 1419 | 95 | 1514 | 11 | 1855 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 5 | completed | 0.500 | 1419 | 125 | 1544 | 11 | 1914 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 1 | completed | 0.000 | 2990 | 372 | 3362 | 11 | 4929 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 2 | completed | 0.000 | 2990 | 376 | 3366 | 11 | 4491 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 3 | completed | 0.000 | 2990 | 359 | 3349 | 11 | 4818 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 4 | completed | 0.000 | 2990 | 327 | 3317 | 11 | 4531 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2990 | 361 | 3351 | 11 | 4271 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 15518 | 572 | 16090 | 3 | 7197 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 15518 | 412 | 15930 | 3 | 5475 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 15518 | 566 | 16084 | 3 | 6562 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 15518 | 566 | 16084 | 3 | 7000 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 15518 | 568 | 16086 | 3 | 8424 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 1 | completed | 0.800 | 28211 | 472 | 28683 | 3 | 7081 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 2 | completed | 0.000 | 28211 | 295 | 28506 | 3 | 5357 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 3 | completed | 0.800 | 28211 | 666 | 28877 | 3 | 8585 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 4 | completed | 0.000 | 28211 | 306 | 28517 | 3 | 5602 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 5 | completed | 0.000 | 28211 | 304 | 28515 | 3 | 5578 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48965 | 44 | 49009 | 0 | 1839 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48965 | 44 | 49009 | 0 | 1984 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48965 | 44 | 49009 | 0 | 1514 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48965 | 47 | 49012 | 0 | 1498 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48965 | 52 | 49017 | 0 | 1618 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 79756 | 167 | 79923 | 0 | 4688 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 79756 | 155 | 79911 | 0 | 3972 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 79756 | 250 | 80006 | 0 | 3963 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 79756 | 372 | 80128 | 0 | 4821 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 79756 | 344 | 80100 | 0 | 4806 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2249 | 93 | 2342 | 13 | 2085 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2249 | 43 | 2292 | 13 | 1325 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2249 | 97 | 2346 | 13 | 1568 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2249 | 50 | 2299 | 13 | 1540 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2249 | 43 | 2292 | 13 | 1091 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 4563 | 251 | 4814 | 13 | 4749 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 4563 | 160 | 4723 | 13 | 3533 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 4563 | 160 | 4723 | 13 | 3988 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 4563 | 408 | 4971 | 13 | 8290 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 4563 | 160 | 4723 | 13 | 3585 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 16058 | 89 | 16147 | 4 | 2315 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 16058 | 77 | 16135 | 4 | 1834 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 16058 | 77 | 16135 | 4 | 1727 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 16058 | 98 | 16156 | 4 | 1943 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 16058 | 53 | 16111 | 4 | 1593 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 28379 | 816 | 29195 | 4 | 10087 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 28379 | 727 | 29106 | 4 | 9327 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 28379 | 844 | 29223 | 4 | 10207 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 28379 | 726 | 29105 | 4 | 10102 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 28379 | 757 | 29136 | 4 | 9712 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48943 | 103 | 49046 | 0 | 11047 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48943 | 104 | 49047 | 0 | 2533 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48943 | 100 | 49043 | 0 | 45472 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48943 | 104 | 49047 | 0 | 10031 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48943 | 108 | 49051 | 0 | 2589 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 79731 | 290 | 80021 | 0 | 5682 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 9055 | provider_failure |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 79731 | 784 | 80515 | 0 | 9429 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 79731 | 676 | 80407 | 0 | 9291 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 79731 | 652 | 80383 | 0 | 8513 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 3269 | 64 | 3333 | 12 | 1730 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 3269 | 66 | 3335 | 12 | 9560 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 3269 | 67 | 3336 | 12 | 1400 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 3269 | 68 | 3337 | 12 | 1574 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 3269 | 66 | 3335 | 12 | 1809 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 5942 | 360 | 6302 | 12 | 4747 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 5942 | 448 | 6390 | 12 | 5395 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 5942 | 323 | 6265 | 12 | 5166 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 5942 | 417 | 6359 | 12 | 4660 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 5942 | 661 | 6603 | 12 | 7736 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 15454 | 42 | 15496 | 6 | 1962 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 15454 | 57 | 15511 | 6 | 2475 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 15454 | 42 | 15496 | 6 | 1374 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 15454 | 42 | 15496 | 6 | 2183 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 15454 | 42 | 15496 | 6 | 7267 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 27305 | 396 | 27701 | 6 | 5528 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 27305 | 299 | 27604 | 6 | 4723 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 27305 | 353 | 27658 | 6 | 5832 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 27305 | 368 | 27673 | 6 | 5926 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 27305 | 244 | 27549 | 6 | 4141 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48974 | 260 | 49234 | 0 | 4856 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48974 | 216 | 49190 | 0 | 17914 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48974 | 166 | 49140 | 0 | 13161 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48974 | 271 | 49245 | 0 | 4239 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48974 | 147 | 49121 | 0 | 51069 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 79774 | 994 | 80768 | 0 | 13663 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 79774 | 930 | 80704 | 0 | 11492 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 79774 | 924 | 80698 | 0 | 12560 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 79774 | 878 | 80652 | 0 | 10627 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 5 | completed | 0.250 | 79774 | 681 | 80455 | 0 | 8817 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 3137 | 245 | 3382 | 12 | 3941 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 3137 | 239 | 3376 | 12 | 3686 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 3137 | 206 | 3343 | 12 | 3361 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 3137 | 254 | 3391 | 12 | 4077 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 3137 | 190 | 3327 | 12 | 3873 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 6140 | 882 | 7022 | 12 | 10162 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 2 | completed | 0.750 | 6140 | 1139 | 7279 | 12 | 12800 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 3 | completed | 0.750 | 6140 | 930 | 7070 | 12 | 10680 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 6140 | 907 | 7047 | 12 | 10511 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 6140 | 1039 | 7179 | 12 | 12177 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 16325 | 120 | 16445 | 5 | 2441 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 16325 | 138 | 16463 | 5 | 2325 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 16325 | 161 | 16486 | 5 | 2869 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 16325 | 124 | 16449 | 5 | 2153 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 16325 | 118 | 16443 | 5 | 2186 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 27869 | 179 | 28048 | 5 | 3903 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 27869 | 336 | 28205 | 5 | 5317 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 27869 | 462 | 28331 | 5 | 6246 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 27869 | 212 | 28081 | 5 | 3895 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 27869 | 257 | 28126 | 5 | 4687 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48960 | 118 | 49078 | 0 | 2773 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48960 | 121 | 49081 | 0 | 2262 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48960 | 74 | 49034 | 0 | 1697 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48960 | 94 | 49054 | 0 | 1743 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48960 | 95 | 49055 | 0 | 39726 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 79750 | 279 | 80029 | 0 | 5236 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 79750 | 265 | 80015 | 0 | 4602 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 79750 | 266 | 80016 | 0 | 4271 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 79750 | 242 | 79992 | 0 | 4294 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 79750 | 263 | 80013 | 0 | 4532 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 5378 | 106 | 5484 | 13 | 1771 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 5378 | 118 | 5496 | 13 | 4405 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 5378 | 127 | 5505 | 13 | 2096 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 5378 | 104 | 5482 | 13 | 4925 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 5378 | 112 | 5490 | 13 | 3456 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 9322 | 799 | 10121 | 13 | 9566 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 9322 | 645 | 9967 | 13 | 7986 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 9322 | 600 | 9922 | 13 | 7090 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 9322 | 915 | 10237 | 13 | 10296 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 9322 | 529 | 9851 | 13 | 6263 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 15798 | 137 | 15935 | 6 | 2921 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 15798 | 72 | 15870 | 6 | 2028 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 15798 | 135 | 15933 | 6 | 2257 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 15798 | 156 | 15954 | 6 | 2317 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 15798 | 169 | 15967 | 6 | 3079 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 28123 | 315 | 28438 | 6 | 5193 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 28123 | 603 | 28726 | 6 | 8114 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 28123 | 541 | 28664 | 6 | 7397 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 28123 | 323 | 28446 | 6 | 4721 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 28123 | 364 | 28487 | 6 | 5686 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 1 | completed | 0.667 | 48963 | 480 | 49443 | 0 | 6396 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 2 | completed | 0.667 | 48963 | 604 | 49567 | 0 | 7662 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 3 | completed | 0.667 | 48963 | 410 | 49373 | 0 | 9594 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 4 | completed | 0.667 | 48963 | 503 | 49466 | 0 | 18942 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 5 | completed | 0.667 | 48963 | 401 | 49364 | 0 | 44813 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 1 | completed | 0.667 | 79754 | 943 | 80697 | 0 | 13389 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 2 | completed | 0.667 | 79754 | 1222 | 80976 | 0 | 14513 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 3 | completed | 0.667 | 79754 | 1082 | 80836 | 0 | 13182 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 4 | completed | 0.667 | 79754 | 1098 | 80852 | 0 | 12223 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 14488 | provider_failure |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2217 | 75 | 2292 | 11 | 1908 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2217 | 127 | 2344 | 11 | 2262 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2217 | 152 | 2369 | 11 | 2313 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2217 | 153 | 2370 | 11 | 2156 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2217 | 144 | 2361 | 11 | 2414 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 4362 | 380 | 4742 | 11 | 5206 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 4362 | 400 | 4762 | 11 | 4770 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 4362 | 290 | 4652 | 11 | 3722 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 4362 | 444 | 4806 | 11 | 5231 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 4362 | 350 | 4712 | 11 | 3948 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 1 | completed | 0.333 | 16344 | 592 | 16936 | 4 | 8335 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 2 | completed | 0.333 | 16344 | 617 | 16961 | 4 | 9689 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 3 | completed | 0.333 | 16344 | 592 | 16936 | 4 | 7438 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 4 | completed | 0.333 | 16344 | 610 | 16954 | 4 | 7999 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 5 | completed | 0.333 | 16344 | 601 | 16945 | 4 | 9026 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 4 | 10690 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 2 | completed | 0.333 | 28809 | 993 | 29802 | 4 | 12126 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 3 | completed | 0.333 | 28809 | 979 | 29788 | 4 | 12551 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 4 | completed | 0.333 | 28809 | 990 | 29799 | 4 | 12165 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 4 | 12974 | provider_failure |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48967 | 75 | 49042 | 0 | 1705 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 2 | completed | 0.667 | 48967 | 90 | 49057 | 0 | 3094 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48967 | 69 | 49036 | 0 | 1698 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48967 | 174 | 49141 | 0 | 3480 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 5 | completed | 0.667 | 48967 | 94 | 49061 | 0 | 2770 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 79762 | 895 | 80657 | 0 | 12438 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 79762 | 1047 | 80809 | 0 | 13821 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 79762 | 1212 | 80974 | 0 | 15468 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 79762 | 945 | 80707 | 0 | 12110 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 79762 | 813 | 80575 | 0 | 11423 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 1 | completed | 0.667 | 2508 | 399 | 2907 | 12 | 6461 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 2 | completed | 0.333 | 2508 | 461 | 2969 | 12 | 7217 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 3 | completed | 0.333 | 2508 | 542 | 3050 | 12 | 8511 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 4 | completed | 0.667 | 2508 | 433 | 2941 | 12 | 6066 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 2508 | 468 | 2976 | 12 | 7007 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 1 | completed | 0.000 | 4929 | 838 | 5767 | 12 | 13040 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 12058 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 3 | completed | 0.000 | 4929 | 963 | 5892 | 12 | 13088 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 4 | completed | 0.000 | 4929 | 939 | 5868 | 12 | 14721 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 5 | completed | 0.333 | 4929 | 1085 | 6014 | 12 | 13154 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 1 | completed | 0.000 | 13306 | 620 | 13926 | 4 | 10725 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 2 | completed | 0.333 | 13306 | 517 | 13823 | 4 | 8912 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 3 | completed | 0.333 | 13306 | 617 | 13923 | 4 | 9950 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 4 | completed | 0.000 | 13306 | 523 | 13829 | 4 | 8843 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 5 | completed | 0.000 | 13306 | 588 | 13894 | 4 | 9797 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 1 | completed | 0.333 | 23648 | 617 | 24265 | 4 | 8551 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 2 | completed | 0.333 | 23648 | 676 | 24324 | 4 | 9395 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 3 | completed | 0.333 | 23648 | 699 | 24347 | 4 | 9407 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 4 | completed | 0.333 | 23648 | 701 | 24349 | 4 | 9521 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 4 | 10922 | provider_failure |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 1 | completed | 0.667 | 48962 | 381 | 49343 | 0 | 7275 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 2 | completed | 0.667 | 48962 | 80 | 49042 | 0 | 2191 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 3 | completed | 0.667 | 48962 | 66 | 49028 | 0 | 2637 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 4 | completed | 0.667 | 48962 | 69 | 49031 | 0 | 2693 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 5 | completed | 0.667 | 48962 | 78 | 49040 | 0 | 3284 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 1 | completed | 0.667 | 79750 | 1107 | 80857 | 0 | 13806 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 12237 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 3 | completed | 0.667 | 79750 | 881 | 80631 | 0 | 10514 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 4 | completed | 0.667 | 79750 | 828 | 80578 | 0 | 9644 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 5 | completed | 0.667 | 79750 | 939 | 80689 | 0 | 12069 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 1 | completed | 0.667 | 2400 | 250 | 2650 | 13 | 4188 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 2 | completed | 0.667 | 2400 | 324 | 2724 | 13 | 6425 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 3 | completed | 0.667 | 2400 | 228 | 2628 | 13 | 4912 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 4 | completed | 0.667 | 2400 | 388 | 2788 | 13 | 5816 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 2400 | 418 | 2818 | 13 | 5963 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 1 | completed | 0.667 | 4787 | 767 | 5554 | 13 | 8664 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 2 | completed | 0.667 | 4787 | 798 | 5585 | 13 | 9707 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 3 | completed | 0.667 | 4787 | 574 | 5361 | 13 | 8517 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 4 | completed | 0.667 | 4787 | 460 | 5247 | 13 | 6441 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 5 | completed | 0.667 | 4787 | 700 | 5487 | 13 | 8036 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 1 | completed | 0.667 | 16486 | 338 | 16824 | 4 | 7026 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 2 | completed | 0.667 | 16486 | 501 | 16987 | 4 | 8578 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 3 | completed | 0.667 | 16486 | 266 | 16752 | 4 | 5281 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 4 | completed | 0.667 | 16486 | 267 | 16753 | 4 | 5104 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 5 | completed | 0.667 | 16486 | 343 | 16829 | 4 | 6348 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 4 | 10127 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 4 | 10295 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 4 | 13332 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 4 | 10552 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 29113 | 1069 | 30182 | 4 | 12152 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 48972 | 50 | 49022 | 0 | 1734 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 48972 | 50 | 49022 | 0 | 1697 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 48972 | 50 | 49022 | 0 | 1360 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 48972 | 50 | 49022 | 0 | 1298 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 48972 | 50 | 49022 | 0 | 1884 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 79773 | 448 | 80221 | 0 | 6963 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 79773 | 534 | 80307 | 0 | 6284 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 79773 | 273 | 80046 | 0 | 3827 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 79773 | 452 | 80225 | 0 | 5934 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 79773 | 375 | 80148 | 0 | 5284 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2489 | 149 | 2638 | 12 | 3164 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2489 | 129 | 2618 | 12 | 2755 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2489 | 119 | 2608 | 12 | 2439 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2489 | 100 | 2589 | 12 | 2579 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2489 | 114 | 2603 | 12 | 2478 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 4815 | 597 | 5412 | 12 | 5645 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 4815 | 667 | 5482 | 12 | 7426 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 4815 | 851 | 5666 | 12 | 8750 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 4815 | 685 | 5500 | 12 | 7850 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 4815 | 630 | 5445 | 12 | 6305 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 16183 | 118 | 16301 | 3 | 2656 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 16183 | 113 | 16296 | 3 | 3046 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 16183 | 125 | 16308 | 3 | 2682 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 16183 | 135 | 16318 | 3 | 2496 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 16183 | 113 | 16296 | 3 | 2225 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 28544 | 424 | 28968 | 3 | 5684 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 28544 | 345 | 28889 | 3 | 5886 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 28544 | 316 | 28860 | 3 | 5016 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 28544 | 468 | 29012 | 3 | 5674 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 28544 | 446 | 28990 | 3 | 6014 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 49006 | 165 | 49171 | 0 | 2758 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 49006 | 136 | 49142 | 0 | 2576 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 49006 | 167 | 49173 | 0 | 2838 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 49006 | 158 | 49164 | 0 | 48706 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 49006 | 140 | 49146 | 0 | 2491 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 79823 | 387 | 80210 | 0 | 6298 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 79823 | 375 | 80198 | 0 | 4826 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 79823 | 421 | 80244 | 0 | 6094 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 79823 | 340 | 80163 | 0 | 4842 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 79823 | 360 | 80183 | 0 | 5492 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 1 | completed | 0.600 | 4390 | 80 | 4470 | 13 | 2441 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 2 | completed | 0.600 | 4390 | 66 | 4456 | 13 | 2048 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 3 | completed | 0.833 | 4390 | 515 | 4905 | 13 | 7791 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 4 | completed | 0.000 | 4390 | 45 | 4435 | 13 | 1933 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 5 | completed | 0.000 | 4390 | 66 | 4456 | 13 | 4996 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 1 | completed | 0.833 | 7637 | 371 | 8008 | 13 | 5807 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 2 | completed | 0.727 | 7637 | 485 | 8122 | 13 | 6071 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 3 | completed | 0.833 | 7637 | 380 | 8017 | 13 | 4947 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 4 | completed | 0.833 | 7637 | 334 | 7971 | 13 | 4080 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 5 | completed | 0.833 | 7637 | 332 | 7969 | 13 | 5332 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 14487 | 68 | 14555 | 5 | 3486 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 14487 | 68 | 14555 | 5 | 3925 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 14487 | 68 | 14555 | 5 | 1767 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 14487 | 68 | 14555 | 5 | 2057 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 14487 | 68 | 14555 | 5 | 6822 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 26238 | 384 | 26622 | 5 | 4843 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 26238 | 336 | 26574 | 5 | 4263 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 26238 | 365 | 26603 | 5 | 4457 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 26238 | 358 | 26596 | 5 | 4520 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 26238 | 362 | 26600 | 5 | 4139 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 49005 | 173 | 49178 | 0 | 3078 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 49005 | 189 | 49194 | 0 | 3380 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 49005 | 178 | 49183 | 0 | 3579 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 49005 | 174 | 49179 | 0 | 19394 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 49005 | 173 | 49178 | 0 | 12177 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 79836 | 448 | 80284 | 0 | 6767 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 79836 | 392 | 80228 | 0 | 5731 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 79836 | 537 | 80373 | 0 | 5923 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 79836 | 412 | 80248 | 0 | 4861 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 79836 | 389 | 80225 | 0 | 4699 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 3246 | 144 | 3390 | 12 | 2662 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 3246 | 128 | 3374 | 12 | 7194 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 3246 | 131 | 3377 | 12 | 2238 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 3246 | 128 | 3374 | 12 | 2502 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 3246 | 122 | 3368 | 12 | 2370 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 6023 | 295 | 6318 | 12 | 3302 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 6023 | 298 | 6321 | 12 | 3258 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 6023 | 282 | 6305 | 12 | 3284 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 6023 | 292 | 6315 | 12 | 4040 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 6023 | 282 | 6305 | 12 | 3626 |  |
