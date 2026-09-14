import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateBenchmarkArm,
  evaluateBenchmarkHypothesis,
} from "./databrain-benchmark/benchmark";
import { loadBenchmarkManifest } from "./databrain-benchmark/manifest";
import { renderBenchmarkMarkdown } from "./databrain-benchmark/report";
import type {
  BenchmarkAggregateV1,
  BenchmarkArm,
  BenchmarkManifest,
  BenchmarkReport,
  BenchmarkReportV1,
  BenchmarkReportV2,
  BenchmarkTrialResultV1,
} from "./databrain-benchmark/types";
import {
  auditGraphSurfaceReleases,
  type GraphSurfaceAudit,
} from "./graph-surface-benchmark/audit";

export type BenchmarkAuditFindingKind =
  | "claim-accuracy"
  | "claim-traceability"
  | "measurement-integrity"
  | "preregistration-lock"
  | "publication-integrity"
  | "run-contract"
  | "trial-coverage"
  | "trial-integrity";

export interface BenchmarkAuditFinding {
  readonly kind: BenchmarkAuditFindingKind;
  readonly message: string;
}

export interface BenchmarkReleaseAudit {
  readonly accuracyDeltaPercentagePoints: number | null;
  readonly actualTrialCount: number;
  readonly expectedTrialCount: number;
  readonly findings: readonly BenchmarkAuditFinding[];
  readonly id: string;
  readonly model: string;
  readonly schemaVersion: 1 | 2;
  readonly tokenReductionPercent: number | null;
}

export interface BenchmarkAudit {
  readonly accuracyDeltaPercentagePoints: number | null;
  readonly actualTrialCount: number;
  readonly claimFileCount: number;
  readonly expectedTrialCount: number;
  readonly findings: readonly BenchmarkAuditFinding[];
  /**
   * The graph-surface releases (todo 25), audited by the same rules; null
   * when the repository has no `benchmarks/graph-surface` directory.
   */
  readonly graphSurface: GraphSurfaceAudit | null;
  readonly model: string;
  /** Pre-registered manifests whose real run has not been executed yet. */
  readonly pendingReleases: readonly string[];
  readonly releases: readonly BenchmarkReleaseAudit[];
  readonly status: "fail" | "pass";
  readonly tokenReductionPercent: number | null;
}

interface ReleaseSpec {
  readonly id: string;
  readonly manifestFile: string;
  readonly markdownFile: string;
  readonly reportFile: string;
  readonly required: boolean;
}

/**
 * `v2` is the published release (schema 1, frozen). `v3` is pre-registered in
 * `tasks.v3.json`; it becomes auditable the moment its real report lands.
 */
const RELEASES: readonly ReleaseSpec[] = [
  {
    id: "v2",
    manifestFile: "tasks.json",
    markdownFile: "results.real.md",
    reportFile: "results.real.json",
    required: true,
  },
  {
    id: "v3",
    manifestFile: "tasks.v3.json",
    markdownFile: "results.v3.real.md",
    reportFile: "results.v3.real.json",
    required: false,
  },
];

const CLAIM_SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".md", ".ts", ".tsx"]);
const EXCLUDED_SEGMENTS = new Set([
  ".next",
  "coverage",
  "dist",
  "node_modules",
]);
const EFFICIENCY_CLAIM =
  /\b(?:higher|better|improv(?:e[sd]?|ement))\s+(?:graded\s+)?accuracy\b|\b(?:fewer|less)\s+tokens?\b|\btokenReductionPercent\b[\s\S]{0,180}?%\s*(?:lower|less|fewer)/i;
const BENCHMARK_LINK = /benchmarks\/databrain\/results\.[a-z0-9.-]*real\.md/i;
const TOKEN_SAVINGS_CLAIMS = [
  /\b(\d{1,3}(?:\.\d+)?)%\s*(?:(?:fewer|less|lower)\s+tokens?|token(?:s|\s+(?:reduction|saving)s?))\b/gi,
  /\btokens?\s+(?:reduc(?:ed|tion)|sav(?:ed|ings?)|lower)\s+(?:by\s+)?(\d{1,3}(?:\.\d+)?)%\b/gi,
] as const;
const ACCURACY_CLAIMS = [
  /\b(\d{1,3}(?:\.\d+)?)\s*(?:pp|percentage points?)\s*(?:higher|better|improv(?:ed|ement))\s+(?:graded\s+)?accuracy\b/gi,
  /\baccuracy\s+(?:increase|gain|improvement)\s+(?:of|by\s+)?(\d{1,3}(?:\.\d+)?)\s*(?:pp|percentage points?)\b/gi,
] as const;

function trialKey(
  taskId: string,
  arm: BenchmarkArm,
  trial: number,
  model: string,
): string {
  return `${taskId}\u0000${arm}\u0000${trial}\u0000${model}`;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function aggregateArmV1(
  arm: BenchmarkArm,
  trials: readonly BenchmarkTrialResultV1[],
): BenchmarkAggregateV1 {
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

function auditTrialRecords(input: {
  executedModels: readonly string[];
  findings: BenchmarkAuditFinding[];
  providerOf: ReadonlyMap<string, string>;
  report: BenchmarkReport;
}): void {
  const promptDigests = new Map<string, Set<string>>();

  for (const trial of input.report.trials) {
    const label = `${trial.taskId}/${trial.arm}/${trial.trial}`;
    const metrics = [
      trial.inputTokens,
      trial.outputTokens,
      trial.toolCalls,
      trial.wallTimeMs,
    ];

    if (!input.executedModels.includes(trial.model)) {
      input.findings.push({
        kind: "trial-integrity",
        message: `${label} used ${trial.model}; expected one of ${input.executedModels.join(", ")}.`,
      });
    }

    if (
      input.report.schemaVersion === 2 &&
      input.providerOf.get(trial.model) !==
        (trial as BenchmarkReportV2["trials"][number]).provider
    ) {
      input.findings.push({
        kind: "trial-integrity",
        message: `${label} recorded a provider that does not match the pre-registered provider for ${trial.model}.`,
      });
    }

    if (!metrics.every((value) => Number.isInteger(value) && value >= 0)) {
      input.findings.push({
        kind: "trial-integrity",
        message: `${label} contains an invalid token, tool-call, or wall-time measurement.`,
      });
    }

    if (!/^[a-f0-9]{64}$/.test(trial.promptDigest)) {
      input.findings.push({
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
      input.findings.push({
        kind: "trial-integrity",
        message: `${label} has an inconsistent completed-trial record.`,
      });
    }

    if (
      trial.status === "failed" &&
      (trial.error === null || trial.grade !== null)
    ) {
      input.findings.push({
        kind: "trial-integrity",
        message: `${label} has an inconsistent failed-trial record.`,
      });
    }

    // Schema 1 compares prompts across arms for a given trial index; schema 2
    // additionally requires one prompt per task across every model.
    const digestKey =
      input.report.schemaVersion === 1
        ? `${trial.taskId}\u0000${trial.trial}`
        : trial.taskId;
    const digests = promptDigests.get(digestKey) ?? new Set<string>();
    digests.add(trial.promptDigest);
    promptDigests.set(digestKey, digests);
  }

  for (const [key, digests] of promptDigests) {
    if (digests.size !== 1) {
      input.findings.push({
        kind: "trial-integrity",
        message: `${key.replaceAll("\u0000", "/")} used different prompts across arms.`,
      });
    }
  }
}

function auditPublication(input: {
  findings: BenchmarkAuditFinding[];
  gateMet: boolean;
  jsonLink: string;
  markdown: string;
  report: BenchmarkReport;
}): void {
  const checks: Array<readonly [boolean, string]> = [
    [
      /usage\.input_tokens.*usage\.output_tokens.*authoritative/i.test(
        input.report.run.tokenizerAssumption,
      ),
      "Real report must state authoritative input/output token accounting assumptions.",
    ],
    [
      input.markdown.includes(`[${input.jsonLink}](${input.jsonLink})`),
      "Markdown must link raw JSON.",
    ],
    [
      input.markdown.includes("## Arm totals"),
      "Markdown must contain the per-arm table.",
    ],
    [
      input.markdown.includes("## Task × arm totals"),
      "Markdown must contain the per-task/arm table.",
    ],
    [
      input.markdown.includes("## Every trial"),
      "Markdown must contain every trial table.",
    ],
    [
      input.gateMet || input.markdown.includes("Iteration plan:"),
      "A missed hypothesis gate requires a documented iteration plan.",
    ],
    [
      input.markdown === renderBenchmarkMarkdown(input.report),
      "Markdown publication does not exactly match the deterministic JSON rendering.",
    ],
  ];

  if (input.report.schemaVersion === 2) {
    const report = input.report;
    checks.push(
      [
        report.run.confidenceMethod.trim().length > 0 &&
          input.markdown.includes(report.run.confidenceMethod),
        "Schema-2 report must state its confidence-interval method in the publication.",
      ],
      [
        input.markdown.includes("## Model coverage"),
        "Markdown must contain the per-model coverage table.",
      ],
      [
        report.run.overrides.length === 0,
        `A published release must run the full pre-registered protocol; found overrides: ${report.run.overrides.join("; ")}.`,
      ],
      [
        report.run.models
          .filter(({ status }) => status === "skipped")
          .every(
            (model) =>
              (model.reason ?? "").trim().length > 0 &&
              input.markdown.includes(`Skipped model: \`${model.id}\``),
          ),
        "Every skipped model must state its reason in the publication.",
      ],
      [
        report.hypotheses.some(({ model }) => model === null) &&
          report.run.models
            .filter(({ status }) => status === "executed")
            .every((model) =>
              report.hypotheses.some(
                (hypothesis) => hypothesis.model === model.id,
              ),
            ),
        "Schema-2 report must publish a pooled hypothesis and one per executed model.",
      ],
    );
  }

  for (const [passed, message] of checks) {
    if (!passed) {
      input.findings.push({ kind: "publication-integrity", message });
    }
  }
}

function auditV1(input: {
  findings: BenchmarkAuditFinding[];
  markdown: string;
  report: BenchmarkReportV1;
}): {
  accuracyDeltaPercentagePoints: number | null;
  tokenReductionPercent: number | null;
} {
  const expectedAggregates = input.report.protocol.arms.map((arm) =>
    aggregateArmV1(arm, input.report.trials),
  );

  if (
    JSON.stringify(input.report.aggregates) !==
    JSON.stringify(expectedAggregates)
  ) {
    input.findings.push({
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
  const expectedHypothesis: BenchmarkReportV1["hypothesis"] = {
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
    JSON.stringify(input.report.hypothesis) !==
    JSON.stringify(expectedHypothesis)
  ) {
    input.findings.push({
      kind: "measurement-integrity",
      message:
        "Published hypothesis result does not match raw-trial measurements.",
    });
  }

  auditPublication({
    findings: input.findings,
    gateMet:
      input.report.hypothesis.accuracyNonInferior &&
      input.report.hypothesis.tokenTargetMet,
    jsonLink: "./results.real.json",
    markdown: input.markdown,
    report: input.report,
  });

  return {
    accuracyDeltaPercentagePoints:
      input.report.hypothesis.accuracyDeltaPercentagePoints,
    tokenReductionPercent: input.report.hypothesis.tokenReductionPercent,
  };
}

function auditV2(input: {
  executedModels: readonly string[];
  findings: BenchmarkAuditFinding[];
  markdown: string;
  report: BenchmarkReportV2;
}): {
  accuracyDeltaPercentagePoints: number | null;
  tokenReductionPercent: number | null;
} {
  // Aggregation and interval estimation are shared with the harness on
  // purpose: the bootstrap is seeded, so recomputing it here detects any
  // edit to the published numbers, while a second hand-rolled implementation
  // of the same seeded estimator could only drift out of sync.
  const expectedAggregates = [
    ...input.report.protocol.arms.map((arm) =>
      aggregateBenchmarkArm(input.report.trials, arm, null),
    ),
    ...input.executedModels.flatMap((model) =>
      input.report.protocol.arms.map((arm) =>
        aggregateBenchmarkArm(input.report.trials, arm, model),
      ),
    ),
  ];

  if (
    JSON.stringify(input.report.aggregates) !==
    JSON.stringify(expectedAggregates)
  ) {
    input.findings.push({
      kind: "measurement-integrity",
      message:
        "Published arm aggregates do not match values recomputed from raw trials.",
    });
  }

  const expectedHypotheses = [
    evaluateBenchmarkHypothesis(input.report.trials, expectedAggregates, null),
    ...input.executedModels.map((model) =>
      evaluateBenchmarkHypothesis(
        input.report.trials,
        expectedAggregates,
        model,
      ),
    ),
  ];

  if (
    JSON.stringify(input.report.hypotheses) !==
    JSON.stringify(expectedHypotheses)
  ) {
    input.findings.push({
      kind: "measurement-integrity",
      message:
        "Published hypothesis result does not match raw-trial measurements.",
    });
  }

  const pooled = expectedHypotheses[0]!;

  auditPublication({
    findings: input.findings,
    gateMet: pooled.accuracyNonInferior && pooled.tokenTargetMet,
    jsonLink: `./${input.report.run.resultsBasename}.json`,
    markdown: input.markdown,
    report: input.report,
  });

  return {
    accuracyDeltaPercentagePoints:
      input.report.hypotheses.find(({ model }) => model === null)
        ?.accuracyDeltaPercentagePoints ?? null,
    tokenReductionPercent:
      input.report.hypotheses.find(({ model }) => model === null)
        ?.tokenReductionPercent ?? null,
  };
}

function registeredModels(
  manifest: BenchmarkManifest,
): Array<{ id: string; provider: string }> {
  return manifest.schemaVersion === 1
    ? [{ id: manifest.model, provider: "openai" }]
    : manifest.models.map((model) => ({ ...model }));
}

async function auditRelease(
  benchmarkDirectory: string,
  spec: ReleaseSpec,
): Promise<BenchmarkReleaseAudit> {
  const manifest = await loadBenchmarkManifest(
    resolve(benchmarkDirectory, spec.manifestFile),
  );
  const [reportSource, markdown] = await Promise.all([
    readFile(resolve(benchmarkDirectory, spec.reportFile), "utf8"),
    readFile(resolve(benchmarkDirectory, spec.markdownFile), "utf8"),
  ]);
  const report = JSON.parse(reportSource) as BenchmarkReport;
  const findings: BenchmarkAuditFinding[] = [];
  const models = registeredModels(manifest);
  const providerOf = new Map(
    models.map((model) => [model.id, model.provider] as const),
  );
  const executedModels =
    report.schemaVersion === 1
      ? [report.run.model]
      : report.run.models
          .filter(({ status }) => status === "executed")
          .map(({ id }) => id);
  const manifestDigest = createHash("sha256")
    .update(JSON.stringify(manifest), "utf8")
    .digest("hex");
  const expectedTrialCount =
    manifest.tasks.length *
    manifest.arms.length *
    manifest.trialsPerArm *
    executedModels.length;
  const registeredTrialCount =
    manifest.tasks.length *
    manifest.arms.length *
    manifest.trialsPerArm *
    models.length;

  const runContractChecks: Array<readonly [boolean, string]> = [
    [
      report.schemaVersion === manifest.schemaVersion,
      `Report schema ${report.schemaVersion} does not match manifest schema ${manifest.schemaVersion}.`,
    ],
    [
      report.run.mode === "real",
      `Run mode must be real; found ${report.run.mode}.`,
    ],
    [
      executedModels.length > 0 &&
        executedModels.every((model) =>
          models.some((registered) => registered.id === model),
        ),
      "Executed models must all be pre-registered in the manifest.",
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

  if (report.schemaVersion === 2) {
    const runModels = report.run.models;
    runContractChecks.push(
      [
        JSON.stringify(runModels.map(({ id }) => id)) ===
          JSON.stringify(models.map(({ id }) => id)),
        "Report must account for every pre-registered model, executed or skipped.",
      ],
      [
        runModels.every((model) =>
          model.status === "executed"
            ? model.reason === null
            : (model.reason ?? "").trim().length > 0,
        ),
        "Every skipped model must carry a recorded reason.",
      ],
      [
        report.protocol.registeredTrialCount === registeredTrialCount,
        `Protocol registered trial count must be ${registeredTrialCount}; found ${report.protocol.registeredTrialCount}.`,
      ],
      [
        report.protocol.realisticTaskCount >= 6,
        `A schema-2 release must cover at least 6 realistic-repository tasks; found ${report.protocol.realisticTaskCount}.`,
      ],
      [
        typeof report.run.corpusCommit === "string" &&
          /^[0-9a-f]{40}$/.test(report.run.corpusCommit),
        "A schema-2 release must record run.corpusCommit (git rev-parse HEAD of the corpus working tree, ADR-012 §6).",
      ],
    );
  }

  for (const [passed, message] of runContractChecks) {
    if (!passed) {
      findings.push({ kind: "run-contract", message });
    }
  }

  const actualCounts = new Map<string, number>();

  for (const trial of report.trials) {
    const key = trialKey(trial.taskId, trial.arm, trial.trial, trial.model);
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
  }

  for (const task of manifest.tasks) {
    for (const arm of manifest.arms) {
      for (let trial = 1; trial <= manifest.trialsPerArm; trial += 1) {
        for (const model of executedModels) {
          const key = trialKey(task.id, arm, trial, model);
          const count = actualCounts.get(key) ?? 0;

          if (count !== 1) {
            findings.push({
              kind: "trial-coverage",
              message: `${task.id}/${arm}/${trial}/${model} must appear exactly once; found ${count}.`,
            });
          }

          actualCounts.delete(key);
        }
      }
    }
  }

  for (const [key, count] of actualCounts) {
    findings.push({
      kind: "trial-coverage",
      message: `Unregistered trial ${key.replaceAll("\u0000", "/")} appears ${count} time(s).`,
    });
  }

  auditTrialRecords({ executedModels, findings, providerOf, report });

  const measured =
    report.schemaVersion === 1
      ? auditV1({ findings, markdown, report })
      : auditV2({ executedModels, findings, markdown, report });

  return {
    accuracyDeltaPercentagePoints: measured.accuracyDeltaPercentagePoints,
    actualTrialCount: report.trials.length,
    expectedTrialCount,
    findings,
    id: spec.id,
    model: executedModels.join("+"),
    schemaVersion: report.schemaVersion,
    tokenReductionPercent: measured.tokenReductionPercent,
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function verifyBenchmarkRelease(
  rootDir: string,
): Promise<BenchmarkAudit> {
  const root = resolve(rootDir);
  const benchmarkDirectory = resolve(root, "benchmarks/databrain");
  const releases: BenchmarkReleaseAudit[] = [];
  const pendingReleases: string[] = [];

  for (const spec of RELEASES) {
    const hasManifest = await fileExists(
      resolve(benchmarkDirectory, spec.manifestFile),
    );
    const hasReport = await fileExists(
      resolve(benchmarkDirectory, spec.reportFile),
    );

    if (!spec.required && !hasManifest) continue;

    if (!hasReport) {
      // A pre-registered manifest without a real run is pending, not a
      // violation; loading it still proves the pre-registration is valid.
      await loadBenchmarkManifest(
        resolve(benchmarkDirectory, spec.manifestFile),
      );
      pendingReleases.push(spec.id);
      continue;
    }

    releases.push(await auditRelease(benchmarkDirectory, spec));
  }

  const primary = releases.at(-1)!;
  const findings: BenchmarkAuditFinding[] = releases.flatMap(
    (release) => release.findings,
  );
  const graphSurface = await auditGraphSurfaceReleases(root);
  for (const release of graphSurface?.releases ?? []) {
    findings.push(...release.findings);
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
        const measured = primary.tokenReductionPercent;

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
        const measured = primary.accuracyDeltaPercentagePoints;

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
    accuracyDeltaPercentagePoints: primary.accuracyDeltaPercentagePoints,
    actualTrialCount: primary.actualTrialCount,
    claimFileCount: claimFiles.length,
    expectedTrialCount: primary.expectedTrialCount,
    findings,
    graphSurface,
    model: primary.model,
    pendingReleases,
    releases,
    status: findings.length === 0 ? "pass" : "fail",
    tokenReductionPercent: primary.tokenReductionPercent,
  };
}

async function main(): Promise<void> {
  const audit = await verifyBenchmarkRelease(process.cwd());

  if (audit.status === "pass") {
    console.log(
      `PASS efficacy benchmark: ${audit.actualTrialCount}/${audit.expectedTrialCount} trials, ${audit.accuracyDeltaPercentagePoints}pp accuracy, ${audit.tokenReductionPercent}% token reduction, ${audit.claimFileCount} claim files`,
    );

    if (audit.pendingReleases.length > 0) {
      console.log(
        `Pending pre-registered releases (no real run yet): ${audit.pendingReleases.join(", ")}`,
      );
    }
    if (audit.graphSurface) {
      console.log(
        `PASS graph-surface benchmark: ${audit.graphSurface.releases
          .map(
            (release) =>
              `${release.id} ${release.trialCount}/${release.expectedTrialCount} (${release.failedTrials} failed, ${release.verdict})`,
          )
          .join(", ")}`,
      );
      if (audit.graphSurface.pendingReleases.length > 0) {
        console.log(
          `Pending graph-surface pre-registrations (no real run yet): ${audit.graphSurface.pendingReleases.join(", ")}`,
        );
      }
    }

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
