import type { BenchmarkReport, BenchmarkTrialResult } from "./types";

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

function taskArmRows(trials: readonly BenchmarkTrialResult[]): string[] {
  const groups = new Map<string, BenchmarkTrialResult[]>();
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

function aggregateRows(report: BenchmarkReport): string[] {
  return report.aggregates.map(
    (aggregate) =>
      `| ${aggregate.arm} | ${aggregate.trialCount} | ${aggregate.meanScore.toFixed(3)} | ${percent(aggregate.passRate * 100)} | ${aggregate.totalInputTokens} | ${aggregate.totalOutputTokens} | ${aggregate.totalTokens} | ${aggregate.totalToolCalls} | ${aggregate.totalWallTimeMs} | ${aggregate.failedTrials} |`,
  );
}

function trialRows(trials: readonly BenchmarkTrialResult[]): string[] {
  return trials.map(
    (trial) =>
      `| ${cell(trial.taskId)} | ${trial.arm} | ${trial.trial} | ${trial.status} | ${trial.grade?.score.toFixed(3) ?? "0.000"} | ${trial.inputTokens} | ${trial.outputTokens} | ${trial.inputTokens + trial.outputTokens} | ${trial.toolCalls} | ${trial.wallTimeMs} | ${cell(trial.error ?? "")} |`,
  );
}

export function renderBenchmarkMarkdown(report: BenchmarkReport): string {
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
    ...aggregateRows(report),
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
    ...trialRows(report.trials),
    "",
  ].join("\n");
}

export function benchmarkJson(report: BenchmarkReport): string {
  const normalized: BenchmarkReport = {
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
