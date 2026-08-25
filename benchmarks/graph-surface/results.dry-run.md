# 그래프 표면 벤치마크 — repo_map · PPR 검색 · 메모리 블록 vs 파일 탐색

## 실행 계약

- Mode: `dry-run` — **릴리스 불가(모의 실행)**
- 생성: 2026-08-25T13:14:59.798Z
- 사전등록 SHA-256: `02e0eedf3c2ff56426f662027d86073d6599647d20102253c7f24d18f19b8cf2` (benchmarks/graph-surface/preregistration.v1.json — 실행 전 잠금)
- 질문 출처: 동결 v3 매니페스트 다이제스트 `7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7`의 answer-manifest 12과제
- 코퍼스 커밋: `0a47a05c1513838cba3de5250af8e8cd8406b0f0`
- 토큰 회계: provider 보고 usage 합계(시행 내 전 호출). 로컬 추정 없음.
- 소표본(군·모델당 24시행) — 점추정 단독 해석 금지. 시행 전량은 JSON에 게시.

## 군별 집계

| model | arm | trials | mean turns | mean tool calls | PASS/PARTIAL/FAIL | PASS rate | mean score | input tokens | output tokens | failed |
|---|---|---|---|---|---|---|---|---|---|---|
| pooled | file-exploration | 48 | 2 | 2 | 48/0/0 | 1 | 1 | 0 | 0 | 0 |
| pooled | graph-surface | 48 | 2 | 2 | 48/0/0 | 1 | 1 | 0 | 0 | 0 |
| gpt-5.6-luna | file-exploration | 24 | 2 | 2 | 24/0/0 | 1 | 1 | 0 | 0 | 0 |
| gpt-5.6-luna | graph-surface | 24 | 2 | 2 | 24/0/0 | 1 | 1 | 0 | 0 | 0 |
| claude-sonnet-5 | file-exploration | 24 | 2 | 2 | 24/0/0 | 1 | 1 | 0 | 0 | 0 |
| claude-sonnet-5 | graph-surface | 24 | 2 | 2 | 24/0/0 | 1 | 1 | 0 | 0 | 0 |

## 사전등록 가설 판정

- 1차(턴 수 절감): graph-surface 2 vs file-exploration 2 → Δ 0 — 미충족
- 품질 비열등(PASS율 −5pp 이내): 1 vs 1 → Δ 0 — 충족
- **판정: NOT MET**

판정과 무관하게 수치 그대로 게시한다(ADR-012 문구 규칙 — 효율 주장은 이 리포트 인용으로만, 구간·가정 병기).
