# Claude → Codex 인계 — RE-02 검색 정확성·상한

작성 2026-09-22 KST · 카드 [RE-02](RESEARCH_EXECUTION_PLAN_2026-09-22.md#re-02--search_index-검색-누락빈-질의상한-정합성) · 보드 [RESEARCH_WORKBOARD.md](RESEARCH_WORKBOARD.md)

**상태: REVIEW.** 로컬 완료 조건 통과 + head `6c1b262`의 커밋 CI 전건 SUCCESS. [PR #26](https://github.com/2klips/alrescha-app/pull/26) 열림, 미머지. 운영 검증은 아직 없다.

## 1. SHA와 작업 공간

| 항목        | 값                                                                       |
| ----------- | ------------------------------------------------------------------------ |
| 기준 SHA    | `5d0c709` — 착수·종료 시점 모두 [PR #25](https://github.com/2klips/alrescha-app/pull/25) head, **OPEN**, 미머지 |
| 구현 SHA    | `2ba9c18`                                                                |
| 브랜치      | `research/re-02-search-accuracy`                                         |
| worktree    | `C:/Users/axz14/Desktop/Project/Arr/re-02-search`                        |
| 인계 문서   | `6c1b262`                                                                |
| PR          | [#26](https://github.com/2klips/alrescha-app/pull/26) OPEN · base `phase4/todo-26-symbol-nodes` · head `6c1b262` |
| 커밋 CI     | head `6c1b262`: gate 2건·Vercel 2건 **모두 SUCCESS** (2026-09-22 11:44–11:52Z) |

착수 시 PR #25의 head `5d0c709` 체크는 gate 2건·Vercel 2건 모두 SUCCESS였다. 그 head는 종료 시에도 동일했다. 이 카드는 **PR #25 브랜치에 아무것도 추가하지 않았다.**

**PR #26은 PR #25 위에 쌓은 스택 PR이다.** base가 `phase4/todo-26-symbol-nodes`라 diff는 이 카드의 7개 파일뿐이다. main을 base로 잡으면 #25의 커밋 2개가 diff에 중복으로 딸려 온다. #25가 머지되면 GitHub가 base를 `main`으로 자동 전환한다. 그래서 머지 순서는 **#25 다음에 #26**이다. `mergeStateStatus`가 `UNSTABLE`로 보이는 것은 base가 아직 열려 있기 때문이며 체크 실패가 아니다(`mergeable: MERGEABLE`).

이 문서 자체는 `research/re-02-search-accuracy` 브랜치에 있다. 공유 루트에서 읽으려면:

```bash
git show research/re-02-search-accuracy:docs/reports/CLAUDE_TO_CODEX_HANDOFF_RE-02.md
```

## 2. 변경 파일과 blob 해시

| 파일                                              | 상태 | blob                                       |
| ------------------------------------------------- | ---- | ------------------------------------------ |
| `packages/mcp/src/data-brain.ts`                  | M    | `af5b6ec920c69715ac68fa9304525b20824381b6` |
| `packages/mcp/src/hosted.ts`                      | M    | `bcf667a10f05d5611952a36363641bad1790a3e5` |
| `packages/mcp/src/index.ts`                       | M    | `2b19a4c14578718dc80b9b990b21d410dcf07c96` |
| `tests/search-accuracy.test.ts`                   | 신규 | `e9e5c176a2eb8790bcc22728086fd36dda7437e8` |
| `docs/reports/research-2026-09-21.probe.re-02.mjs`| 신규 | `2174a2fce10e168ebc46b3490f59c3c0e7e5cc41` |
| `.omo/evidence/research-re-02.md`                 | 신규 | `ba9f40a6965275d53fe0040e0ebbb696a0259e3f` |
| `docs/reports/CLAUDE_TO_CODEX_HANDOFF_RE-02.md`   | 신규 | 이 문서 (`6c1b262`에서 추가, 이후 CI 결과로 갱신) |

구현 커밋 `2ba9c18` 6 파일 +1,263 / −27, 인계 커밋 `6c1b262`가 이 문서. PR #26의 diff는 합계 7 파일이다.

**다른 담당이 계속 보유한 것 (이 커밋에 없음):** Codex의 홈/overview UI 9개 파일과 그 테스트 2개, `docs/brand/**`, `.claude/launch.json`, `.omo/evidence/research-2026-09-21.json`, `.omo/evidence/research-execution-plan-2026-09-22.json`, 연구 문서 5종. 공유 루트의 미커밋 상태는 그대로다. `git add .`를 쓰지 않았고 공유 루트에서 checkout/reset/stash/clean을 하지 않았다.

**공유 루트에서 내가 편집한 유일한 파일:** `docs/reports/RESEARCH_WORKBOARD.md` (미커밋, Codex 소유) — RE-02 claim/handoff 줄, RE-02 행 상태, PR checks 행 재조회 결과. 커밋하지 않았다.

**아직 아무 브랜치에도 없는 파일:** `docs/reports/research-2026-09-21.probe.mjs` (blob `dbe3bb1f…`). Codex 소유라 커밋하지 않았고, 실행을 위해 worktree에 동일 내용으로 복사만 했다. 공유 루트 사본과 해시가 같다 — **원본을 수정하지 않았다.** 커밋은 Codex 몫이다.

## 3. 무엇이 왜 틀렸고 무엇을 고쳤나

한 가지 원인의 네 가지 증상: **상한이 필터보다 먼저 돌았다.**

1. `searchWorkspaceIndex`가 20개로 자른 뒤 `hosted.ts`가 `domain_filter`를 적용 → 앞 20개가 전부 frontend면 backend 필터가 **빈 결과**. 진짜 없음과 구분 불가능한 거짓 음성.
2. 정규화 후 토큰이 없는 질의(`!!!`)는 빈 배열에 `every()`가 `true` → 모든 제목이 일치 → 워크스페이스 앞 20개 반환.
3. 스키마의 `limit` 1–100이 내부 20 상한을 넘지 못함.
4. `truncated`를 이미 잘린 목록 기준으로 계산 → backend 5개를 버린 응답이 "0개 버림"이라고 보고.

**고친 방식:** `searchWorkspaceIndexPage()`가 단일 검색 경로다. **query → type → domain → limit** 순서. 반환은 `{ coverage, eligible, omitted, results }`.

- `eligible` = **이번 읽기가 실제 확보한** 적격 후보 수. 전역 수 주장 아님.
- `omitted` = 그중 limit이 응답에서 뺀 수. `hosted.ts`가 `truncated`로 내보낸다.
- `coverage` = 이 랭킹이 세워진 테이블(`artifacts`, `graph_nodes`, `index_entries`, `memory_block_entries`) 중 하나라도 row budget에 걸리면 `partial`. 상한에 걸린 읽기에서 `truncated: 0`은 "이게 저장소의 전부"로 읽히는데, 그 읽기는 그것을 알 수 없다. 무관한 테이블(`routes`) 상한은 `complete` 그대로.
- 정규화 후 토큰 0개 → 빈 페이지. **공백 질의는 기존대로 schema 거부**(`Input validation error`)이며 빈 페이지로 바꾸지 않았다.
- `searchWorkspaceIndex()`는 배열 반환 그대로 유지, 기본 20개 그대로.

### 같은 fixture의 수정 전/후

20 frontend + 5 backend, 전부 제목 `auth`:

| 사례                          | 전 | 후 |
| ----------------------------- | --: | --: |
| `domain_filter: backend`      |  0 |  5 |
| `query: "!!!"`                | 20 |  0 |
| `limit: 100`                  | 20 | 25 |
| 기본 페이지의 `truncated`     |  0 |  5 |

> 원본 probe의 `filterAfterLimit.returnedAfterDomainFilter`는 **수정 후에도 0**이다. 그 블록은 옛 호출 형태(랭킹 후 JS에서 필터)를 일부러 재현하므로 현재 경로를 재는 것이 아니다. fixture를 바꿔 옛 결과를 감추지 않았다. 현재 경로는 `research-2026-09-21.probe.re-02.mjs`가 같은 fixture로 잰다.

## 4. 실행한 명령·결과·환경

환경: Windows 11, Node + pnpm, worktree `../re-02-search`에서 `pnpm install --frozen-lockfile` 후 실행. 2026-09-22.

| 명령                                                                  | 결과                                   |
| --------------------------------------------------------------------- | -------------------------------------- |
| `node --import tsx docs/reports/research-2026-09-21.probe.mjs`         | `!!!` 20 → **0**                       |
| `node --import tsx docs/reports/research-2026-09-21.probe.re-02.mjs`   | backend **5**, limit 100 → **25**, 기본 omitted **5** |
| `pnpm exec vitest run` — `hosted.test.ts` `symbol-layer.test.ts` `artifact-facets.test.ts` `scope-fidelity.test.ts` `search-accuracy.test.ts` | 5 files / **109 passed** |
| `pnpm lint`                                                           | clean (`--max-warnings=0`)             |
| `pnpm typecheck`                                                      | 6 projects clean                       |
| `pnpm test`                                                           | **208 files / 1,934 passed / 1 skipped** |
| `node --import tsx scripts/verify-scope-boundaries.ts`                | **PASS** — 12 boundaries, 388 files, 0 forbidden |

**수치 구분이 중요하다.** 208 = `5d0c709`의 테스트 파일 207개 + 이 카드의 1개. 기존 207개는 전부 그대로 통과했다. 위 표는 **격리 worktree의 작업트리 실행**이며, 공유 루트의 미커밋 UI 테스트 2개를 포함하지 않는다. 심볼 인계에 적힌 209 files / 1,920 passed는 그 UI 파일이 포함된 **공유 트리** 수치이므로 위 숫자와 직접 비교하면 안 된다.

### 커밋 CI (작업트리 실행과 별개)

PR #26 head `6c1b262` — 구현 `2ba9c18`과 인계 `6c1b262`를 모두 포함한 커밋 — 의 체크:

| check                   | 결과    | 완료                   |
| ----------------------- | ------- | ---------------------- |
| gate                    | SUCCESS | 2026-09-22T11:49:55Z   |
| gate                    | SUCCESS | 2026-09-22T11:52:07Z   |
| Vercel                  | SUCCESS | —                      |
| Vercel Preview Comments | SUCCESS | 2026-09-22T11:44:47Z   |

`gh run list --branch research/re-02-search-accuracy`로도 head `6c1b262`의 CI run 2건이 `completed success`다. 오래된 커밋의 성공으로 대체하지 않았다. 확인 명령:

```bash
gh pr view 26 --json headRefOid,statusCheckRollup
```

이 문서의 CI 갱신 자체가 그다음 문서 커밋이 되므로, **이 줄을 읽는 시점의 최신 head는 위 SHA보다 앞서 있을 수 있다.** 머지 전에 최신 head의 체크를 다시 조회한다.

증거 문서: `.omo/evidence/research-re-02.md`.

## 5. 새 회귀 테스트 — `tests/search-accuracy.test.ts` (19건)

순수 함수 8건 + **MCP SDK client를 통한 hosted 계약** 11건. 순수 함수 probe만으로 API 통과를 주장하지 않는다.

- domain-before-limit: backend 5개 회수, frontend 20개, 양쪽 `truncated: 0`.
- 경계: 후보 19/20/21/100 × limit 미지정/1/20/100의 결과 수·`truncated` 정합, 작은 페이지가 큰 페이지의 **prefix**(안정 순서).
- 빈 토큰 `!!!` `...` `###` `?? ??` `—`, 매칭 없음(`kubernetes`) → 의미 있는 빈 결과. 공백은 schema 거부로 핀.
- 유효 검색 회귀: `foo.ts`, `C# interop`, `인증`, `미들웨어`, `order_total`.
- domain/type 조합과 **memory 처리**: 앵커 없는 memory는 합성 경로 `memory/<block>/<key>` → `unclassified`, 앵커된 memory는 그 파일의 domain 상속. 둘 다 명시적으로 핀했다.
- 같은 경로(`src/auth.ts`)의 저장소 2개가 합쳐지지 않고 id로 안정 정렬.
- tenant 경계: 두 워크스페이스, 각자 토큰으로 상대 결과 미노출.
- `include_excerpt=false`(excerpt·title 모두 생략), `excerpt_chars` 절단, **stale summary 차단**(빈 excerpt + `excerptAbsence.reason`)이 domain 필터 아래에서도 유지.
- 심볼: `loadSymbolNeighborhood` spy로 **최종 선택 파일만** 읽는 것 확인(`["yn20"]`), span `path:start-end`·`nodeId` 형태 유지, **파일당 8개 상한** 유지.
- coverage: `index_entries` 상한 → `partial` + 이유 문자열, `routes` 상한 → `complete`.

기존 단언이나 예산을 완화하지 않았다.

## 6. 호환성

- **`tools/list` 21개, 3,150 토큰 ratchet 유지.** 새 입력을 추가하지 않았으므로 카탈로그는 바이트 동일하다. `hosted.test.ts`가 계속 핀한다.
- **`searchWorkspaceIndex()` 시그니처 불변.** 배열 반환, 기본 20개. 호출자 5곳 — `graph-tools.ts`의 `searchWorkspaceNodes`, `scripts/databrain-benchmark/context.ts`, `scripts/graph-surface-benchmark/tools.ts`, `tests/agent-memory.test.ts`, `tests/pagerank-repo-map.test.ts`, `tests/prose-absence.test.ts` — 모두 무수정 통과.
- **`search_index` 응답:** `results`·`truncated`·`query`·`workspaceId` 이름 그대로. `coverage` 한 키만 추가(additive). outputSchema가 없으므로 카탈로그 비용 0. 기존 소비자 중 `truncated`를 읽는 곳은 없었다.
- `domain_filter` 값 집합, `limit` 범위, `type_filter`, `excerpt_chars` 스키마 전부 그대로. `repository_filter` 같은 새 입력 없음.
- 심볼 기능(todo 26)은 지연 로딩 범위·상한·span·nodeId 모두 그대로.
- 원문 코드 비저장, provenance, freshness/CAS, tenant 경계, 멱등 과금 규칙 — 이 카드가 건드린 것 없음.

## 7. 남은 문제와 미검증 범위

- **프로덕션 검증 없음.** 실제 워크스페이스·재스캔·배포된 hosted 엔드포인트에서 확인하지 않았다. 모든 수치는 합성 fixture와 in-memory store다. 커밋 CI 통과는 게이트 통과이지 운영 검증이 아니다.
- **성능 미측정.** domain 필터가 이제 전체 적격 후보에 대해 `deriveArtifactFacets`를 돈다(이전엔 ≤20). 경로 접두사 비교라 비용은 작을 것으로 보지만 **재지 않았다.** cold/warm 계측은 RE-04 범위다.
- `coverage`는 `workspace.coverage.truncated`가 정확하다는 전제에 선다. Supabase store가 그 값을 채우는 경로는 이 카드에서 다시 검증하지 않았다(`supabase-store.test.ts`의 기존 테스트에 의존).
- 구두점만으로 이루어진 제목(예: 파일 제목이 정확히 `!!!`)은 이제 검색으로 도달할 수 없다. 의도된 선택이며 위 테스트에 기록돼 있다.
- 한국어 랭킹 **품질**(순위·recall)은 측정하지 않았다. 확인한 것은 유효 토큰이 사라지지 않는다는 회귀뿐이다. RE-04 범위.
- `routeQuery`의 옛 `search_nodes` 이름 부채는 손대지 않았다(RE-04의 별도 정리).

## 8. DB·배포 필요 여부

**DB migration 없음. 워커 배포 불필요. 재스캔 불필요.**

변경은 `@alrescha/mcp` 패키지 안에서 끝나며, 배포한다면 hosted MCP를 서비스하는 **웹만** 재배포하면 된다. 그 자체도 이 카드의 범위가 아니다 — 머지·배포 판단은 담당 Codex 몫이다. 롤백은 `2ba9c18` revert 하나이며 스키마 되돌릴 것이 없다.

PR #25(todo 26)의 운영 절차 — `202609210001` → 웹 머지 → 워커 재배포 → full 재스캔 — 는 이 카드와 **독립**이며 그대로 남아 있다.

## 9. Codex가 다음에 실행할 첫 명령

```bash
gh pr view 26 --repo 2klips/alrescha-app --json number,state,baseRefName,headRefOid,statusCheckRollup,url
```

로컬에서 변경을 보려면:

```bash
git -C C:/Users/axz14/Desktop/Project/Arr/re-02-search log --stat -1 2ba9c18
```

그다음 읽기 리뷰 순서: `packages/mcp/src/data-brain.ts`의 `searchWorkspaceIndexPage` → `packages/mcp/src/hosted.ts`의 `search_index` 핸들러 → `tests/search-accuracy.test.ts`.

재현하려면 같은 worktree에서:

```bash
node --import tsx docs/reports/research-2026-09-21.probe.re-02.mjs
pnpm exec vitest run tests/search-accuracy.test.ts packages/mcp/src/hosted.test.ts
```

## 10. 다음 카드

**RE-03 — 변경 준비 응답 계약.** 이 세션은 RE-02에서 멈춘다. RE-03의 `docs/reports/CHANGE_BRIEF_CONTRACT.md`와 소비 경로 구현은 시작하지 않았다.
