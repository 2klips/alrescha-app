# Data Brain efficacy benchmark

Full deterministic trial data: [./results.dry-run.json](./results.dry-run.json)

## Run contract

- Mode: `dry-run`
- Model/version: `gpt-5-nano-2025-08-07`
- Generated: `2026-08-13T14:16:15.696Z`
- Manifest SHA-256: `fc9f23049679ab559a610324db1a7b3359a62969fb03374c6871907f89c2a662`
- Token accounting: Mock usage is deterministic ceil((context + prompt) characters / 4) input and serialized-output characters / 4 output.
- Protocol: 12 pre-registered tasks × 3 trials × 3 arms = 108 trials.
- Prompt and model are identical across arms. Only repository-context retrieval differs.
- Failed trials remain in denominators with score 0 and their recorded token counts.

## Hypothesis gate

- Accuracy delta, Data Brain vs checkout: 0.00pp (non-inferiority margin: -5pp; improvement goal: +5pp).
- Token reduction, Data Brain vs checkout: 53.42% (target: 30%).
- Result: **MET**.

## Arm totals

| Arm | Trials | Mean score | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| checkout | 36 | 1.000 | 100.00% | 113100 | 1803 | 114903 | 306 | 6619 | 0 |
| full-dump | 36 | 1.000 | 100.00% | 199227 | 1803 | 201030 | 0 | 6670 | 0 |
| data-brain | 36 | 1.000 | 100.00% | 51720 | 1803 | 53523 | 366 | 6948 | 0 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 1.000 | 3519 | 27 | 1701 | 0 |
| fixture-implement-remaining-session-ms | full-dump | 1.000 | 2361 | 0 | 1685 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 4545 | 27 | 1640 | 0 |
| fixture-implement-refresh-session | checkout | 1.000 | 3750 | 27 | 1655 | 0 |
| fixture-implement-refresh-session | full-dump | 1.000 | 2394 | 0 | 1588 | 0 |
| fixture-implement-refresh-session | data-brain | 1.000 | 4593 | 24 | 1614 | 0 |
| fixture-implement-github-login | checkout | 1.000 | 6279 | 27 | 1622 | 0 |
| fixture-implement-github-login | full-dump | 1.000 | 2202 | 0 | 1697 | 0 |
| fixture-implement-github-login | data-brain | 1.000 | 4323 | 27 | 1666 | 0 |
| fixture-implement-password-reset | checkout | 1.000 | 2901 | 27 | 1641 | 0 |
| fixture-implement-password-reset | full-dump | 1.000 | 2343 | 0 | 1700 | 0 |
| fixture-implement-password-reset | data-brain | 1.000 | 4230 | 27 | 2028 | 0 |
| fixture-answer-session-policy | checkout | 1.000 | 4005 | 27 | 0 | 0 |
| fixture-answer-session-policy | full-dump | 1.000 | 1995 | 0 | 0 | 0 |
| fixture-answer-session-policy | data-brain | 1.000 | 4146 | 27 | 0 | 0 |
| fixture-answer-audit-schema | checkout | 1.000 | 6177 | 27 | 0 | 0 |
| fixture-answer-audit-schema | full-dump | 1.000 | 1974 | 0 | 0 | 0 |
| fixture-answer-audit-schema | data-brain | 1.000 | 3882 | 30 | 0 | 0 |
| fixture-answer-api-rule-conflict | checkout | 1.000 | 4896 | 27 | 0 | 0 |
| fixture-answer-api-rule-conflict | full-dump | 1.000 | 1998 | 0 | 0 | 0 |
| fixture-answer-api-rule-conflict | data-brain | 1.000 | 3807 | 36 | 0 | 0 |
| fixture-answer-legacy-billing | checkout | 1.000 | 3378 | 27 | 0 | 0 |
| fixture-answer-legacy-billing | full-dump | 1.000 | 1977 | 0 | 0 | 0 |
| fixture-answer-legacy-billing | data-brain | 1.000 | 3402 | 27 | 0 | 0 |
| fixture-judge-auth-drift | checkout | 1.000 | 3018 | 27 | 0 | 0 |
| fixture-judge-auth-drift | full-dump | 1.000 | 2022 | 0 | 0 | 0 |
| fixture-judge-auth-drift | data-brain | 1.000 | 3306 | 33 | 0 | 0 |
| fixture-judge-instruction-doc-drift | checkout | 1.000 | 6744 | 27 | 0 | 0 |
| fixture-judge-instruction-doc-drift | full-dump | 1.000 | 1995 | 0 | 0 | 0 |
| fixture-judge-instruction-doc-drift | data-brain | 1.000 | 3222 | 33 | 0 | 0 |
| real-answer-github-permissions | checkout | 1.000 | 27150 | 24 | 0 | 0 |
| real-answer-github-permissions | full-dump | 1.000 | 89901 | 0 | 0 | 0 |
| real-answer-github-permissions | data-brain | 1.000 | 6534 | 39 | 0 | 0 |
| real-answer-mcp-contract | checkout | 1.000 | 43086 | 12 | 0 | 0 |
| real-answer-mcp-contract | full-dump | 1.000 | 89868 | 0 | 0 | 0 |
| real-answer-mcp-contract | data-brain | 1.000 | 7533 | 36 | 0 | 0 |

## Every trial

| Task | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | checkout | 1 | completed | 1.000 | 1048 | 125 | 1173 | 9 | 567 |  |
| fixture-implement-remaining-session-ms | checkout | 2 | completed | 1.000 | 1048 | 125 | 1173 | 9 | 567 |  |
| fixture-implement-remaining-session-ms | checkout | 3 | completed | 1.000 | 1048 | 125 | 1173 | 9 | 567 |  |
| fixture-implement-remaining-session-ms | full-dump | 1 | completed | 1.000 | 662 | 125 | 787 | 0 | 564 |  |
| fixture-implement-remaining-session-ms | full-dump | 2 | completed | 1.000 | 662 | 125 | 787 | 0 | 564 |  |
| fixture-implement-remaining-session-ms | full-dump | 3 | completed | 1.000 | 662 | 125 | 787 | 0 | 557 |  |
| fixture-implement-remaining-session-ms | data-brain | 1 | completed | 1.000 | 1390 | 125 | 1515 | 9 | 547 |  |
| fixture-implement-remaining-session-ms | data-brain | 2 | completed | 1.000 | 1390 | 125 | 1515 | 9 | 546 |  |
| fixture-implement-remaining-session-ms | data-brain | 3 | completed | 1.000 | 1390 | 125 | 1515 | 9 | 547 |  |
| fixture-implement-refresh-session | checkout | 1 | completed | 1.000 | 1124 | 126 | 1250 | 9 | 540 |  |
| fixture-implement-refresh-session | checkout | 2 | completed | 1.000 | 1124 | 126 | 1250 | 9 | 558 |  |
| fixture-implement-refresh-session | checkout | 3 | completed | 1.000 | 1124 | 126 | 1250 | 9 | 557 |  |
| fixture-implement-refresh-session | full-dump | 1 | completed | 1.000 | 672 | 126 | 798 | 0 | 529 |  |
| fixture-implement-refresh-session | full-dump | 2 | completed | 1.000 | 672 | 126 | 798 | 0 | 531 |  |
| fixture-implement-refresh-session | full-dump | 3 | completed | 1.000 | 672 | 126 | 798 | 0 | 528 |  |
| fixture-implement-refresh-session | data-brain | 1 | completed | 1.000 | 1405 | 126 | 1531 | 8 | 538 |  |
| fixture-implement-refresh-session | data-brain | 2 | completed | 1.000 | 1405 | 126 | 1531 | 8 | 531 |  |
| fixture-implement-refresh-session | data-brain | 3 | completed | 1.000 | 1405 | 126 | 1531 | 8 | 545 |  |
| fixture-implement-github-login | checkout | 1 | completed | 1.000 | 2025 | 68 | 2093 | 9 | 546 |  |
| fixture-implement-github-login | checkout | 2 | completed | 1.000 | 2025 | 68 | 2093 | 9 | 540 |  |
| fixture-implement-github-login | checkout | 3 | completed | 1.000 | 2025 | 68 | 2093 | 9 | 536 |  |
| fixture-implement-github-login | full-dump | 1 | completed | 1.000 | 666 | 68 | 734 | 0 | 572 |  |
| fixture-implement-github-login | full-dump | 2 | completed | 1.000 | 666 | 68 | 734 | 0 | 566 |  |
| fixture-implement-github-login | full-dump | 3 | completed | 1.000 | 666 | 68 | 734 | 0 | 559 |  |
| fixture-implement-github-login | data-brain | 1 | completed | 1.000 | 1373 | 68 | 1441 | 9 | 556 |  |
| fixture-implement-github-login | data-brain | 2 | completed | 1.000 | 1373 | 68 | 1441 | 9 | 555 |  |
| fixture-implement-github-login | data-brain | 3 | completed | 1.000 | 1373 | 68 | 1441 | 9 | 555 |  |
| fixture-implement-password-reset | checkout | 1 | completed | 1.000 | 863 | 104 | 967 | 9 | 547 |  |
| fixture-implement-password-reset | checkout | 2 | completed | 1.000 | 863 | 104 | 967 | 9 | 547 |  |
| fixture-implement-password-reset | checkout | 3 | completed | 1.000 | 863 | 104 | 967 | 9 | 547 |  |
| fixture-implement-password-reset | full-dump | 1 | completed | 1.000 | 677 | 104 | 781 | 0 | 568 |  |
| fixture-implement-password-reset | full-dump | 2 | completed | 1.000 | 677 | 104 | 781 | 0 | 568 |  |
| fixture-implement-password-reset | full-dump | 3 | completed | 1.000 | 677 | 104 | 781 | 0 | 564 |  |
| fixture-implement-password-reset | data-brain | 1 | completed | 1.000 | 1306 | 104 | 1410 | 9 | 691 |  |
| fixture-implement-password-reset | data-brain | 2 | completed | 1.000 | 1306 | 104 | 1410 | 9 | 647 |  |
| fixture-implement-password-reset | data-brain | 3 | completed | 1.000 | 1306 | 104 | 1410 | 9 | 690 |  |
| fixture-answer-session-policy | checkout | 1 | completed | 1.000 | 1317 | 18 | 1335 | 9 | 0 |  |
| fixture-answer-session-policy | checkout | 2 | completed | 1.000 | 1317 | 18 | 1335 | 9 | 0 |  |
| fixture-answer-session-policy | checkout | 3 | completed | 1.000 | 1317 | 18 | 1335 | 9 | 0 |  |
| fixture-answer-session-policy | full-dump | 1 | completed | 1.000 | 647 | 18 | 665 | 0 | 0 |  |
| fixture-answer-session-policy | full-dump | 2 | completed | 1.000 | 647 | 18 | 665 | 0 | 0 |  |
| fixture-answer-session-policy | full-dump | 3 | completed | 1.000 | 647 | 18 | 665 | 0 | 0 |  |
| fixture-answer-session-policy | data-brain | 1 | completed | 1.000 | 1364 | 18 | 1382 | 9 | 0 |  |
| fixture-answer-session-policy | data-brain | 2 | completed | 1.000 | 1364 | 18 | 1382 | 9 | 0 |  |
| fixture-answer-session-policy | data-brain | 3 | completed | 1.000 | 1364 | 18 | 1382 | 9 | 0 |  |
| fixture-answer-audit-schema | checkout | 1 | completed | 1.000 | 2043 | 16 | 2059 | 9 | 0 |  |
| fixture-answer-audit-schema | checkout | 2 | completed | 1.000 | 2043 | 16 | 2059 | 9 | 0 |  |
| fixture-answer-audit-schema | checkout | 3 | completed | 1.000 | 2043 | 16 | 2059 | 9 | 0 |  |
| fixture-answer-audit-schema | full-dump | 1 | completed | 1.000 | 642 | 16 | 658 | 0 | 0 |  |
| fixture-answer-audit-schema | full-dump | 2 | completed | 1.000 | 642 | 16 | 658 | 0 | 0 |  |
| fixture-answer-audit-schema | full-dump | 3 | completed | 1.000 | 642 | 16 | 658 | 0 | 0 |  |
| fixture-answer-audit-schema | data-brain | 1 | completed | 1.000 | 1278 | 16 | 1294 | 10 | 0 |  |
| fixture-answer-audit-schema | data-brain | 2 | completed | 1.000 | 1278 | 16 | 1294 | 10 | 0 |  |
| fixture-answer-audit-schema | data-brain | 3 | completed | 1.000 | 1278 | 16 | 1294 | 10 | 0 |  |
| fixture-answer-api-rule-conflict | checkout | 1 | completed | 1.000 | 1613 | 19 | 1632 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | checkout | 2 | completed | 1.000 | 1613 | 19 | 1632 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | checkout | 3 | completed | 1.000 | 1613 | 19 | 1632 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | full-dump | 1 | completed | 1.000 | 647 | 19 | 666 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | full-dump | 2 | completed | 1.000 | 647 | 19 | 666 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | full-dump | 3 | completed | 1.000 | 647 | 19 | 666 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | data-brain | 1 | completed | 1.000 | 1250 | 19 | 1269 | 12 | 0 |  |
| fixture-answer-api-rule-conflict | data-brain | 2 | completed | 1.000 | 1250 | 19 | 1269 | 12 | 0 |  |
| fixture-answer-api-rule-conflict | data-brain | 3 | completed | 1.000 | 1250 | 19 | 1269 | 12 | 0 |  |
| fixture-answer-legacy-billing | checkout | 1 | completed | 1.000 | 1107 | 19 | 1126 | 9 | 0 |  |
| fixture-answer-legacy-billing | checkout | 2 | completed | 1.000 | 1107 | 19 | 1126 | 9 | 0 |  |
| fixture-answer-legacy-billing | checkout | 3 | completed | 1.000 | 1107 | 19 | 1126 | 9 | 0 |  |
| fixture-answer-legacy-billing | full-dump | 1 | completed | 1.000 | 640 | 19 | 659 | 0 | 0 |  |
| fixture-answer-legacy-billing | full-dump | 2 | completed | 1.000 | 640 | 19 | 659 | 0 | 0 |  |
| fixture-answer-legacy-billing | full-dump | 3 | completed | 1.000 | 640 | 19 | 659 | 0 | 0 |  |
| fixture-answer-legacy-billing | data-brain | 1 | completed | 1.000 | 1115 | 19 | 1134 | 9 | 0 |  |
| fixture-answer-legacy-billing | data-brain | 2 | completed | 1.000 | 1115 | 19 | 1134 | 9 | 0 |  |
| fixture-answer-legacy-billing | data-brain | 3 | completed | 1.000 | 1115 | 19 | 1134 | 9 | 0 |  |
| fixture-judge-auth-drift | checkout | 1 | completed | 1.000 | 979 | 27 | 1006 | 9 | 0 |  |
| fixture-judge-auth-drift | checkout | 2 | completed | 1.000 | 979 | 27 | 1006 | 9 | 0 |  |
| fixture-judge-auth-drift | checkout | 3 | completed | 1.000 | 979 | 27 | 1006 | 9 | 0 |  |
| fixture-judge-auth-drift | full-dump | 1 | completed | 1.000 | 647 | 27 | 674 | 0 | 0 |  |
| fixture-judge-auth-drift | full-dump | 2 | completed | 1.000 | 647 | 27 | 674 | 0 | 0 |  |
| fixture-judge-auth-drift | full-dump | 3 | completed | 1.000 | 647 | 27 | 674 | 0 | 0 |  |
| fixture-judge-auth-drift | data-brain | 1 | completed | 1.000 | 1075 | 27 | 1102 | 11 | 0 |  |
| fixture-judge-auth-drift | data-brain | 2 | completed | 1.000 | 1075 | 27 | 1102 | 11 | 0 |  |
| fixture-judge-auth-drift | data-brain | 3 | completed | 1.000 | 1075 | 27 | 1102 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | checkout | 1 | completed | 1.000 | 2222 | 26 | 2248 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | checkout | 2 | completed | 1.000 | 2222 | 26 | 2248 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | checkout | 3 | completed | 1.000 | 2222 | 26 | 2248 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | full-dump | 1 | completed | 1.000 | 639 | 26 | 665 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | full-dump | 2 | completed | 1.000 | 639 | 26 | 665 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | full-dump | 3 | completed | 1.000 | 639 | 26 | 665 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | data-brain | 1 | completed | 1.000 | 1048 | 26 | 1074 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | data-brain | 2 | completed | 1.000 | 1048 | 26 | 1074 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | data-brain | 3 | completed | 1.000 | 1048 | 26 | 1074 | 11 | 0 |  |
| real-answer-github-permissions | checkout | 1 | completed | 1.000 | 9021 | 29 | 9050 | 8 | 0 |  |
| real-answer-github-permissions | checkout | 2 | completed | 1.000 | 9021 | 29 | 9050 | 8 | 0 |  |
| real-answer-github-permissions | checkout | 3 | completed | 1.000 | 9021 | 29 | 9050 | 8 | 0 |  |
| real-answer-github-permissions | full-dump | 1 | completed | 1.000 | 29938 | 29 | 29967 | 0 | 0 |  |
| real-answer-github-permissions | full-dump | 2 | completed | 1.000 | 29938 | 29 | 29967 | 0 | 0 |  |
| real-answer-github-permissions | full-dump | 3 | completed | 1.000 | 29938 | 29 | 29967 | 0 | 0 |  |
| real-answer-github-permissions | data-brain | 1 | completed | 1.000 | 2149 | 29 | 2178 | 13 | 0 |  |
| real-answer-github-permissions | data-brain | 2 | completed | 1.000 | 2149 | 29 | 2178 | 13 | 0 |  |
| real-answer-github-permissions | data-brain | 3 | completed | 1.000 | 2149 | 29 | 2178 | 13 | 0 |  |
| real-answer-mcp-contract | checkout | 1 | completed | 1.000 | 14338 | 24 | 14362 | 4 | 0 |  |
| real-answer-mcp-contract | checkout | 2 | completed | 1.000 | 14338 | 24 | 14362 | 4 | 0 |  |
| real-answer-mcp-contract | checkout | 3 | completed | 1.000 | 14338 | 24 | 14362 | 4 | 0 |  |
| real-answer-mcp-contract | full-dump | 1 | completed | 1.000 | 29932 | 24 | 29956 | 0 | 0 |  |
| real-answer-mcp-contract | full-dump | 2 | completed | 1.000 | 29932 | 24 | 29956 | 0 | 0 |  |
| real-answer-mcp-contract | full-dump | 3 | completed | 1.000 | 29932 | 24 | 29956 | 0 | 0 |  |
| real-answer-mcp-contract | data-brain | 1 | completed | 1.000 | 2487 | 24 | 2511 | 12 | 0 |  |
| real-answer-mcp-contract | data-brain | 2 | completed | 1.000 | 2487 | 24 | 2511 | 12 | 0 |  |
| real-answer-mcp-contract | data-brain | 3 | completed | 1.000 | 2487 | 24 | 2511 | 12 | 0 |  |
