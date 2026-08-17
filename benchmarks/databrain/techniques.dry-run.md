# 토큰 효율 기법 A/B (dry-run 측정)

> Token estimate is the dry-run assumption ceil(context characters / 4); recall is deterministic required-fact coverage, not a model run.

| technique | tokens off→on | Δtokens % | recall off→on (pp) | cacheable prefix (tokens) | default |
|---|---|---|---|---|---|
| id-first-loading | 5219 → 4477 | -14.22 | 91.67 → 91.67 (0) | 0 | on |
| static-prefix | 5219 → 5325 | 2.03 | 91.67 → 91.67 (0) | 129 | on |
| lazy-tool-definitions | 5219 → 4975 | -4.68 | 91.67 → 91.67 (0) | 0 | on |
| compaction-safe-session | 5219 → 5431 | 4.06 | 66.67 → 83.33 (16.67) | 0 | on |

정확도(회수율) 하락이 측정된 기법은 기본값 off를 유지한다.
