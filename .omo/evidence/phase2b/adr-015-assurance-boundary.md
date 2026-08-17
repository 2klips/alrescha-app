# OQ-016 판정 — ADR-015: 보증은 서버가 관측한 증거에만 (2026-08-17)

로컬 인제스트 경로가 findings·receipt를 만들 수 없다는 아키텍처 제약(OQ-016)에 대한 판정. 선택지는 ⑴ CLI가 분석까지 로컬 수행 ⑵ 로컬은 그래프만·보증은 GitHub 연결 시 ⑶ CI 아티팩트 부분 보증이었고, **⑵를 채택**했다.

## 판정 논거

⑴을 기각한 이유는 편의성이나 비용이 아니라 **증명의 의미**다.

1. **검증 불가.** receipt는 in-toto Statement이고 `previousReceiptDigest`로 체인을 이룬다(`packages/core/src/assurance/receipts.ts`) — 요약이 아니라 증명서다. 룰 엔진을 `packages/core`에서 공유해 결정론을 맞춰도, "그 코드가 그 커밋에 대해 실제로 돌았음"을 서버가 확인할 방법이 없다. 서버는 제출물을 그대로 찍어주는 공증소가 된다. ADR-014가 "환경에 따라 달라지면 보장이 깨진다"로 판정한 것의 더 강한 형태다.
2. **영구 재계산 불가.** 룰이 개정되면 GitHub 경로는 본문을 재조회해 전량 재분석하지만, 로컬 경로는 본문이 없어 낡은 findings를 갱신할 수단이 아예 없다. 시간이 갈수록 두 경로의 findings 의미가 갈라지고, 되돌릴 데이터조차 남지 않는다.

부수 논거: AI 판단 층이 CLI로 내려가면 "실패 출력 무과금·멱등 과금"이 클라이언트 신뢰에 의존하게 된다.

⑶은 **기각이 아니라 보류**다. 현행 `evidence/ci-reports.ts`는 서버가 GitHub Artifact API로 직접 가져와 출처가 보장된다. 사용자 업로드로 확장하려면 OIDC 계열 출처 증명이 선행돼야 하며, 재검토 트리거는 ADR-015에 적었다.

## 구현 — 결정을 코드가 지키게

| 조치 | 위치 | 성질 |
|---|---|---|
| 보증 범위 판별자 `assurance`(`full`/`graph-only`) | `packages/core/src/runs/analysis-cards.ts` | 잡 유무라는 **기존 저장 신호**에서 유도 — 어긋날 수 있는 새 컬럼을 만들지 않음 |
| 부재의 이유를 카드가 말함 | `apps/web/app/commits/commit-cards.tsx` + `lib/strings/commits.ts` | graph-only는 Receipt 자리에 "발급 안 함 — 그래프 전용 인제스트", 델타는 "측정 안 함", 상세에 보증 범위 문장 + `/onboarding` 업그레이드 링크 |
| 경계 스캐너 `client-submitted-assurance` | `scripts/verify-scope-boundaries.ts` | 11 → **12 경계**. 클라이언트 제출 findings·receipt를 인제스트 경로가 받는 코드를 거부 |
| CLI가 못 만드는 것을 먼저 말함 | `packages/cli/src/messages.ts`·`arr.ts` | 업로드 성공 시 `graphOnly` → `githubNudge` 순서로 출력(ADR-013 §5 재확인) |

스캐너는 **주석을 길이 보존 방식으로 공백 처리**한 뒤 매칭한다(`withoutComments`). 마이그레이션 헤더의 "receipt를 만들지 않는 이유" 같은 설계 노트는 위반이 아니고, 같은 줄 주석 뒤에 숨은 코드는 오프셋이 유지되므로 여전히 걸린다.

## 재증명 (가드레일 약화 금지)

- **위반 심기**: `tests/scope-fidelity.test.ts`에 `payload.receipt`를 저장하는 인제스트 라우트를 심어 새 경계가 잡아내는지 확인 — 12개 경계 전부 1:1 네거티브 픽스처 보유(테스트가 개수 일치를 강제).
- **정상 통과**: 메타데이터만 다루는 인제스트 라우트 + OQ-016을 설명하는 SQL 주석은 `pass`.
- **전 제품 표면**: `PASS scope fidelity: 12 boundaries, 215 files, 0 forbidden paths`.

## 게이트

- vitest **665/666** (88 파일; 1 skip = win32 심링크) · Playwright **66/66** (exit 0) · eslint `--max-warnings=0` 무결점 · typecheck 6개 프로젝트 전부 Done
- 신규 테스트: 스코프 경계 2건(위반 1 + 통과 1), 카드 보증 판별자 2건, e2e graph-only 여정 1건
- 기존 e2e 선택자 정밀화: `[data-card-status="completed"]` → `[...][data-assurance="full"]`. graph-only 데모 run도 "완료"이므로 순서 의존을 제거한 것이며 단언은 그대로다(약화 아님).
- 데모 픽스처에 로컬 인제스트 run 1건 추가(`run-local-01`, `manual`, 잡 없음) — 화면에서 실제로 보이는 상태가 됐다.

## 문서

- `spec/DECISIONS-ADR.md` — ADR-015 채택(7개 결정 + 재검토 트리거)
- `spec/OPEN_QUESTIONS.md` — OQ-016 **resolved**

## 남은 것

- ⑶(CI 아티팩트 부분 보증)은 수요 신호 + OIDC 출처 증명 설계 후 별도 ADR.
- 실데이터 배선 시 `record_local_ingest_run` 경로가 카드에서 graph-only로 뜨는지 확인 필요(현재 증명은 픽스처·단위 레벨).
