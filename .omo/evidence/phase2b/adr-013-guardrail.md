# ADR-013 구현 — 스코프 경계 교체 (2026-08-17)

**범위:** ADR-013 결정 2·3·4의 기계 강제 — `local-cli`·`team-ui` 경계를 새 경계로 **대체**(삭제 아님)하고 위반 심기로 재증명, WORK_SPEC §16 개정.

## 1. 무엇이 바뀌었나

| 구 경계 | 신 경계 | 판정 규칙 |
|---|---|---|
| `local-cli` — 경로 `cli/`·`package.json "bin"`·셰뱅이면 존재만으로 실패 | `raw-source-upload` | 전송 동사 호출(`upload/send/post/submit/transmit/push/ingest…(`) 또는 페이로드 리터럴(`payload/body/request/formData = {…}`)에 원본 본문 식별자(`rawCode/rawSource/sourceCode/codeBody/fileContents/fileBody/fileText`)가 실리면 실패 |
| `team-ui` — 경로 `team(s)/organization(s)/members`면 존재만으로 실패 | `unguarded-team-surface` | 같은 경로 규칙 + **`tests/team-privacy.test.ts`에 ADR-011 불변식 마커 3종이 전부 존재하면 통과**, 하나라도 없으면 실패(누락 마커를 메시지에 명시) |

ADR-011 불변식 마커 (스캐너가 `TEAM_PRIVACY_INVARIANTS`로 export — Wave 4에서 음성 테스트의 테스트명에 이 문자열을 포함해야 잠금이 풀린다):

- `ADR-011:no-capture-without-consent`
- `ADR-011:no-raw-prompt-in-access-events`
- `ADR-011:no-consent-status-exposure`

## 2. 약화가 아니라 대체임의 증명 (위반 심기)

`tests/scope-fidelity.test.ts`, 16/16 통과:

1. **신 경계 음성 픽스처(전 경계 공통 스위트):** `packages/cli/src/push.ts`에 셰뱅 + `client.upload({ fileContents })` → `raw-source-upload` 단독 검출. 셰뱅·CLI 경로는 더 이상 트리거가 아니고 원본 업로드가 트리거임을 한 픽스처로 증명.
2. **팀 표면 무방비:** `apps/web/app/teams/page.tsx` 단독 → `unguarded-team-surface` 검출.
3. **경계 이동 양성:** `bin` 키 있는 `packages/cli/package.json` + 메타데이터만 업로드하는 셰뱅 CLI → **pass** (구 스캐너였다면 3중 실패).
4. **조건부 허용 양성:** 팀 페이지 + 마커 3종을 모두 가진 `tests/team-privacy.test.ts` → **pass**.
5. **부분 스위트 거부:** 마커 1종이 빠진 프라이버시 스위트 → 실패 + 메시지에 누락 마커(`ADR-011:no-capture-without-consent`) 명시.
6. **경계-픽스처 전수 대응 불변:** `SCOPE_BOUNDARIES`(11종) ↔ 음성 픽스처 1:1 검사 유지.

## 3. WORK_SPEC 개정 (결정 4)

§16 비목표: "로컬 CLI 드리프트 체커"를 2단계 목록에서 제거하고 **"허용되되 경계가 있는 것 (ADR-013)"** 단락 신설 — 로컬 인제스트 경로 허용, 원본 전송·저장 금지(`raw-source-upload`·`raw-code-persistence` 기계 강제), 원본 보관(유료 옵션)은 별도 ADR 전까지 비목표. 1순위 후속의 팀 워크스페이스 UI에 ADR-011 음성 테스트 선행 조건 명기. `site/spec/WORK_SPEC.md` 동일 개정(동기화 유지).

주: OQ-013·ADR-013 본문은 비목표 섹션을 "§12"로 지칭했으나 현행 WORK_SPEC의 실제 섹션 번호는 **§16**이다(§12는 컨텍스트 팩). 개정은 §16에 반영했다.

## 4. 게이트

- `pnpm exec tsx scripts/verify-scope-boundaries.ts` → `PASS scope fidelity: 11 boundaries, 176 files, 0 forbidden paths`
- vitest **479/479** (66 파일) · eslint `--max-warnings=0` 무결점 · typecheck(web/worker/core/mcp) 무결점
- Playwright 미실행 — 이번 변경은 scripts/tests/spec만 건드리고 제품 코드·UI 무변경.
