# Data Brain efficacy benchmark

Full deterministic trial data: [./results.v3.dry-run.json](./results.v3.dry-run.json)

## Run contract

- Mode: `dry-run`
- Schema version: `2`
- Generated: `2026-08-16T15:21:45.289Z`
- Manifest SHA-256: `ffffb0a973cef8d6c2946086d136289561961419c7210c52562e1741253bf6ba`
- Token accounting: Mock usage is deterministic ceil((context + prompt) characters / 4) input and serialized-output characters / 4 output.
- Confidence method: Seeded nonparametric bootstrap, percentile method: 2000 resamples with replacement over the per-trial units, 95% interval, mulberry32 PRNG seeded by FNV-1a of the aggregate key. Failed trials stay in the resampling pool with score 0.
- Protocol: 20 pre-registered tasks (10 realistic-repository, 10 fixture) × 5 trials × 3 arms × 2 models = 600 registered trials; 600 executed.
- Overrides: none (full pre-registered protocol)
- Prompt and retrieved context are identical across models for a given task and arm. Only repository-context retrieval differs between arms.
- Failed trials remain in denominators with score 0 and their recorded token counts.

## Model coverage

| Model | Provider | Status | Trials | Skip reason |
| --- | --- | --- | ---: | --- |
| gpt-5-nano-2025-08-07 | openai | executed | 300 |  |
| claude-sonnet-5 | anthropic | executed | 300 |  |

## Hypothesis gate

Gate is evaluated against the interval, not the point estimate: non-inferiority holds when the accuracy-delta lower bound clears the -5pp margin, the improvement goal holds when it clears +5pp, and the token target holds when the token-reduction lower bound clears 30%.

| Scope | Paired units | Accuracy Δ | Accuracy 95% CI | Token reduction | Token 95% CI | Non-inferior | +5pp goal | Token target | Gate |
| --- | ---: | ---: | --- | ---: | --- | --- | --- | --- | --- |
| all models (pooled) | 200 | 0.00pp | [0.00, 0.00] | 72.46% | [70.26, 74.22] | yes | no | yes | MET |
| gpt-5-nano-2025-08-07 | 100 | 0.00pp | [0.00, 0.00] | 72.46% | [69.26, 74.92] | yes | no | yes | MET |
| claude-sonnet-5 | 100 | 0.00pp | [0.00, 0.00] | 72.46% | [69.33, 74.93] | yes | no | yes | MET |

- Pooled result: **MET**.

## Arm totals

| Model | Arm | Trials | Mean score | Mean 95% CI | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all models (pooled) | checkout | 200 | 1.000 | [1.00, 1.00] | 100.00% | 1590040 | 8300 | 1598340 | 1460 | 25269 | 0 |
| all models (pooled) | full-dump | 200 | 1.000 | [1.00, 1.00] | 100.00% | 4013560 | 8300 | 4021860 | 0 | 32167 | 0 |
| all models (pooled) | data-brain | 200 | 1.000 | [1.00, 1.00] | 100.00% | 431850 | 8300 | 440150 | 2240 | 25533 | 0 |
| gpt-5-nano-2025-08-07 | checkout | 100 | 1.000 | [1.00, 1.00] | 100.00% | 795020 | 4150 | 799170 | 730 | 12548 | 0 |
| gpt-5-nano-2025-08-07 | full-dump | 100 | 1.000 | [1.00, 1.00] | 100.00% | 2006780 | 4150 | 2010930 | 0 | 12560 | 0 |
| gpt-5-nano-2025-08-07 | data-brain | 100 | 1.000 | [1.00, 1.00] | 100.00% | 215925 | 4150 | 220075 | 1120 | 12434 | 0 |
| claude-sonnet-5 | checkout | 100 | 1.000 | [1.00, 1.00] | 100.00% | 795020 | 4150 | 799170 | 730 | 12721 | 0 |
| claude-sonnet-5 | full-dump | 100 | 1.000 | [1.00, 1.00] | 100.00% | 2006780 | 4150 | 2010930 | 0 | 19607 | 0 |
| claude-sonnet-5 | data-brain | 100 | 1.000 | [1.00, 1.00] | 100.00% | 215925 | 4150 | 220075 | 1120 | 13099 | 0 |

## Task × arm totals

| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixture-implement-remaining-session-ms | checkout | 1.000 | 11670 | 90 | 6356 | 0 |
| fixture-implement-remaining-session-ms | full-dump | 1.000 | 7860 | 0 | 6182 | 0 |
| fixture-implement-remaining-session-ms | data-brain | 1.000 | 15970 | 100 | 6232 | 0 |
| fixture-implement-refresh-session | checkout | 1.000 | 12440 | 90 | 6267 | 0 |
| fixture-implement-refresh-session | full-dump | 1.000 | 7970 | 0 | 6287 | 0 |
| fixture-implement-refresh-session | data-brain | 1.000 | 16130 | 90 | 6180 | 0 |
| fixture-implement-github-login | checkout | 1.000 | 20720 | 90 | 6238 | 0 |
| fixture-implement-github-login | full-dump | 1.000 | 7330 | 0 | 6329 | 0 |
| fixture-implement-github-login | data-brain | 1.000 | 15260 | 100 | 6224 | 0 |
| fixture-implement-password-reset | checkout | 1.000 | 9830 | 90 | 6406 | 0 |
| fixture-implement-password-reset | full-dump | 1.000 | 7970 | 0 | 6287 | 0 |
| fixture-implement-password-reset | data-brain | 1.000 | 15250 | 100 | 6327 | 0 |
| fixture-answer-session-policy | checkout | 1.000 | 13290 | 90 | 0 | 0 |
| fixture-answer-session-policy | full-dump | 1.000 | 6640 | 0 | 0 | 0 |
| fixture-answer-session-policy | data-brain | 1.000 | 13810 | 90 | 0 | 0 |
| fixture-answer-audit-schema | checkout | 1.000 | 20460 | 90 | 0 | 0 |
| fixture-answer-audit-schema | full-dump | 1.000 | 6570 | 0 | 0 | 0 |
| fixture-answer-audit-schema | data-brain | 1.000 | 12930 | 100 | 0 | 0 |
| fixture-answer-api-rule-conflict | checkout | 1.000 | 16170 | 90 | 1 | 0 |
| fixture-answer-api-rule-conflict | full-dump | 1.000 | 6650 | 0 | 0 | 0 |
| fixture-answer-api-rule-conflict | data-brain | 1.000 | 12680 | 120 | 0 | 0 |
| fixture-answer-legacy-billing | checkout | 1.000 | 11240 | 90 | 0 | 0 |
| fixture-answer-legacy-billing | full-dump | 1.000 | 6570 | 0 | 0 | 0 |
| fixture-answer-legacy-billing | data-brain | 1.000 | 11320 | 90 | 0 | 0 |
| fixture-judge-auth-drift | checkout | 1.000 | 9990 | 90 | 0 | 0 |
| fixture-judge-auth-drift | full-dump | 1.000 | 7290 | 0 | 1 | 0 |
| fixture-judge-auth-drift | data-brain | 1.000 | 13290 | 110 | 0 | 0 |
| fixture-judge-instruction-doc-drift | checkout | 1.000 | 22790 | 90 | 0 | 0 |
| fixture-judge-instruction-doc-drift | full-dump | 1.000 | 7200 | 0 | 1 | 0 |
| fixture-judge-instruction-doc-drift | data-brain | 1.000 | 14130 | 110 | 0 | 0 |
| real-answer-github-permissions | checkout | 1.000 | 136150 | 70 | 0 | 0 |
| real-answer-github-permissions | full-dump | 1.000 | 394870 | 0 | 774 | 0 |
| real-answer-github-permissions | data-brain | 1.000 | 22020 | 130 | 62 | 0 |
| real-answer-mcp-contract | checkout | 1.000 | 150360 | 30 | 0 | 0 |
| real-answer-mcp-contract | full-dump | 1.000 | 394600 | 0 | 688 | 0 |
| real-answer-mcp-contract | data-brain | 1.000 | 31020 | 120 | 66 | 0 |
| real-answer-job-queue-claim | checkout | 1.000 | 144330 | 50 | 0 | 0 |
| real-answer-job-queue-claim | full-dump | 1.000 | 395000 | 0 | 700 | 0 |
| real-answer-job-queue-claim | data-brain | 1.000 | 28480 | 120 | 63 | 0 |
| real-answer-graph-renderer | checkout | 1.000 | 139840 | 70 | 0 | 0 |
| real-answer-graph-renderer | full-dump | 1.000 | 394790 | 0 | 776 | 0 |
| real-answer-graph-renderer | data-brain | 1.000 | 41850 | 130 | 64 | 0 |
| real-answer-receipt-statement | checkout | 1.000 | 149740 | 60 | 0 | 0 |
| real-answer-receipt-statement | full-dump | 1.000 | 394860 | 0 | 612 | 0 |
| real-answer-receipt-statement | data-brain | 1.000 | 22060 | 110 | 66 | 0 |
| real-answer-credit-honesty | checkout | 1.000 | 150850 | 60 | 0 | 0 |
| real-answer-credit-honesty | full-dump | 1.000 | 394850 | 0 | 678 | 0 |
| real-answer-credit-honesty | data-brain | 1.000 | 26370 | 120 | 61 | 0 |
| real-answer-index-pr-limits | checkout | 1.000 | 146660 | 60 | 0 | 0 |
| real-answer-index-pr-limits | full-dump | 1.000 | 394750 | 0 | 742 | 0 |
| real-answer-index-pr-limits | data-brain | 1.000 | 25860 | 130 | 64 | 0 |
| real-answer-evidence-grade-rule | checkout | 1.000 | 143360 | 70 | 1 | 0 |
| real-answer-evidence-grade-rule | full-dump | 1.000 | 394910 | 0 | 706 | 0 |
| real-answer-evidence-grade-rule | data-brain | 1.000 | 25930 | 120 | 62 | 0 |
| real-audit-mcp-tool-surface | checkout | 1.000 | 151290 | 30 | 0 | 0 |
| real-audit-mcp-tool-surface | full-dump | 1.000 | 395520 | 0 | 736 | 0 |
| real-audit-mcp-tool-surface | data-brain | 1.000 | 43000 | 130 | 62 | 0 |
| real-audit-finding-taxonomy | checkout | 1.000 | 137160 | 60 | 0 | 0 |
| real-audit-finding-taxonomy | full-dump | 1.000 | 395660 | 0 | 668 | 0 |
| real-audit-finding-taxonomy | data-brain | 1.000 | 32790 | 120 | 0 | 0 |

## Every trial

| Task | Model | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 1042 | 125 | 1167 | 9 | 641 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 1042 | 125 | 1167 | 9 | 640 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 1042 | 125 | 1167 | 9 | 636 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 1042 | 125 | 1167 | 9 | 636 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 1042 | 125 | 1167 | 9 | 643 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 1042 | 125 | 1167 | 9 | 644 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 1042 | 125 | 1167 | 9 | 640 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 1042 | 125 | 1167 | 9 | 639 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 1042 | 125 | 1167 | 9 | 619 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 1042 | 125 | 1167 | 9 | 618 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 661 | 125 | 786 | 0 | 618 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 661 | 125 | 786 | 0 | 618 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 661 | 125 | 786 | 0 | 630 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 661 | 125 | 786 | 0 | 628 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 661 | 125 | 786 | 0 | 628 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 661 | 125 | 786 | 0 | 628 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 661 | 125 | 786 | 0 | 610 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 661 | 125 | 786 | 0 | 602 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 661 | 125 | 786 | 0 | 612 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 661 | 125 | 786 | 0 | 608 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 1472 | 125 | 1597 | 10 | 615 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 1472 | 125 | 1597 | 10 | 619 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 1472 | 125 | 1597 | 10 | 614 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 1472 | 125 | 1597 | 10 | 618 |  |
| fixture-implement-remaining-session-ms | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 1472 | 125 | 1597 | 10 | 633 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 1472 | 125 | 1597 | 10 | 632 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 1472 | 125 | 1597 | 10 | 628 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 1472 | 125 | 1597 | 10 | 627 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 1472 | 125 | 1597 | 10 | 623 |  |
| fixture-implement-remaining-session-ms | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 1472 | 125 | 1597 | 10 | 623 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 1118 | 126 | 1244 | 9 | 623 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 1118 | 126 | 1244 | 9 | 622 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 1118 | 126 | 1244 | 9 | 624 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 1118 | 126 | 1244 | 9 | 624 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 1118 | 126 | 1244 | 9 | 624 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 1118 | 126 | 1244 | 9 | 626 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 1118 | 126 | 1244 | 9 | 634 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 1118 | 126 | 1244 | 9 | 634 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 1118 | 126 | 1244 | 9 | 629 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 1118 | 126 | 1244 | 9 | 627 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 671 | 126 | 797 | 0 | 623 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 671 | 126 | 797 | 0 | 623 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 671 | 126 | 797 | 0 | 618 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 671 | 126 | 797 | 0 | 618 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 671 | 126 | 797 | 0 | 635 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 671 | 126 | 797 | 0 | 624 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 671 | 126 | 797 | 0 | 639 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 671 | 126 | 797 | 0 | 634 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 671 | 126 | 797 | 0 | 642 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 671 | 126 | 797 | 0 | 631 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 1487 | 126 | 1613 | 9 | 627 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 1487 | 126 | 1613 | 9 | 627 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 1487 | 126 | 1613 | 9 | 613 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 1487 | 126 | 1613 | 9 | 624 |  |
| fixture-implement-refresh-session | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 1487 | 126 | 1613 | 9 | 628 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 1487 | 126 | 1613 | 9 | 623 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 1487 | 126 | 1613 | 9 | 616 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 1487 | 126 | 1613 | 9 | 606 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 1487 | 126 | 1613 | 9 | 610 |  |
| fixture-implement-refresh-session | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 1487 | 126 | 1613 | 9 | 606 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 2004 | 68 | 2072 | 9 | 622 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 2004 | 68 | 2072 | 9 | 622 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 2004 | 68 | 2072 | 9 | 618 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 2004 | 68 | 2072 | 9 | 618 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 2004 | 68 | 2072 | 9 | 621 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2004 | 68 | 2072 | 9 | 621 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2004 | 68 | 2072 | 9 | 610 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2004 | 68 | 2072 | 9 | 621 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2004 | 68 | 2072 | 9 | 648 |  |
| fixture-implement-github-login | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2004 | 68 | 2072 | 9 | 637 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 665 | 68 | 733 | 0 | 637 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 665 | 68 | 733 | 0 | 637 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 665 | 68 | 733 | 0 | 646 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 665 | 68 | 733 | 0 | 646 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 665 | 68 | 733 | 0 | 646 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 665 | 68 | 733 | 0 | 647 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 665 | 68 | 733 | 0 | 618 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 665 | 68 | 733 | 0 | 623 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 665 | 68 | 733 | 0 | 623 |  |
| fixture-implement-github-login | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 665 | 68 | 733 | 0 | 606 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 1458 | 68 | 1526 | 10 | 630 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 1458 | 68 | 1526 | 10 | 624 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 1458 | 68 | 1526 | 10 | 620 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 1458 | 68 | 1526 | 10 | 620 |  |
| fixture-implement-github-login | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 1458 | 68 | 1526 | 10 | 621 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 1458 | 68 | 1526 | 10 | 624 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 1458 | 68 | 1526 | 10 | 620 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 1458 | 68 | 1526 | 10 | 626 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 1458 | 68 | 1526 | 10 | 634 |  |
| fixture-implement-github-login | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 1458 | 68 | 1526 | 10 | 605 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 879 | 104 | 983 | 9 | 629 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 879 | 104 | 983 | 9 | 628 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 879 | 104 | 983 | 9 | 632 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 879 | 104 | 983 | 9 | 621 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 879 | 104 | 983 | 9 | 622 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 879 | 104 | 983 | 9 | 613 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 879 | 104 | 983 | 9 | 667 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 879 | 104 | 983 | 9 | 666 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 879 | 104 | 983 | 9 | 671 |  |
| fixture-implement-password-reset | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 879 | 104 | 983 | 9 | 657 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 693 | 104 | 797 | 0 | 626 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 693 | 104 | 797 | 0 | 617 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 693 | 104 | 797 | 0 | 617 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 693 | 104 | 797 | 0 | 612 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 693 | 104 | 797 | 0 | 634 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 693 | 104 | 797 | 0 | 634 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 693 | 104 | 797 | 0 | 634 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 693 | 104 | 797 | 0 | 632 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 693 | 104 | 797 | 0 | 640 |  |
| fixture-implement-password-reset | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 693 | 104 | 797 | 0 | 641 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 1421 | 104 | 1525 | 10 | 635 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 1421 | 104 | 1525 | 10 | 634 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 1421 | 104 | 1525 | 10 | 611 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 1421 | 104 | 1525 | 10 | 610 |  |
| fixture-implement-password-reset | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 1421 | 104 | 1525 | 10 | 611 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 1421 | 104 | 1525 | 10 | 612 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 1421 | 104 | 1525 | 10 | 665 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 1421 | 104 | 1525 | 10 | 623 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 1421 | 104 | 1525 | 10 | 664 |  |
| fixture-implement-password-reset | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 1421 | 104 | 1525 | 10 | 662 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 1311 | 18 | 1329 | 9 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 1311 | 18 | 1329 | 9 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 1311 | 18 | 1329 | 9 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 1311 | 18 | 1329 | 9 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 1311 | 18 | 1329 | 9 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 1311 | 18 | 1329 | 9 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 1311 | 18 | 1329 | 9 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 1311 | 18 | 1329 | 9 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 1311 | 18 | 1329 | 9 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 1311 | 18 | 1329 | 9 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 646 | 18 | 664 | 0 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 646 | 18 | 664 | 0 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 646 | 18 | 664 | 0 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 646 | 18 | 664 | 0 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 646 | 18 | 664 | 0 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 646 | 18 | 664 | 0 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 646 | 18 | 664 | 0 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 646 | 18 | 664 | 0 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 646 | 18 | 664 | 0 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 646 | 18 | 664 | 0 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 1363 | 18 | 1381 | 9 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 1363 | 18 | 1381 | 9 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 1363 | 18 | 1381 | 9 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 1363 | 18 | 1381 | 9 | 0 |  |
| fixture-answer-session-policy | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 1363 | 18 | 1381 | 9 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 1363 | 18 | 1381 | 9 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 1363 | 18 | 1381 | 9 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 1363 | 18 | 1381 | 9 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 1363 | 18 | 1381 | 9 | 0 |  |
| fixture-answer-session-policy | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 1363 | 18 | 1381 | 9 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 2030 | 16 | 2046 | 9 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 2030 | 16 | 2046 | 9 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 2030 | 16 | 2046 | 9 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 2030 | 16 | 2046 | 9 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 2030 | 16 | 2046 | 9 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2030 | 16 | 2046 | 9 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2030 | 16 | 2046 | 9 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2030 | 16 | 2046 | 9 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2030 | 16 | 2046 | 9 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2030 | 16 | 2046 | 9 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 641 | 16 | 657 | 0 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 641 | 16 | 657 | 0 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 641 | 16 | 657 | 0 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 641 | 16 | 657 | 0 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 641 | 16 | 657 | 0 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 641 | 16 | 657 | 0 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 641 | 16 | 657 | 0 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 641 | 16 | 657 | 0 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 641 | 16 | 657 | 0 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 641 | 16 | 657 | 0 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 1277 | 16 | 1293 | 10 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 1277 | 16 | 1293 | 10 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 1277 | 16 | 1293 | 10 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 1277 | 16 | 1293 | 10 | 0 |  |
| fixture-answer-audit-schema | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 1277 | 16 | 1293 | 10 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 1277 | 16 | 1293 | 10 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 1277 | 16 | 1293 | 10 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 1277 | 16 | 1293 | 10 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 1277 | 16 | 1293 | 10 | 0 |  |
| fixture-answer-audit-schema | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 1277 | 16 | 1293 | 10 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 1598 | 19 | 1617 | 9 | 1 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 1598 | 19 | 1617 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 1598 | 19 | 1617 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 1598 | 19 | 1617 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 1598 | 19 | 1617 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 1598 | 19 | 1617 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 1598 | 19 | 1617 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 1598 | 19 | 1617 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 1598 | 19 | 1617 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 1598 | 19 | 1617 | 9 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 646 | 19 | 665 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 646 | 19 | 665 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 646 | 19 | 665 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 646 | 19 | 665 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 646 | 19 | 665 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 646 | 19 | 665 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 646 | 19 | 665 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 646 | 19 | 665 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 646 | 19 | 665 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 646 | 19 | 665 | 0 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 1249 | 19 | 1268 | 12 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 1249 | 19 | 1268 | 12 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 1249 | 19 | 1268 | 12 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 1249 | 19 | 1268 | 12 | 0 |  |
| fixture-answer-api-rule-conflict | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 1249 | 19 | 1268 | 12 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 1249 | 19 | 1268 | 12 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 1249 | 19 | 1268 | 12 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 1249 | 19 | 1268 | 12 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 1249 | 19 | 1268 | 12 | 0 |  |
| fixture-answer-api-rule-conflict | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 1249 | 19 | 1268 | 12 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 1105 | 19 | 1124 | 9 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 1105 | 19 | 1124 | 9 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 1105 | 19 | 1124 | 9 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 1105 | 19 | 1124 | 9 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 1105 | 19 | 1124 | 9 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 1105 | 19 | 1124 | 9 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 1105 | 19 | 1124 | 9 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 1105 | 19 | 1124 | 9 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 1105 | 19 | 1124 | 9 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 1105 | 19 | 1124 | 9 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 638 | 19 | 657 | 0 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 638 | 19 | 657 | 0 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 638 | 19 | 657 | 0 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 638 | 19 | 657 | 0 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 638 | 19 | 657 | 0 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 638 | 19 | 657 | 0 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 638 | 19 | 657 | 0 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 638 | 19 | 657 | 0 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 638 | 19 | 657 | 0 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 638 | 19 | 657 | 0 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 1113 | 19 | 1132 | 9 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 1113 | 19 | 1132 | 9 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 1113 | 19 | 1132 | 9 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 1113 | 19 | 1132 | 9 | 0 |  |
| fixture-answer-legacy-billing | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 1113 | 19 | 1132 | 9 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 1113 | 19 | 1132 | 9 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 1113 | 19 | 1132 | 9 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 1113 | 19 | 1132 | 9 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 1113 | 19 | 1132 | 9 | 0 |  |
| fixture-answer-legacy-billing | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 1113 | 19 | 1132 | 9 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 972 | 27 | 999 | 9 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 972 | 27 | 999 | 9 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 972 | 27 | 999 | 9 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 972 | 27 | 999 | 9 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 972 | 27 | 999 | 9 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 972 | 27 | 999 | 9 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 972 | 27 | 999 | 9 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 972 | 27 | 999 | 9 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 972 | 27 | 999 | 9 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 972 | 27 | 999 | 9 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 702 | 27 | 729 | 0 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 702 | 27 | 729 | 0 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 702 | 27 | 729 | 0 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 702 | 27 | 729 | 0 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 702 | 27 | 729 | 0 | 1 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 702 | 27 | 729 | 0 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 702 | 27 | 729 | 0 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 702 | 27 | 729 | 0 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 702 | 27 | 729 | 0 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 702 | 27 | 729 | 0 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 1302 | 27 | 1329 | 11 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 1302 | 27 | 1329 | 11 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 1302 | 27 | 1329 | 11 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 1302 | 27 | 1329 | 11 | 0 |  |
| fixture-judge-auth-drift | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 1302 | 27 | 1329 | 11 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 1302 | 27 | 1329 | 11 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 1302 | 27 | 1329 | 11 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 1302 | 27 | 1329 | 11 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 1302 | 27 | 1329 | 11 | 0 |  |
| fixture-judge-auth-drift | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 1302 | 27 | 1329 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 2253 | 26 | 2279 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 2253 | 26 | 2279 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 2253 | 26 | 2279 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 2253 | 26 | 2279 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 2253 | 26 | 2279 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 2253 | 26 | 2279 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 2253 | 26 | 2279 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 2253 | 26 | 2279 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 2253 | 26 | 2279 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 2253 | 26 | 2279 | 9 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 694 | 26 | 720 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 694 | 26 | 720 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 694 | 26 | 720 | 0 | 1 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 694 | 26 | 720 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 694 | 26 | 720 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 694 | 26 | 720 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 694 | 26 | 720 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 694 | 26 | 720 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 694 | 26 | 720 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 694 | 26 | 720 | 0 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 1387 | 26 | 1413 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 1387 | 26 | 1413 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 1387 | 26 | 1413 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 1387 | 26 | 1413 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 1387 | 26 | 1413 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 1387 | 26 | 1413 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 1387 | 26 | 1413 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 1387 | 26 | 1413 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 1387 | 26 | 1413 | 11 | 0 |  |
| fixture-judge-instruction-doc-drift | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 1387 | 26 | 1413 | 11 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 13586 | 29 | 13615 | 7 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 13586 | 29 | 13615 | 7 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 13586 | 29 | 13615 | 7 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 13586 | 29 | 13615 | 7 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 13586 | 29 | 13615 | 7 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 13586 | 29 | 13615 | 7 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 13586 | 29 | 13615 | 7 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 13586 | 29 | 13615 | 7 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 13586 | 29 | 13615 | 7 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 13586 | 29 | 13615 | 7 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 39458 | 29 | 39487 | 0 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 39458 | 29 | 39487 | 0 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 39458 | 29 | 39487 | 0 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 39458 | 29 | 39487 | 0 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 39458 | 29 | 39487 | 0 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 39458 | 29 | 39487 | 0 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 39458 | 29 | 39487 | 0 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 39458 | 29 | 39487 | 0 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 39458 | 29 | 39487 | 0 | 387 |  |
| real-answer-github-permissions | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 39458 | 29 | 39487 | 0 | 387 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 2173 | 29 | 2202 | 13 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 2173 | 29 | 2202 | 13 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 2173 | 29 | 2202 | 13 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 2173 | 29 | 2202 | 13 | 0 |  |
| real-answer-github-permissions | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 2173 | 29 | 2202 | 13 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2173 | 29 | 2202 | 13 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2173 | 29 | 2202 | 13 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2173 | 29 | 2202 | 13 | 0 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2173 | 29 | 2202 | 13 | 31 |  |
| real-answer-github-permissions | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2173 | 29 | 2202 | 13 | 31 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 15012 | 24 | 15036 | 3 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 15012 | 24 | 15036 | 3 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 15012 | 24 | 15036 | 3 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 15012 | 24 | 15036 | 3 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 15012 | 24 | 15036 | 3 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 15012 | 24 | 15036 | 3 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 15012 | 24 | 15036 | 3 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 15012 | 24 | 15036 | 3 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 15012 | 24 | 15036 | 3 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 15012 | 24 | 15036 | 3 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 39436 | 24 | 39460 | 0 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 39436 | 24 | 39460 | 0 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 39436 | 24 | 39460 | 0 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 39436 | 24 | 39460 | 0 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 39436 | 24 | 39460 | 0 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 39436 | 24 | 39460 | 0 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 39436 | 24 | 39460 | 0 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 39436 | 24 | 39460 | 0 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 39436 | 24 | 39460 | 0 | 344 |  |
| real-answer-mcp-contract | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 39436 | 24 | 39460 | 0 | 344 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 3078 | 24 | 3102 | 12 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 3078 | 24 | 3102 | 12 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 3078 | 24 | 3102 | 12 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 3078 | 24 | 3102 | 12 | 0 |  |
| real-answer-mcp-contract | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 3078 | 24 | 3102 | 12 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3078 | 24 | 3102 | 12 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3078 | 24 | 3102 | 12 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3078 | 24 | 3102 | 12 | 0 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3078 | 24 | 3102 | 12 | 33 |  |
| real-answer-mcp-contract | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3078 | 24 | 3102 | 12 | 33 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 14406 | 27 | 14433 | 5 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 14406 | 27 | 14433 | 5 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 14406 | 27 | 14433 | 5 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 14406 | 27 | 14433 | 5 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 14406 | 27 | 14433 | 5 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 14406 | 27 | 14433 | 5 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 14406 | 27 | 14433 | 5 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 14406 | 27 | 14433 | 5 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 14406 | 27 | 14433 | 5 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 14406 | 27 | 14433 | 5 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 39473 | 27 | 39500 | 0 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 39473 | 27 | 39500 | 0 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 39473 | 27 | 39500 | 0 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 39473 | 27 | 39500 | 0 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 39473 | 27 | 39500 | 0 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 39473 | 27 | 39500 | 0 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 39473 | 27 | 39500 | 0 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 39473 | 27 | 39500 | 0 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 39473 | 27 | 39500 | 0 | 350 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 39473 | 27 | 39500 | 0 | 350 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 2821 | 27 | 2848 | 12 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 2821 | 27 | 2848 | 12 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 2821 | 27 | 2848 | 12 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 2821 | 27 | 2848 | 12 | 0 |  |
| real-answer-job-queue-claim | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 2821 | 27 | 2848 | 12 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2821 | 27 | 2848 | 12 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2821 | 27 | 2848 | 12 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2821 | 27 | 2848 | 12 | 0 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2821 | 27 | 2848 | 12 | 32 |  |
| real-answer-job-queue-claim | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2821 | 27 | 2848 | 12 | 31 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 13964 | 20 | 13984 | 7 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 13964 | 20 | 13984 | 7 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 13964 | 20 | 13984 | 7 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 13964 | 20 | 13984 | 7 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 13964 | 20 | 13984 | 7 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 13964 | 20 | 13984 | 7 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 13964 | 20 | 13984 | 7 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 13964 | 20 | 13984 | 7 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 13964 | 20 | 13984 | 7 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 13964 | 20 | 13984 | 7 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 39459 | 20 | 39479 | 0 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 39459 | 20 | 39479 | 0 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 39459 | 20 | 39479 | 0 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 39459 | 20 | 39479 | 0 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 39459 | 20 | 39479 | 0 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 39459 | 20 | 39479 | 0 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 39459 | 20 | 39479 | 0 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 39459 | 20 | 39479 | 0 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 39459 | 20 | 39479 | 0 | 388 |  |
| real-answer-graph-renderer | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 39459 | 20 | 39479 | 0 | 388 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 4165 | 20 | 4185 | 13 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 4165 | 20 | 4185 | 13 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 4165 | 20 | 4185 | 13 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 4165 | 20 | 4185 | 13 | 0 |  |
| real-answer-graph-renderer | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 4165 | 20 | 4185 | 13 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 4165 | 20 | 4185 | 13 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 4165 | 20 | 4185 | 13 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 4165 | 20 | 4185 | 13 | 0 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 4165 | 20 | 4185 | 13 | 32 |  |
| real-answer-graph-renderer | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 4165 | 20 | 4185 | 13 | 32 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 14947 | 27 | 14974 | 6 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 14947 | 27 | 14974 | 6 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 14947 | 27 | 14974 | 6 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 14947 | 27 | 14974 | 6 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 14947 | 27 | 14974 | 6 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 14947 | 27 | 14974 | 6 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 14947 | 27 | 14974 | 6 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 14947 | 27 | 14974 | 6 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 14947 | 27 | 14974 | 6 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 14947 | 27 | 14974 | 6 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 39459 | 27 | 39486 | 0 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 39459 | 27 | 39486 | 0 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 39459 | 27 | 39486 | 0 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 39459 | 27 | 39486 | 0 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 39459 | 27 | 39486 | 0 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 39459 | 27 | 39486 | 0 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 39459 | 27 | 39486 | 0 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 39459 | 27 | 39486 | 0 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 39459 | 27 | 39486 | 0 | 306 |  |
| real-answer-receipt-statement | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 39459 | 27 | 39486 | 0 | 306 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 2179 | 27 | 2206 | 11 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 2179 | 27 | 2206 | 11 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 2179 | 27 | 2206 | 11 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 2179 | 27 | 2206 | 11 | 0 |  |
| real-answer-receipt-statement | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 2179 | 27 | 2206 | 11 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2179 | 27 | 2206 | 11 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2179 | 27 | 2206 | 11 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2179 | 27 | 2206 | 11 | 0 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2179 | 27 | 2206 | 11 | 33 |  |
| real-answer-receipt-statement | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2179 | 27 | 2206 | 11 | 33 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 15066 | 19 | 15085 | 6 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 15066 | 19 | 15085 | 6 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 15066 | 19 | 15085 | 6 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 15066 | 19 | 15085 | 6 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 15066 | 19 | 15085 | 6 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 15066 | 19 | 15085 | 6 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 15066 | 19 | 15085 | 6 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 15066 | 19 | 15085 | 6 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 15066 | 19 | 15085 | 6 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 15066 | 19 | 15085 | 6 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 39466 | 19 | 39485 | 0 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 39466 | 19 | 39485 | 0 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 39466 | 19 | 39485 | 0 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 39466 | 19 | 39485 | 0 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 39466 | 19 | 39485 | 0 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 39466 | 19 | 39485 | 0 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 39466 | 19 | 39485 | 0 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 39466 | 19 | 39485 | 0 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 39466 | 19 | 39485 | 0 | 339 |  |
| real-answer-credit-honesty | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 39466 | 19 | 39485 | 0 | 339 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 2618 | 19 | 2637 | 12 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 2618 | 19 | 2637 | 12 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 2618 | 19 | 2637 | 12 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 2618 | 19 | 2637 | 12 | 0 |  |
| real-answer-credit-honesty | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 2618 | 19 | 2637 | 12 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2618 | 19 | 2637 | 12 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2618 | 19 | 2637 | 12 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2618 | 19 | 2637 | 12 | 0 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2618 | 19 | 2637 | 12 | 30 |  |
| real-answer-credit-honesty | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2618 | 19 | 2637 | 12 | 31 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 14649 | 17 | 14666 | 6 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 14649 | 17 | 14666 | 6 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 14649 | 17 | 14666 | 6 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 14649 | 17 | 14666 | 6 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 14649 | 17 | 14666 | 6 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 14649 | 17 | 14666 | 6 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 14649 | 17 | 14666 | 6 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 14649 | 17 | 14666 | 6 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 14649 | 17 | 14666 | 6 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 14649 | 17 | 14666 | 6 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 39458 | 17 | 39475 | 0 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 39458 | 17 | 39475 | 0 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 39458 | 17 | 39475 | 0 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 39458 | 17 | 39475 | 0 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 39458 | 17 | 39475 | 0 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 39458 | 17 | 39475 | 0 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 39458 | 17 | 39475 | 0 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 39458 | 17 | 39475 | 0 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 39458 | 17 | 39475 | 0 | 371 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 39458 | 17 | 39475 | 0 | 371 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 2569 | 17 | 2586 | 13 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 2569 | 17 | 2586 | 13 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 2569 | 17 | 2586 | 13 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 2569 | 17 | 2586 | 13 | 0 |  |
| real-answer-index-pr-limits | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 2569 | 17 | 2586 | 13 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2569 | 17 | 2586 | 13 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2569 | 17 | 2586 | 13 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2569 | 17 | 2586 | 13 | 0 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2569 | 17 | 2586 | 13 | 32 |  |
| real-answer-index-pr-limits | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2569 | 17 | 2586 | 13 | 32 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 14320 | 16 | 14336 | 7 | 1 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 14320 | 16 | 14336 | 7 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 14320 | 16 | 14336 | 7 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 14320 | 16 | 14336 | 7 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 14320 | 16 | 14336 | 7 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 14320 | 16 | 14336 | 7 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 14320 | 16 | 14336 | 7 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 14320 | 16 | 14336 | 7 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 14320 | 16 | 14336 | 7 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 14320 | 16 | 14336 | 7 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 39475 | 16 | 39491 | 0 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 39475 | 16 | 39491 | 0 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 39475 | 16 | 39491 | 0 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 39475 | 16 | 39491 | 0 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 39475 | 16 | 39491 | 0 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 39475 | 16 | 39491 | 0 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 39475 | 16 | 39491 | 0 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 39475 | 16 | 39491 | 0 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 39475 | 16 | 39491 | 0 | 353 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 39475 | 16 | 39491 | 0 | 353 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 2577 | 16 | 2593 | 12 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 2577 | 16 | 2593 | 12 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 2577 | 16 | 2593 | 12 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 2577 | 16 | 2593 | 12 | 0 |  |
| real-answer-evidence-grade-rule | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 2577 | 16 | 2593 | 12 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 2577 | 16 | 2593 | 12 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 2577 | 16 | 2593 | 12 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 2577 | 16 | 2593 | 12 | 0 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 2577 | 16 | 2593 | 12 | 31 |  |
| real-answer-evidence-grade-rule | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 2577 | 16 | 2593 | 12 | 31 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 15083 | 46 | 15129 | 3 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 15083 | 46 | 15129 | 3 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 15083 | 46 | 15129 | 3 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 15083 | 46 | 15129 | 3 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 15083 | 46 | 15129 | 3 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 15083 | 46 | 15129 | 3 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 15083 | 46 | 15129 | 3 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 15083 | 46 | 15129 | 3 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 15083 | 46 | 15129 | 3 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 15083 | 46 | 15129 | 3 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 39506 | 46 | 39552 | 0 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 39506 | 46 | 39552 | 0 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 39506 | 46 | 39552 | 0 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 39506 | 46 | 39552 | 0 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 39506 | 46 | 39552 | 0 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 39506 | 46 | 39552 | 0 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 39506 | 46 | 39552 | 0 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 39506 | 46 | 39552 | 0 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 39506 | 46 | 39552 | 0 | 368 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 39506 | 46 | 39552 | 0 | 368 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 4254 | 46 | 4300 | 13 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 4254 | 46 | 4300 | 13 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 4254 | 46 | 4300 | 13 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 4254 | 46 | 4300 | 13 | 0 |  |
| real-audit-mcp-tool-surface | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 4254 | 46 | 4300 | 13 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 4254 | 46 | 4300 | 13 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 4254 | 46 | 4300 | 13 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 4254 | 46 | 4300 | 13 | 0 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 4254 | 46 | 4300 | 13 | 31 |  |
| real-audit-mcp-tool-surface | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 4254 | 46 | 4300 | 13 | 31 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | checkout | 1 | completed | 1.000 | 13659 | 57 | 13716 | 6 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | checkout | 2 | completed | 1.000 | 13659 | 57 | 13716 | 6 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | checkout | 3 | completed | 1.000 | 13659 | 57 | 13716 | 6 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | checkout | 4 | completed | 1.000 | 13659 | 57 | 13716 | 6 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | checkout | 5 | completed | 1.000 | 13659 | 57 | 13716 | 6 | 0 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 1 | completed | 1.000 | 13659 | 57 | 13716 | 6 | 0 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 2 | completed | 1.000 | 13659 | 57 | 13716 | 6 | 0 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 3 | completed | 1.000 | 13659 | 57 | 13716 | 6 | 0 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 4 | completed | 1.000 | 13659 | 57 | 13716 | 6 | 0 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | checkout | 5 | completed | 1.000 | 13659 | 57 | 13716 | 6 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | full-dump | 1 | completed | 1.000 | 39509 | 57 | 39566 | 0 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | full-dump | 2 | completed | 1.000 | 39509 | 57 | 39566 | 0 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | full-dump | 3 | completed | 1.000 | 39509 | 57 | 39566 | 0 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | full-dump | 4 | completed | 1.000 | 39509 | 57 | 39566 | 0 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | full-dump | 5 | completed | 1.000 | 39509 | 57 | 39566 | 0 | 1 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 1 | completed | 1.000 | 39509 | 57 | 39566 | 0 | 1 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 2 | completed | 1.000 | 39509 | 57 | 39566 | 0 | 1 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 3 | completed | 1.000 | 39509 | 57 | 39566 | 0 | 1 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 4 | completed | 1.000 | 39509 | 57 | 39566 | 0 | 332 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | full-dump | 5 | completed | 1.000 | 39509 | 57 | 39566 | 0 | 332 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | data-brain | 1 | completed | 1.000 | 3222 | 57 | 3279 | 12 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | data-brain | 2 | completed | 1.000 | 3222 | 57 | 3279 | 12 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | data-brain | 3 | completed | 1.000 | 3222 | 57 | 3279 | 12 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | data-brain | 4 | completed | 1.000 | 3222 | 57 | 3279 | 12 | 0 |  |
| real-audit-finding-taxonomy | gpt-5-nano-2025-08-07 | data-brain | 5 | completed | 1.000 | 3222 | 57 | 3279 | 12 | 0 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 1 | completed | 1.000 | 3222 | 57 | 3279 | 12 | 0 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 2 | completed | 1.000 | 3222 | 57 | 3279 | 12 | 0 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 3 | completed | 1.000 | 3222 | 57 | 3279 | 12 | 0 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 4 | completed | 1.000 | 3222 | 57 | 3279 | 12 | 0 |  |
| real-audit-finding-taxonomy | claude-sonnet-5 | data-brain | 5 | completed | 1.000 | 3222 | 57 | 3279 | 12 | 0 |  |
