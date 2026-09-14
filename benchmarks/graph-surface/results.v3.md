# 그래프 표면 v3 — 설치된 예산 · 프로덕션 형태 스토어 vs 체크아웃 탐색

## 실행 계약

- Mode: `real`
- 생성: 2026-09-14T10:16:33.318Z
- 사전등록 SHA-256: `7ce54ebf6cae6794290a2e56b76ebff0c47aadce4f3bf014feebe191a146f34d` (benchmarks/graph-surface/preregistration.v3.json — 실행 전 잠금)
- 질문 출처: 동결 v3 매니페스트 다이제스트 `7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7`의 answer-manifest 12과제
- 제품 `tools/list` 카탈로그 SHA-256: `a3d56907414a85b97c3838c55766ab6c6adb310133239ba6c2ce6d85e411f0ac` (사전등록과 일치해야 실행)
- 코퍼스 커밋: `c172b6bc5e690f32e3d550ff3290c52d90d4413a`
- 토큰 회계: provider 보고 usage 합계(시행 내 전 호출). 로컬 추정 없음. cache creation/read는 provider가 보고한 값 그대로(명시적 캐시 브레이크포인트 없음).
- 소표본(군·모델당 24시행) — 점추정 단독 해석 금지. 시행 전량은 JSON에 게시.
- file-exploration: 체크아웃 툴 list_files, grep_files, read_file — MCP 없음.
- graph-surface: 같은 체크아웃 툴 + 제품 tools/list 21툴(요약 전용 스토어 — 본문 0) + 설치 지시 블록.
- 프로덕션 스토어 스캔: fixtures/drifted-demo 15노드·5엣지 (scan a50f2daf79d2) · . 759노드·4687엣지 (scan a8089d11ceef).

## 군별 집계

| model | arm | trials | mean turns | mean tool calls | PASS/PARTIAL/FAIL | PASS rate | mean score | input tokens | cache creation | cache read | output tokens | failed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | file-exploration | 48 | 4.896 | 8.813 | 33/11/4 | 0.688 | 0.833 | 2050111 | 0 | 574660 | 36411 | 0 |
| pooled | graph-surface | 48 | 5.271 | 8.604 | 33/12/3 | 0.688 | 0.821 | 2161344 | 0 | 663406 | 33157 | 0 |
| gpt-5.6-luna | file-exploration | 24 | 4.583 | 9.75 | 18/6/0 | 0.75 | 0.903 | 823470 | 0 | 574660 | 10481 | 0 |
| gpt-5.6-luna | graph-surface | 24 | 5.625 | 9.958 | 18/6/0 | 0.75 | 0.875 | 843727 | 0 | 663406 | 10990 | 0 |
| claude-sonnet-5 | file-exploration | 24 | 5.208 | 7.875 | 15/5/4 | 0.625 | 0.764 | 1226641 | 0 | 0 | 25930 | 0 |
| claude-sonnet-5 | graph-surface | 24 | 4.917 | 7.25 | 15/6/3 | 0.625 | 0.767 | 1317617 | 0 | 0 | 22167 | 0 |

## 사전등록 가설 판정

- 1차(턴 비증가, Δ ≤ 0 — R5 §4.6 (d)): graph-surface 5.271 vs file-exploration 4.896 → Δ 0.375 — 미충족 (v1 기준 절감 Δ < 0: 미충족)
- 품질 비열등(PASS율 −5pp 이내): 0.688 vs 0.688 → Δ 0 — 충족
- **판정: NOT MET**

판정과 무관하게 수치 그대로 게시한다(ADR-012 문구 규칙 — 효율 주장은 이 리포트 인용으로만, 구간·가정 병기).
