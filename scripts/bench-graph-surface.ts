/**
 * Graph-surface benchmark CLI (Phase 3 Wave F todo 15).
 *
 * `--dry-run`: mock agent over the full pre-registered grid — proves the
 * manifest lock, workspaces, tools, loop accounting, grading, and report
 * pipeline with zero credits. Writes results.dry-run.*.
 *
 * Real mode: executes the frozen 96-trial grid against both providers and
 * writes results.v1.* — published regardless of the hypothesis verdict.
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { loadRepositoryCorpus } from "./databrain-benchmark/context";
import { gradeBenchmarkOutput } from "./databrain-benchmark/grading";
import type { BenchmarkTask } from "./databrain-benchmark/types";
import {
  createAnthropicAgentModel,
  createMockAgentModel,
  createOpenAiAgentModel,
  type AgentModel,
} from "./graph-surface-benchmark/loop";
import {
  GRAPH_SURFACE_ARMS,
  loadGraphSurfaceBenchmark,
  type GraphSurfaceArm,
} from "./graph-surface-benchmark/manifest";
import {
  judgeHypothesis,
  renderGraphSurfaceMarkdown,
  type GraphSurfaceTrial,
  type TrialQuality,
} from "./graph-surface-benchmark/report";
import {
  createToolExecutor,
  toolDefinitionsForArm,
  type ToolExecutor,
} from "./graph-surface-benchmark/tools";
import { benchmarkWorkspace } from "./graph-surface-benchmark/workspace";

const SYSTEM_PROMPT =
  "You are answering a question about a repository using the provided tools. Each tool call costs a turn — explore efficiently. When you are confident, call submit_answer exactly once with a complete answer that includes the exact identifiers, paths, and values you found.";

const PROVIDER_KEY_NAMES = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
} as const;

async function runPool<T>(
  jobs: readonly (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = Array.from({ length: jobs.length });
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, jobs.length) },
    async () => {
      while (next < jobs.length) {
        const index = next;
        next += 1;
        const job = jobs[index];
        if (job) results[index] = await job();
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function corpusCommit(repositoryRoot: string): Promise<string | null> {
  try {
    const { stdout } = await promisify(execFile)("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
    });
    const sha = stdout.trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function scriptedAnswer(task: BenchmarkTask): string {
  return task.grader.kind === "answer-manifest"
    ? task.grader.requiredFacts.map((aliases) => aliases[0] ?? "").join(". ")
    : "";
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const dryRun = process.argv.includes("--dry-run");
  const { preregistration, preregistrationSha256, tasks } =
    await loadGraphSurfaceBenchmark({
      preregistrationPath: resolve(
        repositoryRoot,
        "benchmarks/graph-surface/preregistration.v1.json",
      ),
      v3ManifestPath: resolve(
        repositoryRoot,
        "benchmarks/databrain/tasks.v3.json",
      ),
    });

  const corpusKeys = [...new Set(tasks.map(({ repository }) => repository))];
  const executors = new Map<string, ToolExecutor>();
  for (const corpusKey of corpusKeys) {
    const corpus = await loadRepositoryCorpus(
      resolve(repositoryRoot, corpusKey),
    );
    const workspace = benchmarkWorkspace({
      corpus,
      corpusKey,
      memoryFixtures: preregistration.memoryFixtures,
    });
    for (const arm of GRAPH_SURFACE_ARMS) {
      executors.set(
        `${arm} ${corpusKey}`,
        createToolExecutor({
          arm,
          caps: preregistration.protocol.toolOutputCaps,
          corpus,
          workspace,
        }),
      );
    }
  }

  const mock = createMockAgentModel();
  const runners = new Map<string, AgentModel>();
  for (const model of preregistration.models) {
    if (dryRun) {
      runners.set(model.id, mock);
      continue;
    }
    const keyName = PROVIDER_KEY_NAMES[model.provider];
    const apiKey = process.env[keyName] ?? "";
    if (apiKey.trim().length === 0) {
      throw new TypeError(`${keyName} is required for the real run.`);
    }
    runners.set(
      model.id,
      model.provider === "anthropic"
        ? createAnthropicAgentModel(apiKey)
        : createOpenAiAgentModel(apiKey),
    );
  }

  interface PlannedTrial {
    readonly arm: GraphSurfaceArm;
    readonly model: string;
    readonly repeat: number;
    readonly task: BenchmarkTask;
  }
  const plan: PlannedTrial[] = tasks.flatMap((task) =>
    GRAPH_SURFACE_ARMS.flatMap((arm) =>
      preregistration.models.flatMap((model) =>
        Array.from(
          { length: preregistration.protocol.repeatsPerCell },
          (_, repeatIndex) => ({
            arm,
            model: model.id,
            repeat: repeatIndex + 1,
            task,
          }),
        ),
      ),
    ),
  );

  let completed = 0;
  const trials = await runPool(
    plan.map((planned) => async (): Promise<GraphSurfaceTrial> => {
      const executor = executors.get(
        `${planned.arm} ${planned.task.repository}`,
      );
      const runner = runners.get(planned.model);
      if (!executor || !runner) {
        throw new TypeError("Unplanned arm, corpus, or model.");
      }
      const base = {
        arm: planned.arm,
        model: planned.model,
        repeat: planned.repeat,
        taskId: planned.task.id,
      } as const;
      try {
        const outcome = await runner.runTrial({
          executor,
          model: planned.model,
          prompt: planned.task.prompt,
          scriptedAnswer: scriptedAnswer(planned.task),
          system: SYSTEM_PROMPT,
          tools: toolDefinitionsForArm(planned.arm),
          turnCap: preregistration.protocol.turnCap,
        });
        const grade =
          outcome.answer === null
            ? null
            : await gradeBenchmarkOutput({
                output: { answer: outcome.answer, files: [], findings: [] },
                task: planned.task,
              });
        const quality: TrialQuality =
          grade === null || grade.score === 0
            ? "FAIL"
            : grade.passed
              ? "PASS"
              : "PARTIAL";
        completed += 1;
        process.stdout.write(
          `graph-surface ${completed}/${plan.length}: ${planned.arm} ${planned.model} ${planned.task.id}#${planned.repeat} turns=${outcome.turns} ${quality}\n`,
        );
        return {
          ...base,
          answer: outcome.answer,
          errorMessage: null,
          inputTokens: outcome.inputTokens,
          outputTokens: outcome.outputTokens,
          quality,
          score: grade?.score ?? 0,
          status: "succeeded",
          toolCalls: outcome.toolCalls,
          turns: outcome.turns,
        };
      } catch (error) {
        completed += 1;
        process.stdout.write(
          `graph-surface ${completed}/${plan.length}: ${planned.arm} ${planned.model} ${planned.task.id}#${planned.repeat} FAILED\n`,
        );
        return {
          ...base,
          answer: null,
          errorMessage:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Unknown failure",
          inputTokens: 0,
          outputTokens: 0,
          quality: "FAIL",
          score: 0,
          status: "failed",
          toolCalls: 0,
          turns: preregistration.protocol.turnCap,
        };
      }
    }),
    preregistration.protocol.concurrency,
  );

  const judgment = judgeHypothesis(trials);
  const generatedAt = new Date().toISOString();
  const commitSha = await corpusCommit(repositoryRoot);
  const outputDir = resolve(repositoryRoot, "benchmarks/graph-surface");
  await mkdir(outputDir, { recursive: true });
  const basename = dryRun ? "results.dry-run" : "results.v1";
  const markdown = renderGraphSurfaceMarkdown({
    corpusCommit: commitSha,
    generatedAt,
    judgment,
    mode: dryRun ? "dry-run" : "real",
    models: preregistration.models.map(({ id }) => id),
    preregistrationSha256,
    trials,
    v3ManifestDigest: preregistration.questionSource.manifestDigest,
  });
  await writeFile(
    resolve(outputDir, `${basename}.json`),
    `${JSON.stringify(
      {
        corpusCommit: commitSha,
        generatedAt,
        judgment,
        mode: dryRun ? "dry-run" : "real",
        preregistrationSha256,
        trials,
        v3ManifestDigest: preregistration.questionSource.manifestDigest,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(resolve(outputDir, `${basename}.md`), markdown, "utf8");
  const failed = trials.filter(({ status }) => status === "failed").length;
  process.stdout.write(
    `Graph-surface ${dryRun ? "dry-run" : "real"}: ${trials.length}/${preregistration.protocol.trialCount} trials, ${failed} failed. Verdict: ${judgment.verdict}\n`,
  );
  process.stdout.write(
    `Reports: benchmarks/graph-surface/${basename}.{json,md}\n`,
  );
}

await main();
