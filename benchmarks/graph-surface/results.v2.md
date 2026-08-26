# 그래프 표면 벤치마크 — repo_map · PPR 검색 · 메모리 블록 vs 파일 탐색

## 실행 계약

- Mode: `real`
- 생성: 2026-08-26T08:36:48.192Z
- 사전등록 SHA-256: `200ff563be94bc8849ca10feaf936e9b8b16d5749cebda2cee14b99f5e164011` (benchmarks/graph-surface/preregistration.v1.json — 실행 전 잠금)
- 질문 출처: 동결 v3 매니페스트 다이제스트 `7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7`의 answer-manifest 12과제
- 코퍼스 커밋: `a9f9526130dc9e30f5248f6aca550f3bf5e22920`
- 토큰 회계: provider 보고 usage 합계(시행 내 전 호출). 로컬 추정 없음.
- 소표본(군·모델당 24시행) — 점추정 단독 해석 금지. 시행 전량은 JSON에 게시.

## 군별 집계

| model | arm | trials | mean turns | mean tool calls | PASS/PARTIAL/FAIL | PASS rate | mean score | input tokens | output tokens | failed |
|---|---|---|---|---|---|---|---|---|---|---|
| pooled | file-exploration | 48 | 4.708 | 9.021 | 42/3/3 | 0.875 | 0.917 | 1195125 | 31853 | 0 |
| pooled | graph-surface | 48 | 7.021 | 9.521 | 36/2/10 | 0.75 | 0.778 | 1002789 | 32713 | 0 |
| gpt-5.6-luna | file-exploration | 24 | 4.375 | 10.625 | 22/2/0 | 0.917 | 0.972 | 482909 | 10506 | 0 |
| gpt-5.6-luna | graph-surface | 24 | 8.625 | 11 | 15/2/7 | 0.625 | 0.681 | 466142 | 11045 | 0 |
| claude-sonnet-5 | file-exploration | 24 | 5.042 | 7.417 | 20/1/3 | 0.833 | 0.861 | 712216 | 21347 | 0 |
| claude-sonnet-5 | graph-surface | 24 | 5.417 | 8.042 | 21/0/3 | 0.875 | 0.875 | 536647 | 21668 | 0 |

## 사전등록 가설 판정

- 1차(턴 수 절감): graph-surface 7.021 vs file-exploration 4.708 → Δ 2.313 — 미충족
- 품질 비열등(PASS율 −5pp 이내): 0.75 vs 0.875 → Δ -0.125 — 미충족
- **판정: NOT MET**

판정과 무관하게 수치 그대로 게시한다(ADR-012 문구 규칙 — 효율 주장은 이 리포트 인용으로만, 구간·가정 병기).
