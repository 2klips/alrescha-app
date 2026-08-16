import type {
  BenchmarkArm,
  BenchmarkReportV1,
  BenchmarkReportV2,
} from "./types";

/**
 * Projects what a real v3 run would cost, derived from measurements rather
 * than guesses:
 *
 *   1. The v3 dry run measures the exact characters of context every arm
 *      sends, reported as ceil(characters / 4) mock input tokens.
 *   2. The committed v2 pair (same harness, same mock rule, real provider
 *      usage) gives a per-arm calibration ratio
 *      `real input tokens / dry-run input tokens`.
 *   3. Output tokens cannot be derived from a mock, so the v2 real run's mean
 *      output tokens per trial per arm is used instead.
 *
 * Every number below is traceable to those three committed files. No price is
 * projected: per-model prices are not recorded in this repository, and ADR-005
 * forbids unmeasured numeric claims.
 */

export interface BenchmarkArmCalibration {
  readonly arm: BenchmarkArm;
  readonly baselineDryRunInputTokens: number;
  readonly baselineMeanOutputTokensPerTrial: number;
  readonly baselineRealInputTokens: number;
  readonly baselineTrialCount: number;
  readonly inputTokenRatio: number;
}

export interface BenchmarkCostProjection {
  readonly arm: BenchmarkArm;
  readonly dryRunInputTokens: number;
  readonly model: string;
  readonly projectedInputTokens: number;
  readonly projectedOutputTokens: number;
  readonly projectedTotalTokens: number;
  readonly trialCount: number;
}

export interface BenchmarkCostEstimate {
  readonly calibrations: readonly BenchmarkArmCalibration[];
  readonly projectedTotalTokens: number;
  readonly projectedTrialCount: number;
  readonly projections: readonly BenchmarkCostProjection[];
  readonly registeredTrialCount: number;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function estimateBenchmarkCost(input: {
  baselineDryRun: BenchmarkReportV1;
  baselineReal: BenchmarkReportV1;
  dryRun: BenchmarkReportV2;
}): BenchmarkCostEstimate {
  const calibrations = input.dryRun.protocol.arms.map((arm) => {
    const dryRunTrials = input.baselineDryRun.trials.filter(
      (trial) => trial.arm === arm,
    );
    const realTrials = input.baselineReal.trials.filter(
      (trial) => trial.arm === arm,
    );
    const baselineDryRunInputTokens = sum(
      dryRunTrials.map(({ inputTokens }) => inputTokens),
    );
    const baselineRealInputTokens = sum(
      realTrials.map(({ inputTokens }) => inputTokens),
    );
    return {
      arm,
      baselineDryRunInputTokens,
      baselineMeanOutputTokensPerTrial:
        realTrials.length === 0
          ? 0
          : sum(realTrials.map(({ outputTokens }) => outputTokens)) /
            realTrials.length,
      baselineRealInputTokens,
      baselineTrialCount: realTrials.length,
      inputTokenRatio:
        baselineDryRunInputTokens === 0
          ? 0
          : baselineRealInputTokens / baselineDryRunInputTokens,
    };
  });

  const projections = input.dryRun.run.models.flatMap((model) =>
    input.dryRun.protocol.arms.map((arm) => {
      const trials = input.dryRun.trials.filter(
        (trial) => trial.arm === arm && trial.model === model.id,
      );
      const calibration = calibrations.find(
        (candidate) => candidate.arm === arm,
      )!;
      const dryRunInputTokens = sum(
        trials.map(({ inputTokens }) => inputTokens),
      );
      const projectedInputTokens = Math.round(
        dryRunInputTokens * calibration.inputTokenRatio,
      );
      const projectedOutputTokens = Math.round(
        trials.length * calibration.baselineMeanOutputTokensPerTrial,
      );
      return {
        arm,
        dryRunInputTokens,
        model: model.id,
        projectedInputTokens,
        projectedOutputTokens,
        projectedTotalTokens: projectedInputTokens + projectedOutputTokens,
        trialCount: trials.length,
      };
    }),
  );

  return {
    calibrations,
    projectedTotalTokens: sum(
      projections.map(({ projectedTotalTokens }) => projectedTotalTokens),
    ),
    projectedTrialCount: sum(projections.map(({ trialCount }) => trialCount)),
    projections,
    registeredTrialCount: input.dryRun.protocol.registeredTrialCount,
  };
}

export function renderBenchmarkCostEstimate(
  estimate: BenchmarkCostEstimate,
  dryRun: BenchmarkReportV2,
): string {
  const perModel = dryRun.run.models.map((model) => {
    const rows = estimate.projections.filter(
      (projection) => projection.model === model.id,
    );
    return {
      id: model.id,
      provider: model.provider,
      tokens: sum(rows.map(({ projectedTotalTokens }) => projectedTotalTokens)),
      trials: sum(rows.map(({ trialCount }) => trialCount)),
    };
  });
  return [
    "# Projected cost of the real v3 benchmark run",
    "",
    "Derived, not guessed. Inputs: this v3 dry run (exact context characters per arm),",
    "`results.dry-run.json` + `results.real.json` (the committed v2 pair, same harness).",
    "",
    "## Step 1 — per-arm calibration from the committed v2 pair",
    "",
    "`ratio = real input tokens / dry-run input tokens` over the same 108 v2 trials.",
    "",
    "| Arm | v2 trials | v2 dry-run input | v2 real input | ratio | v2 real mean output/trial |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...estimate.calibrations.map(
      (calibration) =>
        `| ${calibration.arm} | ${calibration.baselineTrialCount} | ${calibration.baselineDryRunInputTokens} | ${calibration.baselineRealInputTokens} | ${calibration.inputTokenRatio.toFixed(4)} | ${calibration.baselineMeanOutputTokensPerTrial.toFixed(1)} |`,
    ),
    "",
    "## Step 2 — projection per model and arm",
    "",
    "`projected input = v3 dry-run input × ratio`, `projected output = trials × v2 mean output/trial`.",
    "",
    "| Model | Arm | Trials | v3 dry-run input | Projected input | Projected output | Projected total |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...estimate.projections.map(
      (projection) =>
        `| ${projection.model} | ${projection.arm} | ${projection.trialCount} | ${projection.dryRunInputTokens} | ${projection.projectedInputTokens} | ${projection.projectedOutputTokens} | ${projection.projectedTotalTokens} |`,
    ),
    "",
    "## Step 3 — totals",
    "",
    "| Model | Provider | Trials | Projected tokens |",
    "| --- | --- | ---: | ---: |",
    ...perModel.map(
      (model) =>
        `| ${model.id} | ${model.provider} | ${model.trials} | ${model.tokens} |`,
    ),
    `| **all** | — | **${estimate.projectedTrialCount}** | **${estimate.projectedTotalTokens}** |`,
    "",
    `Registered protocol: ${dryRun.protocol.taskCount} tasks × ${dryRun.protocol.trialsPerArm} repeats × ${dryRun.protocol.arms.length} arms × ${dryRun.run.models.length} models = ${estimate.registeredTrialCount} trials.`,
    "",
    "## Assumptions and their limits",
    "",
    "- The calibration ratio was measured on OpenAI `gpt-5-nano` only. The Anthropic projection reuses it, so Anthropic token counts are an order-of-magnitude estimate, not a measurement; the real run reports each provider's own usage.",
    "- Output tokens are projected from the v2 real run's per-arm mean. A model that writes longer files or answers will exceed it.",
    "- Retries (HTTP 429/5xx) re-send input; the projection counts one attempt per trial.",
    "- No monetary cost is projected: per-model prices are not recorded in this repository, and unmeasured numeric claims are forbidden (ADR-005, WORK_SPEC §3-8).",
    "",
  ].join("\n");
}
