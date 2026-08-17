/**
 * Deterministic query routing (Phase 2B todo 5, RESEARCH_GRAPH_DATABRAIN).
 *
 * The research conclusion this encodes: simple lookups are cheaper and more
 * accurate through text search; only multi-hop / relational questions earn
 * the graph tools. The router is a pure function of the question text — no
 * model call, no stored state — and every decision carries its evidence
 * (matched signals) plus a fallback for when the chosen route comes up empty.
 */

export type QueryRoute = "graph" | "search";

export interface QueryRoutingDecision {
  readonly fallback: {
    readonly reason: string;
    readonly route: QueryRoute;
    readonly tools: readonly string[];
  };
  readonly matchedSignals: readonly string[];
  readonly reason: string;
  readonly recommendedTools: readonly string[];
  readonly route: QueryRoute;
}

const SEARCH_TOOLS = ["search_index", "get_artifact"] as const;
const GRAPH_TOOLS = [
  "search_nodes",
  "get_neighbors",
  "trace_path",
  "impact_of",
  "query_brain",
] as const;

/** Multi-hop / relational signals, Korean and English. Order is fixed. */
const GRAPH_SIGNALS: readonly { readonly name: string; readonly pattern: RegExp }[] =
  [
    { name: "path-trace", pattern: /경로|추적|trace|\bpath\b/iu },
    {
      name: "connection",
      pattern: /연결|이어[지진]|연쇄|\bconnected\b|\blinked\b/iu,
    },
    {
      name: "impact",
      pattern: /영향|바뀌면|바꾸면|고치면|\bimpact\b|\baffect(?:s|ed)?\b/iu,
    },
    { name: "dependency", pattern: /의존|\bdepends?\b|\bdependenc/iu },
    { name: "neighborhood", pattern: /이웃|인접|주변 노드|\bneighbors?\b/iu },
    { name: "relation", pattern: /관계|\brelations?(?:ship)?\b/iu },
    {
      name: "span-endpoints",
      pattern: /(?:에서|부터).{1,40}까지|\bfrom\b.{1,60}\bto\b/iu,
    },
    {
      name: "relational-absence",
      pattern: /(?:없는|않은|안 된)\s*(?:요구사항|문서|테스트|증거)|\bwithout\s+(?:tests?|evidence)\b/iu,
    },
  ];

export function routeQuery(question: string): QueryRoutingDecision {
  const matchedSignals = GRAPH_SIGNALS.filter(({ pattern }) =>
    pattern.test(question),
  ).map(({ name }) => name);

  if (matchedSignals.length > 0) {
    return {
      fallback: {
        reason:
          "그래프 결과가 0건이면 텍스트 검색으로 폴백 — 색인이 더 넓게 잡는다.",
        route: "search",
        tools: [...SEARCH_TOOLS],
      },
      matchedSignals,
      reason: `멀티홉·관계 신호 감지(${matchedSignals.join(", ")}) — 그래프 순회가 정확하다.`,
      recommendedTools: [...GRAPH_TOOLS],
      route: "graph",
    };
  }

  return {
    fallback: {
      reason:
        "검색 결과가 0건이면 그래프 탐색으로 폴백 — 이름이 아닌 관계로 찾아야 할 수 있다.",
      route: "graph",
      tools: [...GRAPH_TOOLS],
    },
    matchedSignals: [],
    reason: "단일 대상 조회 — 텍스트 검색이 더 싸고 정확하다.",
    recommendedTools: [...SEARCH_TOOLS],
    route: "search",
  };
}
