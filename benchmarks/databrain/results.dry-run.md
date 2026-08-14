# Data Brain efficacy benchmark

Full deterministic trial data: [./results.dry-run.json](./results.dry-run.json)

## Run contract

- Mode: `dry-run`
- Model/version: `gpt-5-nano-2025-08-07`
- Generated: `2026-08-14T14:02:06.770Z`
- Manifest SHA-256: `fc9f23049679ab559a610324db1a7b3359a62969fb03374c6871907f89c2a662`
- Token accounting: Mock usage is deterministic ceil((context + prompt) characters / 4) input and serialized-output characters / 4 output.
- Protocol: 12 pre-registered tasks × 3 trials × 3 arms = 108 trials.
- Prompt and model are identical across arms. Only repository-context retrieval differs.
- Failed trials remain in denominators with score 0 and their recorded token counts.

## Hypothesis gate

- Accuracy delta, Data Brain vs checkout: 0.00pp (non-inferiority margin: -5pp; improvement goal: +5pp).
- Token reduction, Data Brain vs checkout: 52.00% (target: 30%).
- Result: **MET**.

## Arm totals

| Arm | Trials | Mean score | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| checkout | 36 | 1.000 | 100.00% | 114834 | 1803 | 116637 | 303 | 7031 | 0 |
| full-dump | 36 | 1.000 | 100.00% | 204888 | 1803 | 206691 | 0 | 7065 | 0 |
| data-brain | 36 | 1.000 | 100.00% | 54180 | 1803 | 55983 | 378 | 7143 | 0 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 1.000 | 3519 | 27 | 1804 | 0 |
| fixture-implement-remaining-session-ms | full-dump | 1.000 | 2361 | 0 | 1777 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 4794 | 30 | 1773 | 0 |
| fixture-implement-refresh-session | checkout | 1.000 | 3750 | 27 | 1754 | 0 |
| fixture-implement-refresh-session | full-dump | 1.000 | 2394 | 0 | 1735 | 0 |
| fixture-implement-refresh-session | data-brain | 1.000 | 4842 | 27 | 1745 | 0 |
| fixture-implement-github-login | checkout | 1.000 | 6279 | 27 | 1729 | 0 |
| fixture-implement-github-login | full-dump | 1.000 | 2202 | 0 | 1798 | 0 |
| fixture-implement-github-login | data-brain | 1.000 | 4584 | 30 | 1787 | 0 |
| fixture-implement-password-reset | checkout | 1.000 | 2901 | 27 | 1743 | 0 |
| fixture-implement-password-reset | full-dump | 1.000 | 2343 | 0 | 1755 | 0 |
| fixture-implement-password-reset | data-brain | 1.000 | 4482 | 30 | 1836 | 0 |
| fixture-answer-session-policy | checkout | 1.000 | 4005 | 27 | 1 | 0 |
| fixture-answer-session-policy | full-dump | 1.000 | 1995 | 0 | 0 | 0 |
| fixture-answer-session-policy | data-brain | 1.000 | 4146 | 27 | 0 | 0 |
| fixture-answer-audit-schema | checkout | 1.000 | 6177 | 27 | 0 | 0 |
| fixture-answer-audit-schema | full-dump | 1.000 | 1974 | 0 | 0 | 0 |
| fixture-answer-audit-schema | data-brain | 1.000 | 3882 | 30 | 1 | 0 |
| fixture-answer-api-rule-conflict | checkout | 1.000 | 4896 | 27 | 0 | 0 |
| fixture-answer-api-rule-conflict | full-dump | 1.000 | 1998 | 0 | 0 | 0 |
| fixture-answer-api-rule-conflict | data-brain | 1.000 | 3807 | 36 | 0 | 0 |
| fixture-answer-legacy-billing | checkout | 1.000 | 3378 | 27 | 0 | 0 |
| fixture-answer-legacy-billing | full-dump | 1.000 | 1977 | 0 | 0 | 0 |
| fixture-answer-legacy-billing | data-brain | 1.000 | 3402 | 27 | 0 | 0 |
| fixture-judge-auth-drift | checkout | 1.000 | 3018 | 27 | 0 | 0 |
| fixture-judge-auth-drift | full-dump | 1.000 | 2022 | 0 | 0 | 0 |
| fixture-judge-auth-drift | data-brain | 1.000 | 3306 | 33 | 1 | 0 |
| fixture-judge-instruction-doc-drift | checkout | 1.000 | 6744 | 27 | 0 | 0 |
| fixture-judge-instruction-doc-drift | full-dump | 1.000 | 1995 | 0 | 0 | 0 |
| fixture-judge-instruction-doc-drift | data-brain | 1.000 | 3222 | 33 | 0 | 0 |
| real-answer-github-permissions | checkout | 1.000 | 28293 | 24 | 0 | 0 |
| real-answer-github-permissions | full-dump | 1.000 | 92730 | 0 | 0 | 0 |
| real-answer-github-permissions | data-brain | 1.000 | 6507 | 39 | 0 | 0 |
| real-answer-mcp-contract | checkout | 1.000 | 43677 | 9 | 0 | 0 |
| real-answer-mcp-contract | full-dump | 1.000 | 92700 | 0 | 0 | 0 |
| real-answer-mcp-contract | data-brain | 1.000 | 9009 | 36 | 0 | 0 |

## Every trial

| Task | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | checkout | 1 | completed | 1.000 | 1048 | 125 | 1173 | 9 | 602 |  |
| fixture-implement-remaining-session-ms | checkout | 2 | completed | 1.000 | 1048 | 125 | 1173 | 9 | 601 |  |
| fixture-implement-remaining-session-ms | checkout | 3 | completed | 1.000 | 1048 | 125 | 1173 | 9 | 601 |  |
| fixture-implement-remaining-session-ms | full-dump | 1 | completed | 1.000 | 662 | 125 | 787 | 0 | 600 |  |
| fixture-implement-remaining-session-ms | full-dump | 2 | completed | 1.000 | 662 | 125 | 787 | 0 | 578 |  |
| fixture-implement-remaining-session-ms | full-dump | 3 | completed | 1.000 | 662 | 125 | 787 | 0 | 599 |  |
| fixture-implement-remaining-session-ms | data-brain | 1 | completed | 1.000 | 1473 | 125 | 1598 | 10 | 587 |  |
| fixture-implement-remaining-session-ms | data-brain | 2 | completed | 1.000 | 1473 | 125 | 1598 | 10 | 594 |  |
| fixture-implement-remaining-session-ms | data-brain | 3 | completed | 1.000 | 1473 | 125 | 1598 | 10 | 592 |  |
| fixture-implement-refresh-session | checkout | 1 | completed | 1.000 | 1124 | 126 | 1250 | 9 | 585 |  |
| fixture-implement-refresh-session | checkout | 2 | completed | 1.000 | 1124 | 126 | 1250 | 9 | 586 |  |
| fixture-implement-refresh-session | checkout | 3 | completed | 1.000 | 1124 | 126 | 1250 | 9 | 583 |  |
| fixture-implement-refresh-session | full-dump | 1 | completed | 1.000 | 672 | 126 | 798 | 0 | 579 |  |
| fixture-implement-refresh-session | full-dump | 2 | completed | 1.000 | 672 | 126 | 798 | 0 | 579 |  |
| fixture-implement-refresh-session | full-dump | 3 | completed | 1.000 | 672 | 126 | 798 | 0 | 577 |  |
| fixture-implement-refresh-session | data-brain | 1 | completed | 1.000 | 1488 | 126 | 1614 | 9 | 578 |  |
| fixture-implement-refresh-session | data-brain | 2 | completed | 1.000 | 1488 | 126 | 1614 | 9 | 584 |  |
| fixture-implement-refresh-session | data-brain | 3 | completed | 1.000 | 1488 | 126 | 1614 | 9 | 583 |  |
| fixture-implement-github-login | checkout | 1 | completed | 1.000 | 2025 | 68 | 2093 | 9 | 584 |  |
| fixture-implement-github-login | checkout | 2 | completed | 1.000 | 2025 | 68 | 2093 | 9 | 566 |  |
| fixture-implement-github-login | checkout | 3 | completed | 1.000 | 2025 | 68 | 2093 | 9 | 579 |  |
| fixture-implement-github-login | full-dump | 1 | completed | 1.000 | 666 | 68 | 734 | 0 | 605 |  |
| fixture-implement-github-login | full-dump | 2 | completed | 1.000 | 666 | 68 | 734 | 0 | 605 |  |
| fixture-implement-github-login | full-dump | 3 | completed | 1.000 | 666 | 68 | 734 | 0 | 588 |  |
| fixture-implement-github-login | data-brain | 1 | completed | 1.000 | 1460 | 68 | 1528 | 10 | 596 |  |
| fixture-implement-github-login | data-brain | 2 | completed | 1.000 | 1460 | 68 | 1528 | 10 | 595 |  |
| fixture-implement-github-login | data-brain | 3 | completed | 1.000 | 1460 | 68 | 1528 | 10 | 596 |  |
| fixture-implement-password-reset | checkout | 1 | completed | 1.000 | 863 | 104 | 967 | 9 | 581 |  |
| fixture-implement-password-reset | checkout | 2 | completed | 1.000 | 863 | 104 | 967 | 9 | 581 |  |
| fixture-implement-password-reset | checkout | 3 | completed | 1.000 | 863 | 104 | 967 | 9 | 581 |  |
| fixture-implement-password-reset | full-dump | 1 | completed | 1.000 | 677 | 104 | 781 | 0 | 587 |  |
| fixture-implement-password-reset | full-dump | 2 | completed | 1.000 | 677 | 104 | 781 | 0 | 582 |  |
| fixture-implement-password-reset | full-dump | 3 | completed | 1.000 | 677 | 104 | 781 | 0 | 586 |  |
| fixture-implement-password-reset | data-brain | 1 | completed | 1.000 | 1390 | 104 | 1494 | 10 | 623 |  |
| fixture-implement-password-reset | data-brain | 2 | completed | 1.000 | 1390 | 104 | 1494 | 10 | 590 |  |
| fixture-implement-password-reset | data-brain | 3 | completed | 1.000 | 1390 | 104 | 1494 | 10 | 623 |  |
| fixture-answer-session-policy | checkout | 1 | completed | 1.000 | 1317 | 18 | 1335 | 9 | 1 |  |
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
| fixture-answer-audit-schema | data-brain | 1 | completed | 1.000 | 1278 | 16 | 1294 | 10 | 1 |  |
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
| fixture-judge-auth-drift | data-brain | 1 | completed | 1.000 | 1075 | 27 | 1102 | 11 | 1 |  |
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
| real-answer-github-permissions | checkout | 1 | completed | 1.000 | 9402 | 29 | 9431 | 8 | 0 |  |
| real-answer-github-permissions | checkout | 2 | completed | 1.000 | 9402 | 29 | 9431 | 8 | 0 |  |
| real-answer-github-permissions | checkout | 3 | completed | 1.000 | 9402 | 29 | 9431 | 8 | 0 |  |
| real-answer-github-permissions | full-dump | 1 | completed | 1.000 | 30881 | 29 | 30910 | 0 | 0 |  |
| real-answer-github-permissions | full-dump | 2 | completed | 1.000 | 30881 | 29 | 30910 | 0 | 0 |  |
| real-answer-github-permissions | full-dump | 3 | completed | 1.000 | 30881 | 29 | 30910 | 0 | 0 |  |
| real-answer-github-permissions | data-brain | 1 | completed | 1.000 | 2140 | 29 | 2169 | 13 | 0 |  |
| real-answer-github-permissions | data-brain | 2 | completed | 1.000 | 2140 | 29 | 2169 | 13 | 0 |  |
| real-answer-github-permissions | data-brain | 3 | completed | 1.000 | 2140 | 29 | 2169 | 13 | 0 |  |
| real-answer-mcp-contract | checkout | 1 | completed | 1.000 | 14535 | 24 | 14559 | 3 | 0 |  |
| real-answer-mcp-contract | checkout | 2 | completed | 1.000 | 14535 | 24 | 14559 | 3 | 0 |  |
| real-answer-mcp-contract | checkout | 3 | completed | 1.000 | 14535 | 24 | 14559 | 3 | 0 |  |
| real-answer-mcp-contract | full-dump | 1 | completed | 1.000 | 30876 | 24 | 30900 | 0 | 0 |  |
| real-answer-mcp-contract | full-dump | 2 | completed | 1.000 | 30876 | 24 | 30900 | 0 | 0 |  |
| real-answer-mcp-contract | full-dump | 3 | completed | 1.000 | 30876 | 24 | 30900 | 0 | 0 |  |
| real-answer-mcp-contract | data-brain | 1 | completed | 1.000 | 2979 | 24 | 3003 | 12 | 0 |  |
| real-answer-mcp-contract | data-brain | 2 | completed | 1.000 | 2979 | 24 | 3003 | 12 | 0 |  |
| real-answer-mcp-contract | data-brain | 3 | completed | 1.000 | 2979 | 24 | 3003 | 12 | 0 |  |
