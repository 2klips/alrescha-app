# 변경 준비 응답 계약 (change brief) — RE-03

작성 2026-09-22 KST(03a) · **현행화 2026-09-23 KST(03b 머지 + 사후 리뷰 R-01·R-02 반영)** · 카드 [RE-03](RESEARCH_EXECUTION_PLAN_2026-09-22.md#re-03--기존-preparechange의-실제-소비-경로와-응답-예산) · 리뷰 [POST_MERGE_REVIEW_2026-09-23](POST_MERGE_REVIEW_2026-09-23.md)

**이 문서는 현재 구현된 계약이다.** 아래 JSON은 전부 [`change-brief-contract.probe.mjs`](change-brief-contract.probe.mjs)가 **실제 `prepareChange`를 호출해** 낸 출력이다. 03a 때는 구현이 없어 probe가 제안 모양을 손으로 조립했지만, 이제 구현이 있으므로 예제는 구현에서 나온다 — 코드와 따로 쓴 예제는 둘 중 하나가 바뀌는 순간 어긋난다.

```bash
node --import tsx docs/reports/change-brief-contract.probe.mjs
```

실행 가능한 명세: [`tests/change-brief.test.ts`](../../tests/change-brief.test.ts).

## 0. 현행 상태 (2026-09-23)

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 소비 경로 | `get_artifact({ include_change_brief: true })` — 단일 대상 읽기에서만 | #28 `027ec63` |
| `ids` 다중 읽기 | 브리프 **없음** — id 4개는 대상 4개이고 브리프는 1개에 대한 것 | #28 |
| `bound`·`boundReasons`·`confidence` | 실림 | #28 |
| `basis` | tagged union `{available:true,…}` / `{available:false,reason}` | #28 |
| `sourceDigest` | 빈 문자열이면 `null` | #28 |
| `briefTokens` 계산 범위 | 브리프 전체(예산 메타데이터 포함), `briefTokens` 자신만 제외 | R-01 |
| `via` | `relation`·`tier`·`provenance`만 | R-02 |
| `affectedRoutes` | **미포함** — 후속 예산 판단(§7 ⑵) | — |
| 카탈로그 | 21툴 / 3,141 토큰, ratchet 3,150 | probe `catalogue` |

**새로 만들지 않은 것:** 새 엔진, 중복 MCP 도구, 새 DB 테이블, 새 검색 경로. `prepareChange`·`ArtifactCard`·freshness/CAS·방향성 `impactOf`를 하나의 응답으로 묶는 규칙만 정했다.

---

## 1. 03a가 발견한 결함과 해소

`prepareChange()`는 원래 `impactOf()`의 결과 중 넷을 버렸다: `bound`, `boundReasons`, `confidence`, `affectedRoutes`. 가장 심각했던 것은 `bound`다 — `dependencyImpact.complete`는 **순회가 그래프를 다 썼는지**만 말하고, 상한에 걸린 테이블이나 어휘 밖으로 떨어진 관계는 알지 못한다. 그래서 잘린 읽기 위의 브리프가 "소비자는 이게 전부"라고 말했다.

**해소(#28):** `bound`·`boundReasons`·`confidence`가 이제 `consumers`에 실린다. §3 ⑶ 부분 결과 예제가 그 결함을 그대로 보여준다 — `complete: true`, `stoppedBy: null`인데 `bound: "lower-bound"`이고 이유가 둘이다. **`affectedRoutes`는 여전히 미포함**이다(§7 ⑵).

---

## 2. 계약

```text
basis    : workspace/repository + 실제 확보한 commit/revision (없으면 없다고 말한다)
target   : stable artifact id/path + freshness + source digest (+ 모호할 때 후보)
consumers: 위치 · 관계 · 출처 · 증거 등급 · 경계
missing / omissions : 읽지 못한 범위, 상한, 모호함, summary 부재 이유
budget   : 카드 추정 / 브리프 추정 / 추정 방식 / 잘린 항목
```

### 2.1 `basis` — tagged union, 없으면 이유

`McpReadBasis`는 **repository당 optional**이다. hosted store는 RPC 행이 있을 때만 붙이고, in-memory store는 채우지 않는다. 그래서 `basis`는 `null`이 아니라 두 모양 중 하나다:

- `{ available: true, analyzedCommit, dataRevision, graphGeneration, indexedCommit, readConsistency, repositoryFullName, repositoryId, stages }`
- `{ available: false, reason }` — commit 키 자체가 **없다**. null 모양의 commit을 보여주지 않는다.

`graphGeneration`은 소스에서 타입이 `null`이다 — 지명할 불변 세대가 없으므로 지명하지 않는다. 미래 값의 자리표시자가 아니다. `analyzedCommit`과 `indexedCommit`은 따로 간다.

### 2.2 `target`

- `sourceDigest` = `McpArtifactData.blobSha`. hosted 디코더가 null 컬럼을 `""`로 쓰므로 **빈 문자열은 `null`로 정규화**한다.
- `freshness` = `card.summary.state`. 재계산하지 않는다 — freshness 규칙(S1)은 행을 쥔 쪽이 이미 적용했다.
- 경로가 여러 저장소에 걸리면 `ambiguous: true`와 `candidates`(artifactId·repositoryFullName·repositoryId)를 싣고 **아무것도 고르지 않는다.** id 선택자는 모호해질 수 없다.

### 2.3 `consumers` — 증거 등급과 경계, compact `via`

`bound`·`boundReasons`·`confidence`는 필수다. 소비자는 `CHANGE_BRIEF_CONSUMER_CAP`(25)으로 상한이 있고, 초과하면 `boundReasons`와 `budget.truncatedItems` **양쪽에** 드러난다.

`via`의 각 hop은 **`relation`·`tier`·`provenance`만** 싣는다(R-02). 엣지 id·끝점·family·confidence·derived는 뺀다 — 후보가 이미 자기 노드와 거리를 말하고, 소비자마다 엣지 행 전체를 반복하는 것은 설명이 아니라 payload다. provenance는 손대지 않고 그대로 싣는다(method·reason·span).

**`impact_of` 응답은 바뀌지 않는다.** projection은 브리프 전용이다.

**알려진 한계:** 두 hop 이상인 경로에서 중간 노드는 `via`에 이름이 없다. 그 노드는 더 짧은 거리의 후보로 목록에 있지만, `via`만으로는 어느 것인지 알 수 없다.

구조적 도달은 후보이지 고장이 아니다. `relatedTests`는 수집만 하고 관통하지 않는다(test-terminal 규칙).

### 2.4 `budget`

> budget.targetCardTokens는 target.card 직렬화의 근사치다. budget.briefTokens는 다른 budget 메타데이터까지 포함한 changeBrief의 직렬화를 기준으로 하며, briefTokens 수치 필드 자신만 제외한다. 문자열 길이는 UTF-16 code unit 기준이고 ceil(length/4)를 사용한다. 두 값 모두 provider 청구 토큰이 아니다. get_artifact 전체 응답 계측은 emitAccessEvent의 별도 책임이다. 이 보고 값은 token_budget이나 max_chars의 의미/상한을 변경하지 않는다.

- `approach`는 위 근사 방식을 문자열로 응답에 싣는다.
- `truncatedItems`가 비어 있음은 "자른 것 없음"이지 "작다"가 아니다.
- JSON 길이는 키 순서와 무관하므로 계산은 결정론적이다.

---

## 3. 예제 3개 (실제 `prepareChange` 출력)

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
    "truncatedItems": [],
    "briefTokens": 381
  },
  "consumers": {
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
    "complete": true,
    "relatedTests": ["01K200000000000000000000A2"],
    "stoppedBy": null,
    "bound": "exact",
    "boundReasons": [],
    "confidence": { "agent_asserted": 0, "inferred": 0, "reference": 0, "resolved": 1, "unstated": 0 }
  },
  "missing": [],
  "omissions": [],
  "target": {
    "ambiguous": false,
    "card": {
      "domain": "backend",
      "exports": ["SESSION_TIMEOUT_MS", "isSessionExpired"],
      "kind": "code_metadata",
      "missing": [],
      "openTodoCount": 0,
      "path": "src/session.ts",
      "relations": { "tests": 1, "imports": 1 },
      "summary": { "grade": "inferred", "sourceBlobSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "state": "current", "text": "Session expiry helpers." },
      "tested": true,
      "unit": "lib"
    },
    "freshness": "current",
    "nodeId": "01K200000000000000000000A1",
    "path": "src/session.ts",
    "sourceDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

`confidence.resolved: 1` — 이 소비자는 resolved import 엣지 하나로 닿았다. 누군가 손으로 주장한 것이 아니다.

### ⑵ 대상 모호함

저장소 2개가 같은 `src/session.ts`를 가진다. **아무것도 고르지 않는다.**

```json
{
  "basis": {
    "available": false,
    "reason": "no read basis accompanied this repository; commit and revision cannot be stated"
  },
  "budget": {
    "approach": "one token per four UTF-16 characters of the serialised value; an approximation, not a provider's billed count",
    "targetCardTokens": 0,
    "truncatedItems": [],
    "briefTokens": 194
  },
  "consumers": null,
  "missing": ["2 repositories answer to this path; name one"],
  "omissions": [],
  "target": {
    "ambiguous": true,
    "candidates": [
      { "artifactId": "01K200000000000000000000A1", "repositoryFullName": "2klips/alrescha-app", "repositoryId": "01K200000000000000000000R1" },
      { "artifactId": "01K200000000000000000000B1", "repositoryFullName": "2klips/other-app", "repositoryId": "01K200000000000000000000R2" }
    ],
    "card": null,
    "freshness": null,
    "nodeId": null,
    "path": "src/session.ts",
    "sourceDigest": null
  }
}
```

`consumers: null`은 **"소비자 없음"이 아니라 "계산하지 않았다"** 이다. 대상이 정해지지 않았는데 목록을 내놓으면 고르지 않았다고 말하면서 고른 셈이 된다. `basis`가 없는 것도 같은 이유다 — 어느 저장소의 basis인지 정할 수 없다.

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
    "truncatedItems": [],
    "briefTokens": 468
  },
  "consumers": {
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
    "complete": true,
    "relatedTests": ["01K200000000000000000000A2"],
    "stoppedBy": null,
    "bound": "lower-bound",
    "boundReasons": [
      "12 contains edges were not carried: the directory hierarchy is excluded from graph answers until the tools can filter it (todo 22)",
      "the edges read stopped at its 2000-row budget"
    ],
    "confidence": { "agent_asserted": 0, "inferred": 0, "reference": 0, "resolved": 1, "unstated": 0 }
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
    "card": {
      "domain": "backend",
      "exports": ["SESSION_TIMEOUT_MS", "isSessionExpired"],
      "kind": "code_metadata",
      "missing": ["a description exists but was written for an older version of this file, so it is not served as current"],
      "openTodoCount": 0,
      "path": "src/session.ts",
      "relations": { "tests": 1, "imports": 1 },
      "summary": { "currentBlobSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "sourceBlobSha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "state": "stale", "text": "the description of an older version" },
      "tested": true,
      "unit": "lib"
    },
    "freshness": "stale",
    "nodeId": "01K200000000000000000000A1",
    "path": "src/session.ts",
    "sourceDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

**`complete: true`, `stoppedBy: null`인데 `bound: "lower-bound"`다.** 순회는 그래프를 다 썼지만 읽기 자체가 짧았다. §1의 결함이 해소된 모습이 이것이다.

---

## 4. 선택자와 소비 경로

**03a의 기본 후보는 실측으로 기각됐다.** `request_context_pack`이 고른 `codeCards` 중 정확히 1개를 확장하는 방식을 이 저장소(998 artifacts, 과제 12개 한/영, 예산 500·2,000·8,000)에서 쟀다:

| `codeCards` 길이 | 횟수 |
| --- | ---: |
| 정확히 1 | **0** |
| 0 | 3 |
| 20 (상한) | 33 |
| 합계 | 36 |

어느 예산에서도 1이 아니었고 첫 카드 경로가 모든 과제에서 같았다. **대상을 지목하지 못하는 선택자는 브리프를 실을 수 없다.** 그래서 03a가 명시해둔 대안으로 갔다:

- **소비 경로:** `get_artifact({ include_change_brief: true })` — 호출자가 이미 id나 path로 대상 하나를 지목한 자리.
- **`ids` 다중 읽기에는 붙이지 않는다.**
- 일반 조회마다 비싼 impact를 자동으로 붙이지 않는다 — opt-in이다.

**카탈로그 비용 이력:** 03a 예측 3,131 → 3,141(+10), 03b 구현 후 실측 3,141 / 21툴, ratchet 3,150 불변. `hosted.test.ts`의 ratchet 주석에 상승이 기록돼 있다.

선택자 측정은 **저장소 1개·커밋 1개** 기준이다. 이 저장소에 대해 결정적이지만 모든 워크스페이스에 대한 주장이 아니다.

---

## 5. 호환성 정책

- **기존 응답에 키를 더하는 것만 한다.** `include_change_brief` 없는 `get_artifact`는 이전과 완전히 동일하고, `changeBrief` 키는 null이 아니라 **부재**한다.
- `briefTokens`와 `targetCardTokens`는 **보고 값**이지 새 상한이 아니다. `token_budget`·`max_chars`의 의미를 바꾸지 않는다.
- outputSchema가 없으므로 응답 키 추가의 카탈로그 비용은 0이다. 입력 추가(`include_change_brief`)만 비용이 있었다(+10).
- **원문 코드를 싣지 않는다.** 브리프가 나르는 것은 카드·id·경로 같은 위치다. `exports`는 이름뿐이다.
- `prepareChange(workspace, selector, found?, resolved?)` — `resolved`는 네 번째 optional 인자다. 호출당 store 조회 1회, 대상당 `impactOf` 1회.
- 옛 `ChangeBrief` 필드(`target.card`·`target.nodeId`·`target.path`·`consumers.complete`·`candidates[].nodeId`·`relatedTests`·`missing`·`omissions`)는 모두 같은 이름으로 남는다.

---

## 6. 03b 완료 조건 — 상태

| 조건 | 상태 |
| --- | --- |
| 기존 `prepareChange`를 실제 한 소비 경로에서 호출 | 완료 — `get_artifact` opt-in |
| `bound`·`boundReasons`·`confidence` 전파 | 완료 |
| 중복 조회 없음, 대상당 `impactOf` 1회 | 완료 — `findArtifacts` spy로 핀 |
| 정상·모호·stale·다른 tenant·불완전 graph·작은 예산 | 완료 — `tests/change-brief.test.ts` |
| 기존 응답 호환성, raw source 비저장 | 완료 |
| 21툴 / 3,150 ratchet 유지 | 완료 — 3,141 |
| `briefTokens` 계산 범위 (R-01) | 완료 |
| compact `via` (R-02) | 완료 |
| **운영 확인** | **미완** — 공통 MCP 읽기 timeout(RE-04 B-01) 해소 후 |

---

## 7. 미결정

1. **`basis`는 대상의 저장소 것만 싣는다.** 소비자가 다른 저장소에 있을 때 그쪽 basis도 필요한가? **미결정.**
2. **`affectedRoutes`는 미포함이다.** 바뀌는 화면을 아는 것은 가치가 크지만 응답이 커진다. 예산을 재고 결정한다 — **미결정, 구현 완료가 아니다.**
3. ~~`sourceDigest`가 빈 문자열일 때 정규화~~ → **해결:** `null`로 정규화한다.
4. ~~pack `codeCards`가 얼마나 자주 정확히 1개인가~~ → **해결:** 0/36으로 측정, §4.
5. **별도 관찰(리뷰):** id/path로 직접 찾은 대상이 workspace 읽기 상한 바깥에 있으면 `impactOf`의 graph view에 없을 수 있다 — 대상은 있는데 `consumers: null`, `omissions: []`가 된다. `null`은 "미계산"이라 안전하지만, 왜 계산하지 못했는지 coverage 원인을 `missing`에 명시하는 보강이 권고됐다. **후속, 이번 범위 아님.**

---

## 8. 이력 — 03a 당시의 서술 (2026-09-22)

아래는 03a 문서가 작성 시점에 말한 것이며, **현재 상태가 아니다.** 판단 근거를 남기기 위해 보존한다.

- "구현하지 않았다. `prepare-change.ts`를 포함해 제품 소스는 한 줄도 바꾸지 않았다." — 03a는 계약 문서뿐이었다. 구현은 03b(#28)다.
- "pack의 `codeCards`가 … **측정하지 않았다**." — 03b의 첫 실측에서 0/36으로 측정됐다(§4).
- `budget.responseTokens`("응답 전체 추정, 03b가 직렬화 시점에 채운다") — 채택되지 않았다. 브리프 안의 필드가 자신을 담을 응답 전체를 말하면 자기 자신에 대한 숫자가 된다. 대신 `briefTokens`를 쓰고, 그 계산 범위는 R-01에서 바로잡았다(§2.4).
- "`basis`는 nullable" — 구현은 `null` 대신 tagged union이다(§2.1).
- 03a의 예제는 probe가 손으로 조립한 **제안 모양**이었다. 지금의 §3은 실제 구현 출력이다.

## 9. 이 문서가 주장하지 않는 것

- 예제는 **합성 fixture**다. 프로덕션 워크스페이스에서 확인하지 않았다.
- 프로덕션에서 이 경로의 운영 확인은 **아직이다** — 공통 MCP 읽기 timeout이 먼저 풀려야 한다(RE-04 B-01).
- `impactOf`의 성능·지연은 재지 않았다(RE-04).
