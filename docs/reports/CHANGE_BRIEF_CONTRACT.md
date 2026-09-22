# 변경 준비 응답 계약 (change brief) — RE-03 ⑶a

작성 2026-09-22 KST · 카드 [RE-03](RESEARCH_EXECUTION_PLAN_2026-09-22.md#re-03--기존-preparechange의-실제-소비-경로와-응답-예산) · 선행 [RE-02](CLAUDE_TO_CODEX_HANDOFF_RE-02.md)

**이 문서는 계약이며 구현이 아니다.** 03a는 계약 확정, 03b가 한 소비 경로 구현이다. 아래 JSON은 전부 [`change-brief-contract.probe.mjs`](change-brief-contract.probe.mjs)의 실제 출력이다 — 손으로 쓴 예시가 아니다. 그래서 현재 타입이 주지 않는 필드는 이 문서에 등장할 수 없다.

```bash
node --import tsx docs/reports/change-brief-contract.probe.mjs
```

**새로 만들지 않는 것:** 새 엔진, 중복 MCP 도구, 새 DB 테이블, 새 검색 경로. `prepareChange`·`ArtifactCard`·freshness/CAS·방향성 `impactOf`는 **이미 있다.** 이 카드는 그것들을 하나의 응답으로 묶는 규칙을 정한다.

---

## 1. 지금 무엇이 빠져 있나

`prepareChange()`는 이미 카드·소비자·누락을 합성한다. 하지만 `ChangeBrief`는 `impactOf()`가 돌려준 것 중 **네 가지를 버린다.** probe로 확인한 실제 값:

| `impactOf`가 주는 것 | `ChangeBrief`에 있나 | 왜 문제인가                                        |
| -------------------- | -------------------- | -------------------------------------------------- |
| `bound`              | **없음**             | 잘린 읽기의 소비자 목록이 완전한 답으로 보인다     |
| `boundReasons`       | **없음**             | 왜 바닥값인지 말할 수 없다                         |
| `confidence`         | **없음**             | resolved import와 agent 주장이 한 숫자로 뭉개진다  |
| `affectedRoutes`     | **없음**             | 바뀌는 화면/엔드포인트를 알 수 없다                |

가장 심각한 것은 첫 줄이다. **partial 예제에서 실측된 불일치:**

| 값                                  | 실제 결과                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ChangeBrief.consumers.complete`    | `true`                                                                                                                                                 |
| `ImpactReport.bound`                | `"lower-bound"`                                                                                                                                        |
| `ImpactReport.boundReasons`         | `["12 contains edges were not carried: …(todo 22)", "the edges read stopped at its 2000-row budget"]` |

`complete`는 **순회가 그래프를 다 썼는지**만 말한다. 상한에 걸린 테이블이나 어휘 밖으로 떨어진 관계는 알지 못한다. 그래서 잘린 읽기 위에서 만든 브리프가 "소비자는 이게 전부"라고 말하고, 에이전트는 **보지 못한 것 때문에 안전하다고 결론 내린다.** 이것이 이 계약이 존재하는 이유다.

추가로 `ChangeBrief`에는 `basis`(어느 commit/revision 위의 답인지)와 `budget`(이 응답이 얼마인지)이 **아예 없다.**

---

## 2. 계약

```text
basis    : workspace/repository + 실제 확보한 commit/revision + source digest
target   : stable artifact id/path + freshness
consumers: 위치 · 관계 · 출처 · 증거 등급 · 경계
missing / omissions : 읽지 못한 범위, 상한, 모호함, summary 부재 이유
budget   : 본문 추정 / 응답 전체 추정 / 추정 방식 / 잘린 항목
```

### 2.1 `basis` — 없으면 없다고 말한다

`McpReadBasis`는 **repository당 optional**이다. supabase store는 RPC 결과를 `basisByRepository`에 담고 행이 있을 때만 붙인다. in-memory store는 **한 번도 채우지 않는다.**

따라서 `basis`는 nullable이고, 없을 때 **이유를 말한다.** 없는 commit을 지어내지 않는다.

- `graphGeneration`은 소스에서 **타입이 `null`** 이다. 지명할 불변 세대가 없으므로 아무것도 지명하지 않는다. 미래에 생길 값의 자리표시자가 아니다.
- `readConsistency`는 `workspace.coverage`에서 온다 — `revision-fenced` / `single-statement` / `unproven`. fixture에는 coverage가 없으므로 `unproven`이다.
- `analyzedCommit`과 `indexedCommit`은 **따로** 간다. 그래프가 완전한데 findings가 옛 커밋에서 온 저장소가 실제로 있고, 둘을 한 단어로 합치면 그중 하나는 틀린다.
- `stages`는 `analysis: current|pending|unavailable`, `structure: building|ready`.

### 2.2 `target` — id·경로·freshness·digest

`sourceDigest`는 `McpArtifactData.blobSha`다. supabase store는 `source_blob_sha ?? ""`로 채우므로 **빈 문자열이 올 수 있고, 그때는 digest 없음으로 취급한다.**

`freshness`는 `card.summary.state`(`current`/`stale`/`missing`/`unknown`)다. 새로 계산하지 않는다 — freshness 규칙(S1)은 행을 쥔 쪽이 이미 적용했고, 카드는 그 답을 나른다. 두 번째 의견을 만들지 않는다.

### 2.3 `consumers` — 증거 등급과 경계를 반드시 함께

`bound`·`boundReasons`·`confidence`는 **필수**다. 없애면 §1의 결함으로 되돌아간다.

`via`는 각 후보에 닿은 최소 경로다. 계약은 `relation`·`tier`·`provenance`만 남기고 `id`·`sourceNodeId`·`targetNodeId`·`family`·`derived`는 뺀다 — 노드 id는 후보에 이미 있고, 경로 한 줄의 목적은 "왜 이게 소비자인가"를 말하는 것이지 엣지 행을 복제하는 것이 아니다.

**구조적 도달은 후보이지 고장이 아니다.** `relatedTests`는 수집만 하고 관통하지 않는다(test-terminal 규칙).

### 2.4 `budget` — 본문과 전체를 분리

- `targetCardTokens` = 카드 본문 추정. **`token_budget`의 현재 의미(선택된 본문)를 바꾸지 않는다.**
- `responseTokens` = 응답 전체 추정. 03b가 직렬화 시점에 채운다.
- `approach` = UTF-16 4자당 1토큰. **근사치이며 provider가 청구하는 토큰이 아니다.** 문자열로 응답에 싣는다.
- `truncatedItems` = 예산 때문에 잘린 항목. 비어 있음은 "자른 것 없음"이지 "작다"가 아니다.

---

## 3. 예제 3개 (probe 실제 출력)

### ⑴ 정상

저장소 1개, 현행 설명, 그 파일을 import하는 테스트 1개, basis 있음.

```json
{
  "basis": {
    "analyzedCommit": "cccccccccccccccccccccccccccccccccccccccc",
    "available": true,
    "dataRevision": 42,
    "graphGeneration": null,
    "indexedCommit": "cccccccccccccccccccccccccccccccccccccccc",
    "readConsistency": "unproven",
    "repositoryFullName": "2klips/alrescha-app",
    "repositoryId": "01K200000000000000000000R1",
    "stages": { "analysis": "current", "structure": "ready" }
  },
  "budget": {
    "approach": "one token per four UTF-16 characters of the serialised value; an approximation, not a provider's billed count",
    "targetCardTokens": 89,
    "truncatedItems": []
  },
  "consumers": {
    "bound": "exact",
    "boundReasons": [],
    "confidence": { "agent_asserted": 0, "inferred": 0, "reference": 0, "resolved": 1, "unstated": 0 },
    "candidates": [
      {
        "distance": 1,
        "nodeId": "01K200000000000000000000A2",
        "path": "tests/session.test.ts",
        "via": [
          { "provenance": { "method": "import-binding", "reason": null, "span": null }, "relation": "imports", "tier": "resolved" }
        ]
      }
    ],
    "relatedTests": ["01K200000000000000000000A2"],
    "stoppedBy": null
  },
  "missing": [],
  "omissions": [],
  "target": {
    "ambiguous": false,
    "freshness": "current",
    "nodeId": "01K200000000000000000000A1",
    "path": "src/session.ts",
    "sourceDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

`confidence.resolved: 1`이 핵심이다. 이 소비자는 resolved import 엣지 하나로 닿았다 — 누군가 손으로 주장한 것이 아니다.

### ⑵ 대상 모호함

저장소 2개가 같은 `src/session.ts`를 가진다. **임의로 하나를 고르지 않는다.**

```json
{
  "basis": {
    "available": false,
    "reason": "no read basis accompanied this repository; commit and revision cannot be stated"
  },
  "budget": {
    "approach": "one token per four UTF-16 characters of the serialised value; an approximation, not a provider's billed count",
    "targetCardTokens": 0,
    "truncatedItems": []
  },
  "consumers": null,
  "missing": ["2 repositories answer to this path; name one"],
  "omissions": [],
  "target": { "ambiguous": true, "nodeId": null, "path": "src/session.ts" }
}
```

`consumers: null`은 **"소비자 없음"이 아니라 "계산하지 않았다"** 이다. 대상이 정해지지 않았는데 소비자 목록을 내놓으면 고르지 않았다고 말하면서 고른 셈이 된다. 빈 배열과 `null`을 구분하는 이유다.

id 선택자는 모호해질 수 없다 — id는 유일하다.

### ⑶ 부분 결과

엣지 테이블이 상한에 걸렸고, 어휘 밖 관계 12개가 떨어졌고, 설명은 옛 blob 기준이고, basis 행이 없다.

```json
{
  "basis": {
    "available": false,
    "reason": "no read basis accompanied this repository; commit and revision cannot be stated"
  },
  "budget": {
    "approach": "one token per four UTF-16 characters of the serialised value; an approximation, not a provider's billed count",
    "targetCardTokens": 128,
    "truncatedItems": []
  },
  "consumers": {
    "bound": "lower-bound",
    "boundReasons": [
      "12 contains edges were not carried: the directory hierarchy is excluded from graph answers until the tools can filter it (todo 22)",
      "the edges read stopped at its 2000-row budget"
    ],
    "confidence": { "agent_asserted": 0, "inferred": 0, "reference": 0, "resolved": 1, "unstated": 0 },
    "candidates": [
      {
        "distance": 1,
        "nodeId": "01K200000000000000000000A2",
        "path": "tests/session.test.ts",
        "via": [
          { "provenance": { "method": "import-binding", "reason": null, "span": null }, "relation": "imports", "tier": "resolved" }
        ]
      }
    ],
    "relatedTests": ["01K200000000000000000000A2"],
    "stoppedBy": null
  },
  "missing": [
    "a description exists but was written for an older version of this file, so it is not served as current"
  ],
  "omissions": [
    {
      "count": 12,
      "reason": "the directory hierarchy is excluded from graph answers until the tools can filter it (todo 22)",
      "relation": "contains"
    }
  ],
  "target": {
    "ambiguous": false,
    "freshness": "stale",
    "nodeId": "01K200000000000000000000A1",
    "path": "src/session.ts",
    "sourceDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

**`stoppedBy: null`인데 `bound: "lower-bound"`다.** 순회는 그래프를 다 썼지만 읽기 자체가 짧았다. 이 두 사실이 다르다는 것이 `complete` 하나로는 표현되지 않는 바로 그 지점이다.

---

## 4. 선택자 — 어떻게 대상을 정하나

**기본 후보:** 기존 `request_context_pack`이 이미 선택한 `codeCards` 중 **명확한 1개**만 `prepareChange`로 확장한다.

| pack의 `codeCards` | 동작                                            |
| ------------------ | ----------------------------------------------- |
| 정확히 1개         | 그 카드를 대상으로 확장                         |
| 0개                | 확장 없음. brief 자체를 붙이지 않는다           |
| 2개 이상           | 확장 없음. `ambiguous`로 후보 목록을 표시       |

**일반 조회마다 비싼 impact를 자동으로 붙이지 않는다.** `impactOf`는 그래프 뷰를 만들고 최대 5,000 엣지를 순회한다. 모든 `get_artifact`에 이것을 다는 것은 이 카드가 하려는 일이 아니다.

### 대안: `get_artifact`의 명시적 opt-in — 실측 비용

pack의 선택이 대상을 안정적으로 지목하지 못하면, 대안은 `get_artifact`에 optional 불리언을 하나 더하는 것이다. OQ-059는 토큰 예산이므로 숫자 없는 제안은 제안이 아니다. **실제로 서빙되는 카탈로그를 재서** 비교했다:

| 값                           | 토큰      |
| ---------------------------- | --------- |
| 현재 `tools/list` (21 tools) | **3,131** |
| `include_change_brief` 추가  | **3,141** |
| 차이                         | **+10**   |
| ratchet                      | 3,150     |

**감당은 되지만 여유가 9토큰뿐이다.** 이 경로를 택하면 ratchet을 사실상 소진한다. 그래서 **pack 선택자를 먼저 시도하고**, 03b에서 그것이 대상을 안정적으로 지목하지 못한다는 것이 실측으로 드러날 때만 opt-in으로 전환한다. 전환하려면 ratchet을 올리는 별도 결정이 필요하며, 그것은 이 카드가 아니다.

---

## 5. 호환성 정책

- **기존 응답에 키를 더하는 것만 한다.** `request_context_pack`의 현재 키는 이름·의미 모두 그대로다. brief는 대상이 정해졌을 때만 나타나는 **optional 키**다.
- **`token_budget`의 의미를 묵시적으로 바꾸지 않는다.** 지금 그것은 선택된 본문 예산이다. `budget.responseTokens`는 **별도 보고 값**이지 새 상한이 아니다.
- outputSchema가 없으므로 응답 키 추가의 카탈로그 비용은 **0**이다. 입력 추가만 비용이 있다.
- **원문 코드를 싣지 않는다.** brief가 나르는 것은 카드·id·경로·span 같은 **위치**다. `exports`는 이름뿐이고 시그니처가 아니다.
- tenant 경계·freshness/CAS·provenance·멱등 과금은 이 계약이 건드리지 않는다.

---

## 6. 03b의 완료 조건

- 기존 `prepareChange`를 **실제 한 소비 경로**에서 호출한다. 새 도구를 만들지 않는다.
- `bound`·`boundReasons`·`confidence`를 브리프에 싣는다 — §1의 결함 해소가 03b의 존재 이유다.
- 중복 조회를 하지 않는다. `impactOf`는 한 대상에 **1회**.
- 케이스: 정상 · 모호 · stale · 다른 tenant · 불완전 graph · 아주 작은 예산.
- 기존 응답 호환성, raw source 비저장, **21툴 / 3,150 토큰 예산 유지**.
- 테스트 시작점: `tests/artifact-card.test.ts`, `tests/context-pack.test.ts`, `packages/mcp/src/hosted.test.ts`.

---

## 7. 미결정 — Codex 읽기 리뷰에서 답이 필요한 것

1. **`basis`가 repository당인데 brief는 대상 1개다.** 대상이 속한 저장소의 basis만 싣는 것으로 충분한가, 아니면 소비자가 다른 저장소에 있을 때 그쪽 basis도 필요한가? 지금 계약은 **대상의 것만** 싣는다.
2. **`affectedRoutes`를 기본으로 실을 것인가.** 바뀌는 화면을 아는 것은 가치가 크지만 응답이 커진다. 지금 계약은 §1에 "버려지고 있다"고 적었을 뿐 §2에 넣지 않았다 — 03b에서 예산을 재고 결정한다.
3. **`sourceDigest`가 빈 문자열일 때** `null`로 정규화할지, 빈 문자열 그대로 둘지. 지금 계약은 **없음으로 취급**하라고만 정했다.
4. pack의 `codeCards`가 실제 워크스페이스에서 얼마나 자주 정확히 1개인가. **측정하지 않았다.** 03b의 첫 실측 대상이다.

---

## 8. 이 문서가 주장하지 않는 것

- 구현하지 않았다. `prepare-change.ts`를 포함해 **제품 소스는 한 줄도 바꾸지 않았다.**
- 예제는 **합성 fixture**다. 프로덕션 워크스페이스에서 확인하지 않았다.
- 카탈로그 측정(3,131 / 3,141)은 실제 서빙 payload지만 **그 시점의 코드 기준**이다. 툴이 늘면 다시 재야 한다.
- 성능·지연은 재지 않았다. `impactOf`의 비용은 RE-04 범위다.
