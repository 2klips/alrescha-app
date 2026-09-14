# 그래프 표면 v3 — 부속 실험 (주 가설과 분리, 별도 사전등록)

## 실행 계약

- 생성: 2026-09-14T10:19:49.687Z
- 부속 사전등록 SHA-256: `5f6a6d7b573025f43fc9b207808765bf64caf0e4aa6a6f8536f3ceba153f305f` (benchmarks/graph-surface/preregistration.v3-auxiliary.json)
- 주 실행: `benchmarks/graph-surface/results.v3.json` (mode `real`, 96시행, 사전등록 `7ce54ebf6cae6794290a2e56b76ebff0c47aadce4f3bf014feebe191a146f34d`)
- ①②③은 주 실행의 시행을 읽기만 한다(프로토콜 무변경). ④는 별도 그리드, ⑤는 오프라인 라벨링.

## ① 진행 기록 채택률 — graph-surface 군에서 `log_progress`를 1회 이상 부른 시행

| model | trials | adopted | rate |
|---|---|---|---|
| pooled | 48 | 0 | 0 |
| gpt-5.6-luna | 24 | 0 | 0 |
| claude-sonnet-5 | 24 | 0 | 0 |

## ② 호출당 토큰 — provider 보고 usage, 모델 호출 1회 평균

| model | arm | calls | input | cache creation | cache read | cache read share | output |
|---|---|---|---|---|---|---|---|
| pooled | file-exploration | 235 | 8723.877 | 0 | 2445.362 | 0.219 | 154.94 |
| pooled | graph-surface | 253 | 8542.862 | 0 | 2622.158 | 0.235 | 131.055 |
| gpt-5.6-luna | file-exploration | 110 | 7486.091 | 0 | 5224.182 | 0.411 | 95.282 |
| gpt-5.6-luna | graph-surface | 135 | 6249.83 | 0 | 4914.119 | 0.44 | 81.407 |
| claude-sonnet-5 | file-exploration | 125 | 9813.128 | 0 | 0 | 0 | 207.44 |
| claude-sonnet-5 | graph-surface | 118 | 11166.246 | 0 | 0 | 0 | 187.856 |

## ③ todo 중복률 — `log_progress`가 기존 todo에 붙었는가

- 관측 시행 48 · 발행된 todo 0 · 제목 중복 0 · 중복률 —
- writer `matched` 분포: (no log_progress events)

## ④ 관계형 질문 4개 세트

- 사전등록 SHA-256 `34b8fa8730ae47d5d25f62a28225175656506f5c7d82cc668fc760ed4bfd5f14` · 32시행

| model | arm | trials | mean turns | PASS rate |
|---|---|---|---|---|
| pooled | file-exploration | 16 | 4.563 | 0.875 |
| pooled | graph-surface | 16 | 4.938 | 0.938 |
| gpt-5.6-luna | file-exploration | 8 | 3.625 | 1 |
| gpt-5.6-luna | graph-surface | 8 | 5 | 1 |
| claude-sonnet-5 | file-exploration | 8 | 5.5 | 0.75 |
| claude-sonnet-5 | graph-surface | 8 | 4.875 | 0.875 |

- 판정(turns-non-increasing): 턴 Δ 0.375 · PASS Δ 0.063 → **NOT MET**

## ⑤ 위험 상위 N 정밀도 라벨링

- 레포: `local/alrescha-app` (코퍼스 커밋 `c172b6bc5e690f32e3d550ff3290c52d90d4413a`) · 상위 30 · 라벨 규칙: 최근 90일 안에 제목이 `\b(fix|bug|hotfix|regress|revert)`에 맞는 커밋이 그 파일을 건드렸으면 참
- 위험 지도 항목 578 · 규칙에 맞는 커밋 39 · 미측정 신호: coverage, dependency-audit

| stratum | entries | precision@10 | precision@N | true positives |
|---|---|---|---|---|
| with-ci | 0 | — | — | 0 |
| without-ci | 30 | 0.4 | 0.3 | 9 |

라벨은 판단이 아니라 규칙이다 — "최근 수정 커밋이 닿았다"는 위험의 대리 지표이지 정의가 아니며, CI 있는 층은 이 레포에 CI 증거가 없어 n=0이다.

판정과 무관하게 수치 그대로 게시한다. 주 가설(results.v3)의 판정은 이 파일의 어떤 수치에도 의존하지 않는다.
