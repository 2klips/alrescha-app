# VIBE 지표 하네스 주입 A/B — 판정 기록

실험: vibe-harness-injection-v0 · 그리드: 지표 7 × 하네스 2(control/injected) × 모델 2 × 숨긴 정답 과제 4 = 112 시행

채택 규칙(ADR-011-7): 주입 하네스에서 **지표↑ AND 정확도↑**만 채택. 지표만 오르면 폐기·재설계. 결과는 달성/미달 무관 공개.

| metric | status | detail |
|---|---|---|
| V1-verified-evidence-ratio | pending | 실모델 실행 대기(크레딧). 채택 조건: 주입 하네스에서 지표↑ AND 숨긴 정답 정확도↑ — 지표만 오르면 폐기. |
| V2-finding-resolution-rate | pending | 실모델 실행 대기(크레딧). 채택 조건: 주입 하네스에서 지표↑ AND 숨긴 정답 정확도↑ — 지표만 오르면 폐기. |
| V3-requirement-proof-throughput | pending | 실모델 실행 대기(크레딧). 채택 조건: 주입 하네스에서 지표↑ AND 숨긴 정답 정확도↑ — 지표만 오르면 폐기. |
| V4-prompt-rubric-mean | pending | 실모델 실행 대기(크레딧). 채택 조건: 주입 하네스에서 지표↑ AND 숨긴 정답 정확도↑ — 지표만 오르면 폐기. |
| V5-receipt-chain-continuity | pending | 실모델 실행 대기(크레딧). 채택 조건: 주입 하네스에서 지표↑ AND 숨긴 정답 정확도↑ — 지표만 오르면 폐기. |
| V6-verified-commit-ratio | pending | 실모델 실행 대기(크레딧). 채택 조건: 주입 하네스에서 지표↑ AND 숨긴 정답 정확도↑ — 지표만 오르면 폐기. |
| V7-prompt-verifiability-share | pending | 실모델 실행 대기(크레딧). 채택 조건: 주입 하네스에서 지표↑ AND 숨긴 정답 정확도↑ — 지표만 오르면 폐기. |

`pending` 지표는 todo 12의 노출 게이트에 의해 제품 어디에도 렌더되지 않는다.
