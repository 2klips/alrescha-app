import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  runBenchmark,
  type BenchmarkModelExecution,
} from "./databrain-benchmark/benchmark";
import {
  estimateBenchmarkCost,
  renderBenchmarkCostEstimate,
} from "./databrain-benchmark/cost-estimate";
import { loadBenchmarkManifest } from "./databrain-benchmark/manifest";
import {
  createAnthropicBenchmarkModel,
  createMockBenchmarkModel,
  createOpenAiBenchmarkModel,
} from "./databrain-benchmark/model";
import {
  benchmarkJson,
  renderBenchmarkMarkdown,
} from "./databrain-benchmark/report";
import type {
  BenchmarkManifestV2,
  BenchmarkManifestV3,
  BenchmarkModel,
  BenchmarkModelSpec,
  BenchmarkReportV1,
} from "./databrain-benchmark/types";

const PROVIDER_KEY_NAMES = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
} as const;

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function listOption(name: string): string[] | null {
  const raw = option(name);
  if (raw === undefined) return null;
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (values.length === 0) {
    throw new TypeError(`--${name} requires at least one value.`);
  }
  return values;
}

function realModel(spec: BenchmarkModelSpec, apiKey: string): BenchmarkModel {
  return spec.provider === "anthropic"
    ? createAnthropicBenchmarkModel(apiKey)
    : createOpenAiBenchmarkModel(apiKey);
}

/**
 * A provider without a key is skipped with a recorded reason instead of
 * failing the run; the report and the Markdown state the skip.
 */
function planModels(input: {
  dryRun: boolean;
  manifest: BenchmarkManifestV2 | BenchmarkManifestV3;
  mock: BenchmarkModel;
}): BenchmarkModelExecution[] {
  return input.manifest.models.map((spec) => {
    if (input.dryRun) {
      return { reason: null, runner: input.mock, spec };
    }
    const keyName = PROVIDER_KEY_NAMES[spec.provider];
    const apiKey = process.env[keyName] ?? "";
    return apiKey.trim().length === 0
      ? {
          reason: `${keyName} is not set in this environment; the model was skipped rather than estimated.`,
          runner: null,
          spec,
        }
      : { reason: null, runner: realModel(spec, apiKey), spec };
  });
}

async function readBaselineReport(path: string): Promise<BenchmarkReportV1> {
  return JSON.parse(await readFile(path, "utf8")) as BenchmarkReportV1;
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const dryRun = process.argv.includes("--dry-run");
  const mode = dryRun ? "dry-run" : "real";
  const manifestPath = resolve(
    repositoryRoot,
    option("manifest") ?? "benchmarks/databrain/tasks.v3.json",
  );
  const manifest = await loadBenchmarkManifest(manifestPath);
  if (manifest.schemaVersion !== 2 && manifest.schemaVersion !== 3) {
    throw new TypeError(
      `Only schema-2 and schema-3 manifests are executable; ${manifestPath} is schema ${manifest.schemaVersion}. The schema-1 release is frozen.`,
    );
  }

  const models = planModels({
    dryRun,
    manifest,
    mock: createMockBenchmarkModel(manifest),
  });
  const repeats = option("repeats");
  const repeatsValue = repeats === undefined ? null : Number(repeats);
  if (
    repeatsValue !== null &&
    (!Number.isInteger(repeatsValue) ||
      repeatsValue < 1 ||
      repeatsValue > manifest.trialsPerArm)
  ) {
    throw new TypeError(
      `--repeats must be an integer from 1 through ${manifest.trialsPerArm}.`,
    );
  }
  const concurrencyValue = Number(option("concurrency") ?? 3);
  if (
    !Number.isInteger(concurrencyValue) ||
    concurrencyValue < 1 ||
    concurrencyValue > 12
  ) {
    throw new TypeError("--concurrency must be an integer from 1 through 12.");
  }

  const overrides = {
    modelIds: listOption("models"),
    repeats: repeatsValue,
    taskIds: listOption("tasks"),
  };
  const basename =
    option("output-basename") ??
    (dryRun ? "results.v3.dry-run" : "results.v3.real");

  const report = await runBenchmark({
    concurrency: concurrencyValue,
    manifest,
    mode,
    models,
    overrides,
    repositoryRoot,
    resultsBasename: basename,
  });
  if (report.trials.length !== report.protocol.expectedTrialCount) {
    throw new Error(
      `Incomplete benchmark: ${report.trials.length}/${report.protocol.expectedTrialCount} trials.`,
    );
  }

  const outputDirectory = resolve(
    repositoryRoot,
    option("output-dir") ?? "benchmarks/databrain",
  );
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDirectory, `${basename}.json`),
      benchmarkJson(report),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, `${basename}.md`),
      renderBenchmarkMarkdown(report),
      "utf8",
    ),
  ]);

  const failed = report.trials.filter(
    ({ status }) => status === "failed",
  ).length;
  const skipped = report.run.models.filter(
    ({ status }) => status === "skipped",
  );
  process.stdout.write(
    `Data Brain ${mode}: ${report.trials.length}/${report.protocol.expectedTrialCount} trials, ${failed} failed.\n`,
  );
  for (const model of skipped) {
    process.stdout.write(`Skipped model ${model.id}: ${model.reason}\n`);
  }
  if (report.run.overrides.length > 0) {
    process.stdout.write(
      `Overrides (not a publishable release): ${report.run.overrides.join("; ")}\n`,
    );
  }
  process.stdout.write(`Reports: benchmarks/databrain/${basename}.{json,md}\n`);

  if (!dryRun) return;

  const [baselineDryRun, baselineReal] = await Promise.all([
    readBaselineReport(
      resolve(repositoryRoot, "benchmarks/databrain/results.dry-run.json"),
    ),
    readBaselineReport(
      resolve(repositoryRoot, "benchmarks/databrain/results.real.json"),
    ),
  ]);
  const estimate = estimateBenchmarkCost({
    baselineDryRun,
    baselineReal,
    dryRun: report,
  });
  const rendered = renderBenchmarkCostEstimate(estimate, report);
  await writeFile(
    resolve(outputDirectory, `${basename}.cost-estimate.md`),
    rendered,
    "utf8",
  );
  process.stdout.write(`\n${rendered}\n`);
  process.stdout.write(
    `Cost estimate: benchmarks/databrain/${basename}.cost-estimate.md\n`,
  );
}

await main();
