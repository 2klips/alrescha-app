import { createHash } from "node:crypto";
import { resolve } from "node:path";

import {
  buildArmContext,
  loadRepositoryCorpus,
  type ArmContext,
  type RepositoryCorpus,
} from "./context";
import { runIsolatedImplementationTests } from "./implementation-runner";
import { runBenchmarkTrial } from "./runner";
import type {
  BenchmarkAggregate,
  BenchmarkArm,
  BenchmarkManifest,
  BenchmarkModel,
  BenchmarkReport,
  BenchmarkTrialResult,
} from "./types";

function round(value: number): number {
  return Number(value.toFixed(6));
}

function aggregateArm(
  arm: BenchmarkArm,
  trials: readonly BenchmarkTrialResult[],
): BenchmarkAggregate {
  const selected = trials.filter((trial) => trial.arm === arm);
  const passedTrials = selected.filter((trial) => trial.grade?.passed).length;
  const totalInputTokens = selected.reduce(
    (sum, trial) => sum + trial.inputTokens,
    0,
  );
  const totalOutputTokens = selected.reduce(
    (sum, trial) => sum + trial.outputTokens,
    0,
  );
  return {
    arm,
    failedTrials: selected.filter((trial) => trial.status === "failed").length,
    meanScore: round(
      selected.reduce((sum, trial) => sum + (trial.grade?.score ?? 0), 0) /
        selected.length,
    ),
    passedTrials,
    passRate: round(passedTrials / selected.length),
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalToolCalls: selected.reduce((sum, trial) => sum + trial.toolCalls, 0),
    totalWallTimeMs: selected.reduce((sum, trial) => sum + trial.wallTimeMs, 0),
    trialCount: selected.length,
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await operation(values[index]!);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), values.length) },
      () => worker(),
    ),
  );
  return output;
}

export async function runBenchmark(input: {
  concurrency?: number;
  generatedAt?: string;
  manifest: BenchmarkManifest;
  mode: "dry-run" | "real";
  model: BenchmarkModel;
  repositoryRoot: string;
}): Promise<BenchmarkReport> {
  const corpusCache = new Map<string, Promise<RepositoryCorpus>>();
  const contextCache = new Map<string, Promise<ArmContext>>();
  function corpus(repository: string): Promise<RepositoryCorpus> {
    const absolute = resolve(input.repositoryRoot, repository);
    const existing = corpusCache.get(absolute);
    if (existing) return existing;
    const loaded = loadRepositoryCorpus(absolute);
    corpusCache.set(absolute, loaded);
    return loaded;
  }
  function context(taskIndex: number, arm: BenchmarkArm): Promise<ArmContext> {
    const key = `${taskIndex}:${arm}`;
    const existing = contextCache.get(key);
    if (existing) return existing;
    const task = input.manifest.tasks[taskIndex]!;
    const built = corpus(task.repository).then((repositoryCorpus) =>
      buildArmContext({
        arm,
        corpus: repositoryCorpus,
        retrievalQuery: task.retrievalQuery,
        taskDescription: task.prompt,
      }),
    );
    contextCache.set(key, built);
    return built;
  }

  const jobs = input.manifest.tasks.flatMap((task, taskIndex) =>
    input.manifest.arms.flatMap((arm) =>
      Array.from({ length: input.manifest.trialsPerArm }, (_, trialIndex) => ({
        arm,
        task,
        taskIndex,
        trial: trialIndex + 1,
      })),
    ),
  );
  const trials = await mapWithConcurrency(
    jobs,
    input.concurrency ?? 3,
    async (job) =>
      runBenchmarkTrial({
        armContext: await context(job.taskIndex, job.arm),
        model: input.model,
        modelName: input.manifest.model,
        runImplementationTests: (implementationInput) =>
          runIsolatedImplementationTests(
            implementationInput,
            input.repositoryRoot,
          ),
        task: job.task,
        trial: job.trial,
      }),
  );
  const aggregates = input.manifest.arms.map((arm) =>
    aggregateArm(arm, trials),
  );
  const baseline = aggregates.find(({ arm }) => arm === "checkout")!;
  const dataBrain = aggregates.find(({ arm }) => arm === "data-brain")!;
  const accuracyDeltaPercentagePoints = round(
    (dataBrain.meanScore - baseline.meanScore) * 100,
  );
  const tokenReductionPercent =
    baseline.totalTokens === 0
      ? null
      : round((1 - dataBrain.totalTokens / baseline.totalTokens) * 100);
  const manifestDigest = createHash("sha256")
    .update(JSON.stringify(input.manifest), "utf8")
    .digest("hex");

  return {
    aggregates,
    hypothesis: {
      accuracyDeltaPercentagePoints,
      accuracyNonInferior: accuracyDeltaPercentagePoints >= -5,
      baselineArm: "checkout",
      dataBrainArm: "data-brain",
      targetTokenReductionPercent: 30,
      tokenReductionPercent,
      tokenTargetMet:
        tokenReductionPercent !== null && tokenReductionPercent >= 30,
    },
    protocol: {
      arms: [...input.manifest.arms],
      expectedTrialCount: jobs.length,
      taskCount: input.manifest.tasks.length,
      trialsPerArm: input.manifest.trialsPerArm,
    },
    run: {
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      manifestDigest,
      mode: input.mode,
      model: input.manifest.model,
      tokenizerAssumption:
        input.mode === "real"
          ? "OpenAI Responses API usage.input_tokens and usage.output_tokens are authoritative; no local tokenizer estimate is substituted."
          : "Mock usage is deterministic ceil((context + prompt) characters / 4) input and serialized-output characters / 4 output.",
    },
    schemaVersion: 1,
    trials,
  };
}
