import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderAgentInstructionBlock } from "../packages/core/src/context/agent-instructions";
import { loadRepositoryCorpus } from "../scripts/databrain-benchmark/context";
import { auditGraphSurfaceReleases } from "../scripts/graph-surface-benchmark/audit";
import {
  progressAdoption,
  todoDuplication,
  tokensPerCall,
} from "../scripts/graph-surface-benchmark/auxiliary";
import {
  createAnthropicAgentModel,
  createMockAgentModel,
  createOpenAiAgentModel,
} from "../scripts/graph-surface-benchmark/loop";
import {
  loadGraphSurfaceBenchmark,
  preregistrationSha256,
} from "../scripts/graph-surface-benchmark/manifest";
import {
  assertBodilessWorkspace,
  assertCatalogPinned,
  buildProductionWorkspace,
  createProductExecutor,
  openProductSurface,
  productCatalogSha256,
  type ProductSurface,
} from "../scripts/graph-surface-benchmark/product-surface";
import {
  judgeHypothesis,
  renderGraphSurfaceMarkdown,
  type GraphSurfaceTrial,
} from "../scripts/graph-surface-benchmark/report";
import {
  buildRiskPrecisionReport,
  fixTouchesByPath,
  labelRiskEntries,
  parseGitLogNameOnly,
  precisionAt,
} from "../scripts/graph-surface-benchmark/risk-precision";
import {
  createToolExecutor,
  toolDefinitionsForNames,
} from "../scripts/graph-surface-benchmark/tools";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const benchmarkDirectory = join(repoRoot, "benchmarks/graph-surface");
const v3Path = join(benchmarkDirectory, "preregistration.v3.json");
const relationalPath = join(
  benchmarkDirectory,
  "preregistration.v3-relational.json",
);
const v2Path = join(benchmarkDirectory, "preregistration.v2.json");
const v3ManifestPath = join(repoRoot, "benchmarks/databrain/tasks.v3.json");
const fixtureRoot = join(repoRoot, "fixtures/drifted-demo");

const caps = {
  fileContentChars: 6000,
  grepExcerptChars: 120,
  grepFilesMaxHits: 30,
  listFilesMaxPaths: 200,
  repoMapDefaultBudget: 1200,
  searchNodesMaxResults: 10,
};

function fileSha(path: string): string {
  return createHash("sha256")
    .update(readFileSync(path, "utf8"), "utf8")
    .digest("hex");
}

describe("graph-surface v3 pre-registration (todo 25)", () => {
  it("locks the production-shape contract: catalogue digest, arms as sets, v1 grid and questions", async () => {
    const loaded = await loadGraphSurfaceBenchmark({
      preregistrationPath: v3Path,
      v3ManifestPath,
    });
    const { preregistration } = loaded;
    expect(preregistration.schemaVersion).toBe("graph-surface-v3");
    expect(preregistration.resultsBasename).toBe("results.v3");
    expect(preregistration.protocol.trialCount).toBe(96);
    expect(loaded.preregistrationSha256).toBe(fileSha(v3Path));
    const v3 = preregistration.v3!;
    expect(v3.store).toBe("production-shape");
    expect(v3.primaryHypothesis).toBe("turns-non-increasing");
    expect(v3.instructionBlock).toBe(true);
    expect(v3.productCatalogSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(v3.fileTools).toEqual(["list_files", "grep_files", "read_file"]);
    expect(v3.productTools).toContain("search_index");
    expect(v3.productTools).toContain("get_artifact");
    expect(v3.productTools).not.toContain("search_nodes");
    expect(v3.productTools).not.toContain("get_node_content");
    // The graph arm is exactly the checkout tools plus the product plus submit.
    expect([...preregistration.armTools["graph-surface"]].sort()).toEqual(
      [...v3.fileTools, ...v3.productTools, "submit_answer"].sort(),
    );
    expect([...preregistration.armTools["file-exploration"]].sort()).toEqual(
      [...v3.fileTools, "submit_answer"].sort(),
    );
    // Same questions as v1/v2, byte for byte.
    const v2 = await loadGraphSurfaceBenchmark({
      preregistrationPath: v2Path,
      v3ManifestPath,
    });
    expect(preregistration.questionSource).toEqual(
      v2.preregistration.questionSource,
    );
    expect(loaded.tasks.map(({ id }) => id)).toEqual(
      v2.tasks.map(({ id }) => id),
    );
  });

  it("loads the relational set inline, locked by its own digest", async () => {
    const loaded = await loadGraphSurfaceBenchmark({
      preregistrationPath: relationalPath,
      v3ManifestPath,
    });
    expect(loaded.tasks).toHaveLength(4);
    expect(loaded.preregistration.questionSource.manifestDigest).toBeNull();
    expect(loaded.preregistration.protocol.trialCount).toBe(32);
    expect(loaded.preregistration.resultsBasename).toBe(
      "results.v3-relational",
    );
    expect(loaded.preregistrationSha256).toBe(fileSha(relationalPath));
    for (const task of loaded.tasks) {
      expect(task.grader.kind).toBe("answer-manifest");
      // No answer alias appears verbatim in its own prompt.
      if (task.grader.kind === "answer-manifest") {
        for (const aliases of task.grader.requiredFacts) {
          for (const alias of aliases) {
            expect(task.prompt.toLowerCase()).not.toContain(
              alias.toLowerCase(),
            );
          }
        }
      }
    }
  });

  it("refuses a graph arm that is not the product catalogue plus the checkout tools, and inline tasks on v1", async () => {
    const directory = mkdtempSync(join(tmpdir(), "graph-surface-v3-"));
    try {
      const raw = JSON.parse(readFileSync(v3Path, "utf8")) as {
        arms: { "graph-surface": { tools: string[] } };
        schemaVersion: string;
        questionSource: Record<string, unknown>;
      };
      raw.arms["graph-surface"].tools = raw.arms["graph-surface"].tools.filter(
        (tool) => tool !== "search_index",
      );
      const missing = join(directory, "missing.json");
      writeFileSync(missing, JSON.stringify(raw), "utf8");
      await expect(
        loadGraphSurfaceBenchmark({
          preregistrationPath: missing,
          v3ManifestPath,
        }),
      ).rejects.toThrow(/arms\.graph-surface\.tools/);

      const v1Inline = JSON.parse(readFileSync(v2Path, "utf8")) as {
        questionSource: Record<string, unknown>;
      };
      v1Inline.questionSource = {
        tasks: [
          {
            grader: { kind: "answer-manifest", requiredFacts: [["x"]] },
            id: "t",
            prompt: "p",
            repository: ".",
            retrievalQuery: "q",
          },
        ],
      };
      const inline = join(directory, "inline.json");
      writeFileSync(inline, JSON.stringify(v1Inline), "utf8");
      await expect(
        loadGraphSurfaceBenchmark({
          preregistrationPath: inline,
          v3ManifestPath,
        }),
      ).rejects.toThrow(/questionSource\.tasks/);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});

describe("graph-surface v3 production surface", () => {
  let workspace: Awaited<ReturnType<typeof buildProductionWorkspace>>;
  let surface: ProductSurface;
  let pinned: { productCatalogSha256: string; productTools: readonly string[] };

  beforeAll(async () => {
    const loaded = await loadGraphSurfaceBenchmark({
      preregistrationPath: v3Path,
      v3ManifestPath,
    });
    pinned = loaded.preregistration.v3!;
    workspace = await buildProductionWorkspace({
      excludedSegments: loaded.preregistration.v3!.excludedSegments,
      repositoryFullName: "local/drifted-demo",
      rootDir: fixtureRoot,
    });
    surface = await openProductSurface({
      scopes: ["mcp:read", "mcp:write"],
      toolResultChars: 6000,
      workspace: workspace.workspace,
    });
  });

  afterAll(async () => {
    await surface?.close();
  });

  it("scans the corpus into a store with no bodies and real structure", () => {
    expect(workspace.artifactCount).toBeGreaterThanOrEqual(10);
    expect(workspace.edgeCount).toBeGreaterThanOrEqual(1);
    expect(() => assertBodilessWorkspace(workspace.workspace)).not.toThrow();
    for (const artifact of workspace.workspace.repositories[0]!.artifacts) {
      expect(artifact.content).toBe("");
    }
    // The v1/v2 corpus workspace is what the guard refuses.
    expect(() =>
      assertBodilessWorkspace({
        ...workspace.workspace,
        repositories: [
          {
            ...workspace.workspace.repositories[0]!,
            artifacts: [
              {
                ...workspace.workspace.repositories[0]!.artifacts[0]!,
                content: "a body",
              },
            ],
          },
        ],
      }),
    ).toThrow(/carries a body/);
  });

  it("takes its tool definitions from the product's tools/list; the v3 pin now refuses, because the catalogue moved", () => {
    // Same tools, same order — nothing was added or renamed.
    expect(surface.catalog.tools.map(({ name }) => name)).toEqual([
      ...pinned.productTools,
    ]);
    // But not the same definitions: todo 19 ⑴ put `concept` and the six
    // synthesis relations into the enums the input schemas carry, so the
    // digest the v3 run pinned (`a3d56907…`) names a catalogue that no
    // longer ships. The published v3 report still audits against its own
    // pin; a new run needs a new pre-registration, and the lock says so
    // instead of measuring the new surface under the old name.
    expect(surface.catalog.sha256).not.toBe(pinned.productCatalogSha256);
    expect(() => assertCatalogPinned(surface.catalog, pinned)).toThrow(
      /does not match the pre-registered/,
    );
    expect(() =>
      assertCatalogPinned(surface.catalog, {
        productCatalogSha256: surface.catalog.sha256,
        productTools: pinned.productTools,
      }),
    ).not.toThrow();
    // The digest is a set digest: order does not change it.
    expect(productCatalogSha256([...surface.catalog.entries].reverse())).toBe(
      surface.catalog.sha256,
    );
    const searchIndex = surface.catalog.tools.find(
      ({ name }) => name === "search_index",
    )!;
    expect(searchIndex.parameters.type).toBe("object");
    expect(searchIndex.parameters.properties).toHaveProperty("query");
    expect(searchIndex.description.length).toBeGreaterThan(0);
  });

  it("answers through the hosted endpoint in production shape: ids and paths, no excerpt, no body", async () => {
    const indexed = await surface.callTool("search_index", {
      query: "session timeout",
    });
    expect(indexed).toContain("docs/adr/ADR-001-session-timeout.md");
    expect(indexed).toContain('"excerpt":""');
    expect(indexed).toContain("excerptAbsence");
    const artifact = await surface.callTool("get_artifact", {
      path: "src/session.ts",
    });
    expect(artifact).toContain('"content":""');
    expect(artifact).toContain("src/session.ts");
    const neighbors = await surface.callTool("get_neighbors", {
      node_id: "artifact:src/session.ts",
    });
    expect(neighbors).toContain("artifact:docs/adr/ADR-001-session-timeout.md");
  });

  it("clips a result at the pre-registered cap and turns a refused call into text", async () => {
    const clipped = await openProductSurface({
      scopes: ["mcp:read"],
      toolResultChars: 40,
      workspace: workspace.workspace,
    });
    try {
      const short = await clipped.callTool("search_index", {
        query: "session",
      });
      expect(short).toContain("chars clipped");
      expect(short.length).toBeLessThan(120);
      // Read scope only: a write tool answers with a refusal, not a crash.
      const refused = await clipped.callTool("log_progress", {
        status: "done",
        summary: "s",
        task: "t",
      });
      expect(refused).toMatch(/error|scope/i);
    } finally {
      await clipped.close();
    }
  });

  it("observes the writes a trial left behind: matched verdicts, minted and duplicated todos", async () => {
    const first = await surface.callTool("log_progress", {
      status: "started",
      summary: "began",
      task: "Bench progress task",
    });
    expect(first).toContain("created");
    const second = await surface.callTool("log_progress", {
      status: "done",
      summary: "finished",
      task: "Bench progress task",
    });
    expect(second).not.toContain('"matched":"created"');
    const observed = surface.observations();
    expect(observed.progressMatched.created).toBe(1);
    expect(observed.todosCreated).toBe(1);
    expect(observed.todosDuplicated).toBe(0);
  });

  it("gives the graph arm the checkout tools too, and refuses anything unregistered", async () => {
    const corpus = await loadRepositoryCorpus(fixtureRoot);
    const fileExecutor = createToolExecutor({
      arm: "file-exploration",
      caps,
      corpus,
      toolNames: ["list_files", "grep_files", "read_file", "submit_answer"],
      workspace: workspace.workspace,
    });
    const executor = createProductExecutor({
      fileExecutor,
      fileTools: ["list_files", "grep_files", "read_file"],
      productTools: pinned.productTools,
      surface,
    });
    expect(
      await executor.execute("read_file", { path: "src/session.ts" }),
    ).toContain("SESSION_TIMEOUT");
    expect(await executor.execute("repo_map", {})).toContain("src/session.ts");
    expect(await executor.execute("search_nodes", { query: "x" })).toContain(
      "not available",
    );
  });

  it("keeps a fresh store per surface — one trial's todo is not another's", async () => {
    const other = await openProductSurface({
      scopes: ["mcp:read", "mcp:write"],
      toolResultChars: 6000,
      workspace: workspace.workspace,
    });
    try {
      expect(other.observations().todosCreated).toBe(0);
      const listed = await other.callTool("query_brain", { types: ["todo"] });
      expect(listed).not.toContain("Bench progress task");
    } finally {
      await other.close();
    }
  });
});

describe("graph-surface v3 loop usage accounting", () => {
  const tools = toolDefinitionsForNames(["list_files", "submit_answer"]);
  const executed: string[] = [];
  const executor = {
    execute(name: string) {
      executed.push(name);
      return `ran ${name}`;
    },
  };

  it("sums Anthropic cache creation and cache read per call and records tool names", async () => {
    const responses = [
      {
        content: [
          { id: "t1", input: {}, name: "list_files", type: "tool_use" },
        ],
        usage: {
          cache_creation_input_tokens: 30,
          cache_read_input_tokens: 70,
          input_tokens: 100,
          output_tokens: 10,
        },
      },
      {
        content: [
          {
            id: "t2",
            input: { answer: "done" },
            name: "submit_answer",
            type: "tool_use",
          },
        ],
        usage: {
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 100,
          input_tokens: 20,
          output_tokens: 5,
        },
      },
    ];
    let call = 0;
    const fetchImplementation = (async () =>
      Response.json(responses[call++])) as unknown as typeof fetch;
    const outcome = await createAnthropicAgentModel(
      "sk-ant-test",
      fetchImplementation,
    ).runTrial({
      executor,
      model: "m",
      prompt: "p",
      system: "s",
      tools,
      turnCap: 5,
    });
    expect(outcome.answer).toBe("done");
    expect(outcome.turns).toBe(2);
    expect(outcome.inputTokens).toBe(120);
    expect(outcome.outputTokens).toBe(15);
    expect(outcome.cacheCreationTokens).toBe(30);
    expect(outcome.cacheReadTokens).toBe(170);
    expect(outcome.calls).toHaveLength(2);
    expect(outcome.toolNames).toEqual(["list_files", "submit_answer"]);
    expect(executed).toEqual(["list_files"]);
  });

  it("reads OpenAI cached tokens as cache read with no creation half", async () => {
    const responses = [
      {
        id: "r1",
        output: [
          {
            arguments: "{}",
            call_id: "c1",
            name: "list_files",
            type: "function_call",
          },
        ],
        usage: {
          input_tokens: 200,
          input_tokens_details: { cached_tokens: 150 },
          output_tokens: 8,
        },
      },
      {
        id: "r2",
        output: [
          {
            arguments: JSON.stringify({ answer: "ok" }),
            call_id: "c2",
            name: "submit_answer",
            type: "function_call",
          },
        ],
        usage: { input_tokens: 50, output_tokens: 4 },
      },
    ];
    let call = 0;
    const fetchImplementation = (async () =>
      Response.json(responses[call++])) as unknown as typeof fetch;
    const outcome = await createOpenAiAgentModel(
      "sk-test",
      fetchImplementation,
    ).runTrial({
      executor,
      model: "m",
      prompt: "p",
      system: "s",
      tools,
      turnCap: 5,
    });
    expect(outcome.cacheReadTokens).toBe(150);
    expect(outcome.cacheCreationTokens).toBe(0);
    expect(outcome.calls.map(({ cacheReadTokens }) => cacheReadTokens)).toEqual(
      [150, 0],
    );
    expect(outcome.toolNames).toEqual(["list_files", "submit_answer"]);
  });

  it("the mock loop awaits an async executor and records both calls", async () => {
    const outcome = await createMockAgentModel().runTrial({
      executor: { execute: async (name) => `async ${name}` },
      model: "mock",
      prompt: "p",
      scriptedAnswer: "a",
      system: "s",
      tools,
      turnCap: 3,
    });
    expect(outcome.calls).toHaveLength(2);
    expect(outcome.toolNames).toEqual(["list_files", "submit_answer"]);
  });
});

describe("graph-surface v3 verdict and auxiliary metrics", () => {
  const trial = (overrides: Partial<GraphSurfaceTrial>): GraphSurfaceTrial => ({
    answer: "x",
    arm: "file-exploration",
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    calls: [],
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
    toolNames: [],
    turns: 4,
    ...overrides,
  });

  it("reads Δ turns = 0 as MET under the v3 hypothesis and NOT MET under v1's", () => {
    const trials = [
      trial({ turns: 4 }),
      trial({ arm: "graph-surface", turns: 4 }),
    ];
    const v3 = judgeHypothesis(trials, "turns-non-increasing");
    expect(v3.turnsDelta).toBe(0);
    expect(v3.primaryMet).toBe(true);
    expect(v3.turnsReduced).toBe(false);
    expect(v3.verdict).toBe("MET");
    expect(judgeHypothesis(trials).verdict).toBe("NOT MET");
    const markdown = renderGraphSurfaceMarkdown({
      corpusCommit: null,
      generatedAt: "now",
      judgment: v3,
      mode: "dry-run",
      models: ["m"],
      preregistrationFile: "benchmarks/graph-surface/preregistration.v3.json",
      preregistrationSha256: "0".repeat(64),
      productCatalogSha256: "1".repeat(64),
      trials,
      v3ManifestDigest: null,
    });
    expect(markdown).toContain("턴 비증가");
    expect(markdown).toContain("v1 기준 절감 Δ < 0: 미충족");
    expect(markdown).toContain("| cache creation | cache read |");
    expect(markdown).toContain("preregistration.v3.json");
    expect(markdown).toContain(`\`${"1".repeat(64)}\``);
  });

  it("computes adoption, tokens per call and todo duplication from the trials alone", () => {
    const trials = [
      trial({
        arm: "graph-surface",
        calls: [
          {
            cacheCreationTokens: 10,
            cacheReadTokens: 40,
            inputTokens: 50,
            outputTokens: 5,
          },
          {
            cacheCreationTokens: 0,
            cacheReadTokens: 60,
            inputTokens: 30,
            outputTokens: 7,
          },
        ],
        observations: {
          progressMatched: { created: 1, normalized_title: 1 },
          todosCreated: 1,
          todosDuplicated: 1,
        },
        toolNames: ["search_index", "log_progress", "submit_answer"],
      }),
      trial({
        arm: "graph-surface",
        model: "n",
        observations: {
          progressMatched: {},
          todosCreated: 0,
          todosDuplicated: 0,
        },
        toolNames: ["submit_answer"],
      }),
      trial({
        arm: "graph-surface",
        model: "n",
        status: "failed",
        answer: null,
        quality: "FAIL",
        score: 0,
      }),
      trial({ toolNames: ["log_progress"] }),
    ];
    expect(progressAdoption(trials, "pooled")).toEqual({
      adopted: 1,
      model: "pooled",
      rate: 0.333,
      trials: 3,
    });
    expect(progressAdoption(trials, "n").rate).toBe(0);
    const perCall = tokensPerCall(trials, "graph-surface", "m");
    expect(perCall.calls).toBe(2);
    expect(perCall.meanInput).toBe(40);
    expect(perCall.meanCacheRead).toBe(50);
    expect(perCall.meanCacheCreation).toBe(5);
    expect(perCall.cacheReadShare).toBe(0.526);
    expect(
      tokensPerCall(trials, "file-exploration", "pooled").meanInput,
    ).toBeNull();
    expect(todoDuplication(trials)).toEqual({
      created: 1,
      duplicated: 1,
      matched: { created: 1, normalized_title: 1 },
      rate: 1,
      trials: 2,
    });
  });

  it("labels the risk top N by the fix-commit rule and reports precision", () => {
    const log = [
      "aaafix: repair the queue\n\napps/worker/src/queue.ts\npackages/core/src/a.ts\n",
      "bbbfeat: add a thing\n\npackages/core/src/b.ts\n",
      "cccRevert something\n\npackages/core/src/a.ts\n",
    ].join("");
    const commits = parseGitLogNameOnly(log);
    expect(commits).toHaveLength(3);
    expect(commits[0]).toEqual({
      paths: ["apps/worker/src/queue.ts", "packages/core/src/a.ts"],
      sha: "aaa",
      subject: "fix: repair the queue",
    });
    const pattern = /\b(fix|bug|hotfix|regress|revert)/i;
    const touches = fixTouchesByPath(commits, pattern);
    expect(touches.get("packages/core/src/a.ts")).toBe(2);
    expect(touches.has("packages/core/src/b.ts")).toBe(false);
    const entries = [
      {
        factors: [{ detail: "", kind: "fan-in" as const, weight: 1 }],
        grade: "inferred" as const,
        level: "high" as const,
        nodeId: "1",
        path: "packages/core/src/b.ts",
        score: 0.9,
      },
      {
        factors: [{ detail: "", kind: "fan-in" as const, weight: 1 }],
        grade: "inferred" as const,
        level: "moderate" as const,
        nodeId: "2",
        path: "packages/core/src/a.ts",
        score: 0.5,
      },
      {
        factors: [{ detail: "", kind: "fan-in" as const, weight: 1 }],
        grade: "inferred" as const,
        level: "moderate" as const,
        nodeId: "3",
        path: "apps/worker/src/queue.ts",
        score: 0.5,
      },
    ];
    const labels = labelRiskEntries(entries, touches, 2);
    expect(labels.map(({ path }) => path)).toEqual([
      "packages/core/src/b.ts",
      "apps/worker/src/queue.ts",
    ]);
    expect(labels.map(({ truePositive }) => truePositive)).toEqual([
      false,
      true,
    ]);
    expect(precisionAt(labels, 2)).toBe(0.5);
    expect(precisionAt(labels, 10)).toBeNull();
    const report = buildRiskPrecisionReport({
      commits,
      corpusCommit: null,
      repository: "r",
      riskMap: { entries, unmeasured: [{ reason: "", signal: "coverage" }] },
      sinceDays: 90,
      stratum: "without-ci",
      subjectPattern: pattern,
      topN: 3,
    });
    expect(report.fixCommits).toBe(2);
    expect(
      report.strata.map(({ stratum, entries: count }) => [stratum, count]),
    ).toEqual([
      ["with-ci", 0],
      ["without-ci", 3],
    ]);
    expect(report.strata[1]!.precisionAtN).toBe(0.667);
    expect(report.unmeasured).toEqual(["coverage"]);
  });
});

describe("graph-surface F5 audit", () => {
  it("passes the committed releases and reports the pre-registrations without a real run as pending", async () => {
    const audit = await auditGraphSurfaceReleases(repoRoot);
    expect(audit).not.toBeNull();
    const ids = audit!.releases.map(({ id }) => id);
    expect(ids).toContain("v1");
    expect(ids).toContain("v2");
    for (const release of audit!.releases) {
      expect(release.findings, release.id).toEqual([]);
      expect(release.trialCount).toBe(release.expectedTrialCount);
    }
    for (const pending of audit!.pendingReleases) {
      expect(["v3", "v3-relational"]).toContain(pending);
    }
    expect(new Set([...ids, ...audit!.pendingReleases])).toEqual(
      new Set(["v1", "v2", "v3", "v3-relational"]),
    );
  });

  it("flags a report whose pre-registration digest, mode or verdict was tampered", async () => {
    const root = mkdtempSync(join(tmpdir(), "graph-surface-audit-"));
    try {
      mkdirSync(join(root, "benchmarks/graph-surface"), { recursive: true });
      mkdirSync(join(root, "benchmarks/databrain"), { recursive: true });
      writeFileSync(
        join(root, "benchmarks/databrain/tasks.v3.json"),
        readFileSync(v3ManifestPath),
      );
      for (const file of [
        "preregistration.v1.json",
        "results.v1.md",
        "preregistration.v2.json",
        "results.v2.json",
        "results.v2.md",
      ]) {
        writeFileSync(
          join(root, "benchmarks/graph-surface", file),
          readFileSync(join(benchmarkDirectory, file)),
        );
      }
      const v1 = JSON.parse(
        readFileSync(join(benchmarkDirectory, "results.v1.json"), "utf8"),
      ) as {
        judgment: { verdict: string };
        mode: string;
        preregistrationSha256: string;
      };
      v1.preregistrationSha256 = "0".repeat(64);
      v1.mode = "dry-run";
      v1.judgment.verdict = "MET";
      writeFileSync(
        join(root, "benchmarks/graph-surface/results.v1.json"),
        JSON.stringify(v1),
        "utf8",
      );
      const audit = await auditGraphSurfaceReleases(root);
      const v1Audit = audit!.releases.find(({ id }) => id === "v1")!;
      const kinds = new Set(v1Audit.findings.map(({ kind }) => kind));
      expect(kinds).toContain("preregistration-lock");
      expect(kinds).toContain("run-contract");
      expect(kinds).toContain("measurement-integrity");
      const v2Audit = audit!.releases.find(({ id }) => id === "v2")!;
      expect(v2Audit.findings).toEqual([]);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  it("the instruction block the graph arm carries is the installed one", () => {
    const block = renderAgentInstructionBlock();
    expect(block).toContain("search_index");
    expect(block).toContain("log_progress");
    expect(preregistrationSha256("x")).toBe(
      createHash("sha256").update("x", "utf8").digest("hex"),
    );
  });
});
