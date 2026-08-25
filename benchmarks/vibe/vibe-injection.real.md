# VIBE 지표 하네스 주입 A/B — 실모델 실행 (112시행)

실험: vibe-harness-injection-v0 · 생성: 2026-08-25T14:16:18.697Z

## 실행 계약

- 동결 v3 매니페스트 다이제스트: `7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7`
- 측정 정의 보충(실행 전 잠금) SHA-256: `2cb5fa429c4e902dca0f1e2df351402e564193859852d7223e718a41531ba2cf` (benchmarks/vibe/measurement-preregistration.md)
- 코퍼스 커밋: `74bdd6298252fcffa477d5bb56d92e4a1e1474f4`
- 토큰 회계: provider 보고 usage만 (로컬 추정 없음).
- 시행: 112/112, 실패 10 (실패 쌍은 Δ에서 제외·게시).
- 소모: 입력 205613 · 출력 50753 토큰.
- **소표본 경고: 지표당 쌍 8 — 점추정 단독 해석 금지, 쌍별 원자료는 JSON에 전량 게시.**

## 지표별 집계·판정

| metric | pairs | 정확도 대조→주입 (Δ) | 인용 대조→주입 (Δ) | verdict |
|---|---|---|---|---|
| V1-verified-evidence-ratio | 8/8 | 0.875 → 0.917 (0.042) | 1.875 → 2.5 (0.625) | adopted |
| V2-finding-resolution-rate | 7/8 | 0.905 → 0.952 (0.048) | 2.143 → 2.429 (0.286) | pending |
| V3-requirement-proof-throughput | 7/8 | 0.81 → 0.905 (0.095) | 1.714 → 2.714 (1) | pending |
| V4-prompt-rubric-mean | 6/8 | 0.833 → 0.944 (0.111) | 1.5 → 2.5 (1) | pending |
| V5-receipt-chain-continuity | 7/8 | 0.952 → 0.857 (-0.095) | 2 → 2.714 (0.714) | rejected |
| V6-verified-commit-ratio | 5/8 | 0.933 → 0.867 (-0.067) | 1.8 → 2.2 (0.4) | rejected |
| V7-prompt-verifiability-share | 6/8 | 0.833 → 0.944 (0.111) | 1.833 → 2.5 (0.667) | pending |

## 판정 상세

- **V1-verified-evidence-ratio** — adopted: 지표↑ AND 정확도↑ 충족. 인용률 Δ 0.625 (대조 1.875 → 주입 2.5), 쌍 8/8, 정확도 Δ 0.042 (대조 0.875 → 주입 0.917). 소표본(쌍 8) — 점추정 단독 해석 금지.
- **V2-finding-resolution-rate** — pending: 정확도 비악화(쌍 7/8, 정확도 Δ 0.048 (대조 0.905 → 주입 0.952))이나 지표 이동이 이 하네스에서 관측 불가(OQ-020) — 세션형 하네스에서 재실험 전까지 채택 불가.
- **V3-requirement-proof-throughput** — pending: 정확도 비악화(쌍 7/8, 정확도 Δ 0.095 (대조 0.81 → 주입 0.905))이나 지표 이동이 이 하네스에서 관측 불가(OQ-020) — 세션형 하네스에서 재실험 전까지 채택 불가.
- **V4-prompt-rubric-mean** — pending: 정확도 비악화(쌍 6/8, 정확도 Δ 0.111 (대조 0.833 → 주입 0.944))이나 지표 이동이 이 하네스에서 관측 불가(OQ-020) — 세션형 하네스에서 재실험 전까지 채택 불가.
- **V5-receipt-chain-continuity** — rejected: 지표 최적화 지시가 숨긴 정답 정확도를 낮춤 — 노출 부적격(폐기·재설계). 지표 이동은 이 하네스에서 관측 불가(OQ-020). 쌍 7/8, 정확도 Δ -0.095 (대조 0.952 → 주입 0.857).
- **V6-verified-commit-ratio** — rejected: 지표 최적화 지시가 숨긴 정답 정확도를 낮춤 — 노출 부적격(폐기·재설계). 지표 이동은 이 하네스에서 관측 불가(OQ-020). 쌍 5/8, 정확도 Δ -0.067 (대조 0.933 → 주입 0.867).
- **V7-prompt-verifiability-share** — pending: 정확도 비악화(쌍 6/8, 정확도 Δ 0.111 (대조 0.833 → 주입 0.944))이나 지표 이동이 이 하네스에서 관측 불가(OQ-020) — 세션형 하네스에서 재실험 전까지 채택 불가.

채택 규칙(ADR-011-7, 불변): 지표↑ AND 숨긴 정답 정확도↑만 채택 — 지표만 오르면 폐기.
V2~V7의 지표 이동은 이 QA형 하네스에서 관측 불가(OQ-020) — 정확도 악화 시 폐기, 그 외 pending 유지.
`pending`/`rejected` 지표는 노출 게이트에 의해 제품 어디에도 렌더되지 않는다.
