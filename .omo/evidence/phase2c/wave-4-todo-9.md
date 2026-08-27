# Wave 4 todo 9 — 프로덕션 기동 (G4, 2026-08-27)

## 결과

- 웹·호스티드 MCP·GitHub webhook: Vercel `arr-app-web`, `https://arr-app-web.vercel.app`
- 워커: Fly.io `arr-worker`, `nrt`, `shared-cpu-1x:512MB` 2대(1 primary 실행, 1 standby 정지), HTTP 포트 없음
- DB·Auth: Supabase `mzowdsczwaesmfbxzjzw`, 서울 리전
- 커스텀 도메인 구매는 사용자 결정으로 연기했다. Vercel 기본 주소를 프로덕션 기준 주소로 사용한다.

## 배포와 설정

- Vercel Root Directory `apps/web`, Framework `Next.js`, GitHub `2klips/arr-app` `main` 자동 배포 연결.
- Vercel Production 환경 변수 전량 설정: 앱/Supabase/GitHub App/webhook/MCP/AI/BYOK 항목. 값은 증빙과 저장소에 기록하지 않았다.
- Fly.io 필수 워커 secret과 AI/BYOK secret 설정. 현재 이미지 `deployment-01M11R8YR9FRZ958M6YNTBVDZT` (`sha256:0cbeb4cd…`).
- Supabase 마이그레이션 전량 적용. 배포 중 발견한 PostgreSQL B-tree 행 크기 제한을 `202608270001_bound_index_entry_search_keys.sql`로 해결했다.
- 별도 로그인용 GitHub OAuth App `Arr Login`을 Supabase GitHub provider에 연결했다. GitHub App에는 Email 권한을 추가하지 않았다.
- GitHub App `arr-dev-2klips`의 webhook URL과 callback URL을 프로덕션 주소로 전환했다. 기존 설치 재연결 경로도 복구했다.

## 프로덕션 파일럿

- GitHub OAuth 로그인 → 기존 GitHub App 설치 연결 → `2klips/arr-app` 선택 → `main` push webhook 수신을 실측했다.
- 파일럿 커밋 `00d8f27ee51c0abbec25abbc5bea971036624cdf`: scan 성공, analyze 성공, `assurance=full`, 41 open findings, 실행 시간 144초.
- receipt `01M11RD61P71AHRX525315EKAE` 발급 확인:
  - 상태 `generated`, digest 64자
  - `predicateType = https://arr-app-web.vercel.app/receipt/v1`
  - 첫 subject `name = git:commit`, `digest.sha1 = 00d8f27ee51c0abbec25abbc5bea971036624cdf`
  - tool `arr@0.1.0`, coverage `{ requirements: 95, implVerified: 81, testVerified: 3 }`
- 공식 MCP Client로 `https://arr-app-web.vercel.app/api/mcp`의 `get_graph_schema` 1회 성공:
  - protocol `modern`, server `arr@0.1.0`, `isError=false`
  - `artifactCount=454`
  - nodes `{ artifact: 454, finding: 41, receipt: 1, context_pack: 1 }`
  - relations `{ calls: 304, imports: 614, references: 82 }`

## 게이트

- Vitest: 119 files, 876 passed, 1 skipped.
- lint, typecheck, web production build, scope fidelity 12경계: PASS.
- Playwright: 120 passed.
- 프로덕션 URL: `/` 200, `/auth/login` 200. `/api/mcp` 무인증 GET은 의도한 405.
- Fly 결제 수단 등록 후 계정 `Good Standing` / `Pay As You Go` 확인. primary 워커가 5분 제한을 넘겨 계속 `started`이고 드레인 루프가 유지됨을 확인했다.

## 배포 중 발견·수정한 문제

- Docker build context의 Windows junction 유입: `.dockerignore` allowlist 적용.
- 컨테이너에 로컬 env 파일이 없을 때 워커 종료 및 큐가 비면 프로세스 종료: 선택적 env 로드 + 지속 poll 루프로 변경.
- GitHub App 기존 설치가 새 workspace에 연결되지 않음: installation reconnect 경로 수정.
- `index_entries.search_key`의 PostgreSQL B-tree 행 크기 초과: 전체 문자열 인덱스를 bounded workspace/repository 인덱스로 교체.
- rich finding provenance가 DB 제약의 nonblank `reason`을 누락: worker provenance에 이유 저장.
- Fly trial 머신의 5분 강제 종료: 결제 수단 등록 후 Pay As You Go 전환으로 해소.

## 롤백과 남은 운영 항목

- 웹: Vercel Instant Rollback으로 직전 Ready 배포 복원.
- 워커: 직전 이미지 `deployment-01M11PC53N08EYQ647NQ4ZKGVF` (`sha256:f1803fac…`)로 재배포.
- 알려진 UI 문제: 커밋 카드의 `Receipt 보기`가 공개 데모 `/receipts`로 이동해 실제 receipt 대신 fixture를 표시한다. 이번 수용 검증은 프로덕션 DB 원문을 직접 확인했다. 실제 receipt 상세 라우팅은 후속 수정 대상이다.
- 스모크용 read-only MCP 토큰과 교체 전 노출된 GitHub App 자격증명은 운영 검증 후 폐기 대상이다. 폐기는 별도 명시 승인 후 수행한다.
- 커스텀 도메인은 추후 Vercel alias로 붙인다. 기존 receipt 호환을 위해 `predicateType`은 유지한다.
