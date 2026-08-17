# todo 9·10 — 팀 워크스페이스 + 프롬프트 기록 (2026-08-17)

**범위:** BUILD_PLAN_PHASE2B Wave 4 전반부. 두 커밋: `feat(teams): add workspaces with roles`, `feat(teams): opt-in local-first prompt capture`. **ADR-011 준수가 수용 기준의 일부** — 음성 테스트가 1급 산출물.

## 0. 팀 표면 게이트 (ADR-013의 실전 첫 개방)

`packages/core/src/team/` 경로가 생기는 순간 `unguarded-team-surface` 가드레일이 `tests/team-privacy.test.ts`의 ADR-011 불변식 마커 3종을 요구한다. 마커는 **실제 음성 테스트의 이름**으로 존재한다(빈 껍데기 아님): `ADR-011:no-capture-without-consent` · `ADR-011:no-raw-prompt-in-access-events` · `ADR-011:no-consent-status-exposure`. 스코프 스캐너 `PASS 206 files`.

## 1. todo 9 — 팀 워크스페이스 (`202608170004_team_roles.sql`)

스키마는 팀 대비 상태였다(workspace_members 존재, 그래프 테이블 select가 이미 `is_workspace_member`) — 부족했던 것만 추가:

- 역할 확장 `owner|admin|member|viewer` + 초대 라이프사이클(`invited→active→revoked`, `invited_by`).
- **활성 멤버십만 유효**: `is_workspace_member`/`is_workspace_owner`를 `status='active'` 조건으로 교체(동일 시그니처 — 기존 정책 전부가 제자리에서 강화됨). invited/revoked는 아무 권한 없음.
- 능력 매트릭스는 security definer 함수로: `invite_workspace_member`(owner/admin; admin 부여는 owner만; owner 부여 불가; 중복 초대 거부) · `accept_workspace_invite`(본인 invited 행만) · `revoke_workspace_member`(owner 철회 불가; admin 철회는 owner만).
- 멤버 로스터는 팀에 보임(`workspace_members_select_members`) — **동의(비공개)와의 대비가 설계 의도**. rationale 노드도 공유 그래프에 편입(member select).

**테스트** `tests/team-workspaces.test.ts` 6케이스 — 매트릭스 전수(양성·음성: 4역할 × 읽기/초대/철회, invited 무권한, 타인 초대 수락 불가), 철회 즉시 차단, RLS 교차 테넌트(멤버가 남의 워크스페이스 로스터 0행), **솔로 무영향**(신규 사용자 = owner active 1행, 기존 흐름 그대로 — 전체 스위트 626/627 무회귀가 추가 증거).

## 2. todo 10 — 프롬프트 기록 (`202608170005_prompt_capture.sql` + `packages/core/src/team/prompt-log.ts`)

ADR-011 7규칙의 기계 강제:

- **이중 옵트인**: `prompt_capture_settings`(관리자 스위치) + `prompt_capture_consents`(개인 동의, 원문 동기화는 별도 플래그). **BEFORE 트리거**가 모든 insert/update에서 게이트를 검사 — **service role 직접 insert조차** 동의 없이는 실패. authenticated에는 INSERT 미부여(유일한 쓰기 경로 = `record_prompt`, 그마저 트리거 위).
- **메타데이터 우선**: `raw_text`는 `raw_sync_enabled`일 때만 저장 가능(트리거 강제). 열람은 작성자 기본(`shared`를 작성자가 켠 행만 팀 노출). 삭제는 작성자 직접, 집계는 행에서 계산되므로 즉시 반영(별도 집계 저장소 없음 — 구조적 보장).
- **동의 비노출**: consents select는 본인 행만 — owner/admin조차 타인의 동의 존재 여부를 볼 수 없음. 워크스페이스 스위치 자체는 멤버에게 보임(동의 판단에 필요) — ADR-011이 긋는 경계 그대로.
- **로컬 우선**: `prompt-log.ts` — `.arr/prompt-log.jsonl`(+gitignore 엔트리), strict zod 레코드, `toServerPromptSync`가 메타데이터-우선 경계(스위치 off면 원문이 payload에 없음을 테스트로 증명).
- **access_events 분리**: 기록 시 access_events 0행 + 프롬프트성 컬럼 부재 재확인.

**테스트** `tests/team-privacy.test.ts` 7케이스 — 마커 3종 + 원문 스위치 off 시 DB에 원문 부재(민감 문자열 전체 덤프 검사), 타인 원문 열람 차단→명시 공유 시에만 개방, 삭제 즉시 집계 반영, 로컬 로그 직렬화/파싱/동기화 경계.

## 3. 게이트

- vitest **626/627** (84 파일; 신규 13) — 기존 전 스위트 무회귀(솔로 워크스페이스 무영향의 실증)
- 스코프 스캐너 PASS(206) — 팀 게이트 조건부 개방 확인 · eslint·typecheck 무결점
- Playwright 미실행 — 웹 UI 무변경(DB 함수·RLS·core 모듈만), e2e는 자체 마이그레이션 목록 고정. 팀 화면이 생기는 시점에 e2e 편입.

## 4. 남긴 것

- 팀 UI(초대 화면·로스터·팀 진척 뷰)와 `record_prompt`의 MCP/CLI 배선은 후속 — 이번 범위는 도메인·RLS·함수 계층(수용 기준이 요구하는 전부).
- 코칭(11)·기여도(12)는 이 저장소(`prompt_records.rubric`) 위에 쌓는다.
