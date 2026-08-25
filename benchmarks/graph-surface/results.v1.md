# 그래프 표면 벤치마크 — repo_map · PPR 검색 · 메모리 블록 vs 파일 탐색

## 실행 계약

- Mode: `real`
- 생성: 2026-08-25T14:33:07.089Z
- 사전등록 SHA-256: `02e0eedf3c2ff56426f662027d86073d6599647d20102253c7f24d18f19b8cf2` (benchmarks/graph-surface/preregistration.v1.json — 실행 전 잠금)
- 질문 출처: 동결 v3 매니페스트 다이제스트 `7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7`의 answer-manifest 12과제
- 코퍼스 커밋: `74bdd6298252fcffa477d5bb56d92e4a1e1474f4`
- 토큰 회계: provider 보고 usage 합계(시행 내 전 호출). 로컬 추정 없음.
- 소표본(군·모델당 24시행) — 점추정 단독 해석 금지. 시행 전량은 JSON에 게시.

## 군별 집계

| model | arm | trials | mean turns | mean tool calls | PASS/PARTIAL/FAIL | PASS rate | mean score | input tokens | output tokens | failed |
|---|---|---|---|---|---|---|---|---|---|---|
| pooled | file-exploration | 48 | 4.479 | 8.958 | 41/3/4 | 0.854 | 0.889 | 1091256 | 32474 | 0 |
| pooled | graph-surface | 48 | 6.5 | 10.583 | 37/3/8 | 0.771 | 0.806 | 1002135 | 34019 | 0 |
| gpt-5.6-luna | file-exploration | 24 | 4.208 | 10.792 | 22/2/0 | 0.917 | 0.958 | 446069 | 11164 | 0 |
| gpt-5.6-luna | graph-surface | 24 | 7.833 | 12.875 | 17/2/5 | 0.708 | 0.75 | 512609 | 11612 | 0 |
| claude-sonnet-5 | file-exploration | 24 | 4.75 | 7.125 | 19/1/4 | 0.792 | 0.819 | 645187 | 21310 | 0 |
| claude-sonnet-5 | graph-surface | 24 | 5.167 | 8.292 | 20/1/3 | 0.833 | 0.861 | 489526 | 22407 | 0 |

## 사전등록 가설 판정

- 1차(턴 수 절감): graph-surface 6.5 vs file-exploration 4.479 → Δ 2.021 — 미충족
- 품질 비열등(PASS율 −5pp 이내): 0.771 vs 0.854 → Δ -0.083 — 미충족
- **판정: NOT MET**

판정과 무관하게 수치 그대로 게시한다(ADR-012 문구 규칙 — 효율 주장은 이 리포트 인용으로만, 구간·가정 병기).
