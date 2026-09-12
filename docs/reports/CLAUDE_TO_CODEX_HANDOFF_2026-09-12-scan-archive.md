# Claude → Codex 배포 인수인계: 전체 스캔·analyze의 GitHub 읽기를 아카이브 한 번으로 (PR #11 후속)

작성: 2026-09-12 · 대상: Alrescha 배포를 담당하는 Codex
상태: **Codex 롤아웃 완료(2026-09-12 UTC / 09-13 KST) — merge `c38dc08`, Fly v19. 홈 재스캔은 실제로 incremental이라, picker 재선택의 전체 backfill로 보완 검증했다. scan·analyze 모두 archive 사용·시도 1 succeeded·0크레딧, SHA 일치. 예산 4966→4963, 패스 후 메모리 감소, 큐 0·신규 실패 0·기존 14건 WARN. PR #11 실제 push 검증도 완료. 마이그레이션 없음.** [프로덕션 기록](../../.omo/evidence/phase4/pr12-production-rollout-2026-09-12.md).
브랜치: `claude/scan-archive-fetch` (`main@0283dc0` 기준) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/scan-archive-fetch-2026-09-12.md`](../../.omo/evidence/phase4/scan-archive-fetch-2026-09-12.md) — 예산 계산, 변경, red/green, 라이브 측정, 게이트, 검증 절차가 전부 거기 있다. 이 문서는 그 요약이다.

## 1. 왜

- 이 installation이 처음 분류해 낸 403은 둘 다 `primary-rate-limit; rate limit 0/5000 core`였다(PR #11 로컬 라이브 실행, 그리고 PR #11 프로덕션 롤아웃의 330초 연기). 예산은 installation 단위라 프로덕션 워커와 로컬 실행이 함께 쓴다.
- 전체 스캔 1회 = 트리 1회 + 파일당 `contents` 1회(파일럿 ≈1,200), analyze 1회 = 문서·테스트 파일당 1회(≈290). 한 시간에 전체 pair 서너 번이면 예산 전부다. PR #9의 연기가 그것을 실패가 아닌 대기로 만들었고, 이번 변경은 그 대기를 없앤다.

## 2. 변경 파일과 동작

| 파일                                                   | 동작                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/worker/src/github-repository-source.ts`          | `prefetchArchive(sha)`: `GET /repos/{o}/{r}/zipball/{sha}` 한 번(예산 1회, codeload 다운로드는 미과금). 압축 상태로만 메모리에 두고 경로 색인을 만든 뒤 `fetchContent`가 읽을 때 그 파일 하나만 전개한다. `release()`로 버린다. 없는 경로·다른 커밋은 지금처럼 파일당 읽기. |
| `apps/worker/src/repository-scan.ts`                   | 전체 패스(연결·다시 스캔·리졸버 업그레이드)만 아카이브를 먼저 받고 `finally`에서 놓는다. 증분 패스(push)는 변경 파일만 파일당. 결과에 `archive` 요약.                                                                                                                       |
| `apps/worker/src/analysis-job.ts`                      | `prepareSources({ reads, … })` 훅(선택): 읽을 본문 수를 첫 읽기 전에 알린다. 워커는 32개 이상이면 아카이브를 받고 읽기가 끝나면 놓는다.                                                                                                                                     |
| `apps/worker/src/run-local.ts`                         | 위 배선. 로그 `scan @sha full (archive: N files, K KiB) → rows`, `analyze @sha N bodies (archive: …)`. 폴백은 `(archive fallback: 이유)`. `SCAN_ARCHIVE_FETCH=off`면 이전 동작.                                                                                             |
| 테스트                                                 | 소스(+10)·스캔 래퍼(7, 신규)·analyze(+2)·아카이브 등가성(1, 신규): main에서 red → green. 등가성 테스트는 drifted-demo 픽스처를 파일당 읽기와 아카이브로 두 번 스캔해 플랜이 바이트 단위로 같고 요청이 1+N → 2임을 단언한다.                                                 |
| `docs/DEPLOYMENT_RUNBOOK.md`, `spec/OPEN_QUESTIONS.md` | §6 선택 변수, §10.1 "예산" 문단, OQ-067(enrich·임계값·증분 스캔은 열림).                                                                                                                                                                                                    |

폴백은 전부 이유를 로그에 남기고 파일당 읽기로 돌아간다(캡 초과: 압축 64 MiB·엔트리 1 MiB, zip이 아님, 404/5xx). 아카이브 요청 자체가 rate limit이면 잡을 던져 PR #9 경로로 연기한다. 본문은 패스 동안 프로세스 메모리에만 있고 어디에도 쓰지 않는다(WORK_SPEC §3-3). 의존성 추가 없음(`fflate`는 이미 워커의 것). core·웹·SQL 무변경.

## 3. 테스트·게이트·측정 (브랜치 팁)

근거 문서 "Red, then green"·"Gates"·"Live run" 절. 요약: lint clean, typecheck clean, `pnpm test` 189 files / 1,738 passed / 1 skipped, Prettier clean, scope boundaries PASS(12 boundaries, 363 files), `git diff --check` clean.

라이브 측정(실제 GitHub App, 로컬 Supabase, 로컬 워커) 두 번. 첫 구현(전부 전개)에서는 전체 pair 두 개(`80a99cb`의 연기됐던 pair + 머지 head `0283dc0`의 새 pair)가 한 워커 실행에서 **36초** 안에 끝났다. 출하 구현(압축 보관·읽을 때 전개)에서는 같은 head의 전체 rescan pair 하나가 **18.9초**(구조 준비 12.3초, 맵 18.8초). 워커 요약: `scan @0283dc0 full (archive: 1,216 files, 21,588 KiB) → 1 rows`, `analyze @0283dc0 291 bodies (archive: 1,216 files, 21,588 KiB)`. 이전 같은 스펙의 측정(파일당 읽기, `1eb4de7`)은 구조 준비 151초·워커 idle 157.6초였고, 프로덕션의 같은 날 파일당 읽기는 scan 52초·analyze 3분이었다. 요청 수는 코드 경로와 파일 수에서 유도한 값(pair당 ≈1,490 → 3)이지 GitHub 카운터 실측이 아니다. `todo-16/t2fv-live.json`과 스크린샷은 출하 구현의 실행으로 갱신해 함께 커밋했다.

## 4. 배포 필요 사항

- **마이그레이션** — 없음.
- **웹 배포** — 없음(머지는 웹을 재배포하지만 웹 코드는 무변경).
- **워커 재배포** — **필요**(`fly deploy`, 레포 루트).
- **환경변수** — 없음. 롤백 스위치 `SCAN_ARCHIVE_FETCH=off`는 Fly secret(설정 시 재시작).

**절차: 머지 → `fly deploy` → 다시 스캔 1회 → 로그·SHA·health 확인.** 근거 문서 "Rollout" 절 1–5단계. 핵심:

1. merge commit으로 머지. 머지 push는 v18에서 증분 pair(파일당, 요청 몇 개)를 큐잉한다 — 그대로 둔다.
2. `fly deploy` → v19·새 이미지 확인. HTTP 포트 없음이 정상.
3. **Codex 프로덕션 검증 정정:** 현재 홈의 `다시 스캔`은 resolver가 최신이면 incremental pair다(폼에 `mode=full` 없음). 홈 버튼 1회는 그 동작으로 검증하고, **전체** 아카이브 검증은 같은 저장소를 정상 picker에서 재선택하여 생기는 full backfill 경로로 한다(0크레딧). 이번 실행은 두 경로를 구분해 완료했다. `fly logs -a arr-worker`에서 full backfill의 `scan @<sha> full (archive: …)`와 `analyze @<sha> … bodies (archive: …)`, 두 잡 attempt 1 succeeded, 저장소 SHA 두 칼럼 = head를 확인한다. `(archive fallback: …)`는 이유를 기록한다. 문서 정정을 위해 홈 버튼을 강제로 full로 바꾸거나 DB를 수동 수정하지 않는다.
4. 창 안에 `403 primary-rate-limit` 줄이 없어야 한다. 가능하면 pair 전후 `GET /rate_limit`(installation 토큰)의 `remaining` 차이를 기록한다 — 몇 단위여야 한다.
5. `pnpm ops:health`: 기존 14건 WARN 유지, 큐 0, 새 실패 0. 머신 메모리가 패스 뒤에 내려오는지 `fly status`/metrics로 한 번 본다(아카이브는 패스당 압축 21.5 MiB).

## 5. 롤백 지점

- 워커: 이전 이미지(v18 `arr-worker:deployment-01M2ATJRDBS6R7P565EH754RE0`)로 `fly deploy --image`, 또는 `fly secrets set SCAN_ARCHIVE_FETCH=off`(코드 그대로, 파일당 읽기).
- 데이터 변경 없음.

## 6. 예상과 다른 점

- analyze는 스캔이 놓은 아카이브를 다시 받는다(pair당 요청 1개·21 MiB 추가). 잡 사이에 들고 있지 않는 편을 택했다(메모리).
- enrich(BYOK·크레딧)는 파일당 읽기 그대로다(OQ-067 ⑴).
- 증분 스캔은 변경 파일이 많아도 파일당이다(OQ-067 ⑶).
- 첫 구현은 전개 본문을 전부 메모리에 두었다; 파일럿 아카이브(압축 21.5 MiB)와 512 MiB 머신·동시 4패스를 감안해 압축 보관·읽을 때 한 파일 전개로 바꿨다. 두 라이브 실행이 각각의 구현을 통과했다.

## PR

- <https://github.com/2klips/alrescha-app/pull/12> — 커밋 2건: `4a4e2c6`(Codex의 PR #11 롤아웃 기록·프론트 로그·WORKLOG 행·인수인계 상태 줄, 작업 트리에 남아 있던 그대로), `4831bcd`(구현·테스트·문서·라이브 측정). 머지 후 `fly deploy`가 필요하다.
