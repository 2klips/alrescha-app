import { describe, expect, it } from "vitest";

import { routeQuery, type QueryRoute } from "../packages/core/src/index";

/**
 * Phase 2B todo 5 — tagged routing fixture. Simple lookups must go to text
 * search; multi-hop / relational questions must go to the graph tools. The
 * router is deterministic, so the accuracy requirement on this fixture is
 * exact: every query routes to its tag.
 */
const TAGGED_QUERIES: readonly { query: string; route: QueryRoute }[] = [
  // Simple lookups → search
  { query: "이 프로젝트의 인증 방식이 뭐야?", route: "search" },
  { query: "README 파일 어디 있어?", route: "search" },
  { query: "크레딧 단가표 보여줘", route: "search" },
  { query: "receipt predicateType 값이 뭐지?", route: "search" },
  { query: "AGENTS.md 규칙 요약해줘", route: "search" },
  { query: "R-07 요구사항 본문 읽어줘", route: "search" },
  { query: "테스트 실행 명령이 뭐야?", route: "search" },
  { query: "what does the billing policy document say", route: "search" },
  // Multi-hop / relational → graph
  { query: "spec/auth.md와 연결된 코드 영역은?", route: "graph" },
  { query: "이 요구사항이 바뀌면 영향을 받는 테스트는?", route: "graph" },
  { query: "R-07에서 구현 코드까지 경로를 추적해줘", route: "graph" },
  { query: "테스트 증거 없는 요구사항 전부 보여줘", route: "graph" },
  { query: "which artifacts depend on src/session.ts?", route: "graph" },
  { query: "trace the path from the spec to the failing test", route: "graph" },
  { query: "이 함수를 고치면 어떤 문서가 영향 받아?", route: "graph" },
  { query: "요구사항과 구현 사이의 관계를 보여줘", route: "graph" },
];

describe("routeQuery", () => {
  it("routes every tagged fixture query correctly (16/16)", () => {
    const misrouted = TAGGED_QUERIES.filter(
      ({ query, route }) => routeQuery(query).route !== route,
    );
    expect(misrouted).toEqual([]);
  });

  it("explains graph decisions with the matched signals", () => {
    const decision = routeQuery("이 요구사항이 바뀌면 영향을 받는 테스트는?");
    expect(decision.route).toBe("graph");
    expect(decision.matchedSignals.length).toBeGreaterThan(0);
    expect(decision.reason).toContain(decision.matchedSignals[0]!);
  });

  it("always carries a fallback pointing at the opposite route", () => {
    for (const { query } of TAGGED_QUERIES) {
      const decision = routeQuery(query);
      expect(decision.fallback.route).not.toBe(decision.route);
      expect(decision.fallback.tools.length).toBeGreaterThan(0);
      expect(decision.fallback.reason).toContain("폴백");
    }
  });

  it("recommends concrete tools per route", () => {
    expect(routeQuery("README 어디 있어?").recommendedTools).toEqual([
      "search_index",
      "get_artifact",
    ]);
    expect(
      routeQuery("spec에서 테스트까지 경로 추적").recommendedTools,
    ).toContain("trace_path");
  });

  it("is a pure function — identical input, identical decision", () => {
    const question = "이 문서와 연결된 요구사항은?";
    expect(routeQuery(question)).toEqual(routeQuery(question));
  });
});
