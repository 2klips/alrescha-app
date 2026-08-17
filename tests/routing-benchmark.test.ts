import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { buildArmContext } from "../scripts/databrain-benchmark/context";
import {
  benchmarkManifestDigest,
  loadBenchmarkManifest,
} from "../scripts/databrain-benchmark/manifest";
import { hypothesisArmsFor } from "../scripts/databrain-benchmark/benchmark";
import { ROUTING_ARMS } from "../scripts/databrain-benchmark/types";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Phase 2B todo 5 — the grep-only / graph-only / routed arms enter the
 * harness as schema 3, WITHOUT touching the frozen pre-registrations. The
 * digest regression below is the lock: if any harness refactor changes how
 * the frozen v3 manifest parses, this fails before an audit ever would.
 */

const FROZEN_V3_DIGEST =
  "7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7";

function routingManifest(): Record<string, unknown> {
  return {
    arms: ["grep-only", "graph-only", "routed"],
    models: [
      { id: "claude-sonnet-5", provider: "anthropic" },
      { id: "gpt-5.6-luna", provider: "openai" },
    ],
    schemaVersion: 3,
    tasks: Array.from({ length: 12 }, (_, index) => ({
      grader: { kind: "answer-manifest", requiredFacts: [["session"]] },
      id: `routing-task-${index.toString().padStart(2, "0")}`,
      prompt:
        index % 2 === 0
          ? "spec/auth.md와 연결된 코드 영역을 추적해줘"
          : "이 프로젝트의 인증 방식이 뭐야?",
      repository: "fixtures/drifted-demo",
      retrievalQuery: "auth session spec",
      type: "question-answering",
    })),
    trialsPerArm: 5,
  };
}

const temporaryDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirs.map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("routing benchmark arms (schema 3)", () => {
  it("keeps the frozen v3 pre-registration byte-stable through the refactor", async () => {
    const frozen = await loadBenchmarkManifest(
      resolve(repoRoot, "benchmarks/databrain/tasks.v3.json"),
    );
    expect(frozen.schemaVersion).toBe(2);
    expect(benchmarkManifestDigest(frozen)).toBe(FROZEN_V3_DIGEST);
  });

  it("loads a schema-3 manifest with the routing arms", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arr-routing-manifest-"));
    temporaryDirs.push(dir);
    const path = join(dir, "tasks.routing.json");
    await writeFile(path, JSON.stringify(routingManifest()), "utf8");

    const manifest = await loadBenchmarkManifest(path);
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.arms).toEqual([...ROUTING_ARMS]);
    expect(manifest.trialsPerArm).toBe(5);
  });

  it("rejects a schema-3 manifest whose arms differ from the routing tuple", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arr-routing-badarms-"));
    temporaryDirs.push(dir);
    const path = join(dir, "tasks.bad.json");
    await writeFile(
      path,
      JSON.stringify({
        ...routingManifest(),
        arms: ["checkout", "full-dump", "data-brain"],
      }),
      "utf8",
    );
    await expect(loadBenchmarkManifest(path)).rejects.toThrow(
      /grep-only, graph-only, routed/,
    );
  });

  it("pairs grep-only against routed for the schema-3 hypothesis, leaving v2 untouched", () => {
    expect(hypothesisArmsFor([...ROUTING_ARMS])).toEqual({
      baseline: "grep-only",
      treatment: "routed",
    });
    expect(hypothesisArmsFor(["checkout", "full-dump", "data-brain"])).toEqual({
      baseline: "checkout",
      treatment: "data-brain",
    });
  });

  it("builds distinct contexts for the three routing arms", async () => {
    const corpus = {
      entries: [
        {
          content:
            "# Auth spec\n\nREQ-AUTH-003: session renewal every 15 minutes.",
          path: "spec/auth.md",
        },
        {
          content: "export function renewSession() { return 15; }",
          path: "src/session.ts",
        },
        {
          content: "# 작업 규칙\n\nsession 관련 변경은 스펙을 먼저 읽는다.",
          path: "AGENTS.md",
        },
      ],
      root: "fixtures/drifted-demo",
    };

    const grep = await buildArmContext({
      arm: "grep-only",
      corpus,
      retrievalQuery: "session",
      taskDescription: "이 프로젝트의 인증 방식이 뭐야?",
    });
    expect(grep.toolNames[0]).toBe("grep.search");
    expect(grep.toolNames).not.toContain("search_nodes");
    expect(grep.text).toContain("spec/auth.md");

    const graph = await buildArmContext({
      arm: "graph-only",
      corpus,
      retrievalQuery: "session",
      taskDescription: "spec/auth.md와 연결된 코드 영역을 추적해줘",
    });
    expect(graph.toolNames[0]).toBe("search_nodes");
    expect(graph.toolNames).toContain("get_node_content");
    expect(graph.toolNames).not.toContain("grep.search");

    // The router sends the relational task to the graph builder…
    const routedGraph = await buildArmContext({
      arm: "routed",
      corpus,
      retrievalQuery: "session",
      taskDescription: "spec/auth.md와 연결된 코드 영역을 추적해줘",
    });
    expect(routedGraph.toolNames[0]).toBe("route_query");
    expect(routedGraph.toolNames).toContain("search_nodes");
    expect(routedGraph.text).toContain("route_query → graph");

    // …and the simple lookup to grep.
    const routedGrep = await buildArmContext({
      arm: "routed",
      corpus,
      retrievalQuery: "session",
      taskDescription: "이 프로젝트의 인증 방식이 뭐야?",
    });
    expect(routedGrep.toolNames[0]).toBe("route_query");
    expect(routedGrep.toolNames).toContain("grep.search");
    expect(routedGrep.text).toContain("route_query → search");
  });

  it("falls back to grep when the graph route finds nothing (misroute escape)", async () => {
    const corpus = {
      entries: [{ content: "회계 절차 문서.", path: "docs/finance.md" }],
      root: "fixtures/drifted-demo",
    };
    const routed = await buildArmContext({
      arm: "routed",
      corpus,
      // Relational phrasing routes to graph, but nothing matches the query —
      // the decision's fallback kicks in.
      retrievalQuery: "zzz-unmatched-zzz",
      taskDescription: "zzz와 연결된 노드 경로를 추적해줘",
    });
    expect(routed.toolNames[0]).toBe("route_query");
    expect(routed.toolNames).toContain("grep.search");
    expect(routed.text).toContain("폴백");
  });
});
