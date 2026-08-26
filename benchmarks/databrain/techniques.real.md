# 토큰 효율 기법 A/B — 실모델 재측정 (사전등록 dry-run 대비)

> 토큰은 provider 보고 input usage 합계, 회수율은 실모델 답변의 required-fact 채점(%). 동일 컨텍스트는 반복 내에서 모델 호출 1회를 공유하고, 반복(repeat)은 신규 호출이다. 소표본 — 점추정 단독 해석 금지, 시행 전량은 JSON에 게시.

| technique | Δtokens % (등록→실측) | Δrecall pp (등록→실측) | default (등록) | default (실측 재판정) | 실패 |
|---|---|---|---|---|---|
| id-first-loading | -14.22 → -26.84 | 0 → -2.78 | on | **off** | 3/48 |
| static-prefix | 2.03 → -2.5 | 0 → -1.81 | on | **off** | 1/48 |
| lazy-tool-definitions | -4.68 → -16.31 | 0 → -2.28 | on | **off** | 2/48 |
| compaction-safe-session | 4.06 → 4.36 | 16.67 → 16.3 | on | on | 2/48 |

실측 재판정은 dry-run과 같은 게이트를 실측 회수율에 적용한 값이다: 회수율 하락 = off, 유지 시에도 절감·캐시·회수율 개선 중 하나로 스위치를 벌어야 on. 이 컬럼이 게시된 권고이며, 등록 컬럼은 dry-run 역사 기록으로 불변이다.
