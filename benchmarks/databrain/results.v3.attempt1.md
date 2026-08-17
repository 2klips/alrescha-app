# Data Brain efficacy benchmark

Full deterministic trial data: [./results.v3.real.json](./results.v3.real.json)

## Run contract

- Mode: `real`
- Schema version: `2`
- Generated: `2026-08-17T03:42:19.129Z`
- Manifest SHA-256: `7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7`
- Corpus commit: `294505ac3e69d03d2bee1c2d0e3b54892109643b`
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
| all models (pooled) | 200 | 0.81pp | [-4.41, 6.32] | 63.40% | [56.60, 68.84] | yes | no | yes | MET |
| gpt-5.6-luna | 100 | 0.63pp | [-8.08, 8.97] | 72.05% | [66.74, 76.50] | no | no | yes | NOT MET |
| claude-sonnet-5 | 100 | 1.00pp | [-5.41, 7.48] | 48.90% | [27.76, 62.37] | no | no | no | NOT MET |

- Pooled result: **MET**.

## Arm totals

| Model | Arm | Trials | Mean score | Mean 95% CI | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all models (pooled) | checkout | 200 | 0.624 | [0.56, 0.68] | 54.00% | 1127990 | 62364 | 1190354 | 1460 | 1208408 | 52 |
| all models (pooled) | full-dump | 200 | 0.517 | [0.45, 0.58] | 43.50% | 3389886 | 80419 | 3470305 | 0 | 2822613 | 55 |
| all models (pooled) | data-brain | 200 | 0.632 | [0.57, 0.69] | 52.00% | 378410 | 57246 | 435656 | 2240 | 846188 | 55 |
| gpt-5.6-luna | checkout | 100 | 0.764 | [0.69, 0.83] | 63.00% | 725509 | 19983 | 745492 | 730 | 650053 | 7 |
| gpt-5.6-luna | full-dump | 100 | 0.669 | [0.59, 0.75] | 59.00% | 2137536 | 20876 | 2158412 | 0 | 2114277 | 12 |
| gpt-5.6-luna | data-brain | 100 | 0.771 | [0.70, 0.84] | 61.00% | 191691 | 16644 | 208335 | 1120 | 395776 | 12 |
| claude-sonnet-5 | checkout | 100 | 0.483 | [0.39, 0.58] | 45.00% | 402481 | 42381 | 444862 | 730 | 558355 | 45 |
| claude-sonnet-5 | full-dump | 100 | 0.364 | [0.28, 0.45] | 28.00% | 1252350 | 59543 | 1311893 | 0 | 708336 | 43 |
| claude-sonnet-5 | data-brain | 100 | 0.493 | [0.40, 0.58] | 43.00% | 186719 | 40602 | 227321 | 1120 | 450412 | 43 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 1.000 | 25138 | 90 | 51915 | 0 |
| fixture-implement-remaining-session-ms | full-dump | 0.300 | 23508 | 0 | 109130 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 30246 | 100 | 64567 | 0 |
| fixture-implement-refresh-session | checkout | 1.000 | 25186 | 90 | 37296 | 0 |
| fixture-implement-refresh-session | full-dump | 0.100 | 24146 | 0 | 115143 | 0 |
| fixture-implement-refresh-session | data-brain | 1.000 | 29746 | 90 | 59540 | 0 |
| fixture-implement-github-login | checkout | 1.000 | 43885 | 90 | 60868 | 0 |
| fixture-implement-github-login | full-dump | 1.000 | 21109 | 0 | 92034 | 0 |
| fixture-implement-github-login | data-brain | 1.000 | 28846 | 100 | 54673 | 0 |
| fixture-implement-password-reset | checkout | 1.000 | 23345 | 90 | 82741 | 0 |
| fixture-implement-password-reset | full-dump | 1.000 | 20219 | 0 | 78223 | 0 |
| fixture-implement-password-reset | data-brain | 0.900 | 28649 | 100 | 70842 | 0 |
| fixture-answer-session-policy | checkout | 0.900 | 25276 | 90 | 43631 | 1 |
| fixture-answer-session-policy | full-dump | 0.867 | 16879 | 0 | 52326 | 0 |
| fixture-answer-session-policy | data-brain | 0.833 | 27685 | 90 | 50788 | 0 |
| fixture-answer-audit-schema | checkout | 0.900 | 32370 | 90 | 23163 | 1 |
| fixture-answer-audit-schema | full-dump | 0.300 | 7023 | 0 | 65616 | 4 |
| fixture-answer-audit-schema | data-brain | 1.000 | 24518 | 100 | 39544 | 0 |
| fixture-answer-api-rule-conflict | checkout | 1.000 | 33548 | 90 | 47369 | 0 |
| fixture-answer-api-rule-conflict | full-dump | 0.900 | 14395 | 0 | 49507 | 1 |
| fixture-answer-api-rule-conflict | data-brain | 1.000 | 24149 | 120 | 43699 | 0 |
| fixture-answer-legacy-billing | checkout | 0.667 | 19844 | 90 | 37731 | 1 |
| fixture-answer-legacy-billing | full-dump | 0.533 | 15903 | 0 | 41423 | 0 |
| fixture-answer-legacy-billing | data-brain | 0.600 | 19433 | 90 | 44190 | 1 |
| fixture-judge-auth-drift | checkout | 0.401 | 19857 | 90 | 65773 | 1 |
| fixture-judge-auth-drift | full-dump | 0.331 | 21383 | 0 | 83075 | 0 |
| fixture-judge-auth-drift | data-brain | 0.629 | 26382 | 110 | 58611 | 0 |
| fixture-judge-instruction-doc-drift | checkout | 0.000 | 43833 | 90 | 73685 | 1 |
| fixture-judge-instruction-doc-drift | full-dump | 0.000 | 17693 | 0 | 70588 | 1 |
| fixture-judge-instruction-doc-drift | data-brain | 0.400 | 24543 | 110 | 31018 | 0 |
| real-answer-github-permissions | checkout | 1.000 | 187168 | 70 | 28125 | 0 |
| real-answer-github-permissions | full-dump | 0.980 | 730481 | 0 | 84809 | 0 |
| real-answer-github-permissions | data-brain | 1.000 | 34367 | 130 | 23108 | 0 |
| real-answer-mcp-contract | checkout | 0.600 | 128064 | 30 | 193037 | 4 |
| real-answer-mcp-contract | full-dump | 0.900 | 676666 | 0 | 189822 | 1 |
| real-answer-mcp-contract | data-brain | 0.800 | 36366 | 120 | 41939 | 2 |
| real-answer-job-queue-claim | checkout | 0.475 | 129544 | 50 | 92291 | 3 |
| real-answer-job-queue-claim | full-dump | 0.525 | 439930 | 0 | 236707 | 4 |
| real-answer-job-queue-claim | data-brain | 0.500 | 14898 | 120 | 15725 | 5 |
| real-answer-graph-renderer | checkout | 0.500 | 73049 | 70 | 17584 | 5 |
| real-answer-graph-renderer | full-dump | 0.300 | 166154 | 0 | 236300 | 7 |
| real-answer-graph-renderer | data-brain | 0.400 | 23383 | 130 | 23251 | 6 |
| real-answer-receipt-statement | checkout | 0.500 | 79345 | 60 | 24510 | 5 |
| real-answer-receipt-statement | full-dump | 0.300 | 166606 | 0 | 261077 | 7 |
| real-answer-receipt-statement | data-brain | 0.300 | 7094 | 110 | 34837 | 7 |
| real-answer-credit-honesty | checkout | 0.333 | 77560 | 60 | 47108 | 5 |
| real-answer-credit-honesty | full-dump | 0.400 | 221857 | 0 | 193080 | 6 |
| real-answer-credit-honesty | data-brain | 0.267 | 11626 | 120 | 32740 | 6 |
| real-answer-index-pr-limits | checkout | 0.133 | 61337 | 60 | 105351 | 6 |
| real-answer-index-pr-limits | full-dump | 0.500 | 276745 | 0 | 192054 | 5 |
| real-answer-index-pr-limits | data-brain | 0.267 | 11148 | 130 | 32345 | 6 |
| real-answer-evidence-grade-rule | checkout | 0.067 | 15750 | 70 | 128927 | 9 |
| real-answer-evidence-grade-rule | full-dump | 0.400 | 221388 | 0 | 249354 | 6 |
| real-answer-evidence-grade-rule | data-brain | 0.300 | 7706 | 120 | 34789 | 7 |
| real-audit-mcp-tool-surface | checkout | 0.500 | 73745 | 30 | 37454 | 5 |
| real-audit-mcp-tool-surface | full-dump | 0.200 | 110912 | 0 | 274845 | 8 |
| real-audit-mcp-tool-surface | data-brain | 0.443 | 24871 | 130 | 20919 | 5 |
| real-audit-finding-taxonomy | checkout | 0.500 | 72510 | 60 | 9849 | 5 |
| real-audit-finding-taxonomy | full-dump | 0.500 | 277308 | 0 | 147500 | 5 |
| real-audit-finding-taxonomy | data-brain | 0.000 | 0 | 120 | 69063 | 10 |

## Every trial

| Task | Model | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1337 | 202 | 1539 | 9 | 3132 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1337 | 218 | 1555 | 9 | 3566 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1337 | 248 | 1585 | 9 | 4874 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1337 | 212 | 1549 | 9 | 3425 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1337 | 214 | 1551 | 9 | 3167 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2781 | 682 | 3463 | 9 | 6684 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2781 | 700 | 3481 | 9 | 6980 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2781 | 717 | 3498 | 9 | 7091 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2781 | 676 | 3457 | 9 | 6704 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2781 | 679 | 3460 | 9 | 6292 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 1 | completed | 0.000 | 720 | 609 | 1329 | 0 | 6535 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 720 | 621 | 1341 | 0 | 6389 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 3 | completed | 0.000 | 720 | 645 | 1365 | 0 | 6906 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 4 | completed | 0.000 | 720 | 360 | 1080 | 0 | 4456 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 720 | 543 | 1263 | 0 | 6000 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 1 | completed | 0.000 | 1811 | 1429 | 3240 | 0 | 14728 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 2 | completed | 0.000 | 1811 | 1593 | 3404 | 0 | 15506 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 3 | completed | 0.000 | 1811 | 1482 | 3293 | 0 | 14008 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 4 | completed | 0.000 | 1811 | 1810 | 3621 | 0 | 17424 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1811 | 1761 | 3572 | 0 | 17178 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1562 | 217 | 1779 | 10 | 3000 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1562 | 230 | 1792 | 10 | 3215 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1562 | 248 | 1810 | 10 | 3223 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1562 | 210 | 1772 | 10 | 2940 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1562 | 214 | 1776 | 10 | 3087 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3286 | 1082 | 4368 | 10 | 10221 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3286 | 872 | 4158 | 10 | 8721 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3286 | 979 | 4265 | 10 | 10470 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3286 | 904 | 4190 | 10 | 9170 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3286 | 1050 | 4336 | 10 | 10520 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1435 | 230 | 1665 | 9 | 2899 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1435 | 236 | 1671 | 9 | 2884 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1435 | 219 | 1654 | 9 | 2977 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1435 | 234 | 1669 | 9 | 3004 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1435 | 163 | 1598 | 9 | 2203 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2903 | 430 | 3333 | 9 | 4146 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2903 | 702 | 3605 | 9 | 6517 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2903 | 436 | 3339 | 9 | 4422 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2903 | 420 | 3323 | 9 | 4153 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2903 | 426 | 3329 | 9 | 4091 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 1 | completed | 0.000 | 731 | 493 | 1224 | 0 | 5062 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 731 | 695 | 1426 | 0 | 7481 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 3 | completed | 0.000 | 731 | 687 | 1418 | 0 | 7073 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 4 | completed | 0.000 | 731 | 724 | 1455 | 0 | 6882 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 5 | completed | 0.000 | 731 | 461 | 1192 | 0 | 4694 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 1 | completed | 0.000 | 1820 | 1805 | 3625 | 0 | 18091 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 2 | completed | 0.000 | 1820 | 1557 | 3377 | 0 | 15726 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 3 | completed | 0.000 | 1820 | 1696 | 3516 | 0 | 17385 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 4 | completed | 0.000 | 1820 | 1672 | 3492 | 0 | 16561 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 5 | completed | 0.000 | 1820 | 1601 | 3421 | 0 | 16188 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1583 | 224 | 1807 | 9 | 3499 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1583 | 216 | 1799 | 9 | 2944 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1583 | 221 | 1804 | 9 | 3401 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1583 | 222 | 1805 | 9 | 3086 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1583 | 221 | 1804 | 9 | 2677 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3291 | 1010 | 4301 | 9 | 9988 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3291 | 943 | 4234 | 9 | 9641 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3291 | 718 | 4009 | 9 | 7307 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3291 | 812 | 4103 | 9 | 8734 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3291 | 789 | 4080 | 9 | 8263 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2993 | 107 | 3100 | 9 | 2843 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2993 | 117 | 3110 | 9 | 2764 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2993 | 111 | 3104 | 9 | 2482 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2993 | 113 | 3106 | 9 | 2188 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2993 | 122 | 3115 | 9 | 2202 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 4840 | 811 | 5651 | 9 | 8744 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 4840 | 735 | 5575 | 9 | 7842 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 4840 | 1097 | 5937 | 9 | 12658 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 4840 | 739 | 5579 | 9 | 9556 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 4840 | 768 | 5608 | 9 | 9589 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 731 | 201 | 932 | 0 | 2846 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 731 | 213 | 944 | 0 | 3320 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 731 | 210 | 941 | 0 | 3154 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 731 | 180 | 911 | 0 | 2834 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 731 | 277 | 1008 | 0 | 3634 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1817 | 1664 | 3481 | 0 | 17138 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1817 | 1423 | 3240 | 0 | 14708 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1817 | 1479 | 3296 | 0 | 15648 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1817 | 1357 | 3174 | 0 | 13523 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1817 | 1365 | 3182 | 0 | 15229 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1608 | 226 | 1834 | 10 | 3438 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1608 | 218 | 1826 | 10 | 3290 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1608 | 204 | 1812 | 10 | 2997 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1608 | 234 | 1842 | 10 | 3614 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1608 | 185 | 1793 | 10 | 2892 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3245 | 611 | 3856 | 10 | 6397 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3245 | 734 | 3979 | 10 | 8175 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3245 | 772 | 4017 | 10 | 8978 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3245 | 640 | 3885 | 10 | 7018 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3245 | 757 | 4002 | 10 | 7874 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 929 | 330 | 1259 | 9 | 3803 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 929 | 247 | 1176 | 9 | 3034 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 929 | 239 | 1168 | 9 | 3052 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 929 | 307 | 1236 | 9 | 3680 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 929 | 262 | 1191 | 9 | 3332 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2183 | 1270 | 3453 | 9 | 13216 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2183 | 1438 | 3621 | 9 | 14087 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2183 | 1386 | 3569 | 9 | 14760 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2183 | 963 | 3146 | 9 | 9954 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2183 | 1343 | 3526 | 9 | 13823 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 754 | 259 | 1013 | 0 | 3564 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 754 | 226 | 980 | 0 | 3166 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 754 | 249 | 1003 | 0 | 3679 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 754 | 248 | 1002 | 0 | 3108 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 754 | 237 | 991 | 0 | 3070 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1855 | 1452 | 3307 | 0 | 14721 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1855 | 1018 | 2873 | 0 | 10908 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1855 | 1077 | 2932 | 0 | 10978 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1855 | 1473 | 3328 | 0 | 14476 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1855 | 935 | 2790 | 0 | 10553 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1462 | 199 | 1661 | 10 | 2888 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1462 | 225 | 1687 | 10 | 3528 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1462 | 232 | 1694 | 10 | 3255 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1462 | 223 | 1685 | 10 | 2941 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1462 | 234 | 1696 | 10 | 4261 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3023 | 1137 | 4160 | 10 | 12494 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3023 | 942 | 3965 | 10 | 9589 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3023 | 883 | 3906 | 10 | 9413 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3023 | 1006 | 4029 | 10 | 10800 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 5 | completed | 0.000 | 3023 | 1143 | 4166 | 10 | 11673 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1711 | 108 | 1819 | 9 | 1561 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1711 | 107 | 1818 | 9 | 1535 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1711 | 110 | 1821 | 9 | 1741 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1711 | 110 | 1821 | 9 | 1307 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1711 | 116 | 1827 | 9 | 1468 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 3314 | 802 | 4116 | 9 | 7525 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 3314 | 687 | 4001 | 9 | 7283 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 3314 | 768 | 4082 | 9 | 7008 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 9 | 7955 | provider_failure |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 3314 | 657 | 3971 | 9 | 6248 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 1 | completed | 0.667 | 704 | 81 | 785 | 0 | 3065 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 704 | 94 | 798 | 0 | 1638 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 3 | completed | 0.667 | 704 | 161 | 865 | 0 | 2523 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 704 | 128 | 832 | 0 | 1835 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 704 | 124 | 828 | 0 | 1760 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1783 | 896 | 2679 | 0 | 9394 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1783 | 619 | 2402 | 0 | 6751 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 3 | completed | 0.667 | 1783 | 913 | 2696 | 0 | 9377 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 4 | completed | 0.667 | 1783 | 517 | 2300 | 0 | 6838 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1783 | 911 | 2694 | 0 | 9145 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1447 | 107 | 1554 | 9 | 1946 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 2 | completed | 0.667 | 1447 | 105 | 1552 | 9 | 1750 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 3 | completed | 0.667 | 1447 | 89 | 1536 | 9 | 1482 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 4 | completed | 0.667 | 1447 | 104 | 1551 | 9 | 1584 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1447 | 138 | 1585 | 9 | 2155 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 1 | completed | 0.667 | 3079 | 890 | 3969 | 9 | 8498 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3079 | 941 | 4020 | 9 | 8533 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3079 | 791 | 3870 | 9 | 7195 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 4 | completed | 0.667 | 3079 | 1033 | 4112 | 9 | 9465 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3079 | 857 | 3936 | 9 | 8180 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2738 | 40 | 2778 | 9 | 1106 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2738 | 40 | 2778 | 9 | 1307 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2738 | 43 | 2781 | 9 | 1458 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2738 | 40 | 2778 | 9 | 1140 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2738 | 44 | 2782 | 9 | 1237 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 4337 | 299 | 4636 | 9 | 3735 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 9 | 3071 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 4337 | 258 | 4595 | 9 | 3060 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 4337 | 270 | 4607 | 9 | 3799 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 4337 | 298 | 4635 | 9 | 3250 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 1 | completed | 0.500 | 702 | 164 | 866 | 0 | 2225 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 2 | completed | 0.500 | 702 | 184 | 886 | 0 | 2320 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 3 | completed | 0.500 | 702 | 168 | 870 | 0 | 2243 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 4 | completed | 0.500 | 702 | 142 | 844 | 0 | 2057 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 5 | completed | 0.500 | 702 | 156 | 858 | 0 | 2331 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 9693 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 12531 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 11477 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 10746 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 5 | completed | 0.500 | 1772 | 927 | 2699 | 0 | 9993 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1377 | 42 | 1419 | 10 | 1468 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1377 | 43 | 1420 | 10 | 1595 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1377 | 43 | 1420 | 10 | 971 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1377 | 43 | 1420 | 10 | 981 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1377 | 42 | 1419 | 10 | 1344 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2844 | 752 | 3596 | 10 | 8113 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2844 | 562 | 3406 | 10 | 5651 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2844 | 568 | 3412 | 10 | 6350 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2844 | 624 | 3468 | 10 | 6429 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2844 | 694 | 3538 | 10 | 6642 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2160 | 124 | 2284 | 9 | 1649 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2160 | 103 | 2263 | 9 | 1460 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2160 | 126 | 2286 | 9 | 1626 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2160 | 124 | 2284 | 9 | 1731 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2160 | 129 | 2289 | 9 | 1700 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 3681 | 679 | 4360 | 9 | 7169 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 3681 | 732 | 4413 | 9 | 7459 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 3681 | 892 | 4573 | 9 | 9718 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 3681 | 699 | 4380 | 9 | 7396 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 3681 | 735 | 4416 | 9 | 7461 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 703 | 125 | 828 | 0 | 1504 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 703 | 140 | 843 | 0 | 1706 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 703 | 205 | 908 | 0 | 2522 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 703 | 171 | 874 | 0 | 2278 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 703 | 87 | 790 | 0 | 1409 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1784 | 630 | 2414 | 0 | 7252 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1784 | 926 | 2710 | 0 | 10108 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 7682 | provider_failure |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1784 | 729 | 2513 | 0 | 7402 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1784 | 731 | 2515 | 0 | 7644 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1271 | 129 | 1400 | 12 | 1910 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1271 | 127 | 1398 | 12 | 2113 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1271 | 123 | 1394 | 12 | 1853 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1271 | 144 | 1415 | 12 | 2099 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1271 | 142 | 1413 | 12 | 1940 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2751 | 628 | 3379 | 12 | 6254 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2751 | 698 | 3449 | 12 | 7306 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2751 | 615 | 3366 | 12 | 6621 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2751 | 603 | 3354 | 12 | 5770 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2751 | 830 | 3581 | 12 | 7833 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 1 | completed | 0.333 | 1313 | 77 | 1390 | 9 | 1371 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 2 | completed | 0.667 | 1313 | 77 | 1390 | 9 | 1453 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 3 | completed | 0.333 | 1313 | 73 | 1386 | 9 | 1485 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 4 | completed | 0.667 | 1313 | 128 | 1441 | 9 | 1954 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 5 | completed | 0.667 | 1313 | 146 | 1459 | 9 | 2263 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2699 | 595 | 3294 | 9 | 6445 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2699 | 550 | 3249 | 9 | 5871 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2699 | 404 | 3103 | 9 | 4588 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2699 | 433 | 3132 | 9 | 5199 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 9 | 7102 | provider_failure |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 1 | completed | 0.333 | 700 | 136 | 836 | 0 | 2111 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 2 | completed | 0.333 | 700 | 131 | 831 | 0 | 2069 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 3 | completed | 0.667 | 700 | 182 | 882 | 0 | 2318 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 4 | completed | 0.333 | 700 | 144 | 844 | 0 | 1933 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 5 | completed | 0.333 | 700 | 174 | 874 | 0 | 2122 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 1 | completed | 0.667 | 1772 | 598 | 2370 | 0 | 6145 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 2 | completed | 0.667 | 1772 | 530 | 2302 | 0 | 6132 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 3 | completed | 0.667 | 1772 | 591 | 2363 | 0 | 6603 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 4 | completed | 0.667 | 1772 | 565 | 2337 | 0 | 6460 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 5 | completed | 0.667 | 1772 | 492 | 2264 | 0 | 5530 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 1 | completed | 0.333 | 1188 | 95 | 1283 | 9 | 1989 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 2 | completed | 0.333 | 1188 | 85 | 1273 | 9 | 1793 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1188 | 150 | 1338 | 9 | 2025 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 4 | completed | 0.333 | 1188 | 82 | 1270 | 9 | 1454 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 5 | completed | 0.333 | 1188 | 132 | 1320 | 9 | 1965 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 1 | completed | 0.667 | 2604 | 547 | 3151 | 9 | 6030 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 9 | 7400 | provider_failure |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2604 | 612 | 3216 | 9 | 6246 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2604 | 748 | 3352 | 9 | 7827 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2604 | 626 | 3230 | 9 | 7461 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 1 | completed | 0.286 | 1057 | 92 | 1149 | 9 | 1640 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 2 | completed | 0.667 | 1057 | 577 | 1634 | 9 | 6501 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 3 | completed | 0.667 | 1057 | 120 | 1177 | 9 | 2097 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 4 | completed | 0.286 | 1057 | 102 | 1159 | 9 | 1661 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 5 | completed | 0.286 | 1057 | 83 | 1140 | 9 | 1918 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 1 | completed | 0.500 | 2378 | 1059 | 3437 | 9 | 10731 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 9 | 10781 | provider_failure |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 3 | completed | 0.250 | 2378 | 1055 | 3433 | 9 | 11048 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 4 | completed | 0.571 | 2378 | 990 | 3368 | 9 | 9926 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 5 | completed | 0.500 | 2378 | 982 | 3360 | 9 | 9470 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 1 | completed | 0.333 | 760 | 627 | 1387 | 0 | 6741 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 2 | completed | 0.500 | 760 | 616 | 1376 | 0 | 6466 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 3 | completed | 0.250 | 760 | 545 | 1305 | 0 | 5492 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 4 | completed | 0.667 | 760 | 530 | 1290 | 0 | 5287 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 5 | completed | 0.333 | 760 | 573 | 1333 | 0 | 5825 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 1 | completed | 0.222 | 1877 | 1064 | 2941 | 0 | 10724 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 2 | completed | 0.200 | 1877 | 1097 | 2974 | 0 | 11457 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 3 | completed | 0.182 | 1877 | 1019 | 2896 | 0 | 9977 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 4 | completed | 0.182 | 1877 | 1025 | 2902 | 0 | 10407 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 5 | completed | 0.444 | 1877 | 1102 | 2979 | 0 | 10699 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 1 | completed | 0.667 | 1313 | 559 | 1872 | 11 | 5914 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 2 | completed | 0.800 | 1313 | 253 | 1566 | 11 | 3229 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 3 | completed | 0.667 | 1313 | 429 | 1742 | 11 | 4932 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 4 | completed | 0.667 | 1313 | 359 | 1672 | 11 | 4307 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 1313 | 378 | 1691 | 11 | 4385 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 1 | completed | 0.667 | 2837 | 687 | 3524 | 11 | 6747 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 2 | completed | 0.571 | 2837 | 673 | 3510 | 11 | 6572 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 3 | completed | 0.444 | 2837 | 818 | 3655 | 11 | 8014 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 4 | completed | 0.571 | 2837 | 713 | 3550 | 11 | 6977 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 5 | completed | 0.571 | 2837 | 763 | 3600 | 11 | 7534 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 1 | completed | 0.000 | 3308 | 581 | 3889 | 9 | 6210 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 2 | completed | 0.000 | 3308 | 559 | 3867 | 9 | 7363 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 3 | completed | 0.000 | 3308 | 962 | 4270 | 9 | 9898 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 4 | completed | 0.000 | 3308 | 568 | 3876 | 9 | 6243 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 5 | completed | 0.000 | 3308 | 560 | 3868 | 9 | 6133 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 1 | completed | 0.000 | 5260 | 693 | 5953 | 9 | 6818 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 9 | 8278 | provider_failure |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 3 | completed | 0.000 | 5260 | 758 | 6018 | 9 | 7495 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 4 | completed | 0.000 | 5260 | 727 | 5987 | 9 | 7183 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 5 | completed | 0.000 | 5260 | 845 | 6105 | 9 | 8064 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 1 | completed | 0.000 | 754 | 371 | 1125 | 0 | 3882 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 2 | completed | 0.000 | 754 | 501 | 1255 | 0 | 5134 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 3 | completed | 0.000 | 754 | 468 | 1222 | 0 | 4678 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 4 | completed | 0.000 | 754 | 604 | 1358 | 0 | 5527 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 5 | completed | 0.000 | 754 | 633 | 1387 | 0 | 5854 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 1 | completed | 0.000 | 1868 | 878 | 2746 | 0 | 8340 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 2 | completed | 0.000 | 1868 | 1026 | 2894 | 0 | 10021 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 3 | completed | 0.000 | 1868 | 1106 | 2974 | 0 | 10246 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 4 | completed | 0.000 | 1868 | 864 | 2732 | 0 | 8677 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 8229 | provider_failure |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 1 | completed | 0.000 | 1419 | 125 | 1544 | 11 | 2288 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 2 | completed | 0.500 | 1419 | 100 | 1519 | 11 | 1907 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1419 | 149 | 1568 | 11 | 2214 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1419 | 128 | 1547 | 11 | 1882 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 5 | completed | 0.000 | 1419 | 137 | 1556 | 11 | 1919 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 1 | completed | 0.000 | 2990 | 360 | 3350 | 11 | 4441 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 2 | completed | 0.000 | 2990 | 408 | 3398 | 11 | 4126 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 3 | completed | 0.500 | 2990 | 422 | 3412 | 11 | 4893 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 4 | completed | 0.500 | 2990 | 311 | 3301 | 11 | 3414 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 5 | completed | 0.500 | 2990 | 358 | 3348 | 11 | 3934 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 13269 | 155 | 13424 | 7 | 2362 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 13269 | 130 | 13399 | 7 | 2112 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 13269 | 100 | 13369 | 7 | 1501 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 13269 | 173 | 13442 | 7 | 2055 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 13269 | 107 | 13376 | 7 | 1922 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 23701 | 224 | 23925 | 7 | 2587 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 23701 | 361 | 24062 | 7 | 3816 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 23701 | 372 | 24073 | 7 | 4143 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 23701 | 353 | 24054 | 7 | 3828 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 23701 | 343 | 24044 | 7 | 3799 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55290 | 60 | 55350 | 0 | 1615 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55290 | 50 | 55340 | 0 | 1415 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55290 | 60 | 55350 | 0 | 1338 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55290 | 44 | 55334 | 0 | 22737 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55290 | 52 | 55342 | 0 | 21853 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 1 | completed | 0.800 | 90182 | 506 | 90688 | 0 | 6308 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 90182 | 615 | 90797 | 0 | 7411 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 90182 | 498 | 90680 | 0 | 6367 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 90182 | 388 | 90570 | 0 | 6177 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 90182 | 848 | 91030 | 0 | 9588 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2127 | 43 | 2170 | 13 | 1155 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2127 | 49 | 2176 | 13 | 1254 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2127 | 49 | 2176 | 13 | 1123 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2127 | 49 | 2176 | 13 | 1370 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2127 | 49 | 2176 | 13 | 1191 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 4359 | 325 | 4684 | 13 | 3196 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 4359 | 374 | 4733 | 13 | 3537 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 4359 | 340 | 4699 | 13 | 3266 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 4359 | 353 | 4712 | 13 | 3835 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 4359 | 306 | 4665 | 13 | 3181 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 3 | 24236 | provider_failure |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 14627 | 269 | 14896 | 3 | 20303 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 3 | 26534 | provider_failure |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 14627 | 272 | 14899 | 3 | 18492 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 14627 | 195 | 14822 | 3 | 8084 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 25936 | 1765 | 27701 | 3 | 18061 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 25936 | 2059 | 27995 | 3 | 20836 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 3 | 21316 | provider_failure |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 25936 | 1815 | 27751 | 3 | 18894 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 3 | 16281 | provider_failure |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55268 | 104 | 55372 | 0 | 1770 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55268 | 98 | 55366 | 0 | 14679 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 67621 | provider_failure |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55268 | 95 | 55363 | 0 | 12710 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55268 | 95 | 55363 | 0 | 44786 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 90157 | 808 | 90965 | 0 | 9024 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 90157 | 1170 | 91327 | 0 | 13418 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 90157 | 1119 | 91276 | 0 | 11484 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 90157 | 688 | 90845 | 0 | 7323 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 90157 | 632 | 90789 | 0 | 7007 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 3261 | 55 | 3316 | 12 | 1390 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 3261 | 55 | 3316 | 12 | 1082 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 3261 | 67 | 3328 | 12 | 1402 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 3261 | 55 | 3316 | 12 | 1308 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 3261 | 63 | 3324 | 12 | 1520 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 7850 | provider_failure |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 5926 | 608 | 6534 | 12 | 6981 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 5926 | 798 | 6724 | 12 | 8826 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 4882 | provider_failure |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 5926 | 582 | 6508 | 12 | 6698 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 1 | completed | 0.750 | 14744 | 257 | 15001 | 5 | 3688 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 2 | completed | 0.500 | 14744 | 568 | 15312 | 5 | 7583 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 3 | completed | 0.750 | 14744 | 357 | 15101 | 5 | 18851 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 4 | completed | 0.500 | 14744 | 330 | 15074 | 5 | 3680 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 5 | completed | 0.750 | 14744 | 232 | 14976 | 5 | 8681 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 5 | 9595 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 2 | completed | 0.750 | 26138 | 893 | 27031 | 5 | 9734 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 5 | 9578 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 5 | 11250 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 5 | completed | 0.750 | 26138 | 911 | 27049 | 5 | 9651 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 76538 | provider_failure |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 72732 | provider_failure |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55299 | 163 | 55462 | 0 | 5416 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55299 | 175 | 55474 | 0 | 5427 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55299 | 229 | 55528 | 0 | 33961 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 90200 | 1049 | 91249 | 0 | 12294 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 2 | completed | 0.500 | 90200 | 814 | 91014 | 0 | 9664 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 9016 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 4 | completed | 0.750 | 90200 | 1003 | 91203 | 0 | 11116 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 543 | provider_failure |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2798 | 182 | 2980 | 12 | 2633 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2798 | 155 | 2953 | 12 | 2565 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2798 | 170 | 2968 | 12 | 2144 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2798 | 219 | 3017 | 12 | 2695 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2798 | 182 | 2980 | 12 | 4283 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 288 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 290 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 12 | 269 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 288 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 12 | 270 | provider_failure |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 14495 | 132 | 14627 | 7 | 2185 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 14495 | 110 | 14605 | 7 | 1978 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 14495 | 118 | 14613 | 7 | 1585 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 14495 | 107 | 14602 | 7 | 1682 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 14495 | 107 | 14602 | 7 | 8789 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 7 | 272 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 7 | 273 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 7 | 271 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 7 | 274 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 7 | 275 | provider_failure |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 68387 | provider_failure |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55285 | 119 | 55404 | 0 | 16441 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55285 | 75 | 55360 | 0 | 13349 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 71693 | provider_failure |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55285 | 105 | 55390 | 0 | 64743 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 585 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 296 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 299 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 246 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 261 | provider_failure |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 13 | 13243 | provider_failure |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 5728 | 125 | 5853 | 13 | 3323 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 5728 | 106 | 5834 | 13 | 1855 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 5728 | 116 | 5844 | 13 | 1702 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 5728 | 124 | 5852 | 13 | 1589 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 13 | 404 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 13 | 318 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 13 | 260 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 13 | 288 | provider_failure |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 13 | 269 | provider_failure |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 15742 | 125 | 15867 | 6 | 3194 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 15742 | 85 | 15827 | 6 | 5115 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 15742 | 131 | 15873 | 6 | 4387 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 15742 | 159 | 15901 | 6 | 5551 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 15742 | 135 | 15877 | 6 | 4728 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 6 | 425 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 6 | 269 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 6 | 306 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 6 | 268 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 6 | 267 | provider_failure |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55288 | 257 | 55545 | 0 | 19263 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 82067 | provider_failure |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55288 | 225 | 55513 | 0 | 40763 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55288 | 260 | 55548 | 0 | 34365 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 82375 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 579 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 487 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 309 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 311 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 558 | provider_failure |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 11 | 8733 | provider_failure |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 11 | 8837 | provider_failure |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2203 | 178 | 2381 | 11 | 6957 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2203 | 169 | 2372 | 11 | 6892 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2203 | 138 | 2341 | 11 | 1804 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 11 | 365 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 11 | 416 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 11 | 276 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 11 | 275 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 11 | 282 | provider_failure |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 1 | completed | 0.667 | 15041 | 489 | 15530 | 6 | 7333 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 2 | completed | 0.667 | 15041 | 388 | 15429 | 6 | 5806 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 3 | completed | 0.667 | 15041 | 457 | 15498 | 6 | 9743 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 4 | completed | 0.667 | 15041 | 520 | 15561 | 6 | 9136 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 5 | completed | 0.667 | 15041 | 501 | 15542 | 6 | 12638 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 6 | 427 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 6 | 904 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 6 | 499 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 6 | 316 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 6 | 306 | provider_failure |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55292 | 180 | 55472 | 0 | 22006 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55292 | 168 | 55460 | 0 | 21423 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 66234 | provider_failure |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55292 | 170 | 55462 | 0 | 45322 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55292 | 171 | 55463 | 0 | 36529 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 483 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 287 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 296 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 248 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 252 | provider_failure |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 8237 | provider_failure |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 2 | completed | 0.667 | 2505 | 311 | 2816 | 12 | 8290 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 3 | completed | 0.667 | 2505 | 546 | 3051 | 12 | 5926 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 4 | completed | 0.667 | 2505 | 424 | 2929 | 12 | 4767 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 2505 | 325 | 2830 | 12 | 4013 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 356 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 287 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 12 | 271 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 269 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 12 | 324 | provider_failure |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 1 | completed | 0.333 | 14878 | 443 | 15321 | 6 | 29855 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 6 | 24311 | provider_failure |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 3 | completed | 0.333 | 14878 | 447 | 15325 | 6 | 23138 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 4 | completed | 0.333 | 14878 | 334 | 15212 | 6 | 15488 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 5 | completed | 0.333 | 14878 | 601 | 15479 | 6 | 10977 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 6 | 436 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 6 | 273 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 6 | 320 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 6 | 271 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 6 | 282 | provider_failure |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55287 | 66 | 55353 | 0 | 60360 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55287 | 56 | 55343 | 0 | 58045 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55287 | 66 | 55353 | 0 | 18122 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55287 | 56 | 55343 | 0 | 16316 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55287 | 66 | 55353 | 0 | 36928 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 496 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 287 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 440 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 437 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 623 | provider_failure |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 13 | 8193 | provider_failure |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 2 | completed | 0.667 | 2400 | 532 | 2932 | 13 | 10580 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 3 | completed | 0.667 | 2400 | 411 | 2811 | 13 | 4822 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 4 | completed | 0.667 | 2400 | 357 | 2757 | 13 | 4143 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 2400 | 248 | 2648 | 13 | 3094 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 13 | 374 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 13 | 277 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 13 | 318 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 13 | 269 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 13 | 275 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 7 | 28525 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 7 | 28685 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 7 | 28845 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 7 | 28315 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 5 | completed | 0.667 | 15431 | 319 | 15750 | 7 | 12690 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 7 | 442 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 7 | 434 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 7 | 303 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 7 | 410 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 7 | 278 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55297 | 52 | 55349 | 0 | 42206 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55297 | 50 | 55347 | 0 | 41765 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 73861 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55297 | 52 | 55349 | 0 | 14145 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55297 | 46 | 55343 | 0 | 74762 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 552 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 590 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 316 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 840 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 317 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 8196 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 8899 | provider_failure |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2465 | 101 | 2566 | 12 | 8004 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2465 | 114 | 2579 | 12 | 6732 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2465 | 96 | 2561 | 12 | 1394 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 377 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 270 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 12 | 269 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 346 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 12 | 302 | provider_failure |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 14690 | 59 | 14749 | 3 | 4942 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 14690 | 59 | 14749 | 3 | 5000 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 14690 | 59 | 14749 | 3 | 8172 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 14690 | 59 | 14749 | 3 | 8185 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 14690 | 59 | 14749 | 3 | 9201 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 3 | 420 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 3 | 644 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 3 | 307 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 3 | 286 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 3 | 297 | provider_failure |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55331 | 128 | 55459 | 0 | 25469 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 74337 | provider_failure |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 71749 | provider_failure |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55331 | 122 | 55453 | 0 | 33191 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 68358 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 495 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 284 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 432 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 279 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 251 | provider_failure |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 1 | completed | 0.833 | 4615 | 275 | 4890 | 13 | 3388 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 4615 | 577 | 5192 | 13 | 5529 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 3 | completed | 0.833 | 4615 | 113 | 4728 | 13 | 1638 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 4 | completed | 0.933 | 4615 | 541 | 5156 | 13 | 5499 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 5 | completed | 0.833 | 4615 | 290 | 4905 | 13 | 3335 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 13 | 382 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 13 | 255 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 13 | 257 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 13 | 248 | provider_failure |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 13 | 388 | provider_failure |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 14375 | 148 | 14523 | 6 | 1855 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 14375 | 115 | 14490 | 6 | 1456 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 14375 | 125 | 14500 | 6 | 1621 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 14375 | 146 | 14521 | 6 | 1711 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 14375 | 101 | 14476 | 6 | 1420 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 6 | 255 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 6 | 312 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 6 | 445 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 6 | 466 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 6 | 308 | provider_failure |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55330 | 147 | 55477 | 0 | 22184 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55330 | 126 | 55456 | 0 | 22957 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55330 | 129 | 55459 | 0 | 22005 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55330 | 128 | 55458 | 0 | 10392 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55330 | 128 | 55458 | 0 | 66859 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 565 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 548 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 305 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 583 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 1102 | provider_failure |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 13292 | provider_failure |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 13135 | provider_failure |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 12 | 13190 | provider_failure |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 14413 | provider_failure |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 12 | 13447 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 402 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 265 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 12 | 386 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 272 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 12 | 261 | provider_failure |
