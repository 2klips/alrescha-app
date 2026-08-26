# Wave 4 todo 10 — 도메인 확정 + predicateType 최종화 (2026-08-26)

## 도메인 결정 과정 (사용자와 6라운드)

1. Arr 도메인 후보 조회(31종) → **`arr.dev`(자리표시자)는 제3자 선점 확인** — 교체 필수가 실측으로 확정.
2. 사용자가 리브랜딩 검토 지시 → 3계열 조사: "~로" 한국어(제대로·절로·살피로 등 13종 — 충돌 조사로 자로/바로/미더로 탈락), 우주·별(닻별·별무리·미리내 등 — Mirinae 서울 스타트업 충돌로 탈락, 글로벌 별 단어는 도메인 9/10 선점), 영어 약어(SEGIN까지 도달).
3. **최종: Arr 유지 + `arr.tools` 구매** — Vercel 팀 `ao2(Mallo)`, $17.99/년, 자동갱신 ON, 주문 `01M0YY6YP7WZX5T5WS894A4N3N` **completed**. 등록자 Chanwoo Lee.

## 코드 반영 (digest 호환이 깨지는 유일하게 계획된 시점)

- `packages/core/src/assurance/receipts.ts`: `RECEIPT_PREDICATE_TYPE = https://arr.tools/receipt/v1` · `RECEIPT_TOOL {arr, 0.1.0}` · subject 유니온(파일 sha256 | `git:commit` sha1) · predicate에 `analyzedAt`(ISO)·`coverage`·`tool`. 구 자리표시자 statement는 스키마가 거부(음성 테스트 추가).
- `packages/core/src/assurance/rules.ts`: **`assuranceCoverage`** 신설 — findings 룰과 같은 입력에서 결정론 카운트: requirements = spec 문서의 task 기원 요구사항 수, implVerified = 체크됨 또는 명시 심볼 전부 실존, testVerified = 요구사항 ID 매핑 테스트 보유.
- `apps/worker/src/analysis-job.ts`: statement에 신규 필드 배선, `git:commit` subject 선두, `now` 주입 가능(결정론 테스트용).
- `supabase/migrations/202608260001_discard_dev_receipts.sql`: 자리표시자 predicateType의 dev receipt 폐기(§13 예약 그대로). `summary -> 'statement' ->> 'predicateType'` 기준 — 최초 작성 시 `statement` 컬럼으로 잘못 짚어 PGlite 전 스위트가 잡아냈다(마이그레이션 체인 테스트의 가치 실증).
- `apps/web/app/app/settings/mcp/actions.ts`: 폴백 호스트 `mcp.arr.tools` / `app.arr.tools`.
- `apps/web/lib/assurance/fixtures.ts`: 데모 receipt를 신 포맷으로, 다이제스트 재계산(current `1a89f8ed…`, previous `d08b95a0…`).
- `spec/WORK_SPEC.md` §13: 예약 절을 이행 완료로 개정(예시 JSON 최종화, "predicateType은 다시 바꾸지 않는다" 명문) — 계획이 예약해둔 spec 개정의 이행.

## 게이트

- vitest **872 passed / 1 skipped (116 파일)** — 신 포맷 음성 테스트 2건·수용 필드 단언 추가, 약화 없음. lint·typecheck 무결점.
- 로컬 Supabase에는 다음 `pnpm db:migrate`(또는 재기동) 시 폐기 마이그레이션이 적용된다.

## 남김

- todo 9(프로덕션 기동 — Supabase 클라우드·Vercel 배포·Fly.io 워커·webhook URL 전환)가 G4의 남은 절반. DNS(`app`/`mcp` 서브도메인)는 배포 시점에 Vercel 프로젝트에 붙인다.
