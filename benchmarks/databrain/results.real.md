# Data Brain efficacy benchmark

Full deterministic trial data: [./results.real.json](./results.real.json)

## Run contract

- Mode: `real`
- Model/version: `gpt-5-nano-2025-08-07`
- Generated: `2026-08-14T14:33:06.643Z`
- Manifest SHA-256: `03af75ee450fc9a98c8b27f3606cbfabda2285ae638bf537c75407a2fdc1e373`
- Token accounting: OpenAI Responses API usage.input_tokens and usage.output_tokens are authoritative; no local tokenizer estimate is substituted.
- Protocol: 12 pre-registered tasks × 3 trials × 3 arms = 108 trials.
- Prompt and model are identical across arms. Only repository-context retrieval differs.
- Failed trials remain in denominators with score 0 and their recorded token counts.

## Hypothesis gate

- Accuracy delta, Data Brain vs checkout: 3.66pp (non-inferiority margin: -5pp; improvement goal: +5pp).
- Token reduction, Data Brain vs checkout: 55.97% (target: 30%).
- Result: **MET**.

## Arm totals

| Arm | Trials | Mean score | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| checkout | 36 | 0.700 | 61.11% | 136695 | 8014 | 144709 | 303 | 107737 | 0 |
| full-dump | 36 | 0.509 | 38.89% | 336087 | 9625 | 345712 | 0 | 185767 | 0 |
| data-brain | 36 | 0.737 | 63.89% | 56261 | 7456 | 63717 | 378 | 108570 | 1 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 1.000 | 4796 | 27 | 14171 | 0 |
| fixture-implement-remaining-session-ms | full-dump | 0.000 | 3367 | 0 | 11832 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 0.667 | 5487 | 30 | 10306 | 0 |
| fixture-implement-refresh-session | checkout | 1.000 | 5072 | 27 | 9528 | 0 |
| fixture-implement-refresh-session | full-dump | 0.000 | 3234 | 0 | 11748 | 0 |
| fixture-implement-refresh-session | data-brain | 1.000 | 5482 | 27 | 8900 | 0 |
| fixture-implement-github-login | checkout | 0.667 | 9713 | 27 | 8775 | 0 |
| fixture-implement-github-login | full-dump | 0.667 | 2841 | 0 | 7949 | 0 |
| fixture-implement-github-login | data-brain | 1.000 | 5451 | 30 | 7775 | 0 |
| fixture-implement-password-reset | checkout | 1.000 | 3946 | 27 | 11287 | 0 |
| fixture-implement-password-reset | full-dump | 1.000 | 3433 | 0 | 10756 | 0 |
| fixture-implement-password-reset | data-brain | 1.000 | 5958 | 30 | 15019 | 0 |
| fixture-answer-session-policy | checkout | 1.000 | 5593 | 27 | 5287 | 0 |
| fixture-answer-session-policy | full-dump | 0.778 | 2508 | 0 | 4395 | 0 |
| fixture-answer-session-policy | data-brain | 0.778 | 4852 | 27 | 5624 | 0 |
| fixture-answer-audit-schema | checkout | 1.000 | 8623 | 27 | 4870 | 0 |
| fixture-answer-audit-schema | full-dump | 0.167 | 2382 | 0 | 4360 | 0 |
| fixture-answer-audit-schema | data-brain | 1.000 | 4437 | 30 | 4318 | 0 |
| fixture-answer-api-rule-conflict | checkout | 1.000 | 7119 | 27 | 6965 | 0 |
| fixture-answer-api-rule-conflict | full-dump | 1.000 | 2733 | 0 | 6196 | 0 |
| fixture-answer-api-rule-conflict | data-brain | 1.000 | 4741 | 36 | 8123 | 0 |
| fixture-answer-legacy-billing | checkout | 0.444 | 4471 | 27 | 5085 | 0 |
| fixture-answer-legacy-billing | full-dump | 0.333 | 2550 | 0 | 4386 | 0 |
| fixture-answer-legacy-billing | data-brain | 0.333 | 4062 | 27 | 5313 | 0 |
| fixture-judge-auth-drift | checkout | 0.189 | 3885 | 27 | 8092 | 0 |
| fixture-judge-auth-drift | full-dump | 0.215 | 2881 | 0 | 5538 | 0 |
| fixture-judge-auth-drift | data-brain | 0.312 | 4385 | 33 | 6016 | 0 |
| fixture-judge-instruction-doc-drift | checkout | 0.000 | 10379 | 27 | 8010 | 0 |
| fixture-judge-instruction-doc-drift | full-dump | 0.000 | 3327 | 0 | 8673 | 0 |
| fixture-judge-instruction-doc-drift | data-brain | 0.083 | 4644 | 33 | 4779 | 0 |
| real-answer-github-permissions | checkout | 0.933 | 37827 | 24 | 5901 | 0 |
| real-answer-github-permissions | full-dump | 1.000 | 157618 | 0 | 9147 | 0 |
| real-answer-github-permissions | data-brain | 1.000 | 6619 | 39 | 3461 | 0 |
| real-answer-mcp-contract | checkout | 0.167 | 43285 | 9 | 19766 | 0 |
| real-answer-mcp-contract | full-dump | 0.944 | 158838 | 0 | 100787 | 0 |
| real-answer-mcp-contract | data-brain | 0.667 | 7599 | 36 | 28936 | 1 |

## Every trial

| Task | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | checkout | 1 | completed | 1.000 | 1337 | 268 | 1605 | 9 | 4424 |  |
| fixture-implement-remaining-session-ms | checkout | 2 | completed | 1.000 | 1337 | 277 | 1614 | 9 | 5290 |  |
| fixture-implement-remaining-session-ms | checkout | 3 | completed | 1.000 | 1337 | 240 | 1577 | 9 | 4457 |  |
| fixture-implement-remaining-session-ms | full-dump | 1 | completed | 0.000 | 721 | 378 | 1099 | 0 | 3698 |  |
| fixture-implement-remaining-session-ms | full-dump | 2 | completed | 0.000 | 721 | 369 | 1090 | 0 | 3777 |  |
| fixture-implement-remaining-session-ms | full-dump | 3 | completed | 0.000 | 721 | 457 | 1178 | 0 | 4357 |  |
| fixture-implement-remaining-session-ms | data-brain | 1 | completed | 1.000 | 1563 | 240 | 1803 | 10 | 3031 |  |
| fixture-implement-remaining-session-ms | data-brain | 2 | completed | 1.000 | 1563 | 294 | 1857 | 10 | 3898 |  |
| fixture-implement-remaining-session-ms | data-brain | 3 | completed | 0.000 | 1563 | 264 | 1827 | 10 | 3377 |  |
| fixture-implement-refresh-session | checkout | 1 | completed | 1.000 | 1435 | 255 | 1690 | 9 | 3349 |  |
| fixture-implement-refresh-session | checkout | 2 | completed | 1.000 | 1435 | 262 | 1697 | 9 | 3214 |  |
| fixture-implement-refresh-session | checkout | 3 | completed | 1.000 | 1435 | 250 | 1685 | 9 | 2965 |  |
| fixture-implement-refresh-session | full-dump | 1 | completed | 0.000 | 732 | 350 | 1082 | 0 | 3806 |  |
| fixture-implement-refresh-session | full-dump | 2 | completed | 0.000 | 732 | 343 | 1075 | 0 | 3334 |  |
| fixture-implement-refresh-session | full-dump | 3 | completed | 0.000 | 732 | 345 | 1077 | 0 | 4608 |  |
| fixture-implement-refresh-session | data-brain | 1 | completed | 1.000 | 1584 | 261 | 1845 | 9 | 3130 |  |
| fixture-implement-refresh-session | data-brain | 2 | completed | 1.000 | 1584 | 239 | 1823 | 9 | 2925 |  |
| fixture-implement-refresh-session | data-brain | 3 | completed | 1.000 | 1584 | 230 | 1814 | 9 | 2845 |  |
| fixture-implement-github-login | checkout | 1 | completed | 0.000 | 2993 | 220 | 3213 | 9 | 2757 |  |
| fixture-implement-github-login | checkout | 2 | completed | 1.000 | 2993 | 258 | 3251 | 9 | 2959 |  |
| fixture-implement-github-login | checkout | 3 | completed | 1.000 | 2993 | 256 | 3249 | 9 | 3059 |  |
| fixture-implement-github-login | full-dump | 1 | completed | 0.000 | 732 | 205 | 937 | 0 | 2723 |  |
| fixture-implement-github-login | full-dump | 2 | completed | 1.000 | 732 | 259 | 991 | 0 | 2944 |  |
| fixture-implement-github-login | full-dump | 3 | completed | 1.000 | 732 | 181 | 913 | 0 | 2282 |  |
| fixture-implement-github-login | data-brain | 1 | completed | 1.000 | 1609 | 249 | 1858 | 10 | 2747 |  |
| fixture-implement-github-login | data-brain | 2 | completed | 1.000 | 1609 | 166 | 1775 | 10 | 2215 |  |
| fixture-implement-github-login | data-brain | 3 | completed | 1.000 | 1609 | 209 | 1818 | 10 | 2813 |  |
| fixture-implement-password-reset | checkout | 1 | completed | 1.000 | 930 | 263 | 1193 | 9 | 3121 |  |
| fixture-implement-password-reset | checkout | 2 | completed | 1.000 | 930 | 525 | 1455 | 9 | 4046 |  |
| fixture-implement-password-reset | checkout | 3 | completed | 1.000 | 930 | 368 | 1298 | 9 | 4120 |  |
| fixture-implement-password-reset | full-dump | 1 | completed | 1.000 | 755 | 420 | 1175 | 0 | 3865 |  |
| fixture-implement-password-reset | full-dump | 2 | completed | 1.000 | 755 | 240 | 995 | 0 | 2516 |  |
| fixture-implement-password-reset | full-dump | 3 | completed | 1.000 | 755 | 508 | 1263 | 0 | 4375 |  |
| fixture-implement-password-reset | data-brain | 1 | completed | 1.000 | 1462 | 631 | 2093 | 10 | 5185 |  |
| fixture-implement-password-reset | data-brain | 2 | completed | 1.000 | 1462 | 614 | 2076 | 10 | 5516 |  |
| fixture-implement-password-reset | data-brain | 3 | completed | 1.000 | 1462 | 327 | 1789 | 10 | 4318 |  |
| fixture-answer-session-policy | checkout | 1 | completed | 1.000 | 1711 | 173 | 1884 | 9 | 1956 |  |
| fixture-answer-session-policy | checkout | 2 | completed | 1.000 | 1711 | 141 | 1852 | 9 | 1805 |  |
| fixture-answer-session-policy | checkout | 3 | completed | 1.000 | 1711 | 146 | 1857 | 9 | 1526 |  |
| fixture-answer-session-policy | full-dump | 1 | completed | 0.667 | 705 | 113 | 818 | 0 | 1265 |  |
| fixture-answer-session-policy | full-dump | 2 | completed | 0.667 | 705 | 162 | 867 | 0 | 1671 |  |
| fixture-answer-session-policy | full-dump | 3 | completed | 1.000 | 705 | 118 | 823 | 0 | 1459 |  |
| fixture-answer-session-policy | data-brain | 1 | completed | 0.667 | 1448 | 185 | 1633 | 9 | 2122 |  |
| fixture-answer-session-policy | data-brain | 2 | completed | 0.667 | 1448 | 164 | 1612 | 9 | 1667 |  |
| fixture-answer-session-policy | data-brain | 3 | completed | 1.000 | 1448 | 159 | 1607 | 9 | 1835 |  |
| fixture-answer-audit-schema | checkout | 1 | completed | 1.000 | 2741 | 124 | 2865 | 9 | 1741 |  |
| fixture-answer-audit-schema | checkout | 2 | completed | 1.000 | 2741 | 151 | 2892 | 9 | 1788 |  |
| fixture-answer-audit-schema | checkout | 3 | completed | 1.000 | 2741 | 125 | 2866 | 9 | 1341 |  |
| fixture-answer-audit-schema | full-dump | 1 | completed | 0.500 | 703 | 79 | 782 | 0 | 1114 |  |
| fixture-answer-audit-schema | full-dump | 2 | completed | 0.000 | 703 | 88 | 791 | 0 | 1276 |  |
| fixture-answer-audit-schema | full-dump | 3 | completed | 0.000 | 703 | 106 | 809 | 0 | 1970 |  |
| fixture-answer-audit-schema | data-brain | 1 | completed | 1.000 | 1376 | 130 | 1506 | 10 | 1425 |  |
| fixture-answer-audit-schema | data-brain | 2 | completed | 1.000 | 1376 | 80 | 1456 | 10 | 1610 |  |
| fixture-answer-audit-schema | data-brain | 3 | completed | 1.000 | 1376 | 99 | 1475 | 10 | 1283 |  |
| fixture-answer-api-rule-conflict | checkout | 1 | completed | 1.000 | 2161 | 205 | 2366 | 9 | 2486 |  |
| fixture-answer-api-rule-conflict | checkout | 2 | completed | 1.000 | 2161 | 174 | 2335 | 9 | 1851 |  |
| fixture-answer-api-rule-conflict | checkout | 3 | completed | 1.000 | 2161 | 257 | 2418 | 9 | 2628 |  |
| fixture-answer-api-rule-conflict | full-dump | 1 | completed | 1.000 | 704 | 194 | 898 | 0 | 1743 |  |
| fixture-answer-api-rule-conflict | full-dump | 2 | completed | 1.000 | 704 | 233 | 937 | 0 | 2637 |  |
| fixture-answer-api-rule-conflict | full-dump | 3 | completed | 1.000 | 704 | 194 | 898 | 0 | 1816 |  |
| fixture-answer-api-rule-conflict | data-brain | 1 | completed | 1.000 | 1271 | 340 | 1611 | 12 | 2860 |  |
| fixture-answer-api-rule-conflict | data-brain | 2 | completed | 1.000 | 1271 | 363 | 1634 | 12 | 3087 |  |
| fixture-answer-api-rule-conflict | data-brain | 3 | completed | 1.000 | 1271 | 225 | 1496 | 12 | 2176 |  |
| fixture-answer-legacy-billing | checkout | 1 | completed | 0.333 | 1313 | 194 | 1507 | 9 | 1741 |  |
| fixture-answer-legacy-billing | checkout | 2 | completed | 0.333 | 1313 | 141 | 1454 | 9 | 1451 |  |
| fixture-answer-legacy-billing | checkout | 3 | completed | 0.667 | 1313 | 197 | 1510 | 9 | 1893 |  |
| fixture-answer-legacy-billing | full-dump | 1 | completed | 0.333 | 701 | 142 | 843 | 0 | 1394 |  |
| fixture-answer-legacy-billing | full-dump | 2 | completed | 0.333 | 701 | 184 | 885 | 0 | 1699 |  |
| fixture-answer-legacy-billing | full-dump | 3 | completed | 0.333 | 701 | 121 | 822 | 0 | 1293 |  |
| fixture-answer-legacy-billing | data-brain | 1 | completed | 0.333 | 1189 | 133 | 1322 | 9 | 1551 |  |
| fixture-answer-legacy-billing | data-brain | 2 | completed | 0.333 | 1189 | 186 | 1375 | 9 | 1829 |  |
| fixture-answer-legacy-billing | data-brain | 3 | completed | 0.333 | 1189 | 176 | 1365 | 9 | 1933 |  |
| fixture-judge-auth-drift | checkout | 1 | completed | 0.400 | 1058 | 157 | 1215 | 9 | 2065 |  |
| fixture-judge-auth-drift | checkout | 2 | completed | 0.000 | 1058 | 194 | 1252 | 9 | 2079 |  |
| fixture-judge-auth-drift | checkout | 3 | completed | 0.167 | 1058 | 360 | 1418 | 9 | 3948 |  |
| fixture-judge-auth-drift | full-dump | 1 | completed | 0.200 | 761 | 209 | 970 | 0 | 2099 |  |
| fixture-judge-auth-drift | full-dump | 2 | completed | 0.222 | 761 | 201 | 962 | 0 | 1677 |  |
| fixture-judge-auth-drift | full-dump | 3 | completed | 0.222 | 761 | 188 | 949 | 0 | 1762 |  |
| fixture-judge-auth-drift | data-brain | 1 | completed | 0.400 | 1314 | 104 | 1418 | 11 | 1459 |  |
| fixture-judge-auth-drift | data-brain | 2 | completed | 0.250 | 1314 | 160 | 1474 | 11 | 2044 |  |
| fixture-judge-auth-drift | data-brain | 3 | completed | 0.286 | 1314 | 179 | 1493 | 11 | 2513 |  |
| fixture-judge-instruction-doc-drift | checkout | 1 | completed | 0.000 | 3306 | 65 | 3371 | 9 | 1121 |  |
| fixture-judge-instruction-doc-drift | checkout | 2 | completed | 0.000 | 3306 | 220 | 3526 | 9 | 2013 |  |
| fixture-judge-instruction-doc-drift | checkout | 3 | completed | 0.000 | 3306 | 176 | 3482 | 9 | 4876 |  |
| fixture-judge-instruction-doc-drift | full-dump | 1 | completed | 0.000 | 755 | 481 | 1236 | 0 | 3767 |  |
| fixture-judge-instruction-doc-drift | full-dump | 2 | completed | 0.000 | 755 | 281 | 1036 | 0 | 2260 |  |
| fixture-judge-instruction-doc-drift | full-dump | 3 | completed | 0.000 | 755 | 300 | 1055 | 0 | 2646 |  |
| fixture-judge-instruction-doc-drift | data-brain | 1 | completed | 0.000 | 1418 | 130 | 1548 | 11 | 1627 |  |
| fixture-judge-instruction-doc-drift | data-brain | 2 | completed | 0.250 | 1418 | 112 | 1530 | 11 | 1709 |  |
| fixture-judge-instruction-doc-drift | data-brain | 3 | completed | 0.000 | 1418 | 148 | 1566 | 11 | 1443 |  |
| real-answer-github-permissions | checkout | 1 | completed | 1.000 | 12463 | 166 | 12629 | 8 | 2271 |  |
| real-answer-github-permissions | checkout | 2 | completed | 1.000 | 12463 | 117 | 12580 | 8 | 1823 |  |
| real-answer-github-permissions | checkout | 3 | completed | 0.800 | 12463 | 155 | 12618 | 8 | 1807 |  |
| real-answer-github-permissions | full-dump | 1 | completed | 1.000 | 52391 | 211 | 52602 | 0 | 3807 |  |
| real-answer-github-permissions | full-dump | 2 | completed | 1.000 | 52391 | 156 | 52547 | 0 | 3216 |  |
| real-answer-github-permissions | full-dump | 3 | completed | 1.000 | 52391 | 78 | 52469 | 0 | 2124 |  |
| real-answer-github-permissions | data-brain | 1 | completed | 1.000 | 2127 | 89 | 2216 | 13 | 1195 |  |
| real-answer-github-permissions | data-brain | 2 | completed | 1.000 | 2127 | 86 | 2213 | 13 | 1236 |  |
| real-answer-github-permissions | data-brain | 3 | completed | 1.000 | 2127 | 63 | 2190 | 13 | 1030 |  |
| real-answer-mcp-contract | checkout | 1 | completed | 0.000 | 14117 | 382 | 14499 | 3 | 3415 |  |
| real-answer-mcp-contract | checkout | 2 | completed | 0.500 | 14117 | 316 | 14433 | 3 | 6054 |  |
| real-answer-mcp-contract | checkout | 3 | completed | 0.000 | 14117 | 236 | 14353 | 3 | 10297 |  |
| real-answer-mcp-contract | full-dump | 1 | completed | 1.000 | 52369 | 281 | 52650 | 0 | 23412 |  |
| real-answer-mcp-contract | full-dump | 2 | completed | 1.000 | 52369 | 768 | 53137 | 0 | 58165 |  |
| real-answer-mcp-contract | full-dump | 3 | completed | 0.833 | 52369 | 682 | 53051 | 0 | 19210 |  |
| real-answer-mcp-contract | data-brain | 1 | failed | 0.000 | 0 | 0 | 0 | 12 | 12991 | provider_failure |
| real-answer-mcp-contract | data-brain | 2 | completed | 1.000 | 3589 | 168 | 3757 | 12 | 12962 |  |
| real-answer-mcp-contract | data-brain | 3 | completed | 1.000 | 3589 | 253 | 3842 | 12 | 2983 |  |
