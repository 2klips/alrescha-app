/**
 * Graph-surface v3 auxiliary experiments (Phase 4 Wave E todo 25).
 *
 * Reads the main run's report and the relational run's report, labels the
 * risk map's top N by the pre-registered rule, and publishes
 * `results.v3-auxiliary.{json,md}`. Nothing here calls a model: ①②③ are
 * read off trials that already ran, ④ is another run of the main harness,
 * ⑤ is git history against a deterministic map.
 *
 * `--dry-run` reads the dry-run reports and writes the dry-run basename, so
 * the pipeline is proven before a credit is spent.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { workspaceRiskMap } from "../packages/mcp/src/workspace-risk";
import {
  progressAdoption,
  relationalSummary,
  renderAuxiliaryMarkdown,
  todoDuplication,
  tokensPerCall,
  type AuxiliaryReport,
} from "./graph-surface-benchmark/auxiliary";
import {
  GRAPH_SURFACE_ARMS,
  preregistrationSha256,
} from "./graph-surface-benchmark/manifest";
import { buildProductionWorkspace } from "./graph-surface-benchmark/product-surface";
import type {
  GraphSurfaceTrial,
  HypothesisJudgment,
} from "./graph-surface-benchmark/report";
import {
  buildRiskPrecisionReport,
  collectFixCommits,
  riskStratum,
} from "./graph-surface-benchmark/risk-precision";

export interface AuxiliaryPreregistration {
  readonly adoption: { readonly tool: string };
  readonly mainResults: string;
  readonly relationalResults: string;
  readonly risk: {
    readonly excludedSegments: readonly string[];
    readonly repository: string;
    readonly repositoryFullName: string;
    readonly sinceDays: number;
    readonly subjectPattern: string;
    readonly topN: number;
  };
  readonly schemaVersion: "graph-surface-v3-auxiliary";
}

function invalid(field: string): never {
  throw new TypeError(`Auxiliary pre-registration is malformed at ${field}.`);
}

export function parseAuxiliaryPreregistration(
  raw: unknown,
): AuxiliaryPreregistration {
  if (typeof raw !== "object" || raw === null) invalid("$");
  const root = raw as Record<string, unknown>;
  if (root.schemaVersion !== "graph-surface-v3-auxiliary") {
    invalid("schemaVersion");
  }
  const adoption = root.adoption as Record<string, unknown> | undefined;
  if (typeof adoption?.tool !== "string" || adoption.tool.length === 0) {
    invalid("adoption.tool");
  }
  if (typeof root.mainResults !== "string") invalid("mainResults");
  if (typeof root.relationalResults !== "string") invalid("relationalResults");
  const risk = root.risk as Record<string, unknown> | undefined;
  if (!risk) invalid("risk");
  if (
    !Array.isArray(risk.excludedSegments) ||
    !risk.excludedSegments.every((entry) => typeof entry === "string")
  ) {
    invalid("risk.excludedSegments");
  }
  if (typeof risk.repository !== "string") invalid("risk.repository");
  if (typeof risk.repositoryFullName !== "string") {
    invalid("risk.repositoryFullName");
  }
  if (!Number.isInteger(risk.sinceDays) || (risk.sinceDays as number) <= 0) {
    invalid("risk.sinceDays");
  }
  if (typeof risk.subjectPattern !== "string") invalid("risk.subjectPattern");
  if (!Number.isInteger(risk.topN) || (risk.topN as number) <= 0) {
    invalid("risk.topN");
  }
  return {
    adoption: { tool: adoption.tool },
    mainResults: root.mainResults,
    relationalResults: root.relationalResults,
    risk: {
      excludedSegments: risk.excludedSegments as string[],
      repository: risk.repository,
      repositoryFullName: risk.repositoryFullName,
      sinceDays: risk.sinceDays as number,
      subjectPattern: risk.subjectPattern,
      topN: risk.topN as number,
    },
    schemaVersion: "graph-surface-v3-auxiliary",
  };
}

interface GraphSurfaceReportFile {
  readonly corpusCommit: string | null;
  readonly judgment: HypothesisJudgment;
  readonly mode: "dry-run" | "real";
  readonly preregistrationSha256: string;
  readonly render: { readonly models: readonly string[] };
  readonly trials: readonly GraphSurfaceTrial[];
}

async function readReport(
  path: string,
): Promise<GraphSurfaceReportFile | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as GraphSurfaceReportFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function dryRunName(file: string): string {
  return file.replace(/results\./, "results.dry-run.");
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const dryRun = process.argv.includes("--dry-run");
  const preregistrationFile =
    "benchmarks/graph-surface/preregistration.v3-auxiliary.json";
  const raw = await readFile(
    resolve(repositoryRoot, preregistrationFile),
    "utf8",
  );
  const preregistration = parseAuxiliaryPreregistration(JSON.parse(raw));
  const sha256 = preregistrationSha256(raw);

  const mainFile = dryRun
    ? dryRunName(preregistration.mainResults)
    : preregistration.mainResults;
  const main = await readReport(resolve(repositoryRoot, mainFile));
  if (!main)
    throw new Error(`Main report ${mainFile} is missing; run it first.`);
  if (main.mode !== (dryRun ? "dry-run" : "real")) {
    throw new Error(
      `Main report ${mainFile} is not a ${dryRun ? "dry-run" : "real"} report.`,
    );
  }
  const relationalFile = dryRun
    ? dryRunName(preregistration.relationalResults)
    : preregistration.relationalResults;
  const relational = await readReport(resolve(repositoryRoot, relationalFile));

  const models = ["pooled", ...main.render.models];
  const adoption = models.map((model) => progressAdoption(main.trials, model));
  if (preregistration.adoption.tool !== "log_progress") {
    throw new Error(
      "Adoption is defined over log_progress; the pre-registration disagrees.",
    );
  }
  const perCall = models.flatMap((model) =>
    GRAPH_SURFACE_ARMS.map((arm) => tokensPerCall(main.trials, arm, model)),
  );
  const duplication = todoDuplication(main.trials);

  const riskRoot = resolve(repositoryRoot, preregistration.risk.repository);
  const built = await buildProductionWorkspace({
    excludedSegments: preregistration.risk.excludedSegments,
    repositoryFullName: preregistration.risk.repositoryFullName,
    rootDir: riskRoot,
  });
  const commits = await collectFixCommits({
    rootDir: riskRoot,
    sinceDays: preregistration.risk.sinceDays,
  });
  const risk = buildRiskPrecisionReport({
    commits,
    corpusCommit: main.corpusCommit,
    repository: preregistration.risk.repositoryFullName,
    riskMap: workspaceRiskMap(built.workspace),
    sinceDays: preregistration.risk.sinceDays,
    stratum: riskStratum(built.workspace),
    subjectPattern: new RegExp(preregistration.risk.subjectPattern, "i"),
    topN: preregistration.risk.topN,
  });

  const report: AuxiliaryReport = {
    adoption,
    duplication,
    generatedAt: new Date().toISOString(),
    mainReport: {
      file: mainFile,
      mode: main.mode,
      preregistrationSha256: main.preregistrationSha256,
      trialCount: main.trials.length,
    },
    preregistrationSha256: sha256,
    relational: relational
      ? relationalSummary({
          judgment: relational.judgment,
          models: relational.render.models,
          preregistrationSha256: relational.preregistrationSha256,
          trials: relational.trials,
        })
      : null,
    risk,
    tokensPerCall: perCall,
  };
  const basename = dryRun
    ? "results.dry-run.v3-auxiliary"
    : "results.v3-auxiliary";
  const outputDir = resolve(repositoryRoot, "benchmarks/graph-surface");
  await writeFile(
    resolve(outputDir, `${basename}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    resolve(outputDir, `${basename}.md`),
    renderAuxiliaryMarkdown(report),
    "utf8",
  );
  const pooled = adoption[0];
  process.stdout.write(
    `Graph-surface v3 auxiliary (${main.mode}): adoption ${pooled?.adopted ?? 0}/${pooled?.trials ?? 0}, todos created ${duplication.created} (dup ${duplication.duplicated}), risk top ${risk.topN} precision@10 ${risk.strata.map((stratum) => `${stratum.stratum}=${stratum.precisionAt10 ?? "—"}`).join(" ")}, relational ${relational ? relational.judgment.verdict : "missing"}\n`,
  );
  process.stdout.write(
    `Reports: benchmarks/graph-surface/${basename}.{json,md}\n`,
  );
}

await main();
