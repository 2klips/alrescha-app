import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runBenchmark } from "./databrain-benchmark/benchmark";
import { loadBenchmarkManifest } from "./databrain-benchmark/manifest";
import {
  createMockBenchmarkModel,
  createOpenAiBenchmarkModel,
} from "./databrain-benchmark/model";
import {
  benchmarkJson,
  renderBenchmarkMarkdown,
} from "./databrain-benchmark/report";

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const dryRun = process.argv.includes("--dry-run");
  const mode = dryRun ? "dry-run" : "real";
  const manifest = await loadBenchmarkManifest(
    resolve(repositoryRoot, "benchmarks/databrain/tasks.json"),
  );
  const model = dryRun
    ? createMockBenchmarkModel(manifest)
    : createOpenAiBenchmarkModel(process.env.OPENAI_API_KEY ?? "");
  const concurrencyValue = Number(option("concurrency") ?? (dryRun ? 3 : 3));
  if (
    !Number.isInteger(concurrencyValue) ||
    concurrencyValue < 1 ||
    concurrencyValue > 12
  ) {
    throw new TypeError("--concurrency must be an integer from 1 through 12.");
  }

  const report = await runBenchmark({
    concurrency: concurrencyValue,
    manifest,
    mode,
    model,
    repositoryRoot,
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
  const basename = dryRun ? "results.dry-run" : "results.real";
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
  process.stdout.write(
    `Data Brain ${mode}: ${report.trials.length}/${report.protocol.expectedTrialCount} trials, ${failed} failed.\n`,
  );
  process.stdout.write(`Reports: benchmarks/databrain/${basename}.{json,md}\n`);
}

await main();
