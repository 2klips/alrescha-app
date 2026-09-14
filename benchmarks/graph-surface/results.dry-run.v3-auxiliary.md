# 그래프 표면 v3 — 부속 실험 (주 가설과 분리, 별도 사전등록)

## 실행 계약

- 생성: 2026-09-14T09:57:24.496Z
- 부속 사전등록 SHA-256: `5f6a6d7b573025f43fc9b207808765bf64caf0e4aa6a6f8536f3ceba153f305f` (benchmarks/graph-surface/preregistration.v3-auxiliary.json)
- 주 실행: `benchmarks/graph-surface/results.dry-run.v3.json` (mode `dry-run`, 96시행, 사전등록 `7ce54ebf6cae6794290a2e56b76ebff0c47aadce4f3bf014feebe191a146f34d`) — **릴리스 불가(모의 실행)**
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
| pooled | file-exploration | 96 | 0 | 0 | 0 | — | 0 |
| pooled | graph-surface | 96 | 0 | 0 | 0 | — | 0 |
| gpt-5.6-luna | file-exploration | 48 | 0 | 0 | 0 | — | 0 |
| gpt-5.6-luna | graph-surface | 48 | 0 | 0 | 0 | — | 0 |
| claude-sonnet-5 | file-exploration | 48 | 0 | 0 | 0 | — | 0 |
| claude-sonnet-5 | graph-surface | 48 | 0 | 0 | 0 | — | 0 |

## ③ todo 중복률 — `log_progress`가 기존 todo에 붙었는가

- 관측 시행 48 · 발행된 todo 0 · 제목 중복 0 · 중복률 —
- writer `matched` 분포: (no log_progress events)

## ④ 관계형 질문 4개 세트

- 사전등록 SHA-256 `34b8fa8730ae47d5d25f62a28225175656506f5c7d82cc668fc760ed4bfd5f14` · 32시행

| model | arm | trials | mean turns | PASS rate |
|---|---|---|---|---|
| pooled | file-exploration | 16 | 2 | 1 |
| pooled | graph-surface | 16 | 2 | 1 |
| gpt-5.6-luna | file-exploration | 8 | 2 | 1 |
| gpt-5.6-luna | graph-surface | 8 | 2 | 1 |
| claude-sonnet-5 | file-exploration | 8 | 2 | 1 |
| claude-sonnet-5 | graph-surface | 8 | 2 | 1 |

- 판정(turns-non-increasing): 턴 Δ 0 · PASS Δ 0 → **MET**

## ⑤ 위험 상위 N 정밀도 라벨링

- 레포: `local/alrescha-app` (코퍼스 커밋 `ecc68d569608548d877fca03634949b39443aff9`) · 상위 30 · 라벨 규칙: 최근 90일 안에 제목이 `\b(fix|bug|hotfix|regress|revert)`에 맞는 커밋이 그 파일을 건드렸으면 참
- 위험 지도 항목 577 · 규칙에 맞는 커밋 39 · 미측정 신호: coverage, dependency-audit

| stratum | entries | precision@10 | precision@N | true positives |
|---|---|---|---|---|
| with-ci | 0 | — | — | 0 |
| without-ci | 30 | 0.3 | 0.3 | 9 |

라벨은 판단이 아니라 규칙이다 — "최근 수정 커밋이 닿았다"는 위험의 대리 지표이지 정의가 아니며, CI 있는 층은 이 레포에 CI 증거가 없어 n=0이다.

판정과 무관하게 수치 그대로 게시한다. 주 가설(results.v3)의 판정은 이 파일의 어떤 수치에도 의존하지 않는다.
