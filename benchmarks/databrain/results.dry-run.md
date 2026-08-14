# Data Brain efficacy benchmark

Full deterministic trial data: [./results.dry-run.json](./results.dry-run.json)

## Run contract

- Mode: `dry-run`
- Model/version: `gpt-5-nano-2025-08-07`
- Generated: `2026-08-14T14:29:11.600Z`
- Manifest SHA-256: `03af75ee450fc9a98c8b27f3606cbfabda2285ae638bf537c75407a2fdc1e373`
- Token accounting: Mock usage is deterministic ceil((context + prompt) characters / 4) input and serialized-output characters / 4 output.
- Protocol: 12 pre-registered tasks × 3 trials × 3 arms = 108 trials.
- Prompt and model are identical across arms. Only repository-context retrieval differs.
- Failed trials remain in denominators with score 0 and their recorded token counts.

## Hypothesis gate

- Accuracy delta, Data Brain vs checkout: 0.00pp (non-inferiority margin: -5pp; improvement goal: +5pp).
- Token reduction, Data Brain vs checkout: 54.59% (target: 30%).
- Result: **MET**.

## Arm totals

| Arm | Trials | Mean score | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| checkout | 36 | 1.000 | 100.00% | 125718 | 1803 | 127521 | 303 | 7835 | 0 |
| full-dump | 36 | 1.000 | 100.00% | 230772 | 1803 | 232575 | 0 | 7283 | 0 |
| data-brain | 36 | 1.000 | 100.00% | 56103 | 1803 | 57906 | 378 | 7432 | 0 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 1.000 | 3519 | 27 | 2196 | 0 |
| fixture-implement-remaining-session-ms | full-dump | 1.000 | 2361 | 0 | 1841 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 4794 | 30 | 1845 | 0 |
| fixture-implement-refresh-session | checkout | 1.000 | 3750 | 27 | 1889 | 0 |
| fixture-implement-refresh-session | full-dump | 1.000 | 2394 | 0 | 1796 | 0 |
| fixture-implement-refresh-session | data-brain | 1.000 | 4842 | 27 | 1804 | 0 |
| fixture-implement-github-login | checkout | 1.000 | 6279 | 27 | 1916 | 0 |
| fixture-implement-github-login | full-dump | 1.000 | 2202 | 0 | 1798 | 0 |
| fixture-implement-github-login | data-brain | 1.000 | 4584 | 30 | 1810 | 0 |
| fixture-implement-password-reset | checkout | 1.000 | 2952 | 27 | 1833 | 0 |
| fixture-implement-password-reset | full-dump | 1.000 | 2397 | 0 | 1848 | 0 |
| fixture-implement-password-reset | data-brain | 1.000 | 4584 | 30 | 1973 | 0 |
| fixture-answer-session-policy | checkout | 1.000 | 4005 | 27 | 0 | 0 |
| fixture-answer-session-policy | full-dump | 1.000 | 1995 | 0 | 0 | 0 |
| fixture-answer-session-policy | data-brain | 1.000 | 4146 | 27 | 0 | 0 |
| fixture-answer-audit-schema | checkout | 1.000 | 6177 | 27 | 0 | 0 |
| fixture-answer-audit-schema | full-dump | 1.000 | 1974 | 0 | 0 | 0 |
| fixture-answer-audit-schema | data-brain | 1.000 | 3882 | 30 | 0 | 0 |
| fixture-answer-api-rule-conflict | checkout | 1.000 | 4896 | 27 | 1 | 0 |
| fixture-answer-api-rule-conflict | full-dump | 1.000 | 1998 | 0 | 0 | 0 |
| fixture-answer-api-rule-conflict | data-brain | 1.000 | 3807 | 36 | 0 | 0 |
| fixture-answer-legacy-billing | checkout | 1.000 | 3378 | 27 | 0 | 0 |
| fixture-answer-legacy-billing | full-dump | 1.000 | 1977 | 0 | 0 | 0 |
| fixture-answer-legacy-billing | data-brain | 1.000 | 3402 | 27 | 0 | 0 |
| fixture-judge-auth-drift | checkout | 1.000 | 3003 | 27 | 0 | 0 |
| fixture-judge-auth-drift | full-dump | 1.000 | 2193 | 0 | 0 | 0 |
| fixture-judge-auth-drift | data-brain | 1.000 | 3993 | 33 | 0 | 0 |
| fixture-judge-instruction-doc-drift | checkout | 1.000 | 6906 | 27 | 0 | 0 |
| fixture-judge-instruction-doc-drift | full-dump | 1.000 | 2166 | 0 | 0 | 0 |
| fixture-judge-instruction-doc-drift | data-brain | 1.000 | 4248 | 33 | 0 | 0 |
| real-answer-github-permissions | checkout | 1.000 | 38889 | 24 | 0 | 0 |
| real-answer-github-permissions | full-dump | 1.000 | 105501 | 0 | 0 | 0 |
| real-answer-github-permissions | data-brain | 1.000 | 6621 | 39 | 0 | 0 |
| real-answer-mcp-contract | checkout | 1.000 | 43767 | 9 | 0 | 0 |
| real-answer-mcp-contract | full-dump | 1.000 | 105417 | 0 | 0 | 0 |
| real-answer-mcp-contract | data-brain | 1.000 | 9003 | 36 | 0 | 0 |

## Every trial

| Task | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | checkout | 1 | completed | 1.000 | 1048 | 125 | 1173 | 9 | 732 |  |
| fixture-implement-remaining-session-ms | checkout | 2 | completed | 1.000 | 1048 | 125 | 1173 | 9 | 732 |  |
| fixture-implement-remaining-session-ms | checkout | 3 | completed | 1.000 | 1048 | 125 | 1173 | 9 | 732 |  |
| fixture-implement-remaining-session-ms | full-dump | 1 | completed | 1.000 | 662 | 125 | 787 | 0 | 619 |  |
| fixture-implement-remaining-session-ms | full-dump | 2 | completed | 1.000 | 662 | 125 | 787 | 0 | 602 |  |
| fixture-implement-remaining-session-ms | full-dump | 3 | completed | 1.000 | 662 | 125 | 787 | 0 | 620 |  |
| fixture-implement-remaining-session-ms | data-brain | 1 | completed | 1.000 | 1473 | 125 | 1598 | 10 | 621 |  |
| fixture-implement-remaining-session-ms | data-brain | 2 | completed | 1.000 | 1473 | 125 | 1598 | 10 | 612 |  |
| fixture-implement-remaining-session-ms | data-brain | 3 | completed | 1.000 | 1473 | 125 | 1598 | 10 | 612 |  |
| fixture-implement-refresh-session | checkout | 1 | completed | 1.000 | 1124 | 126 | 1250 | 9 | 636 |  |
| fixture-implement-refresh-session | checkout | 2 | completed | 1.000 | 1124 | 126 | 1250 | 9 | 636 |  |
| fixture-implement-refresh-session | checkout | 3 | completed | 1.000 | 1124 | 126 | 1250 | 9 | 617 |  |
| fixture-implement-refresh-session | full-dump | 1 | completed | 1.000 | 672 | 126 | 798 | 0 | 599 |  |
| fixture-implement-refresh-session | full-dump | 2 | completed | 1.000 | 672 | 126 | 798 | 0 | 599 |  |
| fixture-implement-refresh-session | full-dump | 3 | completed | 1.000 | 672 | 126 | 798 | 0 | 598 |  |
| fixture-implement-refresh-session | data-brain | 1 | completed | 1.000 | 1488 | 126 | 1614 | 9 | 611 |  |
| fixture-implement-refresh-session | data-brain | 2 | completed | 1.000 | 1488 | 126 | 1614 | 9 | 597 |  |
| fixture-implement-refresh-session | data-brain | 3 | completed | 1.000 | 1488 | 126 | 1614 | 9 | 596 |  |
| fixture-implement-github-login | checkout | 1 | completed | 1.000 | 2025 | 68 | 2093 | 9 | 639 |  |
| fixture-implement-github-login | checkout | 2 | completed | 1.000 | 2025 | 68 | 2093 | 9 | 639 |  |
| fixture-implement-github-login | checkout | 3 | completed | 1.000 | 2025 | 68 | 2093 | 9 | 638 |  |
| fixture-implement-github-login | full-dump | 1 | completed | 1.000 | 666 | 68 | 734 | 0 | 601 |  |
| fixture-implement-github-login | full-dump | 2 | completed | 1.000 | 666 | 68 | 734 | 0 | 595 |  |
| fixture-implement-github-login | full-dump | 3 | completed | 1.000 | 666 | 68 | 734 | 0 | 602 |  |
| fixture-implement-github-login | data-brain | 1 | completed | 1.000 | 1460 | 68 | 1528 | 10 | 599 |  |
| fixture-implement-github-login | data-brain | 2 | completed | 1.000 | 1460 | 68 | 1528 | 10 | 613 |  |
| fixture-implement-github-login | data-brain | 3 | completed | 1.000 | 1460 | 68 | 1528 | 10 | 598 |  |
| fixture-implement-password-reset | checkout | 1 | completed | 1.000 | 880 | 104 | 984 | 9 | 611 |  |
| fixture-implement-password-reset | checkout | 2 | completed | 1.000 | 880 | 104 | 984 | 9 | 611 |  |
| fixture-implement-password-reset | checkout | 3 | completed | 1.000 | 880 | 104 | 984 | 9 | 611 |  |
| fixture-implement-password-reset | full-dump | 1 | completed | 1.000 | 695 | 104 | 799 | 0 | 627 |  |
| fixture-implement-password-reset | full-dump | 2 | completed | 1.000 | 695 | 104 | 799 | 0 | 607 |  |
| fixture-implement-password-reset | full-dump | 3 | completed | 1.000 | 695 | 104 | 799 | 0 | 614 |  |
| fixture-implement-password-reset | data-brain | 1 | completed | 1.000 | 1424 | 104 | 1528 | 10 | 628 |  |
| fixture-implement-password-reset | data-brain | 2 | completed | 1.000 | 1424 | 104 | 1528 | 10 | 673 |  |
| fixture-implement-password-reset | data-brain | 3 | completed | 1.000 | 1424 | 104 | 1528 | 10 | 672 |  |
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
| fixture-answer-api-rule-conflict | checkout | 1 | completed | 1.000 | 1613 | 19 | 1632 | 9 | 1 |  |
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
| fixture-judge-auth-drift | checkout | 1 | completed | 1.000 | 974 | 27 | 1001 | 9 | 0 |  |
| fixture-judge-auth-drift | checkout | 2 | completed | 1.000 | 974 | 27 | 1001 | 9 | 0 |  |
| fixture-judge-auth-drift | checkout | 3 | completed | 1.000 | 974 | 27 | 1001 | 9 | 0 |  |
| fixture-judge-auth-drift | full-dump | 1 | completed | 1.000 | 704 | 27 | 731 | 0 | 0 |  |
| fixture-judge-auth-drift | full-dump | 2 | completed | 1.000 | 704 | 27 | 731 | 0 | 0 |  |
| fixture-judge-auth-drift | full-dump | 3 | completed | 1.000 | 704 | 27 | 731 | 0 | 0 |  |
| fixture-judge-auth-drift | data-brain | 1 | completed | 1.000 | 1304 | 27 | 1331 | 11 | 0 |  |
| fixture-judge-auth-drift | data-brain | 2 | completed | 1.000 | 1304 | 27 | 1331 | 11 | 0 |  |
| fixture-judge-auth-drift | data-brain | 3 | completed | 1.000 | 1304 | 27 | 1331 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | checkout | 1 | completed | 1.000 | 2276 | 26 | 2302 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | checkout | 2 | completed | 1.000 | 2276 | 26 | 2302 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | checkout | 3 | completed | 1.000 | 2276 | 26 | 2302 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | full-dump | 1 | completed | 1.000 | 696 | 26 | 722 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | full-dump | 2 | completed | 1.000 | 696 | 26 | 722 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | full-dump | 3 | completed | 1.000 | 696 | 26 | 722 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | data-brain | 1 | completed | 1.000 | 1390 | 26 | 1416 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | data-brain | 2 | completed | 1.000 | 1390 | 26 | 1416 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | data-brain | 3 | completed | 1.000 | 1390 | 26 | 1416 | 11 | 0 |  |
| real-answer-github-permissions | checkout | 1 | completed | 1.000 | 12934 | 29 | 12963 | 8 | 0 |  |
| real-answer-github-permissions | checkout | 2 | completed | 1.000 | 12934 | 29 | 12963 | 8 | 0 |  |
| real-answer-github-permissions | checkout | 3 | completed | 1.000 | 12934 | 29 | 12963 | 8 | 0 |  |
| real-answer-github-permissions | full-dump | 1 | completed | 1.000 | 35138 | 29 | 35167 | 0 | 0 |  |
| real-answer-github-permissions | full-dump | 2 | completed | 1.000 | 35138 | 29 | 35167 | 0 | 0 |  |
| real-answer-github-permissions | full-dump | 3 | completed | 1.000 | 35138 | 29 | 35167 | 0 | 0 |  |
| real-answer-github-permissions | data-brain | 1 | completed | 1.000 | 2178 | 29 | 2207 | 13 | 0 |  |
| real-answer-github-permissions | data-brain | 2 | completed | 1.000 | 2178 | 29 | 2207 | 13 | 0 |  |
| real-answer-github-permissions | data-brain | 3 | completed | 1.000 | 2178 | 29 | 2207 | 13 | 0 |  |
| real-answer-mcp-contract | checkout | 1 | completed | 1.000 | 14565 | 24 | 14589 | 3 | 0 |  |
| real-answer-mcp-contract | checkout | 2 | completed | 1.000 | 14565 | 24 | 14589 | 3 | 0 |  |
| real-answer-mcp-contract | checkout | 3 | completed | 1.000 | 14565 | 24 | 14589 | 3 | 0 |  |
| real-answer-mcp-contract | full-dump | 1 | completed | 1.000 | 35115 | 24 | 35139 | 0 | 0 |  |
| real-answer-mcp-contract | full-dump | 2 | completed | 1.000 | 35115 | 24 | 35139 | 0 | 0 |  |
| real-answer-mcp-contract | full-dump | 3 | completed | 1.000 | 35115 | 24 | 35139 | 0 | 0 |  |
| real-answer-mcp-contract | data-brain | 1 | completed | 1.000 | 2977 | 24 | 3001 | 12 | 0 |  |
| real-answer-mcp-contract | data-brain | 2 | completed | 1.000 | 2977 | 24 | 3001 | 12 | 0 |  |
| real-answer-mcp-contract | data-brain | 3 | completed | 1.000 | 2977 | 24 | 3001 | 12 | 0 |  |
