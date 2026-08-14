# Data Brain efficacy benchmark

Full deterministic trial data: [./results.real.json](./results.real.json)

## Run contract

- Mode: `real`
- Model/version: `gpt-5-nano-2025-08-07`
- Generated: `2026-08-14T12:44:32.602Z`
- Manifest SHA-256: `fc9f23049679ab559a610324db1a7b3359a62969fb03374c6871907f89c2a662`
- Token accounting: OpenAI Responses API usage.input_tokens and usage.output_tokens are authoritative; no local tokenizer estimate is substituted.
- Protocol: 12 pre-registered tasks × 3 trials × 3 arms = 108 trials.
- Prompt and model are identical across arms. Only repository-context retrieval differs.
- Failed trials remain in denominators with score 0 and their recorded token counts.

## Hypothesis gate

- Accuracy delta, Data Brain vs checkout: -7.04pp (non-inferiority margin: -5pp; improvement goal: +5pp).
- Token reduction, Data Brain vs checkout: 55.28% (target: 30%).
- Result: **NOT MET**.
- Iteration plan: inspect failed/low-score task rows, tighten evidence ranking/context-pack selection, then rerun the unchanged pre-registered manifest. Product claims remain limited to these measured results.

## Arm totals

| Arm | Trials | Mean score | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| checkout | 36 | 0.644 | 58.33% | 125886 | 7052 | 132938 | 303 | 95761 | 0 |
| full-dump | 36 | 0.514 | 41.67% | 268473 | 8406 | 276879 | 0 | 135759 | 0 |
| data-brain | 36 | 0.574 | 52.78% | 52515 | 6941 | 59456 | 366 | 93915 | 1 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 1.000 | 4835 | 27 | 14479 | 0 |
| fixture-implement-remaining-session-ms | full-dump | 0.333 | 3133 | 0 | 11244 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 5149 | 27 | 8359 | 0 |
| fixture-implement-refresh-session | checkout | 1.000 | 5097 | 27 | 10341 | 0 |
| fixture-implement-refresh-session | full-dump | 0.000 | 3204 | 0 | 10172 | 0 |
| fixture-implement-refresh-session | data-brain | 1.000 | 5429 | 24 | 9333 | 0 |
| fixture-implement-github-login | checkout | 0.667 | 9652 | 27 | 9585 | 0 |
| fixture-implement-github-login | full-dump | 1.000 | 2875 | 0 | 8592 | 0 |
| fixture-implement-github-login | data-brain | 1.000 | 5315 | 27 | 8895 | 0 |
| fixture-implement-password-reset | checkout | 1.000 | 3670 | 27 | 10917 | 0 |
| fixture-implement-password-reset | full-dump | 0.667 | 3553 | 0 | 12982 | 0 |
| fixture-implement-password-reset | data-brain | 0.000 | 5441 | 27 | 13826 | 0 |
| fixture-answer-session-policy | checkout | 1.000 | 5597 | 27 | 5392 | 0 |
| fixture-answer-session-policy | full-dump | 0.556 | 2513 | 0 | 5888 | 0 |
| fixture-answer-session-policy | data-brain | 0.889 | 4851 | 27 | 5602 | 0 |
| fixture-answer-audit-schema | checkout | 1.000 | 8481 | 27 | 5189 | 0 |
| fixture-answer-audit-schema | full-dump | 0.167 | 2371 | 0 | 3771 | 0 |
| fixture-answer-audit-schema | data-brain | 1.000 | 4395 | 30 | 4238 | 0 |
| fixture-answer-api-rule-conflict | checkout | 1.000 | 7251 | 27 | 7549 | 0 |
| fixture-answer-api-rule-conflict | full-dump | 1.000 | 2966 | 0 | 9131 | 0 |
| fixture-answer-api-rule-conflict | data-brain | 1.000 | 4666 | 36 | 7596 | 0 |
| fixture-answer-legacy-billing | checkout | 0.333 | 4346 | 27 | 5813 | 0 |
| fixture-answer-legacy-billing | full-dump | 0.444 | 2574 | 0 | 5701 | 0 |
| fixture-answer-legacy-billing | data-brain | 0.333 | 3876 | 27 | 3719 | 0 |
| fixture-judge-auth-drift | checkout | 0.000 | 3580 | 27 | 3948 | 0 |
| fixture-judge-auth-drift | full-dump | 0.000 | 2388 | 0 | 4179 | 0 |
| fixture-judge-auth-drift | data-brain | 0.000 | 3613 | 33 | 5231 | 0 |
| fixture-judge-instruction-doc-drift | checkout | 0.000 | 10234 | 27 | 4142 | 0 |
| fixture-judge-instruction-doc-drift | full-dump | 0.000 | 2355 | 0 | 4090 | 0 |
| fixture-judge-instruction-doc-drift | data-brain | 0.000 | 3568 | 33 | 3469 | 0 |
| real-answer-github-permissions | checkout | 0.400 | 27053 | 24 | 8154 | 0 |
| real-answer-github-permissions | full-dump | 1.000 | 124050 | 0 | 8418 | 0 |
| real-answer-github-permissions | data-brain | 0.000 | 6631 | 39 | 5000 | 0 |
| real-answer-mcp-contract | checkout | 0.333 | 43142 | 9 | 10252 | 0 |
| real-answer-mcp-contract | full-dump | 1.000 | 124897 | 0 | 51591 | 0 |
| real-answer-mcp-contract | data-brain | 0.667 | 6522 | 36 | 18647 | 1 |

## Every trial

| Task | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | checkout | 1 | completed | 1.000 | 1337 | 266 | 1603 | 9 | 4979 |  |
| fixture-implement-remaining-session-ms | checkout | 2 | completed | 1.000 | 1337 | 235 | 1572 | 9 | 4365 |  |
| fixture-implement-remaining-session-ms | checkout | 3 | completed | 1.000 | 1337 | 323 | 1660 | 9 | 5135 |  |
| fixture-implement-remaining-session-ms | full-dump | 1 | completed | 1.000 | 721 | 250 | 971 | 0 | 3394 |  |
| fixture-implement-remaining-session-ms | full-dump | 2 | completed | 0.000 | 721 | 411 | 1132 | 0 | 4090 |  |
| fixture-implement-remaining-session-ms | full-dump | 3 | completed | 0.000 | 721 | 309 | 1030 | 0 | 3760 |  |
| fixture-implement-remaining-session-ms | data-brain | 1 | completed | 1.000 | 1488 | 218 | 1706 | 9 | 2661 |  |
| fixture-implement-remaining-session-ms | data-brain | 2 | completed | 1.000 | 1488 | 218 | 1706 | 9 | 2546 |  |
| fixture-implement-remaining-session-ms | data-brain | 3 | completed | 1.000 | 1488 | 249 | 1737 | 9 | 3152 |  |
| fixture-implement-refresh-session | checkout | 1 | completed | 1.000 | 1435 | 266 | 1701 | 9 | 3838 |  |
| fixture-implement-refresh-session | checkout | 2 | completed | 1.000 | 1435 | 273 | 1708 | 9 | 3547 |  |
| fixture-implement-refresh-session | checkout | 3 | completed | 1.000 | 1435 | 253 | 1688 | 9 | 2956 |  |
| fixture-implement-refresh-session | full-dump | 1 | completed | 0.000 | 732 | 402 | 1134 | 0 | 3835 |  |
| fixture-implement-refresh-session | full-dump | 2 | completed | 0.000 | 732 | 408 | 1140 | 0 | 3893 |  |
| fixture-implement-refresh-session | full-dump | 3 | completed | 0.000 | 732 | 198 | 930 | 0 | 2444 |  |
| fixture-implement-refresh-session | data-brain | 1 | completed | 1.000 | 1509 | 362 | 1871 | 8 | 3454 |  |
| fixture-implement-refresh-session | data-brain | 2 | completed | 1.000 | 1509 | 259 | 1768 | 8 | 3071 |  |
| fixture-implement-refresh-session | data-brain | 3 | completed | 1.000 | 1509 | 281 | 1790 | 8 | 2808 |  |
| fixture-implement-github-login | checkout | 1 | completed | 1.000 | 2993 | 208 | 3201 | 9 | 2824 |  |
| fixture-implement-github-login | checkout | 2 | completed | 0.000 | 2993 | 217 | 3210 | 9 | 3091 |  |
| fixture-implement-github-login | checkout | 3 | completed | 1.000 | 2993 | 248 | 3241 | 9 | 3670 |  |
| fixture-implement-github-login | full-dump | 1 | completed | 1.000 | 732 | 230 | 962 | 0 | 2943 |  |
| fixture-implement-github-login | full-dump | 2 | completed | 1.000 | 732 | 217 | 949 | 0 | 2836 |  |
| fixture-implement-github-login | full-dump | 3 | completed | 1.000 | 732 | 232 | 964 | 0 | 2813 |  |
| fixture-implement-github-login | data-brain | 1 | completed | 1.000 | 1526 | 308 | 1834 | 9 | 3331 |  |
| fixture-implement-github-login | data-brain | 2 | completed | 1.000 | 1526 | 243 | 1769 | 9 | 2867 |  |
| fixture-implement-github-login | data-brain | 3 | completed | 1.000 | 1526 | 186 | 1712 | 9 | 2697 |  |
| fixture-implement-password-reset | checkout | 1 | completed | 1.000 | 915 | 264 | 1179 | 9 | 3364 |  |
| fixture-implement-password-reset | checkout | 2 | completed | 1.000 | 915 | 334 | 1249 | 9 | 4010 |  |
| fixture-implement-password-reset | checkout | 3 | completed | 1.000 | 915 | 327 | 1242 | 9 | 3543 |  |
| fixture-implement-password-reset | full-dump | 1 | completed | 1.000 | 740 | 410 | 1150 | 0 | 3977 |  |
| fixture-implement-password-reset | full-dump | 2 | completed | 0.000 | 740 | 472 | 1212 | 0 | 4517 |  |
| fixture-implement-password-reset | full-dump | 3 | completed | 1.000 | 740 | 451 | 1191 | 0 | 4488 |  |
| fixture-implement-password-reset | data-brain | 1 | completed | 0.000 | 1365 | 349 | 1714 | 9 | 3986 |  |
| fixture-implement-password-reset | data-brain | 2 | completed | 0.000 | 1365 | 632 | 1997 | 9 | 5959 |  |
| fixture-implement-password-reset | data-brain | 3 | completed | 0.000 | 1365 | 365 | 1730 | 9 | 3881 |  |
| fixture-answer-session-policy | checkout | 1 | completed | 1.000 | 1711 | 146 | 1857 | 9 | 2246 |  |
| fixture-answer-session-policy | checkout | 2 | completed | 1.000 | 1711 | 158 | 1869 | 9 | 1597 |  |
| fixture-answer-session-policy | checkout | 3 | completed | 1.000 | 1711 | 160 | 1871 | 9 | 1549 |  |
| fixture-answer-session-policy | full-dump | 1 | completed | 0.667 | 705 | 145 | 850 | 0 | 1611 |  |
| fixture-answer-session-policy | full-dump | 2 | completed | 0.667 | 705 | 166 | 871 | 0 | 1997 |  |
| fixture-answer-session-policy | full-dump | 3 | completed | 0.333 | 705 | 87 | 792 | 0 | 2280 |  |
| fixture-answer-session-policy | data-brain | 1 | completed | 0.667 | 1448 | 141 | 1589 | 9 | 1538 |  |
| fixture-answer-session-policy | data-brain | 2 | completed | 1.000 | 1448 | 196 | 1644 | 9 | 2091 |  |
| fixture-answer-session-policy | data-brain | 3 | completed | 1.000 | 1448 | 170 | 1618 | 9 | 1973 |  |
| fixture-answer-audit-schema | checkout | 1 | completed | 1.000 | 2741 | 123 | 2864 | 9 | 2783 |  |
| fixture-answer-audit-schema | checkout | 2 | completed | 1.000 | 2741 | 58 | 2799 | 9 | 1089 |  |
| fixture-answer-audit-schema | checkout | 3 | completed | 1.000 | 2741 | 77 | 2818 | 9 | 1317 |  |
| fixture-answer-audit-schema | full-dump | 1 | completed | 0.000 | 703 | 76 | 779 | 0 | 1091 |  |
| fixture-answer-audit-schema | full-dump | 2 | completed | 0.500 | 703 | 108 | 811 | 0 | 1539 |  |
| fixture-answer-audit-schema | full-dump | 3 | completed | 0.000 | 703 | 78 | 781 | 0 | 1141 |  |
| fixture-answer-audit-schema | data-brain | 1 | completed | 1.000 | 1376 | 65 | 1441 | 10 | 1014 |  |
| fixture-answer-audit-schema | data-brain | 2 | completed | 1.000 | 1376 | 113 | 1489 | 10 | 1650 |  |
| fixture-answer-audit-schema | data-brain | 3 | completed | 1.000 | 1376 | 89 | 1465 | 10 | 1574 |  |
| fixture-answer-api-rule-conflict | checkout | 1 | completed | 1.000 | 2161 | 164 | 2325 | 9 | 1720 |  |
| fixture-answer-api-rule-conflict | checkout | 2 | completed | 1.000 | 2161 | 316 | 2477 | 9 | 3078 |  |
| fixture-answer-api-rule-conflict | checkout | 3 | completed | 1.000 | 2161 | 288 | 2449 | 9 | 2751 |  |
| fixture-answer-api-rule-conflict | full-dump | 1 | completed | 1.000 | 704 | 276 | 980 | 0 | 2625 |  |
| fixture-answer-api-rule-conflict | full-dump | 2 | completed | 1.000 | 704 | 271 | 975 | 0 | 3186 |  |
| fixture-answer-api-rule-conflict | full-dump | 3 | completed | 1.000 | 704 | 307 | 1011 | 0 | 3320 |  |
| fixture-answer-api-rule-conflict | data-brain | 1 | completed | 1.000 | 1271 | 207 | 1478 | 12 | 2077 |  |
| fixture-answer-api-rule-conflict | data-brain | 2 | completed | 1.000 | 1271 | 279 | 1550 | 12 | 2380 |  |
| fixture-answer-api-rule-conflict | data-brain | 3 | completed | 1.000 | 1271 | 367 | 1638 | 12 | 3139 |  |
| fixture-answer-legacy-billing | checkout | 1 | completed | 0.333 | 1313 | 123 | 1436 | 9 | 2394 |  |
| fixture-answer-legacy-billing | checkout | 2 | completed | 0.333 | 1313 | 137 | 1450 | 9 | 1623 |  |
| fixture-answer-legacy-billing | checkout | 3 | completed | 0.333 | 1313 | 147 | 1460 | 9 | 1796 |  |
| fixture-answer-legacy-billing | full-dump | 1 | completed | 0.667 | 701 | 193 | 894 | 0 | 2377 |  |
| fixture-answer-legacy-billing | full-dump | 2 | completed | 0.333 | 701 | 149 | 850 | 0 | 1675 |  |
| fixture-answer-legacy-billing | full-dump | 3 | completed | 0.333 | 701 | 129 | 830 | 0 | 1649 |  |
| fixture-answer-legacy-billing | data-brain | 1 | completed | 0.333 | 1189 | 120 | 1309 | 9 | 1478 |  |
| fixture-answer-legacy-billing | data-brain | 2 | completed | 0.333 | 1189 | 94 | 1283 | 9 | 1094 |  |
| fixture-answer-legacy-billing | data-brain | 3 | completed | 0.333 | 1189 | 95 | 1284 | 9 | 1147 |  |
| fixture-judge-auth-drift | checkout | 1 | completed | 0.000 | 1098 | 134 | 1232 | 9 | 1631 |  |
| fixture-judge-auth-drift | checkout | 2 | completed | 0.000 | 1098 | 94 | 1192 | 9 | 1238 |  |
| fixture-judge-auth-drift | checkout | 3 | completed | 0.000 | 1098 | 58 | 1156 | 9 | 1079 |  |
| fixture-judge-auth-drift | full-dump | 1 | completed | 0.000 | 706 | 92 | 798 | 0 | 1457 |  |
| fixture-judge-auth-drift | full-dump | 2 | completed | 0.000 | 706 | 91 | 797 | 0 | 1244 |  |
| fixture-judge-auth-drift | full-dump | 3 | completed | 0.000 | 706 | 87 | 793 | 0 | 1478 |  |
| fixture-judge-auth-drift | data-brain | 1 | completed | 0.000 | 1085 | 88 | 1173 | 11 | 1457 |  |
| fixture-judge-auth-drift | data-brain | 2 | completed | 0.000 | 1085 | 154 | 1239 | 11 | 1914 |  |
| fixture-judge-auth-drift | data-brain | 3 | completed | 0.000 | 1085 | 116 | 1201 | 11 | 1860 |  |
| fixture-judge-instruction-doc-drift | checkout | 1 | completed | 0.000 | 3323 | 86 | 3409 | 9 | 1368 |  |
| fixture-judge-instruction-doc-drift | checkout | 2 | completed | 0.000 | 3323 | 122 | 3445 | 9 | 1811 |  |
| fixture-judge-instruction-doc-drift | checkout | 3 | completed | 0.000 | 3323 | 57 | 3380 | 9 | 963 |  |
| fixture-judge-instruction-doc-drift | full-dump | 1 | completed | 0.000 | 700 | 67 | 767 | 0 | 1178 |  |
| fixture-judge-instruction-doc-drift | full-dump | 2 | completed | 0.000 | 700 | 50 | 750 | 0 | 1184 |  |
| fixture-judge-instruction-doc-drift | full-dump | 3 | completed | 0.000 | 700 | 138 | 838 | 0 | 1728 |  |
| fixture-judge-instruction-doc-drift | data-brain | 1 | completed | 0.000 | 1115 | 77 | 1192 | 11 | 1222 |  |
| fixture-judge-instruction-doc-drift | data-brain | 2 | completed | 0.000 | 1115 | 68 | 1183 | 11 | 1011 |  |
| fixture-judge-instruction-doc-drift | data-brain | 3 | completed | 0.000 | 1115 | 78 | 1193 | 11 | 1236 |  |
| real-answer-github-permissions | checkout | 1 | completed | 0.000 | 8878 | 128 | 9006 | 8 | 1562 |  |
| real-answer-github-permissions | checkout | 2 | completed | 1.000 | 8878 | 162 | 9040 | 8 | 5175 |  |
| real-answer-github-permissions | checkout | 3 | completed | 0.200 | 8878 | 129 | 9007 | 8 | 1417 |  |
| real-answer-github-permissions | full-dump | 1 | completed | 1.000 | 41175 | 117 | 41292 | 0 | 2409 |  |
| real-answer-github-permissions | full-dump | 2 | completed | 1.000 | 41175 | 180 | 41355 | 0 | 3381 |  |
| real-answer-github-permissions | full-dump | 3 | completed | 1.000 | 41175 | 228 | 41403 | 0 | 2628 |  |
| real-answer-github-permissions | data-brain | 1 | completed | 0.000 | 2091 | 125 | 2216 | 13 | 2071 |  |
| real-answer-github-permissions | data-brain | 2 | completed | 0.000 | 2091 | 128 | 2219 | 13 | 1595 |  |
| real-answer-github-permissions | data-brain | 3 | completed | 0.000 | 2091 | 105 | 2196 | 13 | 1334 |  |
| real-answer-mcp-contract | checkout | 1 | completed | 0.500 | 14057 | 337 | 14394 | 3 | 3067 |  |
| real-answer-mcp-contract | checkout | 2 | completed | 0.000 | 14057 | 360 | 14417 | 3 | 3117 |  |
| real-answer-mcp-contract | checkout | 3 | completed | 0.500 | 14057 | 274 | 14331 | 3 | 4068 |  |
| real-answer-mcp-contract | full-dump | 1 | completed | 1.000 | 41172 | 238 | 41410 | 0 | 34324 |  |
| real-answer-mcp-contract | full-dump | 2 | completed | 1.000 | 41172 | 466 | 41638 | 0 | 8147 |  |
| real-answer-mcp-contract | full-dump | 3 | completed | 1.000 | 41172 | 677 | 41849 | 0 | 9120 |  |
| real-answer-mcp-contract | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 7991 | provider_failure |
| real-answer-mcp-contract | data-brain | 2 | completed | 1.000 | 3063 | 215 | 3278 | 12 | 8710 |  |
| real-answer-mcp-contract | data-brain | 3 | completed | 1.000 | 3063 | 181 | 3244 | 12 | 1946 |  |
