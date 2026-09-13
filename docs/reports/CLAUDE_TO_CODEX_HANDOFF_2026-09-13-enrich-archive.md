# Claude → Codex 배포 인수인계: enrich 잡도 아카이브로 읽는다 (OQ-067 ⑴)

작성: 2026-09-13 · 대상: Alrescha 배포를 담당하는 Codex
상태: **대기 — 워커 재배포(`fly deploy`)만 남아 있다. 마이그레이션·웹 변경 없음. 확인만을 위해 enrich를 돌리지 않는다.** 이 줄은 Codex가 갱신한다.
브랜치: `claude/enrich-archive` (`main@d8e4c1b` 기준) · PR: 본문 하단 "PR" 항목.
근거 문서: [`.omo/evidence/phase4/enrich-archive-2026-09-13.md`](../../.omo/evidence/phase4/enrich-archive-2026-09-13.md).

## 1. 왜

PR #12로 스캔과 analyze는 패스당 아카이브 한 번으로 본문을 읽지만, enrich 잡은 대기 파일마다 `contents` 1회를 읽었다. 첫 enrich는 모든 아티팩트(코드 주석의 "370-file batch")를 읽으므로 installation 예산에 그대로 얹힌다. 사용자가 OQ-067 ⑴을 다음 작업으로 골랐다.

## 2. 변경 파일과 동작

| 파일                                                   | 동작                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/worker/src/enrich-job.ts`                        | `prepareSources` 훅(선택). 대기 파일을 마지막으로 본 커밋별로 세어 **가장 큰 그룹**의 커밋과 개수를 첫 읽기 전에 알리고, 읽기가 끝나면(`finally`) 놓는다. 다른 커밋에서 마지막으로 본 파일은 파일당 읽기 그대로. 모듈 잡·대기 0건은 아무것도 요청하지 않는다. `dominantCommit()` 추가. |
| `apps/worker/src/run-local.ts`                         | analyze의 준비 함수를 `archiveSources(sourceFor, kind)`로 빼서 analyze·enrich가 공유한다. 로그 `enrich @sha N bodies (archive: …)` / `(archive fallback: 이유)`. 임계값 32, 캡, 폴백, rate-limit 처리는 PR #12 그대로. analyze 로그 줄 불변.                                           |
| `apps/worker/src/enrich-job.test.ts`                   | +3: 다수 커밋과 개수를 첫 읽기 전에 알리고 마지막 읽기 뒤 놓는다(다른 커밋의 파일은 제 커밋으로 읽는다), 읽기 실패에도 놓고 아무것도 저장하지 않는다, 대기 0건·모듈 잡은 요청하지 않는다. main에서 red → green.                                                                        |
| `docs/DEPLOYMENT_RUNBOOK.md`, `spec/OPEN_QUESTIONS.md` | §6·§10.1 문구에 enrich 추가. OQ-067 ⑴ 구현으로 갱신(⑵⑶은 열림).                                                                                                                                                                                                                        |

`GitHubRepositorySource`는 무변경이다. 아카이브 요청·캡·읽을 때 전개·폴백·rate-limit 처리는 PR #12가 배포하고 프로덕션이 analyze로 검증한 그대로다. core·웹·SQL·의존성 무변경.

## 3. 테스트·게이트 (브랜치 팁)

lint clean, typecheck clean, 워커 스위트 17 files / 136 passed, Prettier clean, scope boundaries PASS(12 boundaries, 363 files), `git diff --check` clean. 전체 `pnpm test`: 189 files / 1,741 passed / 1 skipped.

**enrich 잡은 어디서도 돌리지 않았다.** enrich는 대기 파일마다 AI 프로바이더를 호출하고 크레딧 또는 BYOK 키로 지불된다. 로그 한 줄을 보려고 사용자의 비용을 쓰지 않는다. 공유하는 메커니즘은 2026-09-12 프로덕션이 analyze로 검증한 것이다(`analyze @c38dc08 316 bodies (archive: 1,221 files, 21,686 KiB)`, 전체 패스 창의 카운터 변화 3).

## 4. 배포 필요 사항

- **마이그레이션** — 없음.
- **웹 배포** — 없음.
- **워커 재배포** — **필요**(`fly deploy`, 레포 루트).
- **환경변수** — 없음. 롤백 스위치 `SCAN_ARCHIVE_FETCH=off`가 enrich 아카이브도 함께 끈다.

**절차: 머지 → `fly deploy` → 머지 push pair 착지 확인 → 다음 enrich 때 로그 기록.**

1. merge commit으로 머지. `fly deploy` → v20·새 이미지 확인. 머지 push의 증분 pair가 v20에서 착지하고 `analyze @… bodies (archive: …)` 줄이 그대로 나오는지 본다 — 공유 준비 함수가 analyze를 깨지 않았다는 확인이다.
2. **확인을 위해 enrich를 돌리지 않는다.** 사용자가 다음에 enrich를 실행할 때(설정 → AI → enrich 패스, 또는 BYOK 워크스페이스의 실행) 워커 로그에 N ≥ 32이면 `enrich @<sha> <N> bodies (archive: …)`가, 그 미만이면 새 줄이 없다. 그때 그 줄을 기록한다.
3. `pnpm ops:health`: pair 착지 뒤 큐 0, 새 실패 0, 기존 WARN은 창이 지날 때까지.

## 5. 롤백 지점

- 워커: 이전 이미지(v19 `arr-worker:deployment-01M2B1YPCEH0EJFJSXJG84Y7EF`)로 `fly deploy --image`, 또는 `fly secrets set SCAN_ARCHIVE_FETCH=off`.
- 데이터 변경 없음.

## 6. 예상과 다른 점

- enrich의 대기 파일은 마지막으로 본 커밋이 제각각일 수 있다. 가장 큰 그룹만 아카이브로 읽고 나머지는 파일당이다. 첫 enrich(전부 한 커밋)에서 가장 크고, 증분 push 뒤의 소수 변경 파일은 임계값 아래라 파일당이다.
- scan → analyze → enrich가 같은 커밋의 아카이브를 각각 받는다(최대 3회). 잡 사이에 들고 있지 않는 편을 유지했다(OQ-067).

## PR

- <https://github.com/2klips/alrescha-app/pull/14> — 커밋 1건: `ed9115b`(구현·테스트·문서). 머지 후 `fly deploy`가 필요하다.
