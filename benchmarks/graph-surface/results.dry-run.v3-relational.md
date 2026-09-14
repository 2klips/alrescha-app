# 그래프 표면 v3 — 관계형 질문 4개 세트 (부속 실험 ④)

## 실행 계약

- Mode: `dry-run` — **릴리스 불가(모의 실행)**
- 생성: 2026-09-14T09:57:21.726Z
- 사전등록 SHA-256: `34b8fa8730ae47d5d25f62a28225175656506f5c7d82cc668fc760ed4bfd5f14` (benchmarks/graph-surface/preregistration.v3-relational.json — 실행 전 잠금)
- 질문 출처: 사전등록 파일 내 인라인 answer-manifest 4과제 (파일 다이제스트가 잠금)
- 제품 `tools/list` 카탈로그 SHA-256: `a3d56907414a85b97c3838c55766ab6c6adb310133239ba6c2ce6d85e411f0ac` (사전등록과 일치해야 실행)
- 코퍼스 커밋: `ecc68d569608548d877fca03634949b39443aff9`
- 토큰 회계: provider 보고 usage 합계(시행 내 전 호출). 로컬 추정 없음. cache creation/read는 provider가 보고한 값 그대로(명시적 캐시 브레이크포인트 없음).
- 소표본(군·모델당 8시행) — 점추정 단독 해석 금지. 시행 전량은 JSON에 게시.
- file-exploration: 체크아웃 툴 list_files, grep_files, read_file — MCP 없음.
- graph-surface: 같은 체크아웃 툴 + 제품 tools/list 21툴(요약 전용 스토어 — 본문 0) + 설치 지시 블록.
- 프로덕션 스토어 스캔: . 758노드·4657엣지 (scan 0513a7ae59ec).

## 군별 집계

| model | arm | trials | mean turns | mean tool calls | PASS/PARTIAL/FAIL | PASS rate | mean score | input tokens | cache creation | cache read | output tokens | failed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | file-exploration | 16 | 2 | 2 | 16/0/0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| pooled | graph-surface | 16 | 2 | 2 | 16/0/0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| gpt-5.6-luna | file-exploration | 8 | 2 | 2 | 8/0/0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| gpt-5.6-luna | graph-surface | 8 | 2 | 2 | 8/0/0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| claude-sonnet-5 | file-exploration | 8 | 2 | 2 | 8/0/0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| claude-sonnet-5 | graph-surface | 8 | 2 | 2 | 8/0/0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |

## 사전등록 가설 판정

- 1차(턴 비증가, Δ ≤ 0 — R5 §4.6 (d)): graph-surface 2 vs file-exploration 2 → Δ 0 — 충족 (v1 기준 절감 Δ < 0: 미충족)
- 품질 비열등(PASS율 −5pp 이내): 1 vs 1 → Δ 0 — 충족
- **판정: MET**

판정과 무관하게 수치 그대로 게시한다(ADR-012 문구 규칙 — 효율 주장은 이 리포트 인용으로만, 구간·가정 병기).
