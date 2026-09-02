# 후속 — OQ-022 ⑴ receipt 읽기 측 레거시 tool.name 수용 (2026-09-02)

리네임 이전에 발급된 프로덕션 receipt 12건은 statement 안의 `predicate.tool.name`이 `"arr"`다. tool.name은 digest 범위 안이라 행을 고칠 수 없고, WORK_SPEC §13은 "receipt는 계속 검증 가능해야 한다"고 요구한다 → 사용자 지시로 ⑴(읽기 측 스키마 분리) 구현.

## 설계 (`packages/core/src/assurance/receipts.ts`)

- **발급 측은 불변**: `RECEIPT_TOOL = {alrescha, 0.1.0}`, `alreschaReceiptPredicateSchema`/`inTotoStatementSchema`의 tool.name은 여전히 `literal("alrescha")`. `digestInTotoStatement(InTotoStatement)`는 발급 스키마로 파싱하므로 레거시 이름으로는 **새 receipt를 만들 수 없다**(테스트로 고정).
- **읽기 측 신설**: `RECEIPT_TOOL_NAMES = ["arr", "alrescha"]`, `storedReceiptPredicateSchema`/`storedInTotoStatementSchema`(tool.name `enum`). 두 스키마는 같은 `receiptPredicateBase`를 확장하므로 tool 외의 필드는 한 정의를 공유한다.
- `verifyInTotoStatement`는 stored 스키마로 파싱하고 **파싱 결과를 그대로 canonicalize·SHA-256** — 저장 당시 다이제스트와 같은 입력이므로 레거시 receipt가 자기 다이제스트에 대해 `verified`가 된다. 결과에 `toolName`을 추가해 호출자가 레거시 발급자를 표시할 수 있게 했다(`invalid`에는 없음). 알 수 없는 이름(`someone-else`)은 `invalid`.
- 워커·웹 발급 경로 코드 변경 없음(타입 호환) → **워커 재배포 불필요**. 마이그레이션 없음.

## 검증

- `packages/core/src/assurance/receipts.test.ts` +1: 레거시 statement가 발급 스키마·`digestInTotoStatement`에서 거부됨 / 읽기 경로에서 자기 다이제스트로 `verified` + `toolName "arr"` / 현행 statement는 `toolName "alrescha"` / 미지의 이름은 `invalid`. 기존 "발급 스키마는 `arr`를 거부" 단언 유지.
- **프로덕션 실측(읽기 전용)**: `flyctl ssh` 프로브로 receipt **28건**(`id, commit_sha, status, digest, summary->statement`)을 1건씩 내보내(한 번에 내보내면 ssh stdout이 ~229KB에서 잘림) 로컬에서 실제 `verifyInTotoStatement`로 검증:

  | tool.name | 건수 | 결과 | 발급 스키마 통과 |
  | --- | ---: | --- | --- |
  | `arr` (00d8f27 ~ d6df9bc, 2026-08-27~09-01) | 12 | **12 verified** | 12 거부(의도) |
  | `alrescha` (2615910 ~ 0522111) | 16 | **16 verified** | 16 통과 |

  이전 코드(`literal("alrescha")`)라면 12건이 `invalid`였다. 이제 실 receipt 상세 표면을 만들어도 전 receipt가 검증 가능하다.
- 게이트 수치는 커밋 메시지 참조.

## 남김

- 실 receipt 상세 라우팅(표면)은 별도 작업 — 이 변경으로 그 표면이 레거시 12건을 `toolName`으로 구분 표시할 수 있다.

## 배포 (2026-09-02)

- `774b87b` push에 Vercel이 상태를 게시하지 않아(이전 커밋은 1분 내 success) 빈 커밋 `8cf2ec2`로 재트리거 → Vercel Production **success**(GitHub deployment 6224915026, 14:42 UTC). 웹 코어 번들에만 영향, 워커 재배포 없음(발급 경로 불변).
