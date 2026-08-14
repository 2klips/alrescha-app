import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadBenchmarkManifest } from "./databrain-benchmark/manifest";
import { renderBenchmarkMarkdown } from "./databrain-benchmark/report";
import type {
  BenchmarkAggregate,
  BenchmarkArm,
  BenchmarkReport,
  BenchmarkTrialResult,
} from "./databrain-benchmark/types";

export type BenchmarkAuditFindingKind =
  | "claim-accuracy"
  | "claim-traceability"
  | "measurement-integrity"
  | "publication-integrity"
  | "run-contract"
  | "trial-coverage"
  | "trial-integrity";

export interface BenchmarkAuditFinding {
  readonly kind: BenchmarkAuditFindingKind;
  readonly message: string;
}

export interface BenchmarkAudit {
  readonly accuracyDeltaPercentagePoints: number | null;
  readonly actualTrialCount: number;
  readonly claimFileCount: number;
  readonly expectedTrialCount: number;
  readonly findings: readonly BenchmarkAuditFinding[];
  readonly model: string;
  readonly status: "fail" | "pass";
  readonly tokenReductionPercent: number | null;
}

const CLAIM_SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".md", ".ts", ".tsx"]);
const EXCLUDED_SEGMENTS = new Set([
  ".next",
  "coverage",
  "dist",
  "node_modules",
]);
const EFFICIENCY_CLAIM =
  /\b(?:higher|better|improv(?:e[sd]?|ement))\s+(?:graded\s+)?accuracy\b|\b(?:fewer|less)\s+tokens?\b|\btokenReductionPercent\b[\s\S]{0,180}?%\s*(?:lower|less|fewer)/i;
const BENCHMARK_LINK = /benchmarks\/databrain\/results\.real\.md/i;
const TOKEN_SAVINGS_CLAIMS = [
  /\b(\d{1,3}(?:\.\d+)?)%\s*(?:(?:fewer|less|lower)\s+tokens?|token(?:s|\s+(?:reduction|saving)s?))\b/gi,
  /\btokens?\s+(?:reduc(?:ed|tion)|sav(?:ed|ings?)|lower)\s+(?:by\s+)?(\d{1,3}(?:\.\d+)?)%\b/gi,
] as const;
const ACCURACY_CLAIMS = [
  /\b(\d{1,3}(?:\.\d+)?)\s*(?:pp|percentage points?)\s*(?:higher|better|improv(?:ed|ement))\s+(?:graded\s+)?accuracy\b/gi,
  /\baccuracy\s+(?:increase|gain|improvement)\s+(?:of|by\s+)?(\d{1,3}(?:\.\d+)?)\s*(?:pp|percentage points?)\b/gi,
] as const;

function trialKey(taskId: string, arm: BenchmarkArm, trial: number): string {
  return `${taskId}\u0000${arm}\u0000${trial}`;
}

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

async function collectClaimFiles(directory: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const files: string[] = [];

  for (const entry of entries) {
    if (EXCLUDED_SEGMENTS.has(entry.name)) {
      continue;
    }

    const absolute = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectClaimFiles(absolute)));
    } else if (
      entry.isFile() &&
      CLAIM_SOURCE_EXTENSIONS.has(extname(entry.name))
    ) {
      files.push(absolute);
    }
  }

  return files.sort();
}

export async function verifyBenchmarkRelease(
  rootDir: string,
): Promise<BenchmarkAudit> {
  const root = resolve(rootDir);
  const benchmarkDirectory = resolve(root, "benchmarks/databrain");
  const manifest = await loadBenchmarkManifest(
    resolve(benchmarkDirectory, "tasks.json"),
  );
  const [reportSource, markdown] = await Promise.all([
    readFile(resolve(benchmarkDirectory, "results.real.json"), "utf8"),
    readFile(resolve(benchmarkDirectory, "results.real.md"), "utf8"),
  ]);
  const report = JSON.parse(reportSource) as BenchmarkReport;
  const actualCounts = new Map<string, number>();

  for (const trial of report.trials) {
    const key = trialKey(trial.taskId, trial.arm, trial.trial);
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
  }

  const findings: BenchmarkAuditFinding[] = [];
  const expectedTrialCount =
    manifest.tasks.length * manifest.arms.length * manifest.trialsPerArm;
  const manifestDigest = createHash("sha256")
    .update(JSON.stringify(manifest), "utf8")
    .digest("hex");
  const runContractChecks: ReadonlyArray<readonly [boolean, string]> = [
    [
      report.run.mode === "real",
      `Run mode must be real; found ${report.run.mode}.`,
    ],
    [
      report.run.model === manifest.model,
      `Run model must match manifest model ${manifest.model}; found ${report.run.model}.`,
    ],
    [
      report.run.manifestDigest === manifestDigest,
      "Run manifest digest does not match the pre-registered task manifest.",
    ],
    [
      report.protocol.taskCount === manifest.tasks.length,
      `Protocol task count must be ${manifest.tasks.length}; found ${report.protocol.taskCount}.`,
    ],
    [
      report.protocol.trialsPerArm === manifest.trialsPerArm,
      `Protocol trials per arm must be ${manifest.trialsPerArm}; found ${report.protocol.trialsPerArm}.`,
    ],
    [
      JSON.stringify(report.protocol.arms) === JSON.stringify(manifest.arms),
      "Protocol arms do not match the pre-registered manifest.",
    ],
    [
      report.protocol.expectedTrialCount === expectedTrialCount,
      `Protocol expected trial count must be ${expectedTrialCount}; found ${report.protocol.expectedTrialCount}.`,
    ],
  ];

  for (const [passed, message] of runContractChecks) {
    if (!passed) {
      findings.push({ kind: "run-contract", message });
    }
  }

  for (const task of manifest.tasks) {
    for (const arm of manifest.arms) {
      for (let trial = 1; trial <= manifest.trialsPerArm; trial += 1) {
        const key = trialKey(task.id, arm, trial);
        const count = actualCounts.get(key) ?? 0;

        if (count !== 1) {
          findings.push({
            kind: "trial-coverage",
            message: `${task.id}/${arm}/${trial} must appear exactly once; found ${count}.`,
          });
        }

        actualCounts.delete(key);
      }
    }
  }

  for (const [key, count] of actualCounts) {
    findings.push({
      kind: "trial-coverage",
      message: `Unregistered trial ${key.replaceAll("\u0000", "/")} appears ${count} time(s).`,
    });
  }

  const promptDigests = new Map<string, Set<string>>();

  for (const trial of report.trials) {
    const label = `${trial.taskId}/${trial.arm}/${trial.trial}`;
    const metrics = [
      trial.inputTokens,
      trial.outputTokens,
      trial.toolCalls,
      trial.wallTimeMs,
    ];

    if (trial.model !== manifest.model) {
      findings.push({
        kind: "trial-integrity",
        message: `${label} used ${trial.model}; expected ${manifest.model}.`,
      });
    }

    if (!metrics.every((value) => Number.isInteger(value) && value >= 0)) {
      findings.push({
        kind: "trial-integrity",
        message: `${label} contains an invalid token, tool-call, or wall-time measurement.`,
      });
    }

    if (!/^[a-f0-9]{64}$/.test(trial.promptDigest)) {
      findings.push({
        kind: "trial-integrity",
        message: `${label} has an invalid prompt digest.`,
      });
    }

    if (
      trial.status === "completed" &&
      (trial.error !== null ||
        trial.grade === null ||
        trial.responseId === null)
    ) {
      findings.push({
        kind: "trial-integrity",
        message: `${label} has an inconsistent completed-trial record.`,
      });
    }

    if (
      trial.status === "failed" &&
      (trial.error === null || trial.grade !== null)
    ) {
      findings.push({
        kind: "trial-integrity",
        message: `${label} has an inconsistent failed-trial record.`,
      });
    }

    const digestKey = `${trial.taskId}\u0000${trial.trial}`;
    const digests = promptDigests.get(digestKey) ?? new Set<string>();
    digests.add(trial.promptDigest);
    promptDigests.set(digestKey, digests);
  }

  for (const [key, digests] of promptDigests) {
    if (digests.size !== 1) {
      findings.push({
        kind: "trial-integrity",
        message: `${key.replaceAll("\u0000", "/")} used different prompts across arms.`,
      });
    }
  }

  const expectedAggregates = manifest.arms.map((arm) =>
    aggregateArm(arm, report.trials),
  );

  if (
    JSON.stringify(report.aggregates) !== JSON.stringify(expectedAggregates)
  ) {
    findings.push({
      kind: "measurement-integrity",
      message:
        "Published arm aggregates do not match values recomputed from raw trials.",
    });
  }

  const baseline = expectedAggregates.find(({ arm }) => arm === "checkout")!;
  const dataBrain = expectedAggregates.find(({ arm }) => arm === "data-brain")!;
  const accuracyDeltaPercentagePoints = round(
    (dataBrain.meanScore - baseline.meanScore) * 100,
  );
  const tokenReductionPercent =
    baseline.totalTokens === 0
      ? null
      : round((1 - dataBrain.totalTokens / baseline.totalTokens) * 100);
  const expectedHypothesis: BenchmarkReport["hypothesis"] = {
    accuracyDeltaPercentagePoints,
    accuracyNonInferior: accuracyDeltaPercentagePoints >= -5,
    baselineArm: "checkout",
    dataBrainArm: "data-brain",
    targetTokenReductionPercent: 30,
    tokenReductionPercent,
    tokenTargetMet:
      tokenReductionPercent !== null && tokenReductionPercent >= 30,
  };

  if (
    JSON.stringify(report.hypothesis) !== JSON.stringify(expectedHypothesis)
  ) {
    findings.push({
      kind: "measurement-integrity",
      message:
        "Published hypothesis result does not match raw-trial measurements.",
    });
  }

  const hypothesisPassed =
    report.hypothesis.accuracyNonInferior && report.hypothesis.tokenTargetMet;
  const publicationChecks: ReadonlyArray<readonly [boolean, string]> = [
    [
      /usage\.input_tokens.*usage\.output_tokens.*authoritative/i.test(
        report.run.tokenizerAssumption,
      ),
      "Real report must state authoritative input/output token accounting assumptions.",
    ],
    [
      markdown.includes("[./results.real.json](./results.real.json)"),
      "Markdown must link raw JSON.",
    ],
    [
      markdown.includes("## Arm totals"),
      "Markdown must contain the per-arm table.",
    ],
    [
      markdown.includes("## Task × arm totals"),
      "Markdown must contain the per-task/arm table.",
    ],
    [
      markdown.includes("## Every trial"),
      "Markdown must contain every trial table.",
    ],
    [
      hypothesisPassed || markdown.includes("Iteration plan:"),
      "A missed hypothesis gate requires a documented iteration plan.",
    ],
    [
      markdown === renderBenchmarkMarkdown(report),
      "Markdown publication does not exactly match the deterministic JSON rendering.",
    ],
  ];

  for (const [passed, message] of publicationChecks) {
    if (!passed) {
      findings.push({ kind: "publication-integrity", message });
    }
  }

  const claimFiles = await collectClaimFiles(resolve(root, "apps"));

  try {
    await readFile(resolve(root, "README.md"), "utf8");
    claimFiles.push(resolve(root, "README.md"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  for (const absolute of claimFiles) {
    const source = await readFile(absolute, "utf8");
    const file = relative(root, absolute).replaceAll("\\", "/");

    if (EFFICIENCY_CLAIM.test(source) && !BENCHMARK_LINK.test(source)) {
      findings.push({
        kind: "claim-traceability",
        message: `${file} contains an efficiency claim without a committed real-report link.`,
      });
    }

    for (const pattern of TOKEN_SAVINGS_CLAIMS) {
      pattern.lastIndex = 0;

      for (const match of source.matchAll(pattern)) {
        const claimed = Number(match[1]);
        const measured = report.hypothesis.tokenReductionPercent;

        if (measured === null || claimed > measured) {
          findings.push({
            kind: "claim-accuracy",
            message: `${file} claims ${claimed}% token savings; measured result is ${measured ?? "unavailable"}%.`,
          });
        }
      }
    }

    for (const pattern of ACCURACY_CLAIMS) {
      pattern.lastIndex = 0;

      for (const match of source.matchAll(pattern)) {
        const claimed = Number(match[1]);
        const measured = report.hypothesis.accuracyDeltaPercentagePoints;

        if (measured === null || claimed > measured) {
          findings.push({
            kind: "claim-accuracy",
            message: `${file} claims ${claimed}pp accuracy improvement; measured result is ${measured ?? "unavailable"}pp.`,
          });
        }
      }
    }
  }

  return {
    accuracyDeltaPercentagePoints:
      report.hypothesis.accuracyDeltaPercentagePoints,
    actualTrialCount: report.trials.length,
    claimFileCount: claimFiles.length,
    expectedTrialCount,
    findings,
    model: report.run.model,
    status: findings.length === 0 ? "pass" : "fail",
    tokenReductionPercent: report.hypothesis.tokenReductionPercent,
  };
}

async function main(): Promise<void> {
  const audit = await verifyBenchmarkRelease(process.cwd());

  if (audit.status === "pass") {
    console.log(
      `PASS efficacy benchmark: ${audit.actualTrialCount}/${audit.expectedTrialCount} trials, ${audit.accuracyDeltaPercentagePoints}pp accuracy, ${audit.tokenReductionPercent}% token reduction, ${audit.claimFileCount} claim files`,
    );
    return;
  }

  for (const finding of audit.findings) {
    console.error(`[${finding.kind}] ${finding.message}`);
  }

  console.error(`FAIL efficacy benchmark: ${audit.findings.length} finding(s)`);
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
