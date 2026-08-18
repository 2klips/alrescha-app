# Phase 2C Wave 1 — 실데이터 배선 (2026-08-18)

사용자 지시 "Supabase 기동해서 Wave 1 진행". **todo 1·2·3 완료, todo 4는 G1 차단.**

## G1 게이트 재판정 — 계획보다 좁게 막힌다

Docker Desktop이 설치돼 있지 않아(`docker` 미발견, Windows PATH·기본 설치 경로 모두) `supabase start`는 불가능하다. 그런데 **테스트 하네스가 PGlite(임베디드 Postgres, WASM)**라 실제 마이그레이션·RLS 정책·트리거·`security definer` 함수를 Docker 없이 그대로 실행한다(`tests/helpers/database.ts`가 `auth` 스키마와 anon/authenticated/service_role 역할까지 부트스트랩).

따라서 계획이 "Wave 1 전체"로 적은 G1 차단 범위는 실제로는 **todo 4 하나**다 — 브라우저로 `/auth/*` 화면을 띄워 axe를 돌리는 일만 기동 중인 Supabase가 필요하다. 계획 게이트 표를 이 사실로 개정했다.

## 순서 조정

계획은 1 → 2 순이지만 **todo 1의 로더가 todo 2의 테이블을 읽는다**. 2 → 1 순으로 진행했다.

## todo 2 — 배제 이력 (append-only)

`202608180001_ruled_out_attempts.sql` + MCP `record_ruled_out`(15툴째).

**append-only를 세 겹으로 고정**했다 — 이 로그의 존재 이유가 "이미 시도한 막다른 길이 지워지지 않는 것"이라, 규약이 아니라 성질이어야 한다:
1. `authenticated`에 update/delete **정책 없음** → 경로 자체가 없음
2. `grant select, insert`만 → 권한 계층에서도 차단
3. `before update or delete` 트리거가 예외 발생 → **service_role(=MCP 서버)도 못 지운다**

`record_ruled_out_as`(service_role 전용)가 행위자 멤버십을 확인하고 기록. MCP 툴은 access_event를 발행하지 않는다 — 점검 로그는 그래프가 아니라 건드린 노드가 없다(ADR-004).

## todo 1 — /inspection 로더

`apps/web/lib/inspection/inspection-report.ts` — 순수 빌더(`buildWorkspaceInspectionDashboard`) + 얇은 Supabase 래퍼, 기존 commits 로더와 같은 구조.

- **모르는 값은 강등이 아니라 탈락**: severity/kind/status가 계약 밖이면 행을 버린다. 이 화면에서 잘못 라벨된 finding은 없는 finding보다 나쁘다.
- **"저장된 todo 없음" ≠ "0/0 완료"**: 전자는 `insufficient-evidence`, 후자는 측정값. 데모 폴백은 없다.
- npm audit 업로드는 `202608180002_dependency_audit_uploads.sql`에 **verbatim 저장** — 파서가 유일한 해석자이고 provenance는 "npm audit, 업로드된 그대로"로 남는다(스캐너 경계 유지).

## todo 3 — /team 로더

`apps/web/lib/team/team-report.ts` — ADR-011을 **타입 형태로** 막았다: 행 타입에 타인 동의 필드도 `rawText` 필드도 **아예 없다**. 표현할 수 없는 것은 렌더될 수 없다.

- VIBE 입력 스키마가 `strictObject`라 프롬프트 기록에서 **rubric·userId 외 무엇도 통과하지 못한다**(시간·크기·본문 전부). 이 제약이 프라이버시를 코어 계약 수준에서 지킨다.
- 비교 표는 `null`(부재)이지 빈 배열이 아니다 — ADR-011-7.
- 기여도 입력(commits·receipts·해소 findings)은 Wave 2 실기 파일럿이 채운다. 지금은 빈 배열이라 위젯이 "증거 부족"을 말한다 — 추측하지 않는다.

## 검증

- 신규 단위/DB 테스트 **32건**: append-only 6(UPDATE·DELETE 거부, 비멤버 거부, 테넌트 격리, 길이 경계), inspection 빌더 12, inspection RLS 4(PGlite `authenticated` 역할로 교차 테넌트 차단 실증), team 8, MCP 계약 2.
- 게이트: vitest **715/716**(1 skip = win32 심링크) · Playwright **71/71** · lint·typecheck green · 스코프 스캐너 `PASS: 12 boundaries, 227 files`.

## 남은 것

- **todo 4** — Docker Desktop 설치 후 `supabase start` → `/auth/*` axe 편입, OQ-008 해소. 유일하게 남은 열린 OQ.
- 로더를 화면에 연결하는 작업(현재 라우트는 데모 픽스처 사용)은 todo 4에서 실인증 세션과 함께 붙인다 — 로그인 없이 실데이터 라우트를 띄울 수 없기 때문.
