import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import {
  buildArmContext,
  loadRepositoryCorpus,
  type ArmContext,
  type RepositoryCorpus,
} from "./context";
import { runIsolatedImplementationTests } from "./implementation-runner";
import {
  benchmarkManifestDigest,
  benchmarkManifestModels,
  taskCorpus,
} from "./manifest";
import { runBenchmarkTrial } from "./runner";
import {
  BOOTSTRAP_METHOD_DESCRIPTION,
  bootstrapConfidenceInterval,
  mean,
} from "./statistics";
import type {
  BenchmarkAggregate,
  BenchmarkArm,
  BenchmarkHypothesis,
  BenchmarkManifestV2,
  BenchmarkModel,
  BenchmarkModelSpec,
  BenchmarkReportV2,
  BenchmarkRunModel,
  BenchmarkTrialResult,
} from "./types";

export const DRY_RUN_TOKEN_ASSUMPTION =
  "Mock usage is deterministic ceil((context + prompt) characters / 4) input and serialized-output characters / 4 output.";
export const REAL_TOKEN_ASSUMPTION =
  "Each provider's own reported usage.input_tokens and usage.output_tokens are authoritative (OpenAI Responses API, Anthropic Messages API); no local tokenizer estimate is substituted.";

const NON_INFERIORITY_MARGIN_PERCENTAGE_POINTS = -5;
const IMPROVEMENT_GOAL_PERCENTAGE_POINTS = 5;
const TARGET_TOKEN_REDUCTION_PERCENT = 30;

export interface BenchmarkModelExecution {
  /** `null` marks the model as skipped; `reason` must then explain why. */
  readonly reason: string | null;
  readonly runner: BenchmarkModel | null;
  readonly spec: BenchmarkModelSpec;
}

export interface BenchmarkOverrides {
  readonly modelIds?: readonly string[] | null;
  readonly repeats?: number | null;
  readonly taskIds?: readonly string[] | null;
}

interface PairedUnit {
  readonly baselineScore: number;
  readonly baselineTokens: number;
  readonly dataBrainScore: number;
  readonly dataBrainTokens: number;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function armTrials(
  trials: readonly BenchmarkTrialResult[],
  arm: BenchmarkArm,
  model: string | null,
): BenchmarkTrialResult[] {
  return trials.filter(
    (trial) =>
      trial.arm === arm && (model === null || trial.model === model),
  );
}

export function aggregateBenchmarkArm(
  trials: readonly BenchmarkTrialResult[],
  arm: BenchmarkArm,
  model: string | null,
): BenchmarkAggregate {
  const selected = armTrials(trials, arm, model);
  const scores = selected.map((trial) => trial.grade?.score ?? 0);
  const interval = bootstrapConfidenceInterval(
    scores,
    (sample) => mean(sample),
    `mean-score\u0000${model ?? "all-models"}\u0000${arm}`,
  );
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
    meanScore: selected.length === 0 ? 0 : round(mean(scores)),
    meanScoreCiLower: interval?.lower ?? null,
    meanScoreCiUpper: interval?.upper ?? null,
    model,
    passRate:
      selected.length === 0
        ? 0
        : round(
            selected.filter((trial) => trial.grade?.passed).length /
              selected.length,
          ),
    passedTrials: selected.filter((trial) => trial.grade?.passed).length,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalToolCalls: selected.reduce((sum, trial) => sum + trial.toolCalls, 0),
    totalWallTimeMs: selected.reduce((sum, trial) => sum + trial.wallTimeMs, 0),
    trialCount: selected.length,
  };
}

/**
 * Units are matched across arms by (task, model, trial index): every arm sees
 * the same task with the same prompt, so the accuracy delta and the token
 * ratio are paired statistics.
 */
export function pairedBenchmarkUnits(
  trials: readonly BenchmarkTrialResult[],
  model: string | null,
): PairedUnit[] {
  const baseline = new Map<string, BenchmarkTrialResult>();
  const dataBrain = new Map<string, BenchmarkTrialResult>();
  for (const trial of trials) {
    if (model !== null && trial.model !== model) continue;
    const key = `${trial.taskId}\u0000${trial.model}\u0000${trial.trial}`;
    if (trial.arm === "checkout") baseline.set(key, trial);
    if (trial.arm === "data-brain") dataBrain.set(key, trial);
  }
  return [...baseline.keys()]
    .sort()
    .flatMap((key) => {
      const left = baseline.get(key)!;
      const right = dataBrain.get(key);
      return right
        ? [
            {
              baselineScore: left.grade?.score ?? 0,
              baselineTokens: left.inputTokens + left.outputTokens,
              dataBrainScore: right.grade?.score ?? 0,
              dataBrainTokens: right.inputTokens + right.outputTokens,
            },
          ]
        : [];
    });
}

function tokenReduction(units: readonly PairedUnit[]): number | null {
  const baseline = units.reduce((sum, unit) => sum + unit.baselineTokens, 0);
  if (baseline === 0) return null;
  const dataBrain = units.reduce((sum, unit) => sum + unit.dataBrainTokens, 0);
  return (1 - dataBrain / baseline) * 100;
}

export function evaluateBenchmarkHypothesis(
  trials: readonly BenchmarkTrialResult[],
  aggregates: readonly BenchmarkAggregate[],
  model: string | null,
): BenchmarkHypothesis {
  const baseline = aggregates.find(
    (aggregate) => aggregate.arm === "checkout" && aggregate.model === model,
  )!;
  const dataBrain = aggregates.find(
    (aggregate) => aggregate.arm === "data-brain" && aggregate.model === model,
  )!;
  const units = pairedBenchmarkUnits(trials, model);
  const accuracyDeltaPercentagePoints =
    units.length === 0
      ? null
      : round((dataBrain.meanScore - baseline.meanScore) * 100);
  const tokenReductionPercent =
    baseline.totalTokens === 0
      ? null
      : round((1 - dataBrain.totalTokens / baseline.totalTokens) * 100);
  const accuracyInterval = bootstrapConfidenceInterval(
    units,
    (sample) =>
      mean(sample.map((unit) => unit.dataBrainScore - unit.baselineScore)) * 100,
    `accuracy-delta\u0000${model ?? "all-models"}`,
  );
  const tokenInterval = bootstrapConfidenceInterval(
    units,
    (sample) => tokenReduction(sample),
    `token-reduction\u0000${model ?? "all-models"}`,
  );
  return {
    accuracyDeltaCiLowerPercentagePoints: accuracyInterval?.lower ?? null,
    accuracyDeltaCiUpperPercentagePoints: accuracyInterval?.upper ?? null,
    accuracyDeltaPercentagePoints,
    accuracyImprovementGoalMet:
      accuracyInterval !== null &&
      accuracyInterval.lower >= IMPROVEMENT_GOAL_PERCENTAGE_POINTS,
    accuracyNonInferior:
      accuracyInterval !== null &&
      accuracyInterval.lower >= NON_INFERIORITY_MARGIN_PERCENTAGE_POINTS,
    baselineArm: "checkout",
    dataBrainArm: "data-brain",
    model,
    pairedUnitCount: units.length,
    targetTokenReductionPercent: TARGET_TOKEN_REDUCTION_PERCENT,
    tokenReductionCiLowerPercent: tokenInterval?.lower ?? null,
    tokenReductionCiUpperPercent: tokenInterval?.upper ?? null,
    tokenReductionPercent,
    tokenTargetMet:
      tokenInterval !== null &&
      tokenInterval.lower >= TARGET_TOKEN_REDUCTION_PERCENT,
  };
}

export function summarizeBenchmark(
  trials: readonly BenchmarkTrialResult[],
  arms: readonly BenchmarkArm[],
  executedModelIds: readonly string[],
): {
  aggregates: BenchmarkAggregate[];
  hypotheses: BenchmarkHypothesis[];
} {
  const aggregates = [
    ...arms.map((arm) => aggregateBenchmarkArm(trials, arm, null)),
    ...executedModelIds.flatMap((model) =>
      arms.map((arm) => aggregateBenchmarkArm(trials, arm, model)),
    ),
  ];
  const hypotheses = [
    evaluateBenchmarkHypothesis(trials, aggregates, null),
    ...executedModelIds.map((model) =>
      evaluateBenchmarkHypothesis(trials, aggregates, model),
    ),
  ];
  return { aggregates, hypotheses };
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
    Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, () =>
      worker(),
    ),
  );
  return output;
}

/**
 * Any narrowing of the pre-registered protocol is recorded verbatim in the
 * report so a smoke run can never be mistaken for a publishable release.
 */
function describeOverrides(input: {
  registeredModelCount: number;
  registeredRepeats: number;
  registeredTaskCount: number;
  selectedModelIds: readonly string[];
  selectedRepeats: number;
  selectedTaskIds: readonly string[];
}): string[] {
  const described: string[] = [];
  if (input.selectedTaskIds.length !== input.registeredTaskCount) {
    described.push(`tasks=${[...input.selectedTaskIds].sort().join(",")}`);
  }
  if (input.selectedRepeats !== input.registeredRepeats) {
    described.push(`repeats=${input.selectedRepeats}`);
  }
  if (input.selectedModelIds.length !== input.registeredModelCount) {
    described.push(`models=${[...input.selectedModelIds].sort().join(",")}`);
  }
  return described;
}

/**
 * The realistic-repository context is read from the working tree, so the
 * report records which commit that tree was at (ADR-012 §6). Null when git
 * is unavailable — the F5 audit rejects a release without it.
 */
async function resolveCorpusCommit(
  repositoryRoot: string,
): Promise<string | null> {
  try {
    const { stdout } = await promisify(execFile)(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: repositoryRoot },
    );
    const commit = stdout.trim();
    return /^[0-9a-f]{40}$/.test(commit) ? commit : null;
  } catch {
    return null;
  }
}

export async function runBenchmark(input: {
  concurrency?: number;
  corpusCommit?: string | null;
  generatedAt?: string;
  manifest: BenchmarkManifestV2;
  mode: "dry-run" | "real";
  models: readonly BenchmarkModelExecution[];
  overrides?: BenchmarkOverrides;
  repositoryRoot: string;
  resultsBasename?: string;
}): Promise<BenchmarkReportV2> {
  const overrides = input.overrides ?? {};
  const registeredModels = benchmarkManifestModels(input.manifest);
  const selectedModels = input.models.filter(
    ({ spec }) => !overrides.modelIds || overrides.modelIds.includes(spec.id),
  );
  const executable = selectedModels.filter(({ runner }) => runner !== null);
  if (executable.length === 0) {
    throw new Error(
      "No benchmark model could be executed; every registered model was skipped.",
    );
  }
  const tasks = input.manifest.tasks.filter(
    ({ id }) => !overrides.taskIds || overrides.taskIds.includes(id),
  );
  if (tasks.length === 0) {
    throw new Error("No pre-registered benchmark task matched the selection.");
  }
  const repeats = overrides.repeats ?? input.manifest.trialsPerArm;

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
    const task = tasks[taskIndex]!;
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

  const jobs = tasks.flatMap((task, taskIndex) =>
    input.manifest.arms.flatMap((arm) =>
      executable.flatMap((execution) =>
        Array.from({ length: repeats }, (_, trialIndex) => ({
          arm,
          execution,
          task,
          taskIndex,
          trial: trialIndex + 1,
        })),
      ),
    ),
  );
  const trials = await mapWithConcurrency(
    jobs,
    input.concurrency ?? 3,
    async (job) =>
      runBenchmarkTrial({
        armContext: await context(job.taskIndex, job.arm),
        model: job.execution.runner!,
        modelName: job.execution.spec.id,
        provider: job.execution.spec.provider,
        runImplementationTests: (implementationInput) =>
          runIsolatedImplementationTests(
            implementationInput,
            input.repositoryRoot,
          ),
        task: job.task,
        trial: job.trial,
      }),
  );

  const executedModelIds = executable.map(({ spec }) => spec.id);
  const { aggregates, hypotheses } = summarizeBenchmark(
    trials,
    input.manifest.arms,
    executedModelIds,
  );
  const runModels: BenchmarkRunModel[] = registeredModels.map((spec) => {
    const execution = selectedModels.find(
      (candidate) => candidate.spec.id === spec.id,
    );
    const skippedReason = execution
      ? execution.reason
      : "Excluded by a command-line model override.";
    return execution && execution.runner
      ? { id: spec.id, provider: spec.provider, reason: null, status: "executed" }
      : {
          id: spec.id,
          provider: spec.provider,
          reason: skippedReason ?? "Skipped without a recorded reason.",
          status: "skipped",
        };
  });

  return {
    aggregates,
    hypotheses,
    protocol: {
      arms: [...input.manifest.arms],
      expectedTrialCount: jobs.length,
      fixtureTaskCount: input.manifest.tasks.filter(
        (task) => taskCorpus(task) === "fixture",
      ).length,
      realisticTaskCount: input.manifest.tasks.filter(
        (task) => taskCorpus(task) === "realistic",
      ).length,
      registeredTrialCount:
        input.manifest.tasks.length *
        input.manifest.arms.length *
        input.manifest.trialsPerArm *
        registeredModels.length,
      taskCount: input.manifest.tasks.length,
      trialsPerArm: input.manifest.trialsPerArm,
    },
    run: {
      confidenceMethod: BOOTSTRAP_METHOD_DESCRIPTION,
      corpusCommit:
        input.corpusCommit === undefined
          ? await resolveCorpusCommit(input.repositoryRoot)
          : input.corpusCommit,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      manifestDigest: benchmarkManifestDigest(input.manifest),
      mode: input.mode,
      models: runModels,
      overrides: describeOverrides({
        registeredModelCount: registeredModels.length,
        registeredRepeats: input.manifest.trialsPerArm,
        registeredTaskCount: input.manifest.tasks.length,
        selectedModelIds: selectedModels.map(({ spec }) => spec.id),
        selectedRepeats: repeats,
        selectedTaskIds: tasks.map(({ id }) => id),
      }),
      resultsBasename:
        input.resultsBasename ??
        (input.mode === "real" ? "results.v3.real" : "results.v3.dry-run"),
      tokenizerAssumption:
        input.mode === "real"
          ? REAL_TOKEN_ASSUMPTION
          : DRY_RUN_TOKEN_ASSUMPTION,
    },
    schemaVersion: 2,
    trials,
  };
}
