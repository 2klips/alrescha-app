import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  loadBenchmarkManifest,
  taskCorpus,
} from "../scripts/databrain-benchmark/manifest";
import { gradeBenchmarkOutput } from "../scripts/databrain-benchmark/grading";
import {
  buildArmContext,
  loadRepositoryCorpus,
} from "../scripts/databrain-benchmark/context";
import { runBenchmarkTrial } from "../scripts/databrain-benchmark/runner";
import { runIsolatedImplementationTests } from "../scripts/databrain-benchmark/implementation-runner";
import {
  createAnthropicBenchmarkModel,
  createMockBenchmarkModel,
  createOpenAiBenchmarkModel,
} from "../scripts/databrain-benchmark/model";
import {
  runBenchmark,
  type BenchmarkModelExecution,
} from "../scripts/databrain-benchmark/benchmark";
import { renderBenchmarkMarkdown } from "../scripts/databrain-benchmark/report";
import { bootstrapConfidenceInterval } from "../scripts/databrain-benchmark/statistics";
import { estimateBenchmarkCost } from "../scripts/databrain-benchmark/cost-estimate";
import type {
  BenchmarkManifestV2,
  BenchmarkReportV1,
  BenchmarkReportV2,
  BenchmarkTrialResult,
} from "../scripts/databrain-benchmark/types";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");

async function loadV3Manifest(): Promise<BenchmarkManifestV2> {
  const manifest = await loadBenchmarkManifest(
    resolve(REPOSITORY_ROOT, "benchmarks/databrain/tasks.v3.json"),
  );
  if (manifest.schemaVersion !== 2) throw new Error("expected schema 2");
  return manifest;
}

function mockExecution(
  manifest: BenchmarkManifestV2,
): BenchmarkModelExecution[] {
  const mock = createMockBenchmarkModel(manifest);
  return manifest.models.map((spec) => ({
    reason: null,
    runner: mock,
    spec,
  }));
}

describe("Data Brain benchmark", () => {
  it("rejects a pre-registered task without an objective grading manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arr-bench-manifest-"));
    const path = join(directory, "tasks.json");
    await writeFile(
      path,
      JSON.stringify({
        arms: ["checkout", "full-dump", "data-brain"],
        model: "mock-model-v1",
        schemaVersion: 1,
        tasks: [
          {
            id: "missing-grader",
            prompt: "Answer this",
            repository: "fixture",
            type: "question-answering",
          },
        ],
        trialsPerArm: 3,
      }),
      "utf8",
    );

    await expect(loadBenchmarkManifest(path)).rejects.toThrow(
      /missing-grader.*grading manifest/i,
    );
  });

  it("loads 12 tasks, three trials, all grading types, and a realistic repository", async () => {
    const manifest = await loadBenchmarkManifest(
      resolve(REPOSITORY_ROOT, "benchmarks/databrain/tasks.json"),
    );

    expect(manifest.arms).toEqual(["checkout", "full-dump", "data-brain"]);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.trialsPerArm).toBe(3);
    expect(manifest.tasks).toHaveLength(12);
    expect(new Set(manifest.tasks.map(({ type }) => type))).toEqual(
      new Set(["implementation", "question-answering", "drift-judgment"]),
    );
    expect(manifest.tasks.some(({ repository }) => repository === ".")).toBe(
      true,
    );
  });

  it("loads the v3 pre-registration with five trials, two providers, and six or more realistic-repository tasks", async () => {
    const manifest = await loadV3Manifest();
    const realistic = manifest.tasks.filter(
      (task) => taskCorpus(task) === "realistic",
    );

    expect(manifest.trialsPerArm).toBe(5);
    expect(manifest.tasks.length).toBeGreaterThanOrEqual(20);
    expect(manifest.models.map(({ provider }) => provider)).toEqual([
      "openai",
      "anthropic",
    ]);
    expect(realistic.length).toBeGreaterThanOrEqual(6);
    expect(new Set(manifest.tasks.map(({ type }) => type))).toEqual(
      new Set([
        "implementation",
        "question-answering",
        "drift-judgment",
        "policy-audit",
      ]),
    );
    expect(
      manifest.tasks.every(({ grader }) =>
        ["answer-manifest", "findings-manifest", "test-pass"].includes(
          grader.kind,
        ),
      ),
    ).toBe(true);
  });

  it("rejects a schema-2 manifest that under-covers realistic repositories", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arr-bench-realistic-"));
    const path = join(directory, "tasks.json");
    const tasks = Array.from({ length: 12 }, (_, index) => ({
      grader: { kind: "answer-manifest", requiredFacts: [["fact"]] },
      id: `task-${index}`,
      prompt: "Answer this",
      repository: index === 0 ? "fixtures/other-demo" : "fixtures/drifted-demo",
      retrievalQuery: "fact",
      type: "question-answering",
    }));
    await writeFile(
      path,
      JSON.stringify({
        arms: ["checkout", "full-dump", "data-brain"],
        models: [
          { id: "gpt-test", provider: "openai" },
          { id: "claude-test", provider: "anthropic" },
        ],
        schemaVersion: 2,
        tasks,
        trialsPerArm: 5,
      }),
      "utf8",
    );

    await expect(loadBenchmarkManifest(path)).rejects.toThrow(
      /at least 6 realistic-repository tasks/i,
    );
  });

  it("rejects a schema-2 manifest with a single provider", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arr-bench-provider-"));
    const path = join(directory, "tasks.json");
    const manifest = await loadV3Manifest();
    await writeFile(
      path,
      JSON.stringify({
        arms: manifest.arms,
        models: [{ id: "gpt-test", provider: "openai" }],
        schemaVersion: 2,
        tasks: manifest.tasks,
        trialsPerArm: 5,
      }),
      "utf8",
    );

    await expect(loadBenchmarkManifest(path)).rejects.toThrow(
      /at least two model providers/i,
    );
  });

  it("rejects a manifest that weakens the pre-registered protocol", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arr-bench-protocol-"));
    const path = join(directory, "tasks.json");
    await writeFile(
      path,
      JSON.stringify({
        arms: ["checkout", "full-dump", "data-brain"],
        model: "mock-model-v1",
        schemaVersion: 1,
        tasks: [
          {
            grader: { kind: "answer-manifest", requiredFacts: [["fact"]] },
            id: "only-one",
            prompt: "Answer this",
            repository: ".",
            retrievalQuery: "fact",
            type: "question-answering",
          },
        ],
        trialsPerArm: 2,
      }),
      "utf8",
    );

    await expect(loadBenchmarkManifest(path)).rejects.toThrow(
      /at least 12 tasks/i,
    );
  });

  it("grades question answers against every pre-registered fact alias", async () => {
    const grade = await gradeBenchmarkOutput({
      output: {
        answer: "Sessions expire after 30 minutes.",
        files: [],
        findings: [],
      },
      task: {
        grader: {
          kind: "answer-manifest",
          requiredFacts: [
            ["30 minutes", "1800000"],
            [">=", "exact boundary"],
          ],
        },
        id: "answer-session",
        prompt: "Explain session expiry",
        repository: "fixture",
        retrievalQuery: "session expiry",
        type: "question-answering",
      },
    });

    expect(grade).toEqual({
      passed: false,
      score: 0.5,
      summary: "1/2 required facts matched",
    });
  });

  it("grades drift judgments with order-independent precision and recall", async () => {
    const grade = await gradeBenchmarkOutput({
      output: {
        answer: "",
        files: [],
        findings: ["extra", "missing-test:req-1"],
      },
      task: {
        grader: {
          expectedFindings: ["missing-test:REQ-1", "stale-doc:legacy"],
          kind: "findings-manifest",
        },
        id: "judge-drift",
        prompt: "Find drift",
        repository: "fixture",
        retrievalQuery: "drift",
        type: "drift-judgment",
      },
    });

    expect(grade).toEqual({
      passed: false,
      score: 0.5,
      summary: "1/2 expected, 1 unexpected",
    });
  });

  it("penalises a policy audit that returns every candidate", async () => {
    const manifest = await loadV3Manifest();
    const task = manifest.tasks.find(
      ({ id }) => id === "real-audit-finding-taxonomy",
    );
    expect(task?.type).toBe("policy-audit");
    if (task?.grader.kind !== "findings-manifest") throw new Error("grader");

    const grade = await gradeBenchmarkOutput({
      output: {
        answer: "",
        files: [],
        findings: [
          ...task.grader.expectedFindings,
          "finding-type:flaky-test",
          "finding-type:missing-doc",
        ],
      },
      task,
    });

    expect(grade.passed).toBe(false);
    expect(grade.score).toBeGreaterThan(0.6);
    expect(grade.score).toBeLessThan(1);
  });

  it("grades implementation output only through the isolated test-pass boundary", async () => {
    const grade = await gradeBenchmarkOutput({
      output: {
        answer: "",
        files: [{ content: "export const fixed = true;", path: "src/fix.ts" }],
        findings: [],
      },
      runImplementationTests: async ({ files, task }) => ({
        output: `${task.id}:${files[0]?.path}`,
        passed: true,
      }),
      task: {
        grader: { kind: "test-pass", testPath: "graders/fix.test.ts" },
        id: "implement-fix",
        prompt: "Implement fix",
        repository: "fixture",
        retrievalQuery: "fix",
        type: "implementation",
      },
    });

    expect(grade).toEqual({
      passed: true,
      score: 1,
      summary: "implement-fix:src/fix.ts",
    });
  });

  it("isolates checkout, full-dump, and Data Brain arm context", async () => {
    const repositoryRoot = resolve(REPOSITORY_ROOT, "fixtures/drifted-demo");
    const corpus = await loadRepositoryCorpus(repositoryRoot);
    expect(corpus.entries.map(({ path }) => path)).not.toContain(
      "expected-findings.json",
    );
    const contexts = await Promise.all(
      (["checkout", "full-dump", "data-brain"] as const).map((arm) =>
        buildArmContext({
          arm,
          corpus,
          retrievalQuery: "session timeout requirement",
          taskDescription: "Explain session timeout",
        }),
      ),
    );

    expect(contexts.map(({ arm }) => arm)).toEqual([
      "checkout",
      "full-dump",
      "data-brain",
    ]);
    expect(
      contexts[0]?.toolNames.every((name) => name.startsWith("checkout.")),
    ).toBe(true);
    expect(contexts[0]?.text).not.toContain("search_index");
    expect(contexts[1]?.toolNames).toEqual([]);
    expect(contexts[1]?.text).toContain("spec.md");
    expect(contexts[2]?.toolNames).toContain("search_index");
    expect(contexts[2]?.toolNames).toContain("get_artifact");
    expect(contexts[2]?.toolNames).toContain("request_context_pack");
    expect(contexts[2]?.text).toContain("30 minutes");
    expect(contexts[2]!.text.length).toBeLessThan(contexts[0]!.text.length);
  });

  it("records a provider failure as a complete failed trial", async () => {
    const task = {
      grader: { kind: "answer-manifest" as const, requiredFacts: [["fact"]] },
      id: "provider-failure",
      prompt: "Return fact",
      repository: "fixture",
      retrievalQuery: "fact",
      type: "question-answering" as const,
    };
    const trial = await runBenchmarkTrial({
      armContext: {
        arm: "checkout",
        text: "checkout context",
        toolNames: ["checkout.read"],
      },
      model: {
        async generate() {
          throw new Error("provider unavailable");
        },
      },
      modelName: "mock-model-v1",
      now: (() => {
        const times = [100, 145];
        return () => times.shift() ?? 145;
      })(),
      provider: "anthropic",
      runImplementationTests: async () => ({ output: "unused", passed: false }),
      task,
      trial: 2,
    });

    expect(trial).toMatchObject({
      arm: "checkout",
      error: "provider_failure",
      grade: null,
      inputTokens: 0,
      outputTokens: 0,
      provider: "anthropic",
      status: "failed",
      taskId: "provider-failure",
      toolCalls: 1,
      trial: 2,
      wallTimeMs: 45,
    });
  });

  it("uses model-reported token counts and identical prompt digests across arms", async () => {
    const task = {
      grader: { kind: "answer-manifest" as const, requiredFacts: [["fact"]] },
      id: "token-accounting",
      prompt: "Return fact",
      repository: "fixture",
      retrievalQuery: "fact",
      type: "question-answering" as const,
    };
    const model = {
      async generate() {
        return {
          inputTokens: 123,
          output: { answer: "fact", files: [], findings: [] },
          outputTokens: 17,
          responseId: "response-token-test",
        };
      },
    };
    const results = await Promise.all(
      (["checkout", "data-brain"] as const).map((arm) =>
        runBenchmarkTrial({
          armContext: { arm, text: `${arm} context`, toolNames: [] },
          model,
          modelName: "mock-model-v1",
          runImplementationTests: async () => ({
            output: "unused",
            passed: false,
          }),
          task,
          trial: 1,
        }),
      ),
    );
    const checkout = results[0]!;
    const brain = results[1]!;

    expect(checkout.inputTokens + checkout.outputTokens).toBe(140);
    expect(brain.inputTokens + brain.outputTokens).toBe(140);
    expect(checkout.promptDigest).toBe(brain.promptDigest);
    expect(checkout.grade).toMatchObject({ passed: true, score: 1 });
  });

  it("runs implementation grading in a fresh repository copy", async () => {
    const manifest = await loadV3Manifest();
    const task = manifest.tasks.find(
      ({ id }) => id === "fixture-implement-remaining-session-ms",
    );
    expect(task).toBeDefined();
    const result = await runIsolatedImplementationTests(
      {
        files: [
          {
            path: "src/session.ts",
            content: `export interface Session { readonly lastActivityAt: number; }
export const SESSION_TIMEOUT_MS = 30 * 60 * 1_000;
export function isSessionExpired(session: Session, now: number): boolean {
  return now - session.lastActivityAt >= SESSION_TIMEOUT_MS;
}
export function remainingSessionMs(session: Session, now: number): number {
  return Math.max(0, SESSION_TIMEOUT_MS - (now - session.lastActivityAt));
}`,
          },
        ],
        task: task!,
      },
      REPOSITORY_ROOT,
    );

    expect(result.passed).toBe(true);
    expect(result.output).toContain("passed");
  }, 20_000);

  it("runs every scheduled multi-model trial without aggregating failures away", async () => {
    const manifest = await loadV3Manifest();
    const taskIds = [
      "fixture-answer-session-policy",
      "real-audit-finding-taxonomy",
    ];
    const report = await runBenchmark({
      generatedAt: "2026-08-17T00:00:00.000Z",
      manifest,
      mode: "dry-run",
      models: mockExecution(manifest),
      overrides: { taskIds },
      repositoryRoot: REPOSITORY_ROOT,
    });

    expect(report.schemaVersion).toBe(2);
    expect(report.protocol.registeredTrialCount).toBe(
      manifest.tasks.length * 3 * 5 * 2,
    );
    expect(report.protocol.expectedTrialCount).toBe(taskIds.length * 3 * 5 * 2);
    expect(report.trials).toHaveLength(taskIds.length * 3 * 5 * 2);
    expect(report.trials.every(({ status }) => status === "completed")).toBe(
      true,
    );
    expect(new Set(report.trials.map(({ model }) => model))).toEqual(
      new Set(manifest.models.map(({ id }) => id)),
    );
    expect(new Set(report.trials.map(({ provider }) => provider))).toEqual(
      new Set(["openai", "anthropic"]),
    );
    // Three pooled arm rows plus three per executed model.
    expect(report.aggregates).toHaveLength(9);
    expect(
      report.aggregates.filter(({ model }) => model === null),
    ).toHaveLength(3);
    expect(
      report.aggregates
        .filter(({ model }) => model === null)
        .every(({ trialCount }) => trialCount === taskIds.length * 5 * 2),
    ).toBe(true);
    expect(report.hypotheses).toHaveLength(3);
    expect(report.hypotheses[0]?.model).toBeNull();
    expect(report.hypotheses[0]?.pairedUnitCount).toBe(taskIds.length * 5 * 2);
    expect(report.run.overrides).toEqual([`tasks=${[...taskIds].sort().join(",")}`]);
  }, 120_000);

  it("skips a model that has no API key instead of failing the run", async () => {
    const manifest = await loadV3Manifest();
    const executions = mockExecution(manifest).map((execution) =>
      execution.spec.provider === "anthropic"
        ? {
            reason: "ANTHROPIC_API_KEY is not set in this environment.",
            runner: null,
            spec: execution.spec,
          }
        : execution,
    );
    const report = await runBenchmark({
      manifest,
      mode: "dry-run",
      models: executions,
      overrides: { taskIds: ["fixture-answer-audit-schema"] },
      repositoryRoot: REPOSITORY_ROOT,
    });

    expect(report.protocol.expectedTrialCount).toBe(15);
    expect(report.trials).toHaveLength(15);
    expect(report.run.models).toEqual([
      {
        id: "gpt-5-nano-2025-08-07",
        provider: "openai",
        reason: null,
        status: "executed",
      },
      {
        id: "claude-sonnet-5",
        provider: "anthropic",
        reason: "ANTHROPIC_API_KEY is not set in this environment.",
        status: "skipped",
      },
    ]);
    expect(report.hypotheses).toHaveLength(2);
    expect(renderBenchmarkMarkdown(report)).toContain(
      "Skipped model: `claude-sonnet-5`",
    );
  }, 60_000);

  it("refuses to run when every registered model is skipped", async () => {
    const manifest = await loadV3Manifest();

    await expect(
      runBenchmark({
        manifest,
        mode: "real",
        models: manifest.models.map((spec) => ({
          reason: "no key",
          runner: null,
          spec,
        })),
        repositoryRoot: REPOSITORY_ROOT,
      }),
    ).rejects.toThrow(/every registered model was skipped/i);
  });

  it("records narrowing overrides so a smoke run cannot pass as a release", async () => {
    const manifest = await loadV3Manifest();
    const report = await runBenchmark({
      manifest,
      mode: "dry-run",
      models: mockExecution(manifest),
      overrides: {
        modelIds: ["gpt-5-nano-2025-08-07"],
        repeats: 1,
        taskIds: ["fixture-answer-legacy-billing"],
      },
      repositoryRoot: REPOSITORY_ROOT,
    });

    expect(report.trials).toHaveLength(3);
    expect(report.run.overrides).toEqual([
      "tasks=fixture-answer-legacy-billing",
      "repeats=1",
      "models=gpt-5-nano-2025-08-07",
    ]);
    expect(report.run.models[1]).toMatchObject({
      status: "skipped",
    });
  }, 30_000);

  it("produces a deterministic seeded confidence interval that brackets the mean", () => {
    const values = [0, 0, 1, 1, 0.5, 0.5, 1, 0, 1, 1];
    const first = bootstrapConfidenceInterval(
      values,
      (sample) => sample.reduce((sum, value) => sum + value, 0) / sample.length,
      "unit-test",
    );
    const second = bootstrapConfidenceInterval(
      values,
      (sample) => sample.reduce((sum, value) => sum + value, 0) / sample.length,
      "unit-test",
    );
    const wider = bootstrapConfidenceInterval(
      values.slice(0, 4),
      (sample) => sample.reduce((sum, value) => sum + value, 0) / sample.length,
      "unit-test",
    );

    expect(first).toEqual(second);
    expect(first!.lower).toBeLessThan(0.6);
    expect(first!.upper).toBeGreaterThan(0.6);
    expect(first!.lower).toBeGreaterThanOrEqual(0);
    expect(first!.upper).toBeLessThanOrEqual(1);
    // Fewer observations must not produce a narrower interval.
    expect(wider!.upper - wider!.lower).toBeGreaterThan(
      first!.upper - first!.lower,
    );
    expect(bootstrapConfidenceInterval([], () => 0, "empty")).toBeNull();
  });

  it("renders assumptions, hypotheses, and every failed trial in the Markdown report", () => {
    const failedTrial = {
      arm: "data-brain" as const,
      error: "provider_failure" as const,
      errorMessage: "provider unavailable",
      grade: null,
      inputTokens: 0,
      model: "mock-model-v1",
      output: null,
      outputTokens: 0,
      promptDigest: "digest",
      responseId: null,
      status: "failed" as const,
      taskId: "failed-task",
      toolCalls: 4,
      trial: 3,
      wallTimeMs: 45,
    };
    const markdown = renderBenchmarkMarkdown({
      aggregates: [
        {
          arm: "data-brain",
          failedTrials: 1,
          meanScore: 0,
          passedTrials: 0,
          passRate: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          totalToolCalls: 4,
          totalWallTimeMs: 45,
          trialCount: 1,
        },
      ],
      hypothesis: {
        accuracyDeltaPercentagePoints: null,
        accuracyNonInferior: false,
        baselineArm: "checkout",
        dataBrainArm: "data-brain",
        targetTokenReductionPercent: 30,
        tokenReductionPercent: null,
        tokenTargetMet: false,
      },
      protocol: {
        arms: ["checkout", "full-dump", "data-brain"],
        expectedTrialCount: 1,
        taskCount: 1,
        trialsPerArm: 3,
      },
      run: {
        generatedAt: "2026-08-13T00:00:00.000Z",
        manifestDigest: "manifest-digest",
        mode: "real",
        model: "mock-model-v1",
        tokenizerAssumption: "Responses API usage fields are authoritative.",
      },
      schemaVersion: 1,
      trials: [failedTrial],
    });

    expect(markdown).toContain("Responses API usage fields are authoritative");
    expect(markdown).toContain("30%");
    expect(markdown).toContain("failed-task");
    expect(markdown).toContain("provider_failure");
    expect(markdown).toContain("./results.real.json");
  });

  it("publishes intervals, per-model rows, and the interval-based gate in schema-2 Markdown", async () => {
    const manifest = await loadV3Manifest();
    const report = await runBenchmark({
      generatedAt: "2026-08-17T00:00:00.000Z",
      manifest,
      mode: "dry-run",
      models: mockExecution(manifest),
      overrides: { taskIds: ["fixture-answer-audit-schema"] },
      repositoryRoot: REPOSITORY_ROOT,
    });
    const markdown = renderBenchmarkMarkdown(report);

    expect(markdown).toContain("## Model coverage");
    expect(markdown).toContain("Accuracy 95% CI");
    expect(markdown).toContain("claude-sonnet-5");
    expect(markdown).toContain("all models (pooled)");
    expect(markdown).toContain(report.run.confidenceMethod);
    expect(markdown).toContain("./results.v3.dry-run.json");
    expect(markdown).toContain(
      "Gate is evaluated against the interval, not the point estimate",
    );
  }, 60_000);

  it("honors provider retry timing and keeps authoritative response usage", async () => {
    const responses = [
      new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        headers: { "retry-after": "0.75" },
        status: 429,
      }),
      new Response(
        JSON.stringify({
          id: "resp-authoritative",
          output: [
            {
              content: [
                {
                  text: JSON.stringify({
                    answer: "fact",
                    files: [],
                    findings: [],
                  }),
                  type: "output_text",
                },
              ],
              type: "message",
            },
          ],
          usage: { input_tokens: 321, output_tokens: 23 },
        }),
        { status: 200 },
      ),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const waits: number[] = [];
    const model = createOpenAiBenchmarkModel(
      "test-key",
      fetchMock as unknown as typeof fetch,
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );

    const response = await model.generate({
      arm: "data-brain",
      context: "context",
      model: "gpt-test",
      prompt: "prompt",
      taskId: "retry-test",
      trial: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([750]);
    expect(response).toMatchObject({
      inputTokens: 321,
      outputTokens: 23,
      responseId: "resp-authoritative",
    });
  });

  it("reads Anthropic structured tool output and its reported usage", async () => {
    const responses = [
      new Response(JSON.stringify({ error: { message: "overloaded" } }), {
        headers: { "retry-after": "1" },
        status: 529,
      }),
      new Response(
        JSON.stringify({
          content: [
            { text: "thinking", type: "text" },
            {
              input: {
                answer: "graphology, d3-force, pixi.js",
                files: [],
                findings: [],
              },
              name: "databrain_benchmark_output",
              type: "tool_use",
            },
          ],
          id: "msg-authoritative",
          usage: { input_tokens: 4_120, output_tokens: 88 },
        }),
        { status: 200 },
      ),
    ];
    const requests: Array<{ body: unknown; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      requests.push({ body: JSON.parse(String(init.body)), init });
      return responses.shift()!;
    });
    const waits: number[] = [];
    const model = createAnthropicBenchmarkModel(
      "test-key",
      fetchMock as unknown as typeof fetch,
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );

    const response = await model.generate({
      arm: "data-brain",
      context: "context",
      model: "claude-sonnet-5",
      prompt: "prompt",
      taskId: "anthropic-test",
      trial: 1,
    });

    expect(waits).toEqual([1_000]);
    expect(response).toMatchObject({
      inputTokens: 4_120,
      outputTokens: 88,
      responseId: "msg-authoritative",
    });
    const body = requests[0]?.body as Record<string, unknown>;
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.tool_choice).toEqual({
      name: "databrain_benchmark_output",
      type: "tool",
    });
    expect(
      (requests[0]?.init.headers as Record<string, string>)["anthropic-version"],
    ).toBe("2023-06-01");
  });

  it("requires an Anthropic key rather than silently estimating tokens", () => {
    expect(() => createAnthropicBenchmarkModel("  ")).toThrow(
      /ANTHROPIC_API_KEY is required/i,
    );
  });

  it("derives the projected real-run cost from committed measurements", () => {
    const baselineTrial = (
      arm: "checkout" | "data-brain" | "full-dump",
      inputTokens: number,
      outputTokens: number,
    ) => ({
      arm,
      error: null,
      errorMessage: null,
      grade: { passed: true, score: 1, summary: "ok" },
      inputTokens,
      model: "baseline-model",
      output: null,
      outputTokens,
      promptDigest: "a".repeat(64),
      responseId: "baseline",
      status: "completed" as const,
      taskId: "task",
      toolCalls: 1,
      trial: 1,
      wallTimeMs: 1,
    });
    const baselineDryRun = {
      trials: [baselineTrial("checkout", 1_000, 0)],
    } as unknown as BenchmarkReportV1;
    const baselineReal = {
      trials: [baselineTrial("checkout", 1_100, 40)],
    } as unknown as BenchmarkReportV1;
    const dryRunTrial = {
      ...baselineTrial("checkout", 2_000, 0),
      model: "model-under-test",
      provider: "openai" as const,
    } as unknown as BenchmarkTrialResult;
    const dryRun = {
      protocol: {
        arms: ["checkout"],
        registeredTrialCount: 2,
        taskCount: 1,
        trialsPerArm: 5,
      },
      run: { models: [{ id: "model-under-test", provider: "openai" }] },
      trials: [dryRunTrial, { ...dryRunTrial }],
    } as unknown as BenchmarkReportV2;

    const estimate = estimateBenchmarkCost({
      baselineDryRun,
      baselineReal,
      dryRun,
    });

    expect(estimate.calibrations[0]?.inputTokenRatio).toBeCloseTo(1.1, 6);
    expect(estimate.projections[0]).toMatchObject({
      dryRunInputTokens: 4_000,
      projectedInputTokens: 4_400,
      projectedOutputTokens: 80,
      projectedTotalTokens: 4_480,
      trialCount: 2,
    });
    expect(estimate.projectedTotalTokens).toBe(4_480);
    expect(estimate.projectedTrialCount).toBe(2);
  });
});
