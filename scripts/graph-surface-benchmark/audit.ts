/**
 * F5 audit for the graph-surface releases (Phase 4 Wave E todo 25).
 *
 * The databrain audit in `verify-benchmark-report.ts` never looked at
 * `benchmarks/graph-surface/`; todo 25's acceptance names that script, so
 * the graph-surface reports get the same treatment: the pre-registration
 * lock, the grid, every trial's internal consistency, the recomputed
 * verdict, and — for v3, whose renderer inputs are published with the
 * report — the Markdown re-rendered byte for byte.
 *
 * v1 and v2 predate the render inputs; their Markdown is checked for the
 * facts it must carry rather than re-rendered, because the v3 renderer grew
 * columns and a re-render would flag a frozen report for being frozen.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  GRAPH_SURFACE_ARMS,
  loadGraphSurfaceBenchmark,
  preregistrationSha256,
  type PrimaryHypothesis,
} from "./manifest";
import {
  judgeHypothesis,
  renderGraphSurfaceMarkdown,
  type GraphSurfaceTrial,
  type HypothesisJudgment,
  type RenderGraphSurfaceInput,
} from "./report";

export type GraphSurfaceAuditFindingKind =
  | "measurement-integrity"
  | "preregistration-lock"
  | "publication-integrity"
  | "run-contract"
  | "trial-coverage"
  | "trial-integrity";

export interface GraphSurfaceAuditFinding {
  readonly kind: GraphSurfaceAuditFindingKind;
  readonly message: string;
}

export interface GraphSurfaceReleaseAudit {
  readonly expectedTrialCount: number;
  readonly failedTrials: number;
  readonly findings: readonly GraphSurfaceAuditFinding[];
  readonly id: string;
  readonly trialCount: number;
  readonly verdict: string;
}

export interface GraphSurfaceAudit {
  /** Pre-registrations whose real run has not been executed yet. */
  readonly pendingReleases: readonly string[];
  readonly releases: readonly GraphSurfaceReleaseAudit[];
}

interface GraphSurfaceReleaseSpec {
  readonly id: string;
  readonly markdownFile: string;
  readonly preregistrationFile: string;
  readonly reportFile: string;
  /** A missing report is a violation, not a pending release. */
  readonly required: boolean;
  /** The report carries its renderer inputs; re-render and compare. */
  readonly rerender: boolean;
}

export const GRAPH_SURFACE_RELEASES: readonly GraphSurfaceReleaseSpec[] = [
  {
    id: "v1",
    markdownFile: "results.v1.md",
    preregistrationFile: "preregistration.v1.json",
    reportFile: "results.v1.json",
    required: true,
    rerender: false,
  },
  {
    id: "v2",
    markdownFile: "results.v2.md",
    preregistrationFile: "preregistration.v2.json",
    reportFile: "results.v2.json",
    required: true,
    rerender: false,
  },
  {
    id: "v3",
    markdownFile: "results.v3.md",
    preregistrationFile: "preregistration.v3.json",
    reportFile: "results.v3.json",
    required: false,
    rerender: true,
  },
  {
    id: "v3-relational",
    markdownFile: "results.v3-relational.md",
    preregistrationFile: "preregistration.v3-relational.json",
    reportFile: "results.v3-relational.json",
    required: false,
    rerender: true,
  },
];

interface GraphSurfaceReportFile {
  readonly corpusCommit?: string | null;
  readonly judgment?: Partial<HypothesisJudgment>;
  readonly mode?: string;
  readonly preregistrationSha256?: string;
  readonly primaryHypothesis?: string;
  readonly productCatalogSha256?: string | null;
  readonly render?: Omit<RenderGraphSurfaceInput, "judgment" | "trials">;
  readonly trials?: readonly GraphSurfaceTrial[];
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

export async function auditGraphSurfaceRelease(input: {
  readonly benchmarkDirectory: string;
  readonly spec: GraphSurfaceReleaseSpec;
  readonly v3ManifestPath: string;
}): Promise<GraphSurfaceReleaseAudit> {
  const { benchmarkDirectory, spec } = input;
  const findings: GraphSurfaceAuditFinding[] = [];
  const preregistrationPath = resolve(
    benchmarkDirectory,
    spec.preregistrationFile,
  );
  const raw = await readFile(preregistrationPath, "utf8");
  const { preregistration, tasks } = await loadGraphSurfaceBenchmark({
    preregistrationPath,
    v3ManifestPath: input.v3ManifestPath,
  });
  const report = JSON.parse(
    await readFile(resolve(benchmarkDirectory, spec.reportFile), "utf8"),
  ) as GraphSurfaceReportFile;
  const trials = report.trials ?? [];
  const expectedTrialCount = preregistration.protocol.trialCount;

  if (report.preregistrationSha256 !== preregistrationSha256(raw)) {
    findings.push({
      kind: "preregistration-lock",
      message: `${spec.id}: report pins pre-registration ${report.preregistrationSha256 ?? "(none)"}, file is ${preregistrationSha256(raw)}.`,
    });
  }
  if (preregistration.v3) {
    if (
      report.productCatalogSha256 !== preregistration.v3.productCatalogSha256
    ) {
      findings.push({
        kind: "preregistration-lock",
        message: `${spec.id}: report pins product catalogue ${report.productCatalogSha256 ?? "(none)"}, pre-registration pins ${preregistration.v3.productCatalogSha256}.`,
      });
    }
    if (report.primaryHypothesis !== preregistration.v3.primaryHypothesis) {
      findings.push({
        kind: "run-contract",
        message: `${spec.id}: report judged ${report.primaryHypothesis ?? "(none)"}, pre-registration says ${preregistration.v3.primaryHypothesis}.`,
      });
    }
  }
  if (report.mode !== "real") {
    findings.push({
      kind: "run-contract",
      message: `${spec.id}: published report mode is ${report.mode ?? "(none)"}, not real.`,
    });
  }
  if (
    typeof report.corpusCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(report.corpusCommit)
  ) {
    findings.push({
      kind: "run-contract",
      message: `${spec.id}: corpusCommit is not a 40-hex commit sha.`,
    });
  }

  if (trials.length !== expectedTrialCount) {
    findings.push({
      kind: "trial-coverage",
      message: `${spec.id}: ${trials.length} trials published, ${expectedTrialCount} pre-registered.`,
    });
  }
  const seen = new Map<string, number>();
  for (const trial of trials) {
    const key = `${trial.taskId}|${trial.arm}|${trial.model}|${trial.repeat}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const models = preregistration.models.map(({ id }) => id);
  for (const task of tasks) {
    for (const arm of GRAPH_SURFACE_ARMS) {
      for (const model of models) {
        for (
          let repeat = 1;
          repeat <= preregistration.protocol.repeatsPerCell;
          repeat += 1
        ) {
          const count = seen.get(`${task.id}|${arm}|${model}|${repeat}`) ?? 0;
          if (count !== 1) {
            findings.push({
              kind: "trial-coverage",
              message: `${spec.id}: cell ${task.id}/${arm}/${model}#${repeat} appears ${count} times.`,
            });
          }
        }
      }
    }
  }

  const turnCap = preregistration.protocol.turnCap;
  for (const trial of trials) {
    const label = `${spec.id}: ${trial.taskId}/${trial.arm}/${trial.model}#${trial.repeat}`;
    if (
      typeof trial.score !== "number" ||
      trial.score < 0 ||
      trial.score > 1 ||
      !isCount(trial.turns) ||
      trial.turns < 1 ||
      trial.turns > turnCap ||
      !isCount(trial.inputTokens) ||
      !isCount(trial.outputTokens) ||
      !isCount(trial.toolCalls)
    ) {
      findings.push({
        kind: "trial-integrity",
        message: `${label} carries an out-of-range score, turn count or token count.`,
      });
      continue;
    }
    const expectedQuality =
      trial.score === 0 ? "FAIL" : trial.score === 1 ? "PASS" : "PARTIAL";
    if (trial.quality !== expectedQuality) {
      findings.push({
        kind: "trial-integrity",
        message: `${label} is graded ${trial.quality} with score ${trial.score}.`,
      });
    }
    if (
      trial.status === "failed" &&
      (trial.score !== 0 || trial.answer !== null || trial.quality !== "FAIL")
    ) {
      findings.push({
        kind: "trial-integrity",
        message: `${label} failed but carries a score, an answer or a non-FAIL grade.`,
      });
    }
    if (trial.status !== "failed" && trial.status !== "succeeded") {
      findings.push({
        kind: "trial-integrity",
        message: `${label} has an unknown status.`,
      });
    }
    if (preregistration.v3) {
      if (
        !isCount(trial.cacheCreationTokens) ||
        !isCount(trial.cacheReadTokens) ||
        !Array.isArray(trial.calls) ||
        !Array.isArray(trial.toolNames)
      ) {
        findings.push({
          kind: "trial-integrity",
          message: `${label} lacks the v3 usage record (cache halves, per-call usage, tool names).`,
        });
      } else if (
        trial.status === "succeeded" &&
        trial.calls.length !== trial.turns
      ) {
        findings.push({
          kind: "trial-integrity",
          message: `${label} records ${trial.calls.length} model calls for ${trial.turns} turns.`,
        });
      } else if (
        trial.calls.reduce((sum, call) => sum + call.inputTokens, 0) !==
          trial.inputTokens ||
        trial.calls.reduce((sum, call) => sum + call.outputTokens, 0) !==
          trial.outputTokens ||
        trial.calls.reduce((sum, call) => sum + call.cacheReadTokens, 0) !==
          trial.cacheReadTokens ||
        trial.calls.reduce((sum, call) => sum + call.cacheCreationTokens, 0) !==
          trial.cacheCreationTokens
      ) {
        findings.push({
          kind: "trial-integrity",
          message: `${label}: per-call usage does not sum to the trial's usage.`,
        });
      }
    }
  }

  const primaryHypothesis: PrimaryHypothesis =
    preregistration.v3?.primaryHypothesis ?? "turns-reduced";
  const recomputed = judgeHypothesis(trials, primaryHypothesis);
  const published = report.judgment ?? {};
  for (const field of [
    "baselineMeanTurns",
    "baselinePassRate",
    "graphMeanTurns",
    "graphPassRate",
    "passRateDelta",
    "primaryMet",
    "qualityNonInferior",
    "turnsDelta",
    "verdict",
  ] as const) {
    if (published[field] !== recomputed[field]) {
      findings.push({
        kind: "measurement-integrity",
        message: `${spec.id}: judgment.${field} is published as ${String(published[field])}, recomputed ${String(recomputed[field])}.`,
      });
    }
  }

  const markdown = await readOptional(
    resolve(benchmarkDirectory, spec.markdownFile),
  );
  if (markdown === null) {
    findings.push({
      kind: "publication-integrity",
      message: `${spec.id}: ${spec.markdownFile} is missing.`,
    });
  } else if (spec.rerender) {
    if (!report.render) {
      findings.push({
        kind: "publication-integrity",
        message: `${spec.id}: report carries no render inputs to re-render from.`,
      });
    } else {
      const rendered = renderGraphSurfaceMarkdown({
        ...report.render,
        judgment: recomputed,
        trials,
      });
      if (rendered !== markdown) {
        findings.push({
          kind: "publication-integrity",
          message: `${spec.id}: ${spec.markdownFile} differs from the report re-rendered.`,
        });
      }
    }
  } else {
    for (const required of [
      report.preregistrationSha256 ?? "",
      `**판정: ${recomputed.verdict}**`,
      `Δ ${recomputed.turnsDelta}`,
    ]) {
      if (required.length === 0 || !markdown.includes(required)) {
        findings.push({
          kind: "publication-integrity",
          message: `${spec.id}: ${spec.markdownFile} does not carry "${required}".`,
        });
      }
    }
  }

  return {
    expectedTrialCount,
    failedTrials: trials.filter(({ status }) => status === "failed").length,
    findings,
    id: spec.id,
    trialCount: trials.length,
    verdict: recomputed.verdict,
  };
}

/** Null when the repository has no graph-surface benchmark directory. */
export async function auditGraphSurfaceReleases(
  rootDir: string,
): Promise<GraphSurfaceAudit | null> {
  const benchmarkDirectory = resolve(rootDir, "benchmarks/graph-surface");
  const v3ManifestPath = resolve(rootDir, "benchmarks/databrain/tasks.v3.json");
  const releases: GraphSurfaceReleaseAudit[] = [];
  const pendingReleases: string[] = [];
  let present = false;
  for (const spec of GRAPH_SURFACE_RELEASES) {
    const preregistrationPath = resolve(
      benchmarkDirectory,
      spec.preregistrationFile,
    );
    const hasPreregistration =
      (await readOptional(preregistrationPath)) !== null;
    if (!hasPreregistration) {
      if (spec.required && present) {
        releases.push({
          expectedTrialCount: 0,
          failedTrials: 0,
          findings: [
            {
              kind: "run-contract",
              message: `${spec.id}: ${spec.preregistrationFile} is missing.`,
            },
          ],
          id: spec.id,
          trialCount: 0,
          verdict: "NOT MET",
        });
      }
      continue;
    }
    present = true;
    const hasReport =
      (await readOptional(resolve(benchmarkDirectory, spec.reportFile))) !==
      null;
    if (!hasReport) {
      // Loading proves the pre-registration is valid even before its run.
      await loadGraphSurfaceBenchmark({ preregistrationPath, v3ManifestPath });
      pendingReleases.push(spec.id);
      continue;
    }
    releases.push(
      await auditGraphSurfaceRelease({
        benchmarkDirectory,
        spec,
        v3ManifestPath,
      }),
    );
  }
  return present ? { pendingReleases, releases } : null;
}
