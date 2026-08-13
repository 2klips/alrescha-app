# Data Brain efficacy benchmark

Full deterministic trial data: [./results.real.json](./results.real.json)

## Run contract

- Mode: `real`
- Model/version: `gpt-5-nano-2025-08-07`
- Generated: `2026-08-13T14:14:48.902Z`
- Manifest SHA-256: `fc9f23049679ab559a610324db1a7b3359a62969fb03374c6871907f89c2a662`
- Token accounting: OpenAI Responses API usage.input_tokens and usage.output_tokens are authoritative; no local tokenizer estimate is substituted.
- Protocol: 12 pre-registered tasks × 3 trials × 3 arms = 108 trials.
- Prompt and model are identical across arms. Only repository-context retrieval differs.
- Failed trials remain in denominators with score 0 and their recorded token counts.

## Hypothesis gate

- Accuracy delta, Data Brain vs checkout: 0.46pp (non-inferiority margin: -5pp; improvement goal: +5pp).
- Token reduction, Data Brain vs checkout: 52.01% (target: 30%).
- Result: **MET**.

## Arm totals

| Arm | Trials | Mean score | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| checkout | 36 | 0.644 | 55.56% | 124137 | 7517 | 131654 | 306 | 103725 | 0 |
| full-dump | 36 | 0.389 | 30.56% | 268623 | 8258 | 276881 | 0 | 107792 | 0 |
| data-brain | 36 | 0.648 | 55.56% | 55593 | 7584 | 63177 | 366 | 100011 | 0 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 1.000 | 4786 | 27 | 12992 | 0 |
| fixture-implement-remaining-session-ms | full-dump | 0.667 | 3204 | 0 | 13035 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 5128 | 27 | 8708 | 0 |
| fixture-implement-refresh-session | checkout | 0.667 | 5046 | 27 | 10708 | 0 |
| fixture-implement-refresh-session | full-dump | 0.000 | 3045 | 0 | 10849 | 0 |
| fixture-implement-refresh-session | data-brain | 1.000 | 5401 | 24 | 10828 | 0 |
| fixture-implement-github-login | checkout | 1.000 | 9836 | 27 | 13272 | 0 |
| fixture-implement-github-login | full-dump | 0.667 | 2903 | 0 | 10173 | 0 |
| fixture-implement-github-login | data-brain | 1.000 | 5315 | 27 | 12531 | 0 |
| fixture-implement-password-reset | checkout | 1.000 | 3916 | 27 | 16070 | 0 |
| fixture-implement-password-reset | full-dump | 0.000 | 3466 | 0 | 16331 | 0 |
| fixture-implement-password-reset | data-brain | 0.667 | 5510 | 27 | 15810 | 0 |
| fixture-answer-session-policy | checkout | 1.000 | 5544 | 27 | 6414 | 0 |
| fixture-answer-session-policy | full-dump | 0.444 | 2453 | 0 | 5248 | 0 |
| fixture-answer-session-policy | data-brain | 0.667 | 4857 | 27 | 6195 | 0 |
| fixture-answer-audit-schema | checkout | 1.000 | 8628 | 27 | 5969 | 0 |
| fixture-answer-audit-schema | full-dump | 0.000 | 2401 | 0 | 4661 | 0 |
| fixture-answer-audit-schema | data-brain | 1.000 | 4472 | 30 | 5313 | 0 |
| fixture-answer-api-rule-conflict | checkout | 1.000 | 7171 | 27 | 8860 | 0 |
| fixture-answer-api-rule-conflict | full-dump | 1.000 | 2893 | 0 | 7805 | 0 |
| fixture-answer-api-rule-conflict | data-brain | 1.000 | 4571 | 36 | 8363 | 0 |
| fixture-answer-legacy-billing | checkout | 0.667 | 4288 | 27 | 5127 | 0 |
| fixture-answer-legacy-billing | full-dump | 0.556 | 2436 | 0 | 7714 | 0 |
| fixture-answer-legacy-billing | data-brain | 0.444 | 3853 | 27 | 4813 | 0 |
| fixture-judge-auth-drift | checkout | 0.000 | 3919 | 27 | 7016 | 0 |
| fixture-judge-auth-drift | full-dump | 0.000 | 2862 | 0 | 7720 | 0 |
| fixture-judge-auth-drift | data-brain | 0.000 | 3548 | 33 | 4108 | 0 |
| fixture-judge-instruction-doc-drift | checkout | 0.000 | 10214 | 27 | 4276 | 0 |
| fixture-judge-instruction-doc-drift | full-dump | 0.000 | 2272 | 0 | 5809 | 0 |
| fixture-judge-instruction-doc-drift | data-brain | 0.000 | 3526 | 33 | 3676 | 0 |
| real-answer-github-permissions | checkout | 0.000 | 25970 | 24 | 5116 | 0 |
| real-answer-github-permissions | full-dump | 0.333 | 124276 | 0 | 7842 | 0 |
| real-answer-github-permissions | data-brain | 0.000 | 7285 | 39 | 11583 | 0 |
| real-answer-mcp-contract | checkout | 0.389 | 42336 | 12 | 7905 | 0 |
| real-answer-mcp-contract | full-dump | 1.000 | 124670 | 0 | 10605 | 0 |
| real-answer-mcp-contract | data-brain | 1.000 | 9711 | 36 | 8083 | 0 |

## Every trial

| Task | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | checkout | 1 | completed | 1.000 | 1337 | 269 | 1606 | 9 | 5654 |  |
| fixture-implement-remaining-session-ms | checkout | 2 | completed | 1.000 | 1337 | 266 | 1603 | 9 | 3853 |  |
| fixture-implement-remaining-session-ms | checkout | 3 | completed | 1.000 | 1337 | 240 | 1577 | 9 | 3485 |  |
| fixture-implement-remaining-session-ms | full-dump | 1 | completed | 1.000 | 721 | 294 | 1015 | 0 | 3482 |  |
| fixture-implement-remaining-session-ms | full-dump | 2 | completed | 1.000 | 721 | 359 | 1080 | 0 | 4485 |  |
| fixture-implement-remaining-session-ms | full-dump | 3 | completed | 0.000 | 721 | 388 | 1109 | 0 | 5068 |  |
| fixture-implement-remaining-session-ms | data-brain | 1 | completed | 1.000 | 1488 | 199 | 1687 | 9 | 2555 |  |
| fixture-implement-remaining-session-ms | data-brain | 2 | completed | 1.000 | 1488 | 227 | 1715 | 9 | 3089 |  |
| fixture-implement-remaining-session-ms | data-brain | 3 | completed | 1.000 | 1488 | 238 | 1726 | 9 | 3064 |  |
| fixture-implement-refresh-session | checkout | 1 | completed | 0.000 | 1435 | 241 | 1676 | 9 | 3431 |  |
| fixture-implement-refresh-session | checkout | 2 | completed | 1.000 | 1435 | 257 | 1692 | 9 | 3777 |  |
| fixture-implement-refresh-session | checkout | 3 | completed | 1.000 | 1435 | 243 | 1678 | 9 | 3500 |  |
| fixture-implement-refresh-session | full-dump | 1 | completed | 0.000 | 732 | 375 | 1107 | 0 | 4375 |  |
| fixture-implement-refresh-session | full-dump | 2 | completed | 0.000 | 732 | 126 | 858 | 0 | 2166 |  |
| fixture-implement-refresh-session | full-dump | 3 | completed | 0.000 | 732 | 348 | 1080 | 0 | 4308 |  |
| fixture-implement-refresh-session | data-brain | 1 | completed | 1.000 | 1509 | 280 | 1789 | 8 | 3271 |  |
| fixture-implement-refresh-session | data-brain | 2 | completed | 1.000 | 1509 | 312 | 1821 | 8 | 3673 |  |
| fixture-implement-refresh-session | data-brain | 3 | completed | 1.000 | 1509 | 282 | 1791 | 8 | 3884 |  |
| fixture-implement-github-login | checkout | 1 | completed | 1.000 | 2993 | 269 | 3262 | 9 | 5333 |  |
| fixture-implement-github-login | checkout | 2 | completed | 1.000 | 2993 | 200 | 3193 | 9 | 3500 |  |
| fixture-implement-github-login | checkout | 3 | completed | 1.000 | 2993 | 388 | 3381 | 9 | 4439 |  |
| fixture-implement-github-login | full-dump | 1 | completed | 1.000 | 732 | 290 | 1022 | 0 | 3826 |  |
| fixture-implement-github-login | full-dump | 2 | completed | 1.000 | 732 | 220 | 952 | 0 | 3431 |  |
| fixture-implement-github-login | full-dump | 3 | completed | 0.000 | 732 | 197 | 929 | 0 | 2916 |  |
| fixture-implement-github-login | data-brain | 1 | completed | 1.000 | 1526 | 187 | 1713 | 9 | 5662 |  |
| fixture-implement-github-login | data-brain | 2 | completed | 1.000 | 1526 | 256 | 1782 | 9 | 3056 |  |
| fixture-implement-github-login | data-brain | 3 | completed | 1.000 | 1526 | 294 | 1820 | 9 | 3813 |  |
| fixture-implement-password-reset | checkout | 1 | completed | 1.000 | 915 | 278 | 1193 | 9 | 4993 |  |
| fixture-implement-password-reset | checkout | 2 | completed | 1.000 | 915 | 560 | 1475 | 9 | 7111 |  |
| fixture-implement-password-reset | checkout | 3 | completed | 1.000 | 915 | 333 | 1248 | 9 | 3966 |  |
| fixture-implement-password-reset | full-dump | 1 | completed | 0.000 | 740 | 497 | 1237 | 0 | 5417 |  |
| fixture-implement-password-reset | full-dump | 2 | completed | 0.000 | 740 | 327 | 1067 | 0 | 6196 |  |
| fixture-implement-password-reset | full-dump | 3 | completed | 0.000 | 740 | 422 | 1162 | 0 | 4718 |  |
| fixture-implement-password-reset | data-brain | 1 | completed | 1.000 | 1365 | 378 | 1743 | 9 | 3997 |  |
| fixture-implement-password-reset | data-brain | 2 | completed | 0.000 | 1365 | 607 | 1972 | 9 | 5299 |  |
| fixture-implement-password-reset | data-brain | 3 | completed | 1.000 | 1365 | 430 | 1795 | 9 | 6514 |  |
| fixture-answer-session-policy | checkout | 1 | completed | 1.000 | 1711 | 142 | 1853 | 9 | 1944 |  |
| fixture-answer-session-policy | checkout | 2 | completed | 1.000 | 1711 | 154 | 1865 | 9 | 2831 |  |
| fixture-answer-session-policy | checkout | 3 | completed | 1.000 | 1711 | 115 | 1826 | 9 | 1639 |  |
| fixture-answer-session-policy | full-dump | 1 | completed | 0.333 | 705 | 109 | 814 | 0 | 1549 |  |
| fixture-answer-session-policy | full-dump | 2 | completed | 0.667 | 705 | 120 | 825 | 0 | 1798 |  |
| fixture-answer-session-policy | full-dump | 3 | completed | 0.333 | 705 | 109 | 814 | 0 | 1901 |  |
| fixture-answer-session-policy | data-brain | 1 | completed | 0.667 | 1448 | 159 | 1607 | 9 | 2007 |  |
| fixture-answer-session-policy | data-brain | 2 | completed | 0.667 | 1448 | 168 | 1616 | 9 | 2125 |  |
| fixture-answer-session-policy | data-brain | 3 | completed | 0.667 | 1448 | 186 | 1634 | 9 | 2063 |  |
| fixture-answer-audit-schema | checkout | 1 | completed | 1.000 | 2741 | 129 | 2870 | 9 | 1626 |  |
| fixture-answer-audit-schema | checkout | 2 | completed | 1.000 | 2741 | 179 | 2920 | 9 | 2403 |  |
| fixture-answer-audit-schema | checkout | 3 | completed | 1.000 | 2741 | 97 | 2838 | 9 | 1940 |  |
| fixture-answer-audit-schema | full-dump | 1 | completed | 0.000 | 703 | 74 | 777 | 0 | 1222 |  |
| fixture-answer-audit-schema | full-dump | 2 | completed | 0.000 | 703 | 81 | 784 | 0 | 1476 |  |
| fixture-answer-audit-schema | full-dump | 3 | completed | 0.000 | 703 | 137 | 840 | 0 | 1963 |  |
| fixture-answer-audit-schema | data-brain | 1 | completed | 1.000 | 1376 | 150 | 1526 | 10 | 1847 |  |
| fixture-answer-audit-schema | data-brain | 2 | completed | 1.000 | 1376 | 103 | 1479 | 10 | 1659 |  |
| fixture-answer-audit-schema | data-brain | 3 | completed | 1.000 | 1376 | 91 | 1467 | 10 | 1807 |  |
| fixture-answer-api-rule-conflict | checkout | 1 | completed | 1.000 | 2161 | 160 | 2321 | 9 | 3286 |  |
| fixture-answer-api-rule-conflict | checkout | 2 | completed | 1.000 | 2161 | 319 | 2480 | 9 | 3163 |  |
| fixture-answer-api-rule-conflict | checkout | 3 | completed | 1.000 | 2161 | 209 | 2370 | 9 | 2411 |  |
| fixture-answer-api-rule-conflict | full-dump | 1 | completed | 1.000 | 704 | 206 | 910 | 0 | 2189 |  |
| fixture-answer-api-rule-conflict | full-dump | 2 | completed | 1.000 | 704 | 349 | 1053 | 0 | 3210 |  |
| fixture-answer-api-rule-conflict | full-dump | 3 | completed | 1.000 | 704 | 226 | 930 | 0 | 2406 |  |
| fixture-answer-api-rule-conflict | data-brain | 1 | completed | 1.000 | 1271 | 194 | 1465 | 12 | 2151 |  |
| fixture-answer-api-rule-conflict | data-brain | 2 | completed | 1.000 | 1271 | 340 | 1611 | 12 | 3315 |  |
| fixture-answer-api-rule-conflict | data-brain | 3 | completed | 1.000 | 1271 | 224 | 1495 | 12 | 2897 |  |
| fixture-answer-legacy-billing | checkout | 1 | completed | 0.667 | 1313 | 110 | 1423 | 9 | 1637 |  |
| fixture-answer-legacy-billing | checkout | 2 | completed | 0.667 | 1313 | 119 | 1432 | 9 | 1532 |  |
| fixture-answer-legacy-billing | checkout | 3 | completed | 0.667 | 1313 | 120 | 1433 | 9 | 1958 |  |
| fixture-answer-legacy-billing | full-dump | 1 | completed | 0.667 | 701 | 115 | 816 | 0 | 1850 |  |
| fixture-answer-legacy-billing | full-dump | 2 | completed | 0.667 | 701 | 94 | 795 | 0 | 1398 |  |
| fixture-answer-legacy-billing | full-dump | 3 | completed | 0.333 | 701 | 124 | 825 | 0 | 4466 |  |
| fixture-answer-legacy-billing | data-brain | 1 | completed | 0.333 | 1189 | 124 | 1313 | 9 | 1869 |  |
| fixture-answer-legacy-billing | data-brain | 2 | completed | 0.333 | 1189 | 75 | 1264 | 9 | 1430 |  |
| fixture-answer-legacy-billing | data-brain | 3 | completed | 0.667 | 1189 | 87 | 1276 | 9 | 1514 |  |
| fixture-judge-auth-drift | checkout | 1 | completed | 0.000 | 1098 | 255 | 1353 | 9 | 2607 |  |
| fixture-judge-auth-drift | checkout | 2 | completed | 0.000 | 1098 | 93 | 1191 | 9 | 1573 |  |
| fixture-judge-auth-drift | checkout | 3 | completed | 0.000 | 1098 | 277 | 1375 | 9 | 2836 |  |
| fixture-judge-auth-drift | full-dump | 1 | completed | 0.000 | 706 | 222 | 928 | 0 | 2454 |  |
| fixture-judge-auth-drift | full-dump | 2 | completed | 0.000 | 706 | 286 | 992 | 0 | 2893 |  |
| fixture-judge-auth-drift | full-dump | 3 | completed | 0.000 | 706 | 236 | 942 | 0 | 2373 |  |
| fixture-judge-auth-drift | data-brain | 1 | completed | 0.000 | 1085 | 125 | 1210 | 11 | 1595 |  |
| fixture-judge-auth-drift | data-brain | 2 | completed | 0.000 | 1085 | 85 | 1170 | 11 | 1191 |  |
| fixture-judge-auth-drift | data-brain | 3 | completed | 0.000 | 1085 | 83 | 1168 | 11 | 1322 |  |
| fixture-judge-instruction-doc-drift | checkout | 1 | completed | 0.000 | 3323 | 88 | 3411 | 9 | 1555 |  |
| fixture-judge-instruction-doc-drift | checkout | 2 | completed | 0.000 | 3323 | 93 | 3416 | 9 | 1559 |  |
| fixture-judge-instruction-doc-drift | checkout | 3 | completed | 0.000 | 3323 | 64 | 3387 | 9 | 1162 |  |
| fixture-judge-instruction-doc-drift | full-dump | 1 | completed | 0.000 | 700 | 50 | 750 | 0 | 1197 |  |
| fixture-judge-instruction-doc-drift | full-dump | 2 | completed | 0.000 | 700 | 62 | 762 | 0 | 3469 |  |
| fixture-judge-instruction-doc-drift | full-dump | 3 | completed | 0.000 | 700 | 60 | 760 | 0 | 1143 |  |
| fixture-judge-instruction-doc-drift | data-brain | 1 | completed | 0.000 | 1115 | 72 | 1187 | 11 | 1233 |  |
| fixture-judge-instruction-doc-drift | data-brain | 2 | completed | 0.000 | 1115 | 59 | 1174 | 11 | 1220 |  |
| fixture-judge-instruction-doc-drift | data-brain | 3 | completed | 0.000 | 1115 | 50 | 1165 | 11 | 1223 |  |
| real-answer-github-permissions | checkout | 1 | completed | 0.000 | 8510 | 143 | 8653 | 8 | 1663 |  |
| real-answer-github-permissions | checkout | 2 | completed | 0.000 | 8510 | 127 | 8637 | 8 | 1458 |  |
| real-answer-github-permissions | checkout | 3 | completed | 0.000 | 8510 | 170 | 8680 | 8 | 1995 |  |
| real-answer-github-permissions | full-dump | 1 | completed | 1.000 | 41200 | 118 | 41318 | 0 | 1981 |  |
| real-answer-github-permissions | full-dump | 2 | completed | 0.000 | 41200 | 281 | 41481 | 0 | 3282 |  |
| real-answer-github-permissions | full-dump | 3 | completed | 0.000 | 41200 | 277 | 41477 | 0 | 2579 |  |
| real-answer-github-permissions | data-brain | 1 | completed | 0.000 | 2096 | 201 | 2297 | 13 | 2283 |  |
| real-answer-github-permissions | data-brain | 2 | completed | 0.000 | 2096 | 97 | 2193 | 13 | 1466 |  |
| real-answer-github-permissions | data-brain | 3 | completed | 0.000 | 2096 | 699 | 2795 | 13 | 7834 |  |
| real-answer-mcp-contract | checkout | 1 | completed | 0.667 | 13842 | 269 | 14111 | 4 | 2692 |  |
| real-answer-mcp-contract | checkout | 2 | completed | 0.167 | 13842 | 211 | 14053 | 4 | 2096 |  |
| real-answer-mcp-contract | checkout | 3 | completed | 0.333 | 13842 | 330 | 14172 | 4 | 3117 |  |
| real-answer-mcp-contract | full-dump | 1 | completed | 1.000 | 41197 | 427 | 41624 | 0 | 4097 |  |
| real-answer-mcp-contract | full-dump | 2 | completed | 1.000 | 41197 | 316 | 41513 | 0 | 3142 |  |
| real-answer-mcp-contract | full-dump | 3 | completed | 1.000 | 41197 | 336 | 41533 | 0 | 3366 |  |
| real-answer-mcp-contract | data-brain | 1 | completed | 1.000 | 3063 | 160 | 3223 | 12 | 2870 |  |
| real-answer-mcp-contract | data-brain | 2 | completed | 1.000 | 3063 | 194 | 3257 | 12 | 2525 |  |
| real-answer-mcp-contract | data-brain | 3 | completed | 1.000 | 3063 | 168 | 3231 | 12 | 2688 |  |
