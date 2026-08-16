import type {
  BenchmarkHypothesis,
  BenchmarkReport,
  BenchmarkReportV1,
  BenchmarkReportV2,
  BenchmarkTrialResult,
  BenchmarkTrialResultV1,
} from "./types";

function percent(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(2)}%`;
}

function percentagePoints(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(2)}pp`;
}

function cell(value: unknown): string {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function taskArmRows(
  trials: readonly (BenchmarkTrialResult | BenchmarkTrialResultV1)[],
): string[] {
  const groups = new Map<string, (BenchmarkTrialResult | BenchmarkTrialResultV1)[]>();
  for (const trial of trials) {
    const key = `${trial.taskId}\u0000${trial.arm}`;
    const existing = groups.get(key) ?? [];
    existing.push(trial);
    groups.set(key, existing);
  }
  return [...groups.values()].map((group) => {
    const first = group[0]!;
    return `| ${cell(first.taskId)} | ${first.arm} | ${mean(group.map((trial) => trial.grade?.score ?? 0)).toFixed(3)} | ${group.reduce((sum, trial) => sum + trial.inputTokens + trial.outputTokens, 0)} | ${group.reduce((sum, trial) => sum + trial.toolCalls, 0)} | ${group.reduce((sum, trial) => sum + trial.wallTimeMs, 0)} | ${group.filter(({ status }) => status === "failed").length} |`;
  });
}

function aggregateRowsV1(report: BenchmarkReportV1): string[] {
  return report.aggregates.map(
    (aggregate) =>
      `| ${aggregate.arm} | ${aggregate.trialCount} | ${aggregate.meanScore.toFixed(3)} | ${percent(aggregate.passRate * 100)} | ${aggregate.totalInputTokens} | ${aggregate.totalOutputTokens} | ${aggregate.totalTokens} | ${aggregate.totalToolCalls} | ${aggregate.totalWallTimeMs} | ${aggregate.failedTrials} |`,
  );
}

function trialRowsV1(
  trials: readonly (BenchmarkTrialResult | BenchmarkTrialResultV1)[],
): string[] {
  return trials.map(
    (trial) =>
      `| ${cell(trial.taskId)} | ${trial.arm} | ${trial.trial} | ${trial.status} | ${trial.grade?.score.toFixed(3) ?? "0.000"} | ${trial.inputTokens} | ${trial.outputTokens} | ${trial.inputTokens + trial.outputTokens} | ${trial.toolCalls} | ${trial.wallTimeMs} | ${cell(trial.error ?? "")} |`,
  );
}

/**
 * Frozen schema-1 rendering. The published release markdown must keep matching
 * this function byte-for-byte, so it must never be edited.
 */
function renderBenchmarkMarkdownV1(report: BenchmarkReportV1): string {
  const jsonLink =
    report.run.mode === "real"
      ? "./results.real.json"
      : "./results.dry-run.json";
  const hypothesisPassed =
    report.hypothesis.accuracyNonInferior && report.hypothesis.tokenTargetMet;
  return [
    "# Data Brain efficacy benchmark",
    "",
    `Full deterministic trial data: [${jsonLink}](${jsonLink})`,
    "",
    "## Run contract",
    "",
    `- Mode: \`${report.run.mode}\``,
    `- Model/version: \`${report.run.model}\``,
    `- Generated: \`${report.run.generatedAt}\``,
    `- Manifest SHA-256: \`${report.run.manifestDigest}\``,
    `- Token accounting: ${report.run.tokenizerAssumption}`,
    `- Protocol: ${report.protocol.taskCount} pre-registered tasks × ${report.protocol.trialsPerArm} trials × ${report.protocol.arms.length} arms = ${report.protocol.expectedTrialCount} trials.`,
    "- Prompt and model are identical across arms. Only repository-context retrieval differs.",
    "- Failed trials remain in denominators with score 0 and their recorded token counts.",
    "",
    "## Hypothesis gate",
    "",
    `- Accuracy delta, Data Brain vs checkout: ${percentagePoints(report.hypothesis.accuracyDeltaPercentagePoints)} (non-inferiority margin: -5pp; improvement goal: +5pp).`,
    `- Token reduction, Data Brain vs checkout: ${percent(report.hypothesis.tokenReductionPercent)} (target: 30%).`,
    `- Result: **${hypothesisPassed ? "MET" : "NOT MET"}**.`,
    ...(hypothesisPassed
      ? []
      : [
          "- Iteration plan: inspect failed/low-score task rows, tighten evidence ranking/context-pack selection, then rerun the unchanged pre-registered manifest. Product claims remain limited to these measured results.",
        ]),
    "",
    "## Arm totals",
    "",
    "| Arm | Trials | Mean score | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...aggregateRowsV1(report),
    "",
    "## Task × arm totals",
    "",
    "| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...taskArmRows(report.trials),
    "",
    "## Every trial",
    "",
    "| Task | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...trialRowsV1(report.trials),
    "",
  ].join("\n");
}

export function benchmarkGateMet(hypothesis: BenchmarkHypothesis): boolean {
  return hypothesis.accuracyNonInferior && hypothesis.tokenTargetMet;
}

function interval(lower: number | null, upper: number | null): string {
  return lower === null || upper === null
    ? "n/a"
    : `[${lower.toFixed(2)}, ${upper.toFixed(2)}]`;
}

function hypothesisRows(report: BenchmarkReportV2): string[] {
  return report.hypotheses.map(
    (hypothesis) =>
      `| ${hypothesis.model ?? "all models (pooled)"} | ${hypothesis.pairedUnitCount} | ${percentagePoints(hypothesis.accuracyDeltaPercentagePoints)} | ${interval(hypothesis.accuracyDeltaCiLowerPercentagePoints, hypothesis.accuracyDeltaCiUpperPercentagePoints)} | ${percent(hypothesis.tokenReductionPercent)} | ${interval(hypothesis.tokenReductionCiLowerPercent, hypothesis.tokenReductionCiUpperPercent)} | ${hypothesis.accuracyNonInferior ? "yes" : "no"} | ${hypothesis.accuracyImprovementGoalMet ? "yes" : "no"} | ${hypothesis.tokenTargetMet ? "yes" : "no"} | ${benchmarkGateMet(hypothesis) ? "MET" : "NOT MET"} |`,
  );
}

function aggregateRowsV2(report: BenchmarkReportV2): string[] {
  return report.aggregates.map(
    (aggregate) =>
      `| ${aggregate.model ?? "all models (pooled)"} | ${aggregate.arm} | ${aggregate.trialCount} | ${aggregate.meanScore.toFixed(3)} | ${interval(aggregate.meanScoreCiLower, aggregate.meanScoreCiUpper)} | ${percent(aggregate.passRate * 100)} | ${aggregate.totalInputTokens} | ${aggregate.totalOutputTokens} | ${aggregate.totalTokens} | ${aggregate.totalToolCalls} | ${aggregate.totalWallTimeMs} | ${aggregate.failedTrials} |`,
  );
}

function modelRows(report: BenchmarkReportV2): string[] {
  return report.run.models.map((model) => {
    const trials = report.trials.filter(
      (trial) => trial.model === model.id,
    ).length;
    return `| ${cell(model.id)} | ${model.provider} | ${model.status} | ${trials} | ${cell(model.reason ?? "")} |`;
  });
}

function trialRowsV2(report: BenchmarkReportV2): string[] {
  return report.trials.map(
    (trial) =>
      `| ${cell(trial.taskId)} | ${cell(trial.model)} | ${trial.arm} | ${trial.trial} | ${trial.status} | ${trial.grade?.score.toFixed(3) ?? "0.000"} | ${trial.inputTokens} | ${trial.outputTokens} | ${trial.inputTokens + trial.outputTokens} | ${trial.toolCalls} | ${trial.wallTimeMs} | ${cell(trial.error ?? "")} |`,
  );
}

function renderBenchmarkMarkdownV2(report: BenchmarkReportV2): string {
  const jsonLink = `./${report.run.resultsBasename}.json`;
  const pooled = report.hypotheses.find(({ model }) => model === null)!;
  const gateMet = benchmarkGateMet(pooled);
  const skipped = report.run.models.filter(
    ({ status }) => status === "skipped",
  );
  return [
    "# Data Brain efficacy benchmark",
    "",
    `Full deterministic trial data: [${jsonLink}](${jsonLink})`,
    "",
    "## Run contract",
    "",
    `- Mode: \`${report.run.mode}\``,
    `- Schema version: \`${report.schemaVersion}\``,
    `- Generated: \`${report.run.generatedAt}\``,
    `- Manifest SHA-256: \`${report.run.manifestDigest}\``,
    `- Token accounting: ${report.run.tokenizerAssumption}`,
    `- Confidence method: ${report.run.confidenceMethod}`,
    `- Protocol: ${report.protocol.taskCount} pre-registered tasks (${report.protocol.realisticTaskCount} realistic-repository, ${report.protocol.fixtureTaskCount} fixture) × ${report.protocol.trialsPerArm} trials × ${report.protocol.arms.length} arms × ${report.run.models.length} models = ${report.protocol.registeredTrialCount} registered trials; ${report.protocol.expectedTrialCount} executed.`,
    `- Overrides: ${report.run.overrides.length === 0 ? "none (full pre-registered protocol)" : report.run.overrides.join("; ")}`,
    ...(skipped.length === 0
      ? []
      : skipped.map(
          (model) =>
            `- Skipped model: \`${model.id}\` (${model.provider}) — ${model.reason}`,
        )),
    "- Prompt and retrieved context are identical across models for a given task and arm. Only repository-context retrieval differs between arms.",
    "- Failed trials remain in denominators with score 0 and their recorded token counts.",
    "",
    "## Model coverage",
    "",
    "| Model | Provider | Status | Trials | Skip reason |",
    "| --- | --- | --- | ---: | --- |",
    ...modelRows(report),
    "",
    "## Hypothesis gate",
    "",
    "Gate is evaluated against the interval, not the point estimate: non-inferiority holds when the accuracy-delta lower bound clears the -5pp margin, the improvement goal holds when it clears +5pp, and the token target holds when the token-reduction lower bound clears 30%.",
    "",
    "| Scope | Paired units | Accuracy Δ | Accuracy 95% CI | Token reduction | Token 95% CI | Non-inferior | +5pp goal | Token target | Gate |",
    "| --- | ---: | ---: | --- | ---: | --- | --- | --- | --- | --- |",
    ...hypothesisRows(report),
    "",
    `- Pooled result: **${gateMet ? "MET" : "NOT MET"}**.`,
    ...(gateMet
      ? []
      : [
          "- Iteration plan: inspect failed/low-score task rows, tighten evidence ranking/context-pack selection, then rerun the unchanged pre-registered manifest. Product claims remain limited to these measured results.",
        ]),
    "",
    "## Arm totals",
    "",
    "| Model | Arm | Trials | Mean score | Mean 95% CI | Pass rate | Input tokens | Output tokens | Total tokens | Tool calls | Wall ms | Failed |",
    "| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...aggregateRowsV2(report),
    "",
    "## Task × arm totals",
    "",
    "| Task | Arm | Mean score | Total tokens | Tool calls | Wall ms | Failed |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...taskArmRows(report.trials),
    "",
    "## Every trial",
    "",
    "| Task | Model | Arm | Trial | Status | Score | Input | Output | Total | Tools | Wall ms | Error |",
    "| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...trialRowsV2(report),
    "",
  ].join("\n");
}

export function renderBenchmarkMarkdown(report: BenchmarkReport): string {
  return report.schemaVersion === 1
    ? renderBenchmarkMarkdownV1(report)
    : renderBenchmarkMarkdownV2(report);
}

export function benchmarkJson(report: BenchmarkReport): string {
  const normalized = {
    ...report,
    trials: report.trials.map((trial) => ({
      ...trial,
      grade: trial.grade
        ? {
            ...trial.grade,
            summary: trial.grade.summary.split(/\r?\n/, 1)[0] ?? "",
          }
        : null,
    })),
  };
  return `${JSON.stringify(normalized, null, 2)}\n`;
}
