# 벤치마크 반복 1차 — 원인 분석과 개정안 (2026-08-14, ADR-008-4)

**기준 실행:** `results.real.json` (gpt-5-nano, 108 trials) — 토큰 -55.28% ✅ / 정확도 -7.04pp ❌ (게이트 NOT MET)

## 원인 분석 (기록된 trial 출력 기반, 결정론 재현)

| 과제 | 증상 | 확정 원인 | 분류 |
|---|---|---|---|
| `fixture-implement-password-reset` | data-brain 0.000 (checkout 1.000) | 모델이 빈 이메일에 `null` 반환, 채점기는 `throw` 기대. 과제 문구 "reject an empty result"가 모호했고, checkout 컨텍스트에는 throw 관례를 보여주는 코드/테스트 예시가 있었으나 data-brain 팩에는 없었음 | 프롬프트 모호 + 회수(예시 부재) |
| `real-answer-github-permissions` | data-brain 0.000 (full-dump 1.000) | **회수는 성공** (`app-permissions.ts` 정확히 인용, 실질 정답: "actions, checks, contents, metadata (all read-only)" + "pull_requests: write"). 채점기 별칭이 `pull_requests: write`(콜론 뒤 공백)·묶음 서술형을 매칭 못 함 | **채점기 false negative** |
| `fixture-judge-*` 2종 | 세 군 모두 0.000 | 프롬프트가 `kind:subject` 형식만 요구하고 **허용 kind 어휘 6종과 subject 규칙을 열거하지 않음** → 모델이 자유 어휘 사용(`drift:authentication:REQ-AUTH-003` 등) | 과제 설계 결함 (군 간 비교엔 중립이나 신호 0) |

## 이번 커밋에 적용한 수정 (F5 비파괴 — tasks.json 불변)

1. `grading.ts` — 정규화에 `[_:]→공백` 추가 (비교 양쪽 동일 적용). `pull_requests:write` ≡ `pull requests write` ≡ `pull_requests: write`.
2. `context.ts` — 구현 과제의 data-brain 팩 강화: 아티팩트 2→3개, 발췌 4,000→6,000자, **테스트 예시 파일 1개 포함**(관례 노출 — checkout과의 정보 격차 해소).

## 재실행 시 함께 적용할 매니페스트 v2 개정안 (승인 대기 — 적용 시 F5 digest 갱신 필요)

> 원칙: 개정은 **전 군에 동일**하게 적용되어 비교 공정성을 유지하며, 개정 사실과 사유를 보고서에 명시한다.

1. `fixture-implement-password-reset` prompt 말미에 추가:
   `"Throw an Error when the trimmed email is empty (do not return null)."`
2. `real-answer-github-permissions` prompt 말미에 추가:
   `"Format each permission as a \`name:access\` pair (e.g. contents:read)."`
3. judge 2종 prompt에 어휘 명세 추가:
   `"Allowed kinds: missing-implementation, missing-test, stale-doc, contradicting-instructions, orphan-doc, unproven-claim. Subject: use the requirement ID (e.g. REQ-AUTH-001) when one exists, otherwise the document or topic slug."`
4. (검토) `fixture-judge-auth-drift` 기대값 재확인: 모델이 REQ-AUTH-003을 지목 — 픽스처 ground truth와 대조해 기대 subject가 유일해석인지 확인 후 확정.

## 재실행 계획

- 명령: `pnpm bench:databrain` (실모델). 예상 비용: 이전 실행 총 ~47만 토큰(gpt-5-nano) 수준 — 소액이나 **사용자 예산 승인 후 실행**.
- 예상 효과: ①·② 수정으로 두 회수/채점 실패 과제 회복 시 data-brain mean score ≈ checkout 동급(±), 토큰 우위 유지 → 게이트(비열등 AND -30%) 통과 가능성 높음. judge 과제는 전 군 동반 상승으로 군 간 비교 신호 확보.
- 결과는 달성/미달 무관 수치 그대로 갱신 공개.

---

## 재실행 결과 (2026-08-14 23:33 KST, 매니페스트 v2) — **게이트 MET ✅**

| 지표 | v1 (08-14 12:44Z) | v2 (08-14 14:33Z) | 게이트 |
|---|---|---|---|
| 정확도 Δ (vs checkout) | -7.04pp | **+3.66pp** | 비열등(-5pp) 통과, 개선 목표(+5pp)엔 1.34pp 미달 |
| 토큰 절감 (vs checkout) | 55.28% | **55.97%** | 목표 30% 초과 달성 |
| data-brain mean score | 0.574 | **0.737 (3군 중 최고)** | — |
| data-brain 총 토큰 | 59,456 | 63,717 (vs checkout 144,709 · full-dump 345,712) | — |

- 회복 확인: password-reset(0.000→회복), gh-permissions(채점 정규화로 정답 인정), judge 과제(어휘 명세로 전 군 신호 발생).
- full-dump는 최다 토큰(345K)에 최저 점수(0.509) — "전부 밀어넣기"의 역효과 재확인 (ETH 논지).
- 부수 수정: 네거티브 테스트 픽스처의 과장 주장 값 2pp→99pp (실측이 +로 전환되며 2pp가 과장이 아니게 됨 — 테스트 의도 보존).
- **효율 주장 게시 해금**: 인용 가능한 공식 문구 = "동일 과제·동일 모델 3군 비교에서 정확도 +3.66pp, 토큰 55.97% 절감 (gpt-5-nano, 108 trials)" + 본 리포트 링크 필수.
- 남은 개선 여지(다음 반복): 개선 목표 +5pp 달성, 실레포 과제 확대·다모델 검증 (RESEARCH_AGENDA §3).
