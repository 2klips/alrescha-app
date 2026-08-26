import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createMockAgentModel } from "../scripts/graph-surface-benchmark/loop";
import {
  GRAPH_SURFACE_ARMS,
  loadGraphSurfaceBenchmark,
} from "../scripts/graph-surface-benchmark/manifest";
import {
  aggregateArm,
  judgeHypothesis,
  type GraphSurfaceTrial,
} from "../scripts/graph-surface-benchmark/report";
import {
  createToolExecutor,
  toolDefinitionsForArm,
  toolDefinitionsForNames,
} from "../scripts/graph-surface-benchmark/tools";
import {
  benchmarkWorkspace,
  deriveCorpusEdges,
  memoryEntriesFromFixtures,
} from "../scripts/graph-surface-benchmark/workspace";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const preregistrationPath = join(
  repoRoot,
  "benchmarks/graph-surface/preregistration.v1.json",
);
const v3ManifestPath = join(repoRoot, "benchmarks/databrain/tasks.v3.json");

describe("graph-surface benchmark pre-registration (todo 15)", () => {
  it("loads the frozen pre-registration and resolves the 96-trial grid from the frozen v3 manifest", async () => {
    const loaded = await loadGraphSurfaceBenchmark({
      preregistrationPath,
      v3ManifestPath,
    });
    expect(loaded.tasks).toHaveLength(12);
    expect(loaded.preregistration.protocol.trialCount).toBe(96);
    expect(
      loaded.preregistration.models.map(({ provider }) => provider).sort(),
    ).toEqual(["anthropic", "openai"]);
    // The digest lock: the loader hash equals the committed file's SHA-256.
    const fileSha = createHash("sha256")
      .update(readFileSync(preregistrationPath, "utf8"), "utf8")
      .digest("hex");
    expect(loaded.preregistrationSha256).toBe(fileSha);
  });

  it("refuses to run when the pinned v3 manifest digest disagrees", async () => {
    const raw = JSON.parse(readFileSync(preregistrationPath, "utf8")) as {
      questionSource: { manifestDigest: string };
    };
    raw.questionSource.manifestDigest = "0".repeat(64);
    const directory = mkdtempSync(join(tmpdir(), "graph-surface-"));
    const tampered = join(directory, "preregistration.json");
    writeFileSync(tampered, JSON.stringify(raw), "utf8");
    await expect(
      loadGraphSurfaceBenchmark({
        preregistrationPath: tampered,
        v3ManifestPath,
      }),
    ).rejects.toThrow(/does not match the pre-registered/);
  });

  it("the published dry-run report pins the same pre-registration digest", () => {
    const report = JSON.parse(
      readFileSync(
        join(repoRoot, "benchmarks/graph-surface/results.dry-run.json"),
        "utf8",
      ),
    ) as { mode: string; preregistrationSha256: string };
    const fileSha = createHash("sha256")
      .update(readFileSync(preregistrationPath, "utf8"), "utf8")
      .digest("hex");
    expect(report.preregistrationSha256).toBe(fileSha);
    expect(report.mode).toBe("dry-run");
  });
});

describe("graph-surface benchmark workspace", () => {
  const corpus = {
    entries: [
      {
        content:
          "# Spec\n\nSee [ADR](docs/adr/one.md) and [gone](docs/missing.md).",
        path: "spec.md",
      },
      { content: "# ADR one\n\nBody.", path: "docs/adr/one.md" },
      {
        content:
          'import { helper } from "./util";\nimport missing from "./gone";\n',
        path: "src/main.ts",
      },
      { content: "export const helper = 1;\n", path: "src/util.ts" },
    ],
    root: "/fixture",
  };

  it("derives references and imports edges only for resolvable targets", () => {
    const edges = deriveCorpusEdges(corpus);
    expect(
      edges.map(({ relation, sourceNodeId, targetNodeId }) => ({
        relation,
        sourceNodeId,
        targetNodeId,
      })),
    ).toEqual([
      {
        relation: "references",
        sourceNodeId: "artifact-00000",
        targetNodeId: "artifact-00001",
      },
      {
        relation: "imports",
        sourceNodeId: "artifact-00002",
        targetNodeId: "artifact-00003",
      },
    ]);
  });

  it("injects only the pre-registered memory fixtures for the workspace's corpus", () => {
    const fixtures = [
      {
        corpus: ".",
        entryKey: "a",
        name: "conventions" as const,
        sourcePaths: ["AGENTS.md"],
        text: "fact",
      },
      {
        corpus: "fixtures/drifted-demo",
        entryKey: "b",
        name: "gotchas" as const,
        sourcePaths: ["spec.md"],
        text: "other",
      },
    ];
    expect(memoryEntriesFromFixtures(fixtures, ".")).toHaveLength(1);
    const workspace = benchmarkWorkspace({
      corpus,
      corpusKey: "fixtures/drifted-demo",
      memoryFixtures: fixtures,
    });
    expect(workspace.memoryEntries?.map(({ entryKey }) => entryKey)).toEqual([
      "b",
    ]);
    expect(workspace.repositories[0]?.edges).toHaveLength(2);
  });

  it("gates tools by arm and applies the pre-registered output caps", () => {
    const caps = {
      fileContentChars: 20,
      grepExcerptChars: 10,
      grepFilesMaxHits: 1,
      listFilesMaxPaths: 2,
      repoMapDefaultBudget: 200,
      searchNodesMaxResults: 2,
    };
    const workspace = benchmarkWorkspace({
      corpus,
      corpusKey: ".",
      memoryFixtures: [],
    });
    const baseline = createToolExecutor({
      arm: "file-exploration",
      caps,
      corpus,
      workspace,
    });
    expect(baseline.execute("repo_map", {})).toContain("not available");
    expect(baseline.execute("list_files", {})).toContain("more paths");
    expect(baseline.execute("read_file", { path: "spec.md" })).toContain(
      "chars clipped",
    );
    expect(
      baseline.execute("grep_files", { query: "import" }).split("\n"),
    ).toHaveLength(1);

    const graph = createToolExecutor({
      arm: "graph-surface",
      caps,
      corpus,
      workspace,
    });
    expect(graph.execute("read_file", { path: "spec.md" })).toContain(
      "not available",
    );
    expect(graph.execute("search_nodes", { query: "helper util" })).toContain(
      "artifact-",
    );
    expect(
      graph.execute("get_neighbors", { node_id: "artifact-00000" }),
    ).toContain("-references->");
    expect(graph.execute("memory_read", {})).toBe("No memory entries.");
  });
});

describe("graph-surface benchmark aggregation", () => {
  const trial = (overrides: Partial<GraphSurfaceTrial>): GraphSurfaceTrial => ({
    answer: "x",
    arm: "file-exploration",
    errorMessage: null,
    inputTokens: 100,
    model: "m",
    outputTokens: 10,
    quality: "PASS",
    repeat: 1,
    score: 1,
    status: "succeeded",
    taskId: "t",
    toolCalls: 3,
    turns: 4,
    ...overrides,
  });

  it("aggregates per arm and judges the pre-registered hypothesis", () => {
    const trials = [
      trial({ turns: 6 }),
      trial({ turns: 8, quality: "PARTIAL", score: 0.5 }),
      trial({ arm: "graph-surface", turns: 3 }),
      trial({ arm: "graph-surface", turns: 4 }),
    ];
    const baseline = aggregateArm(trials, "file-exploration", "pooled");
    expect(baseline.meanTurns).toBe(7);
    expect(baseline.passRate).toBe(0.5);
    const judgment = judgeHypothesis(trials);
    expect(judgment.turnsDelta).toBe(-3.5);
    expect(judgment.primaryMet).toBe(true);
    expect(judgment.qualityNonInferior).toBe(true);
    expect(judgment.verdict).toBe("MET");
  });

  it("fails the verdict when quality drops more than the 5pp margin even with fewer turns", () => {
    const trials = [
      trial({ turns: 8 }),
      trial({ turns: 8 }),
      trial({ arm: "graph-surface", turns: 2, quality: "FAIL", score: 0 }),
      trial({ arm: "graph-surface", turns: 2 }),
    ];
    const judgment = judgeHypothesis(trials);
    expect(judgment.primaryMet).toBe(true);
    expect(judgment.qualityNonInferior).toBe(false);
    expect(judgment.verdict).toBe("NOT MET");
  });

  it("the mock loop drives every arm's first tool and returns the scripted answer", async () => {
    const workspace = benchmarkWorkspace({
      corpus: { entries: [{ content: "x", path: "a.md" }], root: "/x" },
      corpusKey: ".",
      memoryFixtures: [],
    });
    const executor = createToolExecutor({
      arm: "graph-surface",
      caps: {
        fileContentChars: 100,
        grepExcerptChars: 100,
        grepFilesMaxHits: 5,
        listFilesMaxPaths: 5,
        repoMapDefaultBudget: 200,
        searchNodesMaxResults: 5,
      },
      corpus: { entries: [{ content: "x", path: "a.md" }], root: "/x" },
      workspace,
    });
    const outcome = await createMockAgentModel().runTrial({
      executor,
      model: "mock",
      prompt: "q",
      scriptedAnswer: "the answer",
      system: "s",
      tools: toolDefinitionsForArm("graph-surface"),
      turnCap: 10,
    });
    expect(outcome.answer).toBe("the answer");
    expect(outcome.turns).toBe(2);
  });

  it("keeps the two arms' tool surfaces disjoint apart from submit_answer", () => {
    const [baseline, graph] = GRAPH_SURFACE_ARMS.map((arm) =>
      toolDefinitionsForArm(arm).map(({ name }) => name),
    );
    const shared = (baseline ?? []).filter((name) =>
      (graph ?? []).includes(name),
    );
    expect(shared).toEqual(["submit_answer"]);
  });
});

describe("graph-surface v2 surface (preregistration.v2.json)", () => {
  const v2Path = join(
    repoRoot,
    "benchmarks/graph-surface/preregistration.v2.json",
  );

  it("locks the v2 pre-registration: same grid and questions, search_index added, digest pinned", async () => {
    const loaded = await loadGraphSurfaceBenchmark({
      preregistrationPath: v2Path,
      v3ManifestPath,
    });
    expect(loaded.preregistration.resultsBasename).toBe("results.v2");
    expect(loaded.preregistration.protocol.trialCount).toBe(96);
    expect(loaded.preregistration.armTools["graph-surface"]).toContain(
      "search_index",
    );
    // The question set is byte-identical to v1's.
    const v1 = await loadGraphSurfaceBenchmark({
      preregistrationPath,
      v3ManifestPath,
    });
    expect(loaded.preregistration.questionSource.taskIds).toEqual(
      v1.preregistration.questionSource.taskIds,
    );
    const fileSha = createHash("sha256")
      .update(readFileSync(v2Path, "utf8"), "utf8")
      .digest("hex");
    expect(loaded.preregistrationSha256).toBe(fileSha);
  });

  it("resolves pre-registered tool names and rejects unknown ones", () => {
    const names = ["search_index", "get_node_content", "submit_answer"];
    expect(toolDefinitionsForNames(names).map(({ name }) => name)).toEqual(
      names,
    );
    expect(() => toolDefinitionsForNames(["not_a_tool"])).toThrow(
      /Unknown pre-registered tool/,
    );
  });

  it("search_index returns excerpts and get_node_content batches up to four ids", () => {
    const corpus = {
      entries: [
        {
          content: "# Auth\n\nSession timeout is thirty minutes.",
          path: "auth.md",
        },
        { content: "# Billing\n\nCharges settle nightly.", path: "billing.md" },
      ],
      root: "/x",
    };
    const workspace = benchmarkWorkspace({
      corpus,
      corpusKey: ".",
      memoryFixtures: [],
    });
    const caps = {
      fileContentChars: 200,
      grepExcerptChars: 80,
      grepFilesMaxHits: 5,
      listFilesMaxPaths: 5,
      repoMapDefaultBudget: 200,
      searchNodesMaxResults: 5,
    };
    const executor = createToolExecutor({
      arm: "graph-surface",
      caps,
      corpus,
      toolNames: [
        "search_index",
        "get_node_content",
        "search_nodes",
        "submit_answer",
      ],
      workspace,
    });
    const indexed = executor.execute("search_index", {
      query: "session timeout",
    });
    expect(indexed).toContain("artifact-00000");
    expect(indexed).toContain("thirty minutes");
    // Batch: two ids in one call, unknown id reported inline; capped at 4.
    const batch = executor.execute("get_node_content", {
      node_id: "artifact-00000 artifact-00001 nope",
    });
    expect(batch).toContain("# auth.md");
    expect(batch).toContain("# billing.md");
    expect(batch).toContain("Unknown node: nope");
    // The v2 tool-name gate still blocks tools outside the pre-registered list.
    expect(executor.execute("memory_read", {})).toContain("not available");
  });
});
