# Data Brain efficacy benchmark

Full deterministic trial data: [./results.v3.real.json](./results.v3.real.json)

## Run contract

- Mode: `real`
- Schema version: `2`
- Generated: `2026-08-17T05:56:50.690Z`
- Manifest SHA-256: `7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7`
- Corpus commit: `4d37e0f3fc548166cf583c90a4f1829e8e727d35`
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
| all models (pooled) | 200 | 4.23pp | [-0.20, 8.73] | 67.14% | [63.07, 70.82] | yes | no | yes | MET |
| gpt-5.6-luna | 100 | 9.33pp | [5.39, 13.95] | 71.11% | [68.03, 73.79] | yes | yes | yes | MET |
| claude-sonnet-5 | 100 | -0.88pp | [-8.70, 7.40] | 64.34% | [56.49, 70.03] | no | no | yes | NOT MET |

- Pooled result: **MET**.

## Arm totals

| Model | Arm | Trials | Mean score | Mean 95% CI | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all models (pooled) | checkout | 200 | 0.794 | [0.75, 0.84] | 67.50% | 1989627 | 80649 | 2070276 | 1460 | 1112116 | 14 |
| all models (pooled) | full-dump | 200 | 0.734 | [0.68, 0.79] | 64.50% | 6847576 | 101681 | 6949257 | 0 | 1837200 | 13 |
| all models (pooled) | data-brain | 200 | 0.836 | [0.79, 0.88] | 68.00% | 600509 | 79847 | 680356 | 2240 | 1018485 | 13 |
| gpt-5.6-luna | checkout | 100 | 0.823 | [0.77, 0.88] | 66.00% | 831365 | 23476 | 854841 | 730 | 343247 | 0 |
| gpt-5.6-luna | full-dump | 100 | 0.779 | [0.70, 0.85] | 70.00% | 2801130 | 22823 | 2823953 | 0 | 863515 | 0 |
| gpt-5.6-luna | data-brain | 100 | 0.916 | [0.88, 0.94] | 73.00% | 228285 | 18693 | 246978 | 1120 | 267005 | 0 |
| claude-sonnet-5 | checkout | 100 | 0.765 | [0.68, 0.84] | 69.00% | 1158262 | 57173 | 1215435 | 730 | 768869 | 14 |
| claude-sonnet-5 | full-dump | 100 | 0.689 | [0.60, 0.77] | 59.00% | 4046446 | 78858 | 4125304 | 0 | 973685 | 13 |
| claude-sonnet-5 | data-brain | 100 | 0.756 | [0.68, 0.83] | 63.00% | 372224 | 61154 | 433378 | 1120 | 751480 | 13 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 1.000 | 25745 | 90 | 57697 | 0 |
| fixture-implement-remaining-session-ms | full-dump | 0.400 | 23220 | 0 | 107524 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 29888 | 100 | 62294 | 0 |
| fixture-implement-refresh-session | checkout | 1.000 | 24973 | 90 | 36015 | 0 |
| fixture-implement-refresh-session | full-dump | 0.100 | 24606 | 0 | 117108 | 0 |
| fixture-implement-refresh-session | data-brain | 1.000 | 30240 | 90 | 74904 | 0 |
| fixture-implement-github-login | checkout | 1.000 | 44115 | 90 | 61218 | 0 |
| fixture-implement-github-login | full-dump | 1.000 | 20828 | 0 | 90538 | 0 |
| fixture-implement-github-login | data-brain | 1.000 | 29468 | 100 | 61781 | 0 |
| fixture-implement-password-reset | checkout | 1.000 | 23415 | 90 | 81497 | 0 |
| fixture-implement-password-reset | full-dump | 1.000 | 20207 | 0 | 78094 | 0 |
| fixture-implement-password-reset | data-brain | 0.800 | 25645 | 100 | 86561 | 1 |
| fixture-answer-session-policy | checkout | 1.000 | 29056 | 90 | 41766 | 0 |
| fixture-answer-session-policy | full-dump | 0.833 | 16808 | 0 | 51619 | 0 |
| fixture-answer-session-policy | data-brain | 0.933 | 27804 | 90 | 53812 | 0 |
| fixture-answer-audit-schema | checkout | 1.000 | 36946 | 90 | 23263 | 0 |
| fixture-answer-audit-schema | full-dump | 0.350 | 12634 | 0 | 73614 | 2 |
| fixture-answer-audit-schema | data-brain | 1.000 | 24333 | 100 | 38288 | 0 |
| fixture-answer-api-rule-conflict | checkout | 0.900 | 29067 | 90 | 46882 | 1 |
| fixture-answer-api-rule-conflict | full-dump | 0.900 | 13969 | 0 | 44153 | 1 |
| fixture-answer-api-rule-conflict | data-brain | 1.000 | 24204 | 120 | 46316 | 0 |
| fixture-answer-legacy-billing | checkout | 0.800 | 22753 | 90 | 33359 | 0 |
| fixture-answer-legacy-billing | full-dump | 0.467 | 13861 | 0 | 53741 | 1 |
| fixture-answer-legacy-billing | data-brain | 0.767 | 22449 | 90 | 43183 | 0 |
| fixture-judge-auth-drift | checkout | 0.424 | 20111 | 90 | 71457 | 1 |
| fixture-judge-auth-drift | full-dump | 0.394 | 20575 | 0 | 73907 | 0 |
| fixture-judge-auth-drift | data-brain | 0.593 | 25900 | 110 | 56506 | 0 |
| fixture-judge-instruction-doc-drift | checkout | 0.000 | 44193 | 90 | 80975 | 1 |
| fixture-judge-instruction-doc-drift | full-dump | 0.000 | 12637 | 0 | 78874 | 3 |
| fixture-judge-instruction-doc-drift | data-brain | 0.500 | 24638 | 110 | 31339 | 0 |
| real-answer-github-permissions | checkout | 1.000 | 187483 | 70 | 33096 | 0 |
| real-answer-github-permissions | full-dump | 0.980 | 730020 | 0 | 54175 | 0 |
| real-answer-github-permissions | data-brain | 1.000 | 34340 | 130 | 23884 | 0 |
| real-answer-mcp-contract | checkout | 0.783 | 157840 | 30 | 125388 | 2 |
| real-answer-mcp-contract | full-dump | 1.000 | 731278 | 0 | 95915 | 0 |
| real-answer-mcp-contract | data-brain | 0.800 | 36246 | 120 | 37539 | 2 |
| real-answer-job-queue-claim | checkout | 0.700 | 184277 | 50 | 77208 | 1 |
| real-answer-job-queue-claim | full-dump | 0.950 | 733768 | 0 | 109026 | 0 |
| real-answer-job-queue-claim | data-brain | 1.000 | 47801 | 120 | 71702 | 0 |
| real-answer-graph-renderer | checkout | 1.000 | 198163 | 70 | 30086 | 0 |
| real-answer-graph-renderer | full-dump | 1.000 | 729532 | 0 | 86158 | 0 |
| real-answer-graph-renderer | data-brain | 1.000 | 82013 | 130 | 47543 | 0 |
| real-answer-receipt-statement | checkout | 1.000 | 216178 | 60 | 38496 | 0 |
| real-answer-receipt-statement | full-dump | 0.800 | 641353 | 0 | 166993 | 1 |
| real-answer-receipt-statement | data-brain | 1.000 | 35399 | 110 | 32342 | 0 |
| real-answer-credit-honesty | checkout | 0.400 | 104888 | 60 | 83820 | 4 |
| real-answer-credit-honesty | full-dump | 1.000 | 734014 | 0 | 120899 | 0 |
| real-answer-credit-honesty | data-brain | 0.433 | 27164 | 120 | 91265 | 3 |
| real-answer-index-pr-limits | checkout | 0.233 | 129675 | 60 | 70612 | 3 |
| real-answer-index-pr-limits | full-dump | 1.000 | 732368 | 0 | 94668 | 0 |
| real-answer-index-pr-limits | data-brain | 0.533 | 29623 | 130 | 56505 | 2 |
| real-answer-evidence-grade-rule | checkout | 0.633 | 183960 | 70 | 65865 | 1 |
| real-answer-evidence-grade-rule | full-dump | 1.000 | 729936 | 0 | 70520 | 0 |
| real-answer-evidence-grade-rule | data-brain | 1.000 | 39881 | 120 | 44760 | 0 |
| real-audit-mcp-tool-surface | checkout | 1.000 | 205497 | 30 | 23944 | 0 |
| real-audit-mcp-tool-surface | full-dump | 1.000 | 730360 | 0 | 126024 | 0 |
| real-audit-mcp-tool-surface | data-brain | 0.859 | 66034 | 130 | 47805 | 0 |
| real-audit-finding-taxonomy | checkout | 1.000 | 201941 | 60 | 29472 | 0 |
| real-audit-finding-taxonomy | full-dump | 0.500 | 277283 | 0 | 143650 | 5 |
| real-audit-finding-taxonomy | data-brain | 0.500 | 17286 | 120 | 10156 | 5 |

## Every trial

| Task | Model | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1337 | 220 | 1557 | 9 | 5272 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1337 | 222 | 1559 | 9 | 5254 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1337 | 238 | 1575 | 9 | 2625 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1337 | 210 | 1547 | 9 | 2858 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1337 | 239 | 1576 | 9 | 3221 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2781 | 785 | 3566 | 9 | 7876 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2781 | 740 | 3521 | 9 | 7043 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2781 | 852 | 3633 | 9 | 7897 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2781 | 827 | 3608 | 9 | 7964 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2781 | 822 | 3603 | 9 | 7687 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 720 | 459 | 1179 | 0 | 5348 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 2 | completed | 0.000 | 720 | 503 | 1223 | 0 | 5321 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 720 | 442 | 1162 | 0 | 5508 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 4 | completed | 0.000 | 720 | 618 | 1338 | 0 | 6025 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | full-dump | 5 | completed | 0.000 | 720 | 555 | 1275 | 0 | 5660 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 1 | completed | 0.000 | 1811 | 1778 | 3589 | 0 | 17539 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 2 | completed | 0.000 | 1811 | 1731 | 3542 | 0 | 16614 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1811 | 1600 | 3411 | 0 | 15675 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1811 | 1390 | 3201 | 0 | 13728 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 5 | completed | 0.000 | 1811 | 1489 | 3300 | 0 | 16106 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1562 | 235 | 1797 | 10 | 4320 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1562 | 221 | 1783 | 10 | 2958 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1562 | 215 | 1777 | 10 | 2905 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1562 | 216 | 1778 | 10 | 2714 |  |
| fixture-implement-remaining-session-ms | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1562 | 237 | 1799 | 10 | 3153 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3286 | 1003 | 4289 | 10 | 9854 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3286 | 912 | 4198 | 10 | 9744 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3286 | 912 | 4198 | 10 | 9737 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3286 | 886 | 4172 | 10 | 8818 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3286 | 811 | 4097 | 10 | 8091 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1435 | 224 | 1659 | 9 | 3049 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1435 | 234 | 1669 | 9 | 2772 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1435 | 219 | 1654 | 9 | 3437 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1435 | 197 | 1632 | 9 | 2606 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1435 | 227 | 1662 | 9 | 2601 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2903 | 432 | 3335 | 9 | 4125 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2903 | 433 | 3336 | 9 | 4472 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2903 | 451 | 3354 | 9 | 4417 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2903 | 436 | 3339 | 9 | 4333 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2903 | 430 | 3333 | 9 | 4203 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 731 | 664 | 1395 | 0 | 6468 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 2 | completed | 0.000 | 731 | 643 | 1374 | 0 | 6180 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 3 | completed | 0.000 | 731 | 558 | 1289 | 0 | 5526 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 4 | completed | 0.000 | 731 | 502 | 1233 | 0 | 5292 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | full-dump | 5 | completed | 0.000 | 731 | 591 | 1322 | 0 | 6397 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 1 | completed | 0.000 | 1820 | 1706 | 3526 | 0 | 16905 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 2 | completed | 0.000 | 1820 | 1756 | 3576 | 0 | 17487 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 3 | completed | 0.000 | 1820 | 1599 | 3419 | 0 | 15661 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 4 | completed | 0.000 | 1820 | 1829 | 3649 | 0 | 17943 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 5 | completed | 0.000 | 1820 | 2003 | 3823 | 0 | 19249 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1583 | 233 | 1816 | 9 | 2920 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1583 | 221 | 1804 | 9 | 2918 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1583 | 239 | 1822 | 9 | 3097 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1583 | 233 | 1816 | 9 | 3098 |  |
| fixture-implement-refresh-session | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1583 | 226 | 1809 | 9 | 3332 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3291 | 937 | 4228 | 9 | 12181 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3291 | 895 | 4186 | 9 | 11605 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3291 | 940 | 4231 | 9 | 10868 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3291 | 933 | 4224 | 9 | 11480 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3291 | 1013 | 4304 | 9 | 13405 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2993 | 232 | 3225 | 9 | 3465 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2993 | 104 | 3097 | 9 | 2048 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2993 | 118 | 3111 | 9 | 2266 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2993 | 115 | 3108 | 9 | 2055 |  |
| fixture-implement-github-login | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2993 | 118 | 3111 | 9 | 2251 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 4840 | 1005 | 5845 | 9 | 11382 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 4840 | 668 | 5508 | 9 | 8283 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 4840 | 889 | 5729 | 9 | 10245 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 4840 | 807 | 5647 | 9 | 9195 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 4840 | 894 | 5734 | 9 | 10028 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 731 | 213 | 944 | 0 | 3280 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 731 | 222 | 953 | 0 | 3006 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 731 | 200 | 931 | 0 | 2841 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 731 | 242 | 973 | 0 | 3110 |  |
| fixture-implement-github-login | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 731 | 355 | 1086 | 0 | 4134 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1817 | 1502 | 3319 | 0 | 15449 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1817 | 1218 | 3035 | 0 | 13724 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1817 | 1208 | 3025 | 0 | 13135 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1817 | 1701 | 3518 | 0 | 18500 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1817 | 1227 | 3044 | 0 | 13359 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1608 | 191 | 1799 | 10 | 2869 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1608 | 254 | 1862 | 10 | 3326 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1608 | 245 | 1853 | 10 | 3625 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1608 | 220 | 1828 | 10 | 3179 |  |
| fixture-implement-github-login | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1608 | 240 | 1848 | 10 | 3327 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3245 | 681 | 3926 | 10 | 7364 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3245 | 746 | 3991 | 10 | 9070 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3245 | 896 | 4141 | 10 | 9415 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3245 | 985 | 4230 | 10 | 10931 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3245 | 745 | 3990 | 10 | 8675 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 929 | 255 | 1184 | 9 | 3202 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 929 | 274 | 1203 | 9 | 3292 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 929 | 260 | 1189 | 9 | 3022 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 929 | 276 | 1205 | 9 | 3348 |  |
| fixture-implement-password-reset | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 929 | 255 | 1184 | 9 | 3789 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2183 | 1208 | 3391 | 9 | 12361 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2183 | 1389 | 3572 | 9 | 13279 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2183 | 1503 | 3686 | 9 | 14715 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2183 | 1138 | 3321 | 9 | 11264 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2183 | 1297 | 3480 | 9 | 13225 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 754 | 215 | 969 | 0 | 3972 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 754 | 248 | 1002 | 0 | 3265 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 754 | 242 | 996 | 0 | 4112 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 754 | 233 | 987 | 0 | 2980 |  |
| fixture-implement-password-reset | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 754 | 253 | 1007 | 0 | 2986 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1855 | 1474 | 3329 | 0 | 14319 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1855 | 1068 | 2923 | 0 | 11843 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1855 | 993 | 2848 | 0 | 10144 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1855 | 1048 | 2903 | 0 | 10348 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1855 | 1388 | 3243 | 0 | 14125 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1462 | 197 | 1659 | 10 | 2892 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1462 | 238 | 1700 | 10 | 3160 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1462 | 229 | 1691 | 10 | 3931 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1462 | 230 | 1692 | 10 | 3139 |  |
| fixture-implement-password-reset | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1462 | 216 | 1678 | 10 | 3390 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 1 | completed | 0.000 | 3023 | 1430 | 4453 | 10 | 15327 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3023 | 1097 | 4120 | 10 | 12563 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3023 | 1124 | 4147 | 10 | 11397 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3023 | 1482 | 4505 | 10 | 15319 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 10 | 15443 | provider_failure |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 1711 | 106 | 1817 | 9 | 1876 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 1711 | 122 | 1833 | 9 | 1548 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 1711 | 120 | 1831 | 9 | 1836 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 1711 | 107 | 1818 | 9 | 1531 |  |
| fixture-answer-session-policy | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 1711 | 105 | 1816 | 9 | 1837 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 3314 | 720 | 4034 | 9 | 6970 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 3314 | 652 | 3966 | 9 | 6755 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 3314 | 673 | 3987 | 9 | 6351 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 3314 | 695 | 4009 | 9 | 6742 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 3314 | 631 | 3945 | 9 | 6320 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 704 | 132 | 836 | 0 | 1786 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 2 | completed | 0.667 | 704 | 132 | 836 | 0 | 1896 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 704 | 144 | 848 | 0 | 2089 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 4 | completed | 0.667 | 704 | 127 | 831 | 0 | 1941 |  |
| fixture-answer-session-policy | gpt-5.6-luna | full-dump | 5 | completed | 0.667 | 704 | 92 | 796 | 0 | 1834 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1783 | 789 | 2572 | 0 | 8326 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 1783 | 841 | 2624 | 0 | 9357 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1783 | 699 | 2482 | 0 | 7384 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 4 | completed | 0.667 | 1783 | 607 | 2390 | 0 | 7855 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 5 | completed | 0.667 | 1783 | 810 | 2593 | 0 | 9151 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 1 | completed | 0.667 | 1447 | 122 | 1569 | 9 | 1729 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1447 | 111 | 1558 | 9 | 1692 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1447 | 108 | 1555 | 9 | 1583 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1447 | 102 | 1549 | 9 | 1567 |  |
| fixture-answer-session-policy | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1447 | 104 | 1551 | 9 | 1703 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3079 | 773 | 3852 | 9 | 7136 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3079 | 1046 | 4125 | 9 | 10143 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 3 | completed | 0.667 | 3079 | 818 | 3897 | 9 | 7788 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3079 | 1076 | 4155 | 9 | 12284 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3079 | 914 | 3993 | 9 | 8187 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2738 | 43 | 2781 | 9 | 1947 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2738 | 43 | 2781 | 9 | 1603 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2738 | 42 | 2780 | 9 | 1082 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2738 | 43 | 2781 | 9 | 1140 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2738 | 40 | 2778 | 9 | 1152 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 4337 | 252 | 4589 | 9 | 3051 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 4337 | 276 | 4613 | 9 | 3780 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 4337 | 300 | 4637 | 9 | 3421 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 4337 | 274 | 4611 | 9 | 3201 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 4337 | 258 | 4595 | 9 | 2886 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 1 | completed | 0.500 | 702 | 190 | 892 | 0 | 2567 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 2 | completed | 0.000 | 702 | 144 | 846 | 0 | 2188 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 3 | completed | 0.500 | 702 | 191 | 893 | 0 | 2502 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 4 | completed | 0.000 | 702 | 163 | 865 | 0 | 2736 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | full-dump | 5 | completed | 0.500 | 702 | 194 | 896 | 0 | 2833 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 11852 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 2 | completed | 0.500 | 1772 | 812 | 2584 | 0 | 8656 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 3 | completed | 0.500 | 1772 | 1089 | 2861 | 0 | 12832 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 14644 | provider_failure |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1772 | 1025 | 2797 | 0 | 12804 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1377 | 42 | 1419 | 10 | 1546 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1377 | 40 | 1417 | 10 | 1112 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1377 | 40 | 1417 | 10 | 971 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1377 | 42 | 1419 | 10 | 1138 |  |
| fixture-answer-audit-schema | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1377 | 43 | 1420 | 10 | 972 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2844 | 517 | 3361 | 10 | 5724 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2844 | 511 | 3355 | 10 | 5553 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2844 | 754 | 3598 | 10 | 7372 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2844 | 639 | 3483 | 10 | 7139 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2844 | 600 | 3444 | 10 | 6761 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 2160 | 113 | 2273 | 9 | 1642 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 2160 | 132 | 2292 | 9 | 2164 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 2160 | 117 | 2277 | 9 | 1820 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 2160 | 111 | 2271 | 9 | 1722 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 2160 | 112 | 2272 | 9 | 1734 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 3681 | 650 | 4331 | 9 | 6962 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 3681 | 759 | 4440 | 9 | 7628 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 3681 | 732 | 4413 | 9 | 7378 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 3681 | 817 | 4498 | 9 | 8170 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 9 | 7662 | provider_failure |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 703 | 90 | 793 | 0 | 1362 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 703 | 115 | 818 | 0 | 1822 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 703 | 113 | 816 | 0 | 1390 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 703 | 99 | 802 | 0 | 1664 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 703 | 212 | 915 | 0 | 2680 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 1784 | 637 | 2421 | 0 | 6661 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 6756 | provider_failure |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 1784 | 678 | 2462 | 0 | 7169 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 1784 | 697 | 2481 | 0 | 7168 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 1784 | 677 | 2461 | 0 | 7481 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1271 | 140 | 1411 | 12 | 2148 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1271 | 139 | 1410 | 12 | 2044 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 1271 | 124 | 1395 | 12 | 1580 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1271 | 136 | 1407 | 12 | 1760 |  |
| fixture-answer-api-rule-conflict | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 1271 | 124 | 1395 | 12 | 2963 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2751 | 648 | 3399 | 12 | 6801 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2751 | 784 | 3535 | 12 | 8296 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2751 | 618 | 3369 | 12 | 6554 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2751 | 654 | 3405 | 12 | 6556 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2751 | 727 | 3478 | 12 | 7614 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 1 | completed | 0.667 | 1313 | 76 | 1389 | 9 | 1341 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 2 | completed | 0.667 | 1313 | 153 | 1466 | 9 | 2184 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 3 | completed | 0.667 | 1313 | 158 | 1471 | 9 | 2211 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 4 | completed | 0.667 | 1313 | 161 | 1474 | 9 | 2280 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | checkout | 5 | completed | 0.333 | 1313 | 70 | 1383 | 9 | 1319 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2699 | 456 | 3155 | 9 | 5164 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2699 | 377 | 3076 | 9 | 4357 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2699 | 433 | 3132 | 9 | 4972 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2699 | 434 | 3133 | 9 | 4721 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2699 | 375 | 3074 | 9 | 4810 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 1 | completed | 0.667 | 700 | 181 | 881 | 0 | 2437 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 2 | completed | 0.333 | 700 | 152 | 852 | 0 | 2122 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 3 | completed | 0.333 | 700 | 154 | 854 | 0 | 2179 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 4 | completed | 0.333 | 700 | 177 | 877 | 0 | 2457 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | full-dump | 5 | completed | 0.333 | 700 | 195 | 895 | 0 | 2780 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 8783 | provider_failure |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 2 | completed | 0.667 | 1772 | 626 | 2398 | 0 | 8536 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 3 | completed | 0.667 | 1772 | 649 | 2421 | 0 | 8012 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 4 | completed | 0.667 | 1772 | 517 | 2289 | 0 | 7218 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 5 | completed | 0.667 | 1772 | 622 | 2394 | 0 | 9217 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 1 | completed | 0.667 | 1188 | 217 | 1405 | 9 | 3375 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 2 | completed | 0.667 | 1188 | 112 | 1300 | 9 | 1858 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 3 | completed | 0.667 | 1188 | 99 | 1287 | 9 | 1625 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 4 | completed | 0.667 | 1188 | 86 | 1274 | 9 | 1535 |  |
| fixture-answer-legacy-billing | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 1188 | 98 | 1286 | 9 | 1944 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 1 | completed | 0.667 | 2604 | 599 | 3203 | 9 | 6386 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2604 | 519 | 3123 | 9 | 6046 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2604 | 644 | 3248 | 9 | 7550 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 4 | completed | 0.667 | 2604 | 590 | 3194 | 9 | 6729 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2604 | 525 | 3129 | 9 | 6135 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 1 | completed | 0.286 | 1057 | 131 | 1188 | 9 | 2340 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 2 | completed | 0.571 | 1057 | 585 | 1642 | 9 | 7425 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 3 | completed | 0.286 | 1057 | 81 | 1138 | 9 | 1638 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 4 | completed | 0.286 | 1057 | 594 | 1651 | 9 | 6762 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | checkout | 5 | completed | 0.667 | 1057 | 71 | 1128 | 9 | 1491 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 9 | 12530 | provider_failure |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 2 | completed | 0.571 | 2378 | 870 | 3248 | 9 | 8499 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 3 | completed | 0.500 | 2378 | 943 | 3321 | 9 | 10138 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 4 | completed | 0.500 | 2378 | 1106 | 3484 | 9 | 11366 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 5 | completed | 0.571 | 2378 | 933 | 3311 | 9 | 9268 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 1 | completed | 0.571 | 760 | 515 | 1275 | 0 | 5741 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 2 | completed | 0.333 | 760 | 590 | 1350 | 0 | 6241 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 3 | completed | 0.286 | 760 | 448 | 1208 | 0 | 4729 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 4 | completed | 0.500 | 760 | 338 | 1098 | 0 | 3616 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | full-dump | 5 | completed | 0.667 | 760 | 357 | 1117 | 0 | 3756 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 1 | completed | 0.400 | 1877 | 1024 | 2901 | 0 | 9720 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 2 | completed | 0.400 | 1877 | 1017 | 2894 | 0 | 9761 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 3 | completed | 0.400 | 1877 | 967 | 2844 | 0 | 9531 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 4 | completed | 0.182 | 1877 | 1045 | 2922 | 0 | 10342 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 5 | completed | 0.200 | 1877 | 1089 | 2966 | 0 | 10470 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 1 | completed | 0.800 | 1313 | 380 | 1693 | 11 | 4602 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 2 | completed | 0.667 | 1313 | 310 | 1623 | 11 | 3686 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 3 | completed | 0.800 | 1313 | 302 | 1615 | 11 | 4407 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 4 | completed | 0.571 | 1313 | 377 | 1690 | 11 | 4797 |  |
| fixture-judge-auth-drift | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 1313 | 402 | 1715 | 11 | 5015 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 1 | completed | 0.571 | 2837 | 693 | 3530 | 11 | 6900 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 2 | completed | 0.667 | 2837 | 672 | 3509 | 11 | 6656 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 3 | completed | 0.571 | 2837 | 675 | 3512 | 11 | 6812 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 4 | completed | 0.286 | 2837 | 731 | 3568 | 11 | 7475 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 5 | completed | 0.333 | 2837 | 608 | 3445 | 11 | 6156 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 1 | completed | 0.000 | 3308 | 770 | 4078 | 9 | 9280 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 2 | completed | 0.000 | 3308 | 907 | 4215 | 9 | 10831 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 3 | completed | 0.000 | 3308 | 590 | 3898 | 9 | 7104 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 4 | completed | 0.000 | 3308 | 589 | 3897 | 9 | 6939 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | checkout | 5 | completed | 0.000 | 3308 | 453 | 3761 | 9 | 5577 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 1 | completed | 0.000 | 5260 | 731 | 5991 | 9 | 7408 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 2 | completed | 0.000 | 5260 | 794 | 6054 | 9 | 8428 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 3 | completed | 0.000 | 5260 | 813 | 6073 | 9 | 8501 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 4 | completed | 0.000 | 5260 | 966 | 6226 | 9 | 9578 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 9 | 7329 | provider_failure |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 1 | completed | 0.000 | 754 | 635 | 1389 | 0 | 6835 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 2 | completed | 0.000 | 754 | 633 | 1387 | 0 | 6802 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 3 | completed | 0.000 | 754 | 644 | 1398 | 0 | 6673 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 4 | completed | 0.000 | 754 | 536 | 1290 | 0 | 5327 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | full-dump | 5 | completed | 0.000 | 754 | 574 | 1328 | 0 | 6249 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 9521 | provider_failure |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 8224 | provider_failure |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 9260 | provider_failure |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 4 | completed | 0.000 | 1868 | 842 | 2710 | 0 | 8039 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 5 | completed | 0.000 | 1868 | 1267 | 3135 | 0 | 11944 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 1419 | 118 | 1537 | 11 | 2256 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 1419 | 143 | 1562 | 11 | 1993 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 3 | completed | 0.500 | 1419 | 113 | 1532 | 11 | 2016 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 1419 | 132 | 1551 | 11 | 1814 |  |
| fixture-judge-instruction-doc-drift | gpt-5.6-luna | data-brain | 5 | completed | 0.500 | 1419 | 150 | 1569 | 11 | 2202 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 1 | completed | 0.000 | 2990 | 383 | 3373 | 11 | 4089 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 2 | completed | 0.500 | 2990 | 413 | 3403 | 11 | 4572 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 3 | completed | 0.000 | 2990 | 376 | 3366 | 11 | 3850 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 4 | completed | 0.000 | 2990 | 387 | 3377 | 11 | 4284 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 5 | completed | 0.500 | 2990 | 378 | 3368 | 11 | 4263 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 13269 | 118 | 13387 | 7 | 2159 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 13269 | 186 | 13455 | 7 | 2844 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 13269 | 118 | 13387 | 7 | 1822 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 13269 | 344 | 13613 | 7 | 3686 |  |
| real-answer-github-permissions | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 13269 | 301 | 13570 | 7 | 3303 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 23701 | 242 | 23943 | 7 | 3026 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 23701 | 245 | 23946 | 7 | 3833 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 23701 | 375 | 24076 | 7 | 4660 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 23701 | 342 | 24043 | 7 | 3741 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 23701 | 362 | 24063 | 7 | 4022 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55290 | 64 | 55354 | 0 | 1501 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55290 | 60 | 55350 | 0 | 1691 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55290 | 44 | 55334 | 0 | 1137 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55290 | 60 | 55350 | 0 | 9302 |  |
| real-answer-github-permissions | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55290 | 52 | 55342 | 0 | 9150 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 90182 | 649 | 90831 | 0 | 8687 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 2 | completed | 0.800 | 90182 | 542 | 90724 | 0 | 7101 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 90182 | 192 | 90374 | 0 | 3176 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 90182 | 490 | 90672 | 0 | 5980 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 90182 | 507 | 90689 | 0 | 6450 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2127 | 50 | 2177 | 13 | 1537 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2127 | 49 | 2176 | 13 | 1333 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2127 | 49 | 2176 | 13 | 1153 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2127 | 49 | 2176 | 13 | 1437 |  |
| real-answer-github-permissions | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2127 | 49 | 2176 | 13 | 1106 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 4359 | 316 | 4675 | 13 | 3510 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 4359 | 392 | 4751 | 13 | 3798 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 4359 | 289 | 4648 | 13 | 3446 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 4359 | 340 | 4699 | 13 | 3307 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 4359 | 327 | 4686 | 13 | 3257 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 14627 | 190 | 14817 | 3 | 2638 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 14627 | 263 | 14890 | 3 | 2897 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 3 | completed | 0.833 | 14627 | 260 | 14887 | 3 | 3242 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 14627 | 156 | 14783 | 3 | 6636 |  |
| real-answer-mcp-contract | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 14627 | 290 | 14917 | 3 | 7385 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 3 | 19060 | provider_failure |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 3 | 23744 | provider_failure |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 25936 | 1823 | 27759 | 3 | 18929 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 25936 | 2213 | 28149 | 3 | 22888 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 25936 | 1702 | 27638 | 3 | 17969 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55268 | 98 | 55366 | 0 | 1801 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55268 | 113 | 55381 | 0 | 2075 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55268 | 101 | 55369 | 0 | 2538 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55268 | 120 | 55388 | 0 | 33136 |  |
| real-answer-mcp-contract | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55268 | 95 | 55363 | 0 | 14796 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 90157 | 551 | 90708 | 0 | 6904 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 90157 | 810 | 90967 | 0 | 9520 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 90157 | 489 | 90646 | 0 | 6073 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 90157 | 812 | 90969 | 0 | 9298 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 90157 | 964 | 91121 | 0 | 9774 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 3261 | 55 | 3316 | 12 | 1289 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 3261 | 64 | 3325 | 12 | 1359 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 3261 | 63 | 3324 | 12 | 1350 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 3261 | 65 | 3326 | 12 | 1230 |  |
| real-answer-mcp-contract | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 3261 | 55 | 3316 | 12 | 1164 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 5926 | 847 | 6773 | 12 | 9250 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 6982 | provider_failure |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 5926 | 429 | 6355 | 12 | 4817 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 4140 | provider_failure |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 5926 | 585 | 6511 | 12 | 5958 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 1 | completed | 0.750 | 14744 | 271 | 15015 | 5 | 4266 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 14744 | 396 | 15140 | 5 | 4580 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 3 | completed | 0.750 | 14744 | 472 | 15216 | 5 | 5108 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 14744 | 304 | 15048 | 5 | 3529 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | checkout | 5 | completed | 0.500 | 14744 | 398 | 15142 | 5 | 6505 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 5 | 8209 | provider_failure |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 26138 | 987 | 27125 | 5 | 11145 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 3 | completed | 0.750 | 26138 | 1099 | 27237 | 5 | 11694 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 4 | completed | 0.750 | 26138 | 1136 | 27274 | 5 | 12485 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 5 | completed | 0.500 | 26138 | 942 | 27080 | 5 | 9687 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55299 | 259 | 55558 | 0 | 3996 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55299 | 164 | 55463 | 0 | 2545 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55299 | 278 | 55577 | 0 | 5272 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55299 | 154 | 55453 | 0 | 3896 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55299 | 266 | 55565 | 0 | 34319 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 90200 | 1000 | 91200 | 0 | 11890 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 90200 | 1118 | 91318 | 0 | 12335 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 90200 | 871 | 91071 | 0 | 10064 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 4 | completed | 0.500 | 90200 | 1187 | 91387 | 0 | 13924 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 90200 | 976 | 91176 | 0 | 10785 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2798 | 261 | 3059 | 12 | 2907 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2798 | 443 | 3241 | 12 | 4629 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2798 | 356 | 3154 | 12 | 4316 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2798 | 211 | 3009 | 12 | 2905 |  |
| real-answer-job-queue-claim | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2798 | 334 | 3132 | 12 | 3891 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 5484 | 811 | 6295 | 12 | 9137 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 5484 | 779 | 6263 | 12 | 9153 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 5484 | 959 | 6443 | 12 | 10808 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 5484 | 1016 | 6500 | 12 | 10834 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 5484 | 1221 | 6705 | 12 | 13122 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 14495 | 114 | 14609 | 7 | 4619 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 14495 | 144 | 14639 | 7 | 1727 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 14495 | 109 | 14604 | 7 | 1684 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 14495 | 111 | 14606 | 7 | 1513 |  |
| real-answer-graph-renderer | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 14495 | 103 | 14598 | 7 | 1433 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 24705 | 342 | 25047 | 7 | 3937 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 24705 | 249 | 24954 | 7 | 3264 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 24705 | 262 | 24967 | 7 | 3584 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 24705 | 464 | 25169 | 7 | 5008 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 24705 | 265 | 24970 | 7 | 3317 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55285 | 106 | 55391 | 0 | 2618 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55285 | 103 | 55388 | 0 | 1874 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55285 | 90 | 55375 | 0 | 8568 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55285 | 108 | 55393 | 0 | 9001 |  |
| real-answer-graph-renderer | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55285 | 106 | 55391 | 0 | 41937 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 90176 | 210 | 90386 | 0 | 3724 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 90176 | 269 | 90445 | 0 | 3793 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 90176 | 378 | 90554 | 0 | 4443 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 90176 | 214 | 90390 | 0 | 3094 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 90176 | 643 | 90819 | 0 | 7106 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 5728 | 115 | 5843 | 13 | 1550 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 5728 | 108 | 5836 | 13 | 1563 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 5728 | 104 | 5832 | 13 | 2070 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 5728 | 109 | 5837 | 13 | 1506 |  |
| real-answer-graph-renderer | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 5728 | 115 | 5843 | 13 | 1646 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 9863 | 679 | 10542 | 13 | 7632 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 9863 | 728 | 10591 | 13 | 8035 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 9863 | 628 | 10491 | 13 | 7388 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 9863 | 614 | 10477 | 13 | 6241 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 9863 | 858 | 10721 | 13 | 9912 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 15742 | 129 | 15871 | 6 | 1944 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 15742 | 77 | 15819 | 6 | 1307 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 15742 | 71 | 15813 | 6 | 1452 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 15742 | 128 | 15870 | 6 | 1628 |  |
| real-answer-receipt-statement | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 15742 | 125 | 15867 | 6 | 6693 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 26926 | 314 | 27240 | 6 | 4242 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 26926 | 457 | 27383 | 6 | 4788 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 26926 | 559 | 27485 | 6 | 5776 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 26926 | 539 | 27465 | 6 | 6011 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 26926 | 439 | 27365 | 6 | 4655 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55288 | 282 | 55570 | 0 | 8813 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55288 | 265 | 55553 | 0 | 7849 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55288 | 222 | 55510 | 0 | 33169 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55288 | 304 | 55592 | 0 | 33724 |  |
| real-answer-receipt-statement | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55288 | 214 | 55502 | 0 | 32880 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 12192 | provider_failure |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 2 | completed | 0.667 | 90180 | 673 | 90853 | 0 | 9113 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 3 | completed | 0.667 | 90180 | 748 | 90928 | 0 | 9662 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 4 | completed | 0.667 | 90180 | 827 | 91007 | 0 | 10604 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 90180 | 658 | 90838 | 0 | 8987 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2203 | 158 | 2361 | 11 | 2186 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2203 | 121 | 2324 | 11 | 1980 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2203 | 121 | 2324 | 11 | 1717 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2203 | 144 | 2347 | 11 | 2020 |  |
| real-answer-receipt-statement | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2203 | 156 | 2359 | 11 | 1938 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 4331 | 520 | 4851 | 11 | 5427 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 4331 | 310 | 4641 | 11 | 3792 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 4331 | 416 | 4747 | 11 | 4522 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 4331 | 487 | 4818 | 11 | 5040 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 4331 | 296 | 4627 | 11 | 3720 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 1 | completed | 0.667 | 15041 | 314 | 15355 | 6 | 4033 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 2 | completed | 0.667 | 15041 | 588 | 15629 | 6 | 6409 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 3 | completed | 0.667 | 15041 | 602 | 15643 | 6 | 6848 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 4 | completed | 0.667 | 15041 | 589 | 15630 | 6 | 6841 |  |
| real-answer-credit-honesty | gpt-5.6-luna | checkout | 5 | completed | 0.667 | 15041 | 376 | 15417 | 6 | 4979 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 6 | 10654 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 2 | failed | 0.000 | 0 | 0 | 0 | 6 | 9783 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 3 | failed | 0.000 | 0 | 0 | 0 | 6 | 10820 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 4 | completed | 0.667 | 26215 | 999 | 27214 | 6 | 10961 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 6 | 12492 | provider_failure |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55292 | 212 | 55504 | 0 | 3838 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55292 | 155 | 55447 | 0 | 2277 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55292 | 148 | 55440 | 0 | 7952 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55292 | 215 | 55507 | 0 | 19963 |  |
| real-answer-credit-honesty | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55292 | 264 | 55556 | 0 | 18037 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 90188 | 774 | 90962 | 0 | 10637 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 90188 | 1343 | 91531 | 0 | 16802 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 90188 | 1250 | 91438 | 0 | 14052 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 90188 | 886 | 91074 | 0 | 11510 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 90188 | 1367 | 91555 | 0 | 15831 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 1 | completed | 0.667 | 2505 | 365 | 2870 | 12 | 4157 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 2 | completed | 0.667 | 2505 | 487 | 2992 | 12 | 5076 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 3 | completed | 0.667 | 2505 | 461 | 2966 | 12 | 5398 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 4 | completed | 0.667 | 2505 | 550 | 3055 | 12 | 6399 |  |
| real-answer-credit-honesty | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 2505 | 356 | 2861 | 12 | 4238 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 1 | completed | 0.333 | 4939 | 1346 | 6285 | 12 | 15755 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 2 | completed | 0.667 | 4939 | 1196 | 6135 | 12 | 13800 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 12 | 12805 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 10446 | provider_failure |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 12 | 13191 | provider_failure |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 1 | completed | 0.333 | 14878 | 549 | 15427 | 6 | 7022 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 2 | completed | 0.333 | 14878 | 614 | 15492 | 6 | 7233 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 3 | completed | 0.333 | 14878 | 499 | 15377 | 6 | 6681 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 4 | completed | 0.333 | 14878 | 608 | 15486 | 6 | 7209 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | checkout | 5 | completed | 0.333 | 14878 | 214 | 15092 | 6 | 3244 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 1 | failed | 0.000 | 0 | 0 | 0 | 6 | 9505 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 2 | completed | 0.333 | 25970 | 503 | 26473 | 6 | 6236 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 3 | completed | 0.333 | 25970 | 358 | 26328 | 6 | 4582 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 6 | 9437 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 5 | failed | 0.000 | 0 | 0 | 0 | 6 | 9463 | provider_failure |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55287 | 56 | 55343 | 0 | 1519 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55287 | 66 | 55353 | 0 | 1708 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55287 | 57 | 55344 | 0 | 1702 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55287 | 77 | 55364 | 0 | 6595 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55287 | 64 | 55351 | 0 | 23819 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 90176 | 903 | 91079 | 0 | 11599 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 90176 | 873 | 91049 | 0 | 10937 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 90176 | 1243 | 91419 | 0 | 15095 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 90176 | 722 | 90898 | 0 | 8910 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 90176 | 992 | 91168 | 0 | 12784 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 1 | completed | 0.667 | 2400 | 273 | 2673 | 13 | 3453 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 2 | completed | 0.667 | 2400 | 316 | 2716 | 13 | 4107 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 3 | completed | 0.667 | 2400 | 298 | 2698 | 13 | 3954 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 4 | completed | 0.667 | 2400 | 297 | 2697 | 13 | 3603 |  |
| real-answer-index-pr-limits | gpt-5.6-luna | data-brain | 5 | completed | 0.667 | 2400 | 97 | 2497 | 13 | 1489 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 1 | completed | 0.667 | 4787 | 580 | 5367 | 13 | 6825 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 13 | 10036 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 3 | completed | 0.667 | 4787 | 684 | 5471 | 13 | 7172 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 13 | 6452 | provider_failure |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 5 | completed | 0.667 | 4787 | 717 | 5504 | 13 | 9414 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 1 | completed | 0.667 | 15431 | 375 | 15806 | 7 | 6198 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 2 | completed | 0.667 | 15431 | 318 | 15749 | 7 | 4074 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 3 | completed | 0.667 | 15431 | 220 | 15651 | 7 | 6471 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 4 | completed | 0.667 | 15431 | 406 | 15837 | 7 | 5786 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | checkout | 5 | completed | 0.667 | 15431 | 57 | 15488 | 7 | 1642 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 1 | completed | 0.667 | 25679 | 821 | 26500 | 7 | 9316 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 2 | completed | 0.667 | 25679 | 512 | 26191 | 7 | 7182 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 25679 | 641 | 26320 | 7 | 7177 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 4 | failed | 0.000 | 0 | 0 | 0 | 7 | 9714 | provider_failure |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 5 | completed | 0.667 | 25679 | 739 | 26418 | 7 | 8305 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55297 | 46 | 55343 | 0 | 1758 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55297 | 46 | 55343 | 0 | 1303 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55297 | 50 | 55347 | 0 | 1486 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55297 | 51 | 55348 | 0 | 24745 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55297 | 51 | 55348 | 0 | 7205 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 90199 | 536 | 90735 | 0 | 8617 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 90199 | 390 | 90589 | 0 | 6612 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 90199 | 429 | 90628 | 0 | 6200 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 90199 | 453 | 90652 | 0 | 6679 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 90199 | 404 | 90603 | 0 | 5915 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 2465 | 115 | 2580 | 12 | 2013 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 2465 | 123 | 2588 | 12 | 2215 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 2465 | 133 | 2598 | 12 | 2142 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 2465 | 109 | 2574 | 12 | 1684 |  |
| real-answer-evidence-grade-rule | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 2465 | 110 | 2575 | 12 | 1847 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 4767 | 811 | 5578 | 12 | 8887 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 4767 | 585 | 5352 | 12 | 6987 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 4767 | 608 | 5375 | 12 | 6701 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 4767 | 581 | 5348 | 12 | 6311 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 4767 | 546 | 5313 | 12 | 5973 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 14690 | 99 | 14789 | 3 | 1823 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 14690 | 59 | 14749 | 3 | 1123 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 14690 | 59 | 14749 | 3 | 1156 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 14690 | 59 | 14749 | 3 | 1052 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 14690 | 59 | 14749 | 3 | 1055 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 26028 | 333 | 26361 | 3 | 3911 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 26028 | 309 | 26337 | 3 | 3398 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 26028 | 324 | 26352 | 3 | 3491 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 26028 | 286 | 26314 | 3 | 3127 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 26028 | 320 | 26348 | 3 | 3808 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55331 | 160 | 55491 | 0 | 2245 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55331 | 137 | 55468 | 0 | 49185 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55331 | 134 | 55465 | 0 | 14705 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55331 | 133 | 55464 | 0 | 16627 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55331 | 115 | 55446 | 0 | 16481 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 90249 | 389 | 90638 | 0 | 6162 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 90249 | 324 | 90573 | 0 | 5300 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 90249 | 375 | 90624 | 0 | 5690 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 90249 | 320 | 90569 | 0 | 4543 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 90249 | 373 | 90622 | 0 | 5086 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 1 | completed | 0.833 | 4615 | 173 | 4788 | 13 | 7638 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 2 | completed | 0.923 | 4615 | 572 | 5187 | 13 | 6612 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 3 | completed | 0.833 | 4615 | 238 | 4853 | 13 | 2904 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 4 | completed | 0.833 | 4615 | 155 | 4770 | 13 | 3322 |  |
| real-audit-mcp-tool-surface | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 4615 | 408 | 5023 | 13 | 4604 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 1 | completed | 0.833 | 7892 | 373 | 8265 | 13 | 4343 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 2 | completed | 0.833 | 7892 | 402 | 8294 | 13 | 4993 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 3 | completed | 0.833 | 7892 | 382 | 8274 | 13 | 4113 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 4 | completed | 0.833 | 7892 | 411 | 8303 | 13 | 4981 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 5 | completed | 0.833 | 7892 | 385 | 8277 | 13 | 4295 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 1 | completed | 1.000 | 14375 | 124 | 14499 | 6 | 2090 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 2 | completed | 1.000 | 14375 | 142 | 14517 | 6 | 1974 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 3 | completed | 1.000 | 14375 | 132 | 14507 | 6 | 1849 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 4 | completed | 1.000 | 14375 | 127 | 14502 | 6 | 1668 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | checkout | 5 | completed | 1.000 | 14375 | 127 | 14502 | 6 | 4398 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 25534 | 362 | 25896 | 6 | 3650 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 25534 | 359 | 25893 | 6 | 3842 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 25534 | 293 | 25827 | 6 | 2948 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 25534 | 364 | 25898 | 6 | 3485 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 25534 | 366 | 25900 | 6 | 3568 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 1 | completed | 1.000 | 55330 | 129 | 55459 | 0 | 11335 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 2 | completed | 1.000 | 55330 | 129 | 55459 | 0 | 9733 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 3 | completed | 1.000 | 55330 | 119 | 55449 | 0 | 71675 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 4 | completed | 1.000 | 55330 | 130 | 55460 | 0 | 31939 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | full-dump | 5 | completed | 1.000 | 55330 | 126 | 55456 | 0 | 17450 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 1 | failed | 0.000 | 0 | 0 | 0 | 0 | 485 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 2 | failed | 0.000 | 0 | 0 | 0 | 0 | 271 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 3 | failed | 0.000 | 0 | 0 | 0 | 0 | 251 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 4 | failed | 0.000 | 0 | 0 | 0 | 0 | 266 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 5 | failed | 0.000 | 0 | 0 | 0 | 0 | 245 | provider_failure |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 1 | completed | 1.000 | 3325 | 126 | 3451 | 12 | 1672 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 2 | completed | 1.000 | 3325 | 135 | 3460 | 12 | 1742 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 3 | completed | 1.000 | 3325 | 137 | 3462 | 12 | 1729 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 4 | completed | 1.000 | 3325 | 132 | 3457 | 12 | 1648 |  |
| real-audit-finding-taxonomy | gpt-5.6-luna | data-brain | 5 | completed | 1.000 | 3325 | 131 | 3456 | 12 | 1691 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 560 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 2 | failed | 0.000 | 0 | 0 | 0 | 12 | 282 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 3 | failed | 0.000 | 0 | 0 | 0 | 12 | 272 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 4 | failed | 0.000 | 0 | 0 | 0 | 12 | 265 | provider_failure |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 5 | failed | 0.000 | 0 | 0 | 0 | 12 | 295 | provider_failure |
