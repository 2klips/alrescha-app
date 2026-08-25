# 토큰 효율 기법 A/B — 실모델 재측정 (사전등록 dry-run 대비)

> 토큰은 provider 보고 input usage 합계, 회수율은 실모델 답변의 required-fact 채점(%). 동일 컨텍스트는 모델 호출 1회를 공유한다(dry-run이 컨텍스트를 공유한 것과 같은 구조). 소표본(기법·측 당 8시행) — 점추정 단독 해석 금지.

| technique | Δtokens % (dry-run 등록) | Δtokens % (실측) | Δrecall pp (dry-run 등록) | Δrecall pp (실측) | 실패 |
|---|---|---|---|---|---|
| id-first-loading | -14.22 | -12.11 | 0 | -12.5 | 0/16 |
| static-prefix | 2.03 | 3.35 | 0 | -8.33 | 0/16 |
| lazy-tool-definitions | -4.68 | -5.54 | 0 | -4.16 | 0/16 |
| compaction-safe-session | 4.06 | 62.39 | 16.67 | 15.97 | 2/16 |

실측 회수율 하락이 dry-run 판정(defaultOn)과 어긋나는 기법이 있으면 기본값 재검토 대상으로 기록한다 — 이 리포트는 측정 기록이며 기본값 변경은 별도 판단이다.
