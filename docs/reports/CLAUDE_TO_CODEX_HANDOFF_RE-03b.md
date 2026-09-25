# Claude → Codex 인계 — RE-03 ⑶b 변경 준비 응답의 소비 경로

작성 2026-09-22 KST · 계약 [CHANGE_BRIEF_CONTRACT.md](CHANGE_BRIEF_CONTRACT.md) · 보드 [RESEARCH_WORKBOARD.md](RESEARCH_WORKBOARD.md)

**상태: LOCAL_VERIFIED.** 격리 worktree에서 완료 조건 통과. **푸시·PR 없음**(롤아웃 문서의 추가 push/merge/배포 금지). 커밋 CI·운영 검증 없음.

**현재(2026-09-25):** PR #28로 머지(2026-09-22)·배포. RE-03은 RELEASED · PROD_VERIFIED(2026-09-24).

## 1. SHA와 base 확인

| 항목     | 값                                                                                        |
| -------- | ----------------------------------------------------------------------------------------- |
| 기준 SHA | `9834656` = RE-03 ⑶a head = [PR #27](https://github.com/2klips/alrescha-app/pull/27) head |
| 구현 SHA | `90eb410`                                                                                 |
| 브랜치   | `research/re-03b-change-brief-path`                                                       |
| worktree | `C:/Users/axz14/Desktop/Project/Arr/re-03b-path`                                          |
| 푸시/PR  | **없음.** 로컬 커밋만                                                                     |

**읽기 전용으로 확인한 스택(2026-09-22):**

- PR #25 **MERGED** `6da89a11a0419bb5f53427f6d239fd4a40c7bcff`, main tip.
- PR #26 **OPEN**, head `8c16b99`, base는 **여전히 `phase4/todo-26-symbol-nodes`** — main 자동 전환을 가정하지 않고 실측했다.
- PR #27 **OPEN**, head `9834656`, base `research/re-02-search-accuracy`.
- 03b는 `9834656`에서 갈라졌고 RE-02 구현 `2ba9c18`이 조상이라 **`hosted.ts` 충돌이 없었다.** main 대비 코드 차이는 RE-02의 4파일 + 이 카드뿐이다. 리베이스 불필요.

## 2. 변경 파일

| 파일                                 | 상태 | 비고                                      |
| ------------------------------------ | ---- | ----------------------------------------- |
| `packages/mcp/src/prepare-change.ts` | M    | 브리프 구성. +227/−28                     |
| `packages/mcp/src/hosted.ts`         | M    | `get_artifact`의 opt-in. +32              |
| `packages/mcp/src/index.ts`          | M    | 타입 재수출                               |
| `packages/mcp/src/hosted.test.ts`    | M    | **주석만** — ratchet 상승 기록. 단언 불변 |
| `tests/change-brief.test.ts`         | 신규 | 18건                                      |
| `.omo/evidence/research-re-03b.md`   | 신규 | 증거                                      |

**다른 담당 보유(이 커밋에 없음):** Codex 홈/overview UI 9개 + 테스트 2개, `docs/brand/**`, `.claude/launch.json`, 연구 문서, `RESEARCH_WORKBOARD.md`(공유 루트 미커밋 — 이 카드의 claim/handoff 줄만 편집). 공유 루트에서 checkout/reset/stash/clean·`git add .` 하지 않았다.

## 3. 무엇을 고쳤나

`ChangeBrief`가 `impactOf`의 `bound`·`boundReasons`·`confidence`·`affectedRoutes`를 버리고 `dependencyImpact`만 넘겼다. `complete`는 **순회가 그래프를 다 썼는지**만 말하므로, 상한에 걸린 테이블이나 어휘 밖 관계를 모른다. 그래서 잘린 읽기 위의 브리프가 `complete: true`로 완전한 답처럼 보였다.

핀한 사례(`tests/change-brief.test.ts`): `edges` 2,000행 상한 + `contains` 12개 누락에서 `complete: true` / `stoppedBy: null` 이면서 `bound: "lower-bound"` 와 이유 2개.

브리프가 이제 나르는 것: `basis`(없으면 이유 명시), `target`(ambiguous·candidates·card·freshness·nodeId·path·sourceDigest), `consumers`(기존 + bound·boundReasons·confidence), `budget`(targetCardTokens·briefTokens·approach·truncatedItems). 소비자는 25개 상한이며 초과 시 `boundReasons`와 `truncatedItems` 양쪽에 드러난다.

## 4. 계약의 선택자가 실측에서 기각됐다

계약 §4의 기본 후보는 `request_context_pack`의 `codeCards` 중 **정확히 1개**를 확장하는 것이었다. 이 저장소 `57304f30`에서 **998 artifacts**, 과제 12개(한/영), 예산 3종으로 측정:

| `codeCards` 길이 |  횟수 |
| ---------------- | ----: |
| 정확히 1         | **0** |
| 0                |     3 |
| 20(상한)         |    33 |
| 합계             |    36 |

어느 예산에서도 1이 아니었고, 첫 카드 경로가 모든 과제에서 동일(`.env.example`)했다 — 선택이 `repository.artifacts`를 경로순으로 훑어 앞 20개를 담기 때문이다. **대상을 지목하지 못하는 선택자는 브리프를 실을 수 없다.**

그래서 계약이 명시한 조건부 대안으로 갔다: `get_artifact`는 호출자가 **이미 id/path로 대상 1개를 지목한** 자리다. opt-in 비용은 구현 **전**(3,131 → 3,141, +10)과 **후**(3,141 / 21툴) 모두 실측했고 3,150 ratchet 안이다. **ratchet은 올리지 않았다** — `hosted.test.ts`의 상승 기록 주석에만 추기했고 단언 값은 그대로다.

## 5. 실행한 명령·결과

| 명령                                                                                    | 결과                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------- |
| `pnpm exec vitest run tests/change-brief.test.ts`                                       | 18 passed                                   |
| `pnpm exec vitest run` (hosted·artifact-card·context-pack·change-brief·search-accuracy) | 5 files / 101 passed                        |
| `pnpm lint`                                                                             | clean (`--max-warnings=0`)                  |
| `pnpm typecheck`                                                                        | 6 projects clean                            |
| `pnpm test`                                                                             | **209 files / 1,952 passed / 1 skipped**    |
| `node --import tsx scripts/verify-scope-boundaries.ts`                                  | PASS — 12 boundaries, 388 files             |
| 카탈로그 probe                                                                          | **21 tools / 3,141 tokens** (ratchet 3,150) |

209 = `9834656`의 208 + 이 카드 1. 1,952 = 1,934 + 18. 기존 파일 전부 무수정 통과.
**격리 worktree의 작업트리 실행이며 커밋 CI가 아니다** — 이 브랜치는 푸시하지 않았다.

## 6. 호환성

- `prepareChange` 시그니처 유지. `resolved`는 **네 번째 optional 인자**다.
- 옛 `ChangeBrief`의 모든 필드가 같은 이름으로 남아 `tests/artifact-card.test.ts`가 무수정 통과한다.
- `include_change_brief` 없는 `get_artifact`는 이전과 **완전히 동일**하다. `changeBrief` 키는 null이 아니라 **부재**한다.
- `ids` 다중 읽기에는 브리프를 붙이지 않는다 — id 4개는 대상 4개이고 브리프는 1개에 대한 것이다.
- 호출당 store 조회 1회(`findArtifacts` spy로 핀), 대상당 `impactOf` 1회.
- 원문 코드 미유입(sentinel 문자열 fixture로 핀).

## 7. 계약과 달라진 점 — Codex 판단 필요

계약은 `budget.responseTokens`(응답 전체 추정)를 적었다. 구현은 **`budget.briefTokens`**(브리프 자신의 직렬화 추정)다. 브리프 안의 필드가 자신을 담을 응답 전체 크기를 말하면 자기 자신에 대한 숫자가 되어 정직하지 않다. `get_artifact` 전체 크기는 이미 `emitAccessEvent`가 잰다.

**계약 문서는 수정하지 않았다** — PR #27이 리뷰 중이라서다. 반영 여부는 Codex가 판단한다.

## 8. 남은 문제·미검증

- **프로덕션 검증 없음.** RE-00의 operator full 재스캔은 여전히 미실행이며 이 카드는 건드리지 않는다.
- `affectedRoutes`는 아직 버려진다. 계약 §7 ⑵가 예산 측정 후 결정하라고 남긴 항목이며 **이 카드에서 재지 않았다.**
- `impactOf`의 대형 그래프 비용 미측정(RE-04).
- 선택자 측정은 **저장소 1개·커밋 1개**다. 이 저장소에 대해서는 결정적이지만 모든 워크스페이스에 대한 주장이 아니다.
- 커밋 CI 없음(미푸시).

## 9. DB·배포

**마이그레이션 없음, 워커 배포 불필요, 재스캔 불필요.** 변경은 `@alrescha/mcp` 안에서 끝난다. 롤백은 `90eb410` revert 하나.

## 10. Codex가 다음에 실행할 첫 명령

```bash
git -C C:/Users/axz14/Desktop/Project/Arr/re-03b-path log --stat -1 90eb410
```

읽기 리뷰 순서: `packages/mcp/src/prepare-change.ts` → `hosted.ts`의 `get_artifact` 핸들러 → `tests/change-brief.test.ts`.

재현:

```bash
cd C:/Users/axz14/Desktop/Project/Arr/re-03b-path
pnpm exec vitest run tests/change-brief.test.ts packages/mcp/src/hosted.test.ts
```

## 11. 다음 범위

이 세션은 03b에서 멈춘다. RE-04(검색 비용·한국어 품질) 및 `affectedRoutes` 예산 판단은 시작하지 않았다.
