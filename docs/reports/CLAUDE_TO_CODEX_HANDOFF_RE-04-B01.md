# Claude → 배포 Codex 인계 — RE-04 B-01 공통 MCP 읽기 + 리뷰 R-01·R-02

작성 2026-09-23 KST · 지시 [CODEX_TO_CLAUDE_RE04_2026-09-23](CODEX_TO_CLAUDE_RE04_2026-09-23.md) · 리뷰 [POST_MERGE_REVIEW_2026-09-23](POST_MERGE_REVIEW_2026-09-23.md) · 증거 [`.omo/evidence/research-re-04-b01.md`](../../.omo/evidence/research-re-04-b01.md)

**상태: LOCAL_VERIFIED, 일부 해결.** receipts 원인은 고쳤고, edge RPC는 **측정만 하고 고치지 않았다.** 푸시·PR·배포 없음.

## 1. SHA와 작업 공간

| 항목 | 값 |
| --- | --- |
| 기준 | `027ec63c477920610ce1d99fd4d68c611188ab80` (main, 착수 시 재확인, 열린 PR 없음) |
| B-01 receipts | `6b6554b` |
| R-01 briefTokens | `3771ac8` |
| R-02 compact via + 계약 현행화 | `2f6e7f2` |
| 브랜치 | `research/re-04-mcp-read-recovery` |
| worktree | `C:/Users/axz14/Desktop/Project/Arr/re-04-read` |
| 푸시 / PR | **없음** — 승인 없는 push 금지 |

공유 루트는 `5d0c709` 그대로이고 편집한 공유 파일은 `RESEARCH_WORKBOARD.md` 하나다(claim·handoff 줄, RE-04 행). UI 9·테스트 2·brand·launch·연구 문서·`:3030`은 건드리지 않았다. 공유 루트 checkout/reset/stash/clean·`git add .` 없음.

## 2. 변경 파일 (main 대비 10개, +894 / −261)

| 파일 | 커밋 | blob |
| --- | --- | --- |
| `apps/web/lib/mcp/supabase-store.ts` | B-01 | `4c81d612` |
| `apps/web/lib/mcp/supabase-store.test.ts` | B-01 | `e5eb961e` |
| `packages/mcp/src/store.ts` | B-01 | `3ce1c635` |
| `packages/mcp/src/hosted.ts` | B-01 | `a9c84922` |
| `packages/mcp/src/index.ts` | B-01, R-02 | `3320fe8d` |
| `tests/workspace-read-receipts.test.ts` | B-01 (신규) | `730fc672` |
| `packages/mcp/src/prepare-change.ts` | R-01, R-02 | `ac8428f1` |
| `tests/change-brief.test.ts` | R-01, R-02 | `2aa5a224` |
| `docs/reports/CHANGE_BRIEF_CONTRACT.md` | R-02 | `972f9a25` |
| `docs/reports/change-brief-contract.probe.mjs` | R-02 | `17ea0be8` |

## 3. B-01 — receipts: 찾았고 고쳤다

공통 읽기가 `receipts.summary`(receipt마다 in-toto statement 전체)를 매번 select했다. MCP의 `receipts` 소비자 다섯을 전부 확인했더니 **summary를 읽는 곳은 `receipts-summary` 리소스 하나뿐**이고, 나머지 넷(브레인 노드·그래프 노드·개요·카운트)은 id·commit·status·개수만 쓴다.

**수정:** 공통 읽기는 `id, repository_id, commit_sha, status, digest`만 select한다. 리소스는 새 targeted 메서드 `loadReceiptSummaries`로 따로 읽는다 — 같은 테이블·같은 순서·같은 row budget, 자기 truncation을 보고한다. in-memory store도 심볼 레이어를 빼는 방식 그대로 summary를 빼서 두 store가 갈라지지 않는다. `summary`는 `{}`가 아니라 **부재**다 — 빈 객체는 "summary가 비어 있다"는 다른 사실이다.

**합성 fixture 실측** (PGlite = 실제 PostgreSQL, 전체 마이그레이션, 파일럿 크기로 맞춘 330 receipt, 운영 행 없음):

| receipt select | median | payload |
| --- | ---: | ---: |
| summary 포함 | 199 ms | 40,100,611 bytes |
| summary 제외 | 3 ms | 56,761 bytes |

**상대 비교일 뿐 운영 지연이 아니다.** fixture 바이트는 파일럿 실측 40,101,144와 0.002% 이내라 같은 문제를 재고 있다.

`receipts-summary` 리소스는 요청받으면 여전히 40MB를 읽는다. 이제 매 도구 호출마다가 아니라는 점만 바뀌었다. 리소스가 페이지를 나눠야 하는지는 제품 결정이라 하지 않았다.

## 4. B-01 — edge RPC: 측정했고, 고치지 않았다

`read_edge_page`를 같은 합성 PGlite로 쟀다:

- **단일 테넌트(23,619 edges):** 매 페이지가 워크스페이스 edge **전체**를 Bitmap Heap Scan + Sort한 뒤 2,001개만 남긴다. 커서 `id > $after`는 인덱스 범위가 아니라 **스캔 후 필터**다. 페이지 비용이 페이지 크기가 아니라 워크스페이스 전체 edge에 비례한다.
- **멀티 테넌트(60,003, 대상 20%):** `edges_pkey`를 커서부터 훑으며 다른 테넌트를 걸러 2,001개에 ~10,000행을 만진다.
- **`(workspace_id, id)` 인덱스는 효과가 없었다:** 추가·ANALYZE 후에도 현재 술어, `coalesce` 재작성, `order by workspace_id, id`, `random_page_cost = 1.1` 어느 경우에도 플래너가 고르지 않았다. 행·버퍼 동일.
- **합성 레이아웃이 운영을 모델링하지 못한다.** 5행마다 섞으면 대상 행이 모든 힙 페이지에 퍼져 어느 경로로 읽든 같은 페이지를 만진다. 이 시스템은 스캔 단위로 일괄 삽입하므로 운영은 워크스페이스별로 뭉쳐 있을 가능성이 크다. PGlite는 느린 페이지를 한 번도 재현하지 못했다.

**그래서 마이그레이션을 쓰지 않았다.** 로컬에서 플랜을 바꾼다고 보이지 못한 인덱스·술어 변경은 운영에 보내는 추측이다. 운영 플랜이 필요하다(§6).

**함께 발견:** 페이지 상한은 2,000 × 4 = **8,000**인데 파일럿 edge는 11,809다(`contains` 포함, store가 이후 생략). 즉 **파일럿의 모든 워크스페이스 읽기는 이미 edge가 잘려 있다.** 기존에 보고되던 동작이며 회귀가 아니다 — `impact_of`와 change brief가 `lower-bound`와 이유를 말하는 것이 정상이다. 운영 재검증에서 놀라지 않도록 적어둔다.

## 5. R-01·R-02

- **R-01** `briefTokens`: 예산 객체 전체를 빼고 셌다. 테스트 fixture에서 384 보고 vs 실제 428(리뷰 fixture 295 vs 343). 이제 브리프 전체(예산 메타데이터 포함)에서 `briefTokens` 자신만 뺀다. 작은/상한 걸린 브리프 양쪽을 실제 직렬화와 비교해 핀.
- **R-02** compact via: 브리프의 hop은 `relation`·`tier`·`provenance`만, `impact_of`는 9필드 그대로. 양쪽 핀. 알려진 한계: 다중 hop 경로의 중간 노드는 `via`에 이름이 없다.
- **계약 현행화:** 리뷰가 정한 대로 basis tagged union, `sourceDigest` "" → null, 선택자 0/36 실측과 `get_artifact(include_change_brief)` 소비 경로(`ids` 제외), budget 문안 그대로, `affectedRoutes` 미포함 유지, 03a 서술은 이력으로 분리. **예제는 이제 실제 `prepareChange` 출력**이다.

## 6. 실행한 명령·결과

환경: Windows 11, Node, pnpm, worktree에서 `pnpm install --frozen-lockfile` 후. 2026-09-23.

| 명령 | 결과 |
| --- | --- |
| `pnpm lint` | clean |
| `pnpm typecheck` | 6 projects clean |
| `pnpm test` | **210 files / 1,965 passed / 1 skipped** |
| `node --import tsx scripts/verify-scope-boundaries.ts` | PASS — 12 boundaries, 388 files |
| 카탈로그 (contract probe) | 21툴 / 3,141 / ratchet 3,150 |

1,965 = `027ec63`의 1,952 + B-01 10 + R-01 1 + R-02 2. 기존 테스트 전부 무수정 통과. **격리 worktree의 작업트리 실행이며 커밋 CI가 아니다.**

**레드 확인:** B-01 소스 4개만 `027ec63`로 되돌리고 새 테스트를 돌리면 8건 실패, 복원하면 전부 통과. 양쪽에서 통과하는 2건은 fixture 크기 확인과 "리소스는 여전히 summary를 준다"(동작 보존 테스트라 양쪽 통과가 맞다). R-01·R-02도 각각 수정 전 실패를 먼저 확인했다.

## 7. 배포 Codex에게 — 남은 검증 (읽기 전용)

**배포·DB·재스캔 필요 여부:** 마이그레이션 없음, 워커 재배포 불필요, **full 재스캔 금지(이미 1회 성공)**. 변경은 `@alrescha/mcp`와 웹 store 안에서 끝나므로 반영하려면 **웹 배포만** 필요하다. 이 브랜치는 아직 푸시되지 않았다 — 푸시·PR·머지는 사용자 승인 사항이다. 롤백은 세 커밋 revert.

웹 배포 후 순서:

1. **receipt 수정 확인.** 같은 파일럿 워크스페이스에서 `search_index`, `get_artifact`(default·`include_change_brief:true`), `get_neighbors`, `impact_of`를 각 1회. timeout이 사라졌는지, 응답 시간.
2. **edge 운영 진단 — 반드시 읽기 전용.** timeout이 남으면 edge 쪽이다. 플랜만 보는 `EXPLAIN`(실행 없음)부터:

   ```sql
   explain (costs, verbose)
   select e.id, e.repository_id, e.source_node_id, e.target_node_id,
          e.relation, e.family, e.confidence, e.provenance
   from public.edges e
   where e.workspace_id = '<pilot workspace id>'
     and (null::text is null or e.repository_id = null)
     and (null::text is null or e.id > null)
   order by e.id limit 2001;

   select count(*) from public.edges;                                  -- 전 테넌트
   select count(*) from public.edges where workspace_id = '<pilot>';
   select avg(pg_column_size(provenance)) from public.edges where workspace_id = '<pilot>';
   ```

   `EXPLAIN (ANALYZE, BUFFERS)`는 쿼리를 실제로 실행하므로 statement timeout 안에서만. 결과(플랜 노드·rows·buffers)를 가져오면 그 플랜 위에서 수정을 설계한다. **운영 DB 수정·인덱스 생성은 하지 않는다.**
3. **RE-00 닫기 조건** — 사용자 지시 그대로: MCP 읽기 재검증(1번이 통과한 뒤) + **실제 Near 헤일로** 확인. 캐시/로딩 PASS와 분리. edge truncation 때문에 `impact_of`·브리프가 `lower-bound`를 말하는 것은 정상(§4).
4. RE-02(`search_index` domain/limit/truncated/coverage)와 RE-03(`get_artifact` default 부재·opt-in·`ids` 제외·21툴)의 운영 확인도 1번 이후 같은 토큰으로.

토큰은 사용자 승인 범위에서 발급·즉시 폐기하고, 응답 본문·payload·자격증명을 기록하지 않는다.

## 8. 남은 문제·미검증

- **운영 DB를 읽지 않았다.** 14.3–32.0초 timeout을 재현하지 못했다.
- receipt 수정만으로 네 도구의 timeout이 풀리는지 모른다 — §7 1번이 답한다.
- **edge RPC의 운영 플랜과 비용 — 미해결.** §7 2번이 선행이다.
- `receipts-summary` 리소스 자체는 여전히 40MB를 읽는다.
- 리뷰의 별도 관찰(대상이 workspace 상한 바깥이면 `consumers: null` + `omissions: []`, 원인 미명시)은 후속으로 계약 §7 ⑤에 남겼다. 이번 범위 아님.
- 커밋 CI 없음(미푸시).

## 9. 원래 RE-04 작업은 시작하지 않았다

사용자 지시는 "**복구 후** 원래 RE-04 검색 비용·한국어 품질 작업"이다. 복구는 아직 확인되지 않았다 — receipt 수정은 배포 전이고 edge는 미해결이다. 그리고 검색 비용을 지금 재면 운영에서는 여전히 40MB를 읽는 옛 공통 읽기를 재게 된다. 그래서 §7 1·2번 결과를 받은 뒤 시작한다.

## 10. Codex가 다음에 실행할 첫 명령

```bash
git -C C:/Users/axz14/Desktop/Project/Arr/re-04-read log --stat 027ec63..HEAD
```

읽기 리뷰 순서: `apps/web/lib/mcp/supabase-store.ts`(receipts select + `loadReceiptSummaries`) → `packages/mcp/src/store.ts`(in-memory 대응) → `hosted.ts`의 `receipts-summary` → `prepare-change.ts`(R-01·R-02) → 두 테스트 파일.
