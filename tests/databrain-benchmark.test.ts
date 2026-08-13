import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadBenchmarkManifest } from "../scripts/databrain-benchmark/manifest";
import { gradeBenchmarkOutput } from "../scripts/databrain-benchmark/grading";
import {
  buildArmContext,
  loadRepositoryCorpus,
} from "../scripts/databrain-benchmark/context";
import { runBenchmarkTrial } from "../scripts/databrain-benchmark/runner";
import { runIsolatedImplementationTests } from "../scripts/databrain-benchmark/implementation-runner";
import {
  createMockBenchmarkModel,
  createOpenAiBenchmarkModel,
} from "../scripts/databrain-benchmark/model";
import { runBenchmark } from "../scripts/databrain-benchmark/benchmark";
import { renderBenchmarkMarkdown } from "../scripts/databrain-benchmark/report";

describe("Data Brain benchmark", () => {
  it("rejects a pre-registered task without an objective grading manifest", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "specproof-bench-manifest-"),
    );
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
      resolve(import.meta.dirname, "../benchmarks/databrain/tasks.json"),
    );

    expect(manifest.arms).toEqual(["checkout", "full-dump", "data-brain"]);
    expect(manifest.trialsPerArm).toBe(3);
    expect(manifest.tasks).toHaveLength(12);
    expect(new Set(manifest.tasks.map(({ type }) => type))).toEqual(
      new Set(["implementation", "question-answering", "drift-judgment"]),
    );
    expect(manifest.tasks.some(({ repository }) => repository === ".")).toBe(
      true,
    );
  });

  it("rejects a manifest that weakens the pre-registered protocol", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "specproof-bench-protocol-"),
    );
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
    const repositoryRoot = resolve(
      import.meta.dirname,
      "../fixtures/drifted-demo",
    );
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
    const manifest = await loadBenchmarkManifest(
      resolve(import.meta.dirname, "../benchmarks/databrain/tasks.json"),
    );
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
      resolve(import.meta.dirname, ".."),
    );

    expect(result.passed).toBe(true);
    expect(result.output).toContain("passed");
  }, 20_000);

  it("runs every pre-registered dry-run trial without aggregating failures away", async () => {
    const repositoryRoot = resolve(import.meta.dirname, "..");
    const manifest = await loadBenchmarkManifest(
      resolve(repositoryRoot, "benchmarks/databrain/tasks.json"),
    );
    const report = await runBenchmark({
      generatedAt: "2026-08-13T00:00:00.000Z",
      manifest,
      mode: "dry-run",
      model: createMockBenchmarkModel(manifest),
      repositoryRoot,
    });

    expect(report.protocol.expectedTrialCount).toBe(108);
    expect(report.trials).toHaveLength(108);
    expect(report.trials.every(({ status }) => status === "completed")).toBe(
      true,
    );
    expect(report.aggregates).toHaveLength(3);
    expect(report.aggregates.every(({ trialCount }) => trialCount === 36)).toBe(
      true,
    );
  }, 60_000);

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
});
