# Phase 2C todo 4 — Supabase 실기동 + OQ-008 해소 (2026-08-18)

사용자가 Docker Desktop을 설치해 **G1 게이트가 열렸다.** Wave 1 완료.

## 기동 절차 (재현용)

Docker Desktop은 사용자 설치 경로에 들어갔고(`%LOCALAPPDATA%\Programs\DockerDesktop`), 그 `resources\bin`이 PATH에 등록된다. 설치 전에 시작된 셸은 PATH가 낡아 `docker`를 못 찾으니 새 셸을 쓰거나 경로를 직접 붙인다.

```
export PATH="/c/Users/axz14/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"
npx supabase init --force     # supabase/config.toml 생성(마이그레이션은 이미 있었음)
npx supabase start            # 마이그레이션 21개 적용
```

`.env.local`은 **`apps/web/`에 있어야 한다** — Next.js는 자기 프로젝트 루트에서 읽지 모노레포 루트에서 읽지 않는다. 레포 루트에만 두면 `Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`로 `/auth/*`가 404가 된다. 두 파일 모두 `.gitignore`의 `.env.*`에 걸린다.

## OQ-008 해소

`/auth/login`·`/auth/auth-code-error`가 **처음으로 실제 렌더**됐다(이전엔 Supabase 부재로 500). 두 화면을 기존 순회 두 곳에 편입:

- `a11y-contrast.spec.ts` — 양 테마 axe AA **위반 0**
- `screens-theme.spec.ts` — 양 테마 재도색·미도색 노드 0

**잔여는 `/app/*`뿐이고, 이건 G1이 아니라 G2 문제다.** 로그인 수단이 GitHub OAuth 하나뿐이라 실제 세션을 만들려면 GitHub App이 필요하다. 같은 이유로 계획이 todo 4에 넣었던 `arr push` → `/commits` graph-only 실데이터 e2e도 세션이 선행이라, 둘 다 Wave 2 todo 5(실기 파일럿)로 이관했다.

## 실물이 픽스처와 달랐던 지점 — service_role GRANT 누락

Phase 2C의 존재 이유가 그대로 나왔다. Wave 1에서 만든 두 테이블이 실제 Postgres에서 **service_role에 403**을 냈다:

```
ruled_out_attempts        -> HTTP 403
dependency_audit_reports  -> HTTP 403
```

원인: `202608100001`의 `grant all on all tables in schema public to service_role`은 **그 시점에 존재하던 테이블만** 덮는다. 이후 생기는 테이블은 스스로 service_role을 지명해야 하는데(기존 마이그레이션들은 전부 그렇게 하고 있었다) 새 두 테이블이 빠뜨렸다. 호스티드 MCP 서버와 워커가 service_role로 도는 만큼 프로덕션에서 바로 깨졌을 결함이다.

PGlite 테스트가 못 잡은 이유는 테스트가 슈퍼유저로 돌아 권한 검사를 우회했기 때문이다. 그래서 **역할 전환 헬퍼 `asServiceRole`을 추가**하고 두 테이블에 커버리지를 넣었다. 위반 심기로 재증명:

- `grant all ... to service_role` 삭제 → `permission denied for table ruled_out_attempts`로 **2건 실패**
- 복원 → 8/8 통과

append-only 트리거는 service_role에도 그대로 걸린다는 것도 같이 고정했다(`stays append-only for service_role too`).

## 검증

- `supabase start` 마이그레이션 21/21 적용, `db reset`으로 수정된 GRANT 재적용 후 두 테이블 **HTTP 200**.
- 신규 테스트 3건(service_role 도달성 2 + append-only 유지 1), 순회 편입 8건(auth 2화면 × 2테마 × 2스위트).
- 게이트: vitest **718/719**(1 skip = win32 심링크) · Playwright **79/79** · lint·typecheck·format green.

## 남은 것

Wave 1은 완결. 다음은 **Wave 2(G2 — GitHub App 등록)** 또는 **Wave 3 todo 8(코칭 크레딧 원장, 준비물 없이 가능)**.
