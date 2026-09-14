# 그래프 표면 v3 — 관계형 질문 4개 세트 (부속 실험 ④)

## 실행 계약

- Mode: `real`
- 생성: 2026-09-14T10:19:46.638Z
- 사전등록 SHA-256: `34b8fa8730ae47d5d25f62a28225175656506f5c7d82cc668fc760ed4bfd5f14` (benchmarks/graph-surface/preregistration.v3-relational.json — 실행 전 잠금)
- 질문 출처: 사전등록 파일 내 인라인 answer-manifest 4과제 (파일 다이제스트가 잠금)
- 제품 `tools/list` 카탈로그 SHA-256: `a3d56907414a85b97c3838c55766ab6c6adb310133239ba6c2ce6d85e411f0ac` (사전등록과 일치해야 실행)
- 코퍼스 커밋: `c172b6bc5e690f32e3d550ff3290c52d90d4413a`
- 토큰 회계: provider 보고 usage 합계(시행 내 전 호출). 로컬 추정 없음. cache creation/read는 provider가 보고한 값 그대로(명시적 캐시 브레이크포인트 없음).
- 소표본(군·모델당 8시행) — 점추정 단독 해석 금지. 시행 전량은 JSON에 게시.
- file-exploration: 체크아웃 툴 list_files, grep_files, read_file — MCP 없음.
- graph-surface: 같은 체크아웃 툴 + 제품 tools/list 21툴(요약 전용 스토어 — 본문 0) + 설치 지시 블록.
- 프로덕션 스토어 스캔: . 759노드·4687엣지 (scan 3fdc7d15160e).

## 군별 집계

| model | arm | trials | mean turns | mean tool calls | PASS/PARTIAL/FAIL | PASS rate | mean score | input tokens | cache creation | cache read | output tokens | failed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | file-exploration | 16 | 4.563 | 5.813 | 14/0/2 | 0.875 | 0.875 | 489854 | 0 | 105994 | 7938 | 0 |
| pooled | graph-surface | 16 | 4.938 | 6 | 15/0/1 | 0.938 | 0.938 | 719260 | 0 | 270626 | 9131 | 0 |
| gpt-5.6-luna | file-exploration | 8 | 3.625 | 5.625 | 8/0/0 | 1 | 1 | 173086 | 0 | 105994 | 2336 | 0 |
| gpt-5.6-luna | graph-surface | 8 | 5 | 6.625 | 8/0/0 | 1 | 1 | 329675 | 0 | 270626 | 3082 | 0 |
| claude-sonnet-5 | file-exploration | 8 | 5.5 | 6 | 6/0/2 | 0.75 | 0.75 | 316768 | 0 | 0 | 5602 | 0 |
| claude-sonnet-5 | graph-surface | 8 | 4.875 | 5.375 | 7/0/1 | 0.875 | 0.875 | 389585 | 0 | 0 | 6049 | 0 |

## 사전등록 가설 판정

- 1차(턴 비증가, Δ ≤ 0 — R5 §4.6 (d)): graph-surface 4.938 vs file-exploration 4.563 → Δ 0.375 — 미충족 (v1 기준 절감 Δ < 0: 미충족)
- 품질 비열등(PASS율 −5pp 이내): 0.938 vs 0.875 → Δ 0.063 — 충족
- **판정: NOT MET**

판정과 무관하게 수치 그대로 게시한다(ADR-012 문구 규칙 — 효율 주장은 이 리포트 인용으로만, 구간·가정 병기).
