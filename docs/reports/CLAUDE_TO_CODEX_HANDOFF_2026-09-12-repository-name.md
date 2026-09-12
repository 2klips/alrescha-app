# Claude → Codex 배포 인수인계: 이름이 바뀐 저장소의 canonical 이름 유지 (PR #10 후속)

작성: 2026-09-12 · 대상: Alrescha 배포를 담당하는 Codex
상태: **2026-09-12 Codex 롤아웃 완료 — PR #11 merge `0283dc0`, Vercel SUCCESS, picker 재선택으로 홈·헤더·inventory의 canonical 이름과 감사 metadata 확인. 프로덕션 primary-rate-limit 이후 새 pair가 자동 재개해 모두 succeeded(시도 2·0크레딧), SHA 일치·큐 0·신규 실패 0·기존 14건 WARN. 마이그레이션·워커 배포 없음.** [PR #11 기록](../../.omo/evidence/phase4/pr11-production-rollout-2026-09-12.md). **이월 검증 완료:** PR #12 실제 merge push(`c38dc08`)가 `push` run을 생성하고 두 잡 모두 시도 1에 성공했다. [PR #12 기록](../../.omo/evidence/phase4/pr12-production-rollout-2026-09-12.md).
브랜치: `claude/repository-canonical-name` (`main@80a99cb` 기준) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/repository-canonical-name-2026-09-12.md`](../../.omo/evidence/phase4/repository-canonical-name-2026-09-12.md) — 원인 사슬, 변경, red/green, 라이브 실행, 게이트, 검증 절차가 전부 거기 있다. 이 문서는 그 요약이다.

## 1. 재현 원인

- `github_available_repositories`(picker 목록)는 OAuth 콜백의 `savePendingInstallation`이 **설치 시점에 한 번** 쓰고, 다시 쓰는 경로가 없다. App은 `repository`(renamed)·`installation_repositories` 웹훅을 구독하지 않는다.
- 2026-09-01의 GitHub 이름 변경은 `202609010001`이 `repositories.full_name`만 이름 기준으로 고쳤고 inventory는 그대로 `2klips/arr-app`이었다.
- `connectSelectedRepository`는 inventory 행의 이름·기본 브랜치를 `repositories`에 `(workspace_id, github_repository_id)` upsert로 복사했다. id는 canonical 행과 같으므로 이름만 옛것으로 되돌아갔다.
- 그 뒤로 웹훅 `resolveRepository`가 installation·id·**이름**으로 행을 찾았기 때문에, 행이 `2klips/arr-app`인 동안 `2klips/alrescha-app`으로 오는 push는 전부 `repository_not_selected`(202)로 무시됐다. 재선택 시각(13:43:36Z) 이후 프로덕션은 이 상태다. 롤아웃 기록이 측정한 merge-push run(`80a99cb`)은 그 전에 도착한 것이라 드러나지 않았다.

## 2. 변경 파일과 동작

| 파일                                                                                                        | 동작                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/lib/github/api.ts`                                                                                | `fetchRepositoryById`: 연결 시 발급한 repo 범위 토큰으로 `GET /repositories/{id}`를 읽는다. 응답 `id`가 요청한 id가 아니면 거부. 상태·형식·네트워크 실패는 이유 문자열로 반환(본문·토큰 기록 없음).                                                                                             |
| `apps/web/lib/github/repository-identity.ts` (신규)                                                         | `reconcileConnectedRepository`: GitHub가 답하면 inventory 행을 갱신하고 그 기록을 저장. 답하지 못하면 기존 행은 `selected_at`·`installation_id`만 갱신하고 이름은 그대로(첫 연결이면 inventory 값 저장). 결과 `metadata`(`confirmed`/`renamed`/`reason`)로 무엇이 일어났는지 말한다.            |
| `apps/web/lib/github/onboarding-store.ts`                                                                   | `saveSelectedRepository`: `(workspace_id, github_repository_id)` 키로만 쓴다(반복 선택 = 같은 행). 확인된 이름이 다른 행과 충돌(`23505`)하면 행의 이름을 유지하고 그렇다고 말한다. `repository_selected` 감사 행에 `{ metadataSource, kept, renamed }` 추가. `refreshAvailableRepository` 신규. |
| `apps/web/lib/github/connect-repository.ts`                                                                 | 위 함수를 `saveSelection`에서 호출. head 읽기는 행이 지금 갖는 이름·브랜치로. 결과에 `metadata` 추가.                                                                                                                                                                                           |
| `apps/web/lib/github/webhook-store.ts`                                                                      | 배달을 workspace·installation·GitHub id로 매칭. 이름 조건 제거.                                                                                                                                                                                                                                 |
| 테스트                                                                                                      | `repository-identity.test.ts`(9), `webhook-store.test.ts`(2), `tests/github-api.test.ts`(+3): 이전 코드에서 red → green. `tests/e2e/connect-backfill-live.spec.ts`: inventory를 옛 라벨로 심고 실제 picker 클릭 후 두 테이블과 헤더가 GitHub 이름으로 수렴하는지 단언(라이브 App 게이트).       |
| `docs/frontend/logs/2026-09-12-repository-canonical-name.md`, `WORKLOG.md`, `spec/OPEN_QUESTIONS.md` OQ-066 | 프론트 로그와 열린 질문(선택 전 picker 갱신·URL 경로).                                                                                                                                                                                                                                          |

보존한 계약: PR #10의 선택 규칙(`selected_at`)·재시도·0크레딧, 테넌트 격리(inventory·행 조회는 workspace 한정), 실패 잡·타임스탬프 불변, GitHub 권한 불변(`metadata:read`로 충분), UI·문구 불변.

## 3. 테스트·게이트 (브랜치 팁)

근거 문서 "Red, then green"·"Gates"·"Live run" 절. 요약: lint clean, typecheck clean, `pnpm test` 188 files / 1,720 passed / 1 skipped, Prettier clean, scope boundaries PASS(12 boundaries, 363 files), `git diff --check` clean.

라이브 실행(로컬 Supabase + 실제 GitHub App + 로컬 워커): **이름 수렴 단언은 통과** — 옛 라벨을 클릭했는데 `repositories`·inventory 행과 헤더가 `2klips/alrescha-app`. 그 뒤 스캔 착지 단계는 이 변경과 무관하게 실패: 워커가 스캔을 **`403 primary-rate-limit; retry after 1051s; rate limit 0/5000 core`**로 연기하고(`queued` 유지, 실패 아님) 종료했다. 이 installation의 시간당 5,000 core 예산이 0이었다 — 프로덕션 워커의 alrescha-app 전체 스캔 2회(13:44Z·13:48Z), LostArk pair(13:53Z), 이 로컬 전체 스캔이 같은 시간 안에 한 예산을 썼다. 전체 스캔 1회 ≈ 트리 1회 + 파일당 `contents` 1회(파일럿 1,211 파일). **PR #9의 열린 질문에 대한 첫 분류된 관측이며 primary다.** pacer·동시성 변경은 이 기록의 결론이 아니라 별도 결정의 근거다.

## 4. 배포 필요 사항

- **마이그레이션** — 없음.
- **웹 배포** — 필요(머지로 Vercel 자동 배포).
- **워커 재배포** — 불필요(워커는 inventory를 읽지 않고 `repositories.full_name`으로 API 경로를 만든다. 옛 이름은 GitHub 리다이렉트가 받아주고, 아래 재선택으로 canonical이 된다).
- **환경변수·GitHub App 설정** — 없음.

**절차: 머지 → Vercel 확인 → picker 재선택 → 읽기 전용 확인.** 근거 문서 "Rollout" 절 1–5단계. 핵심:

1. merge commit으로 머지. **머지 push 자체는 아무것도 큐잉하지 않는 것이 정상**: 그 순간 살아 있는 배포는 아직 이름으로 매칭하고 행은 `2klips/arr-app`이다. 이번이 마지막이다. `/` 200, `/api/mcp` GET 405.
2. picker를 연다. **여전히 `2klips/arr-app`이 보인다**(선택이 갱신 경로다, OQ-066). 클릭.
3. 홈·헤더 `2klips/alrescha-app`, 돌아온 picker도 `2klips/alrescha-app`, 머지 head의 새 backfill pair 0크레딧. 이 pair는 파일럿 전체 스캔(≈1,200 `contents` 읽기)이다 — 그날의 스캔으로 installation 예산이 낮으면 v18이 `403 primary-rate-limit; retry after Ns`로 연기했다가 리셋에 돌린다(정상, 그 줄의 kind·리셋을 기록). 읽기 전용 SQL(근거 문서): `repositories`·`github_available_repositories`의 `full_name`이 둘 다 `2klips/alrescha-app`, 최신 `repository_selected` 감사 행 metadata가 `{"kept": false, "renamed": true, "metadataSource": "github"}`. `metadataSource`가 `inventory`면 그 순간 GitHub를 읽지 못해 아무것도 덮어쓰지 않은 것이다 — 다시 클릭.
4. 웹훅 수정은 다음 실제 push에서 드러난다(이전엔 `2klips/alrescha-app` push가 run을 만들지 않았다). 다음 PR 머지가 그 push다. 강제할 것은 없다.
5. `pnpm ops:health`: 기존 14건 WARN 유지, pair가 끝나면 큐 0, 새 실패 0.

## 5. 롤백 지점

- 웹: Vercel Instant Rollback(`80a99cb` 배포). 되돌릴 데이터 변경 없음 — 재선택이 남긴 이름은 GitHub의 현재 이름이다.

## 6. 예상과 다른 점

- picker는 선택 **후**에 맞다. 렌더 시 갱신은 모든 inventory 행 범위의 토큰이나 App 웹훅 구독 확대가 필요해 넣지 않았다(OQ-066).
- URL 연결 경로는 inventory가 갱신되기 전까지 canonical URL에 `no_access`를 답한다(같은 OQ).
- `첫 레포를 선택하세요` 문구는 그대로다.
- 403 종류는 라이브 실행에서 처음 분류돼 관측됐다(**primary**, 위 §3). pacer·`SCAN_FETCH_CONCURRENCY`는 바꾸지 않았다 — 근거는 기록했고 결정은 별도 단위다.

## PR

- <https://github.com/2klips/alrescha-app/pull/11> — 커밋 2건: `f6c5b6d`(Codex의 PR #10 롤아웃 기록·AGENTS.md 보고 선호, 작업 트리에 남아 있던 그대로), `e615e3d`(구현·테스트·문서). 머지 후 머지 커밋이 Vercel에 배포된다.
