# 후속 — judge·coach enqueue 표면 (2026-08-31)

러너 종결(`c98c8b7`) 직후 사용자 지시로 구현. 러너는 준비됐지만 잡을 만드는 제품 표면이 없던 공백을 닫는다.

## 설계

`enqueue_enrich_job` 선례를 그대로 따른다: 표면별 security-definer SQL 함수가 자격 조건·kind 매핑·과금 규칙을 소유하고(service_role 전용), 웹 액션은 인증·BYOK 우선 프로바이더 해석·rpc 호출만 한다. 버튼이 지키는 규칙은 전부 SQL이 다시 지킨다.

- **`enqueue_judgment_job(workspace, finding, provider, mode)`** (`202608310002`):
  열린 finding만 · kind 매핑은 WORK_SPEC §14의 판단 종류로(`contradicting-instructions` → `contradiction-confirmation`, 그 외 → `drift-verdict-confirmation`; `requirement-disambiguation`은 요구사항 표면이 생길 때) · context는 메타데이터만(제목·kind·등급·provenance — 원본 코드 본문 없음, 항목당 4,000자 절단) · credits 10 / byok 0(핸들러의 양방향 단언과 일치) · run은 `judgment:<finding>` manual run 재사용 · 멱등 키 `judgment:<finding>` — finding당 판단 1회.
- **`enqueue_coaching_job(workspace, record, requesting_user, provider, mode)`**:
  **작성자 본인만**(ADR-011-4를 SQL에서 재강제) · raw 동기화 동의 없인 거부 · 워크스페이스 최신 레포의 `coaching:<record>` manual run · credits 1(`coachingCreditCost`) / byok 0 · 멱등 키 `coaching:<record>` — 기록당 채점 1회(기록 원문은 불변).

## 표면

- **`/app/inspection`** — 라이브 전용 "AI 판정 요청" 패널: 열린 발견 최근 8건 + `AI 확정` 버튼(`requestFindingJudgment` 액션). 공유 `InspectionView`·데모 화면 불변.
- **`/app/team`** — "내 프롬프트 코칭 요청" 패널: **뷰어 본인 기록만** 나열(`OwnPromptRecord` — 타인 행과 타입부터 분리, raw 유무 불리언도 본인 행에만 존재), 채점 완료/원문 미동기화/`코칭 요청` 3상태. 채점되면 `TeamView`의 coaching 루브릭이 본인 최신 채점(`buildOwnCoaching` — `promptCoachingOutputSchema`로 검증)으로 채워진다 — 기존 `coaching: null` 주석("코칭 잡이 채점할 때까지")이 예약해 둔 바로 그 배선.

## 검증

- 신규 실DB 테스트 `tests/judgment-coaching-enqueue.test.ts` **7/7** (service_role 경유): strict 판단 페이로드의 정확한 키 집합·kind 매핑·비용(10/0, 1/0)·finding당/기록당 멱등·비열림 거부·타인 기록 거부·원문 부재 거부.
- 한국어 우선 카피 정책 통과(`Findings 테이블의 열린 발견`으로 조정), lint·typecheck clean, `tests/prompt-coaching-database.test.ts`·team-view 테스트 그린. 로컬 스택에 `202608310002` 적용.
- **트리 공유 주의**: 같은 시각 Alrescha 브랜딩 트랙이 main에 로컬 커밋 4건(F1 셸·토큰 개편)과 미커밋 WIP(dashboard-screen 등)를 진행 중 — full vitest의 실패 3건은 전부 그쪽 WIP 파일 소속이며 이 변경과 무관(이 변경 파일들은 전부 그린). e2e·푸시·프로덕션 반영은 그 트랙의 정리와 함께 배치로.

## 프로덕션 반영 절차(보류 중)

푸시하면 브랜딩 커밋 4건이 함께 배포되므로 **그 트랙이 준비될 때까지 푸시 보류**. 반영 시: ① 프로덕션 DB에 `202608310002` 적용(`.env.migrate` 절차) ② `git push`(Vercel 자동) — 워커는 재배포 불필요(러너는 v6에 이미 탑재).
