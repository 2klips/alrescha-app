# Phase 2B todo 1 — 레포 URL 등록 경로 (2026-08-17)

## 무엇을 만들었나

| 파일 | 역할 |
|---|---|
| `packages/core/src/github/repository-url.ts` | URL 파서 — https/ssh(scp·ssh://)/스킴 없음/단축형, `.git`·딥링크·쿼리·해시 허용, 비GitHub 호스트는 `unsupported_host`로 구분 거부 |
| `apps/web/lib/github/url-connect.ts` | 판정 함수(의존성 주입): invalid_url / already_connected / connected / no_access / install / private_or_missing 6분기 |
| `apps/web/app/api/github/repositories/url/route.ts` | POST 라우트 — origin·인증·rate limit(20/60s) 후 판정, 결과별 303 리다이렉트 |
| `apps/web/lib/github/connect-repository.ts` | 기존 선택 라우트에서 추출한 공용 연결 헬퍼(토큰 재검증 + 저장). 픽커 라우트도 이걸 쓰도록 리팩터링 — 두 경로가 동일 검사를 강제 |
| `apps/web/lib/github/api.ts` | `lookupPublicGitHubRepository` — 무인증 공개 레포 조회(404 = 비공개/부재, GitHub이 구분 안 함) |
| `packages/core/src/github/app-permissions.ts` | `githubInstallationUrl`에 `repository_ids[]` 힌트 — 설치 화면에서 붙여넣은 레포 사전 선택 |
| `apps/web/lib/github/state.ts` | 설치 state에 `repositoryFullName` 힌트(HMAC 서명 범위 포함) — 콜백이 선택 화면에 전달, 해당 레포 최상단 표시 |
| `apps/web/app/app/connect/github/page.tsx` | URL 붙여넣기 폼 + 상태별 한국어 안내 + 설치 CTA |
| `apps/web/app/ui/onboarding-flow.tsx` | 데모 위저드에 URL 입력 시뮬레이션(파서는 실제 core 함수 — `@arr/core/repository-url` 서브패스로 클라이언트 안전 import) |

## 판정 흐름 (실경로)

붙여넣기 → 파싱 실패면 즉시 안내. 성공 시: ① 이미 연결(`repositories.selected_at`) ② App이 보는 레포(`github_available_repositories`) → **즉시 연결**(기존 선택 경로와 동일한 토큰 재검증) ③ 설치는 있는데 이 레포 미부여 → 권한 없음 안내 ④ 설치 없음 → 공개 조회로 id 확보 시 설치 화면 사전 선택, 404면 "비공개이거나 없음" 안내 + 설치 유도.

## 수용 기준 대응

- URL 파서 단위 테스트: `repository-url.test.ts` 30케이스 (https/ssh/단축형/쿼리·해시/오타/타 호스트)
- 실패 상태 라우트 테스트: `tests/github-repo-url.test.ts` 6분기 전부 (기존 auth-route 패턴의 의존성 주입 방식)
- Playwright 여정: `tests/e2e/onboarding-url.spec.ts` 3건 — 붙여넣기→설치 유도→연결 완료 / 즉시 연결 / 파싱 실패 안내

## 재량 결정 (기록)

- 공개 레포 id 조회는 무인증 GitHub API 1회 — core 네트워크 금지 준수(웹 레이어에만 존재). GitHub이 404로 비공개/부재를 구분하지 않으므로 메시지도 묶어서 안내.
- `repository_ids[]`는 GitHub이 무시해도 무해한 힌트. 견고한 경로는 state의 `repositoryFullName` → 콜백 → 선택 화면 최상단 표시.
- 한국어 스위프 `TECHNICAL_TOKENS`에 URL 예시 토큰 추가(주소는 번역 대상이 아님 — 기존 주석의 원칙 그대로).

## 게이트

- lint ✅ · typecheck ✅ · vitest **476/476** ✅ (440 → 476) · playwright **52/52** ✅ (49 → 52)
