/**
 * Token-efficiency technique A/B report (Phase 2B todo 6 dry-run; Phase 2C
 * todo 7 real re-measurement).
 *
 * Default: dry-run measurement over the fixture corpus — per-technique token
 * delta and required-fact recall, written to
 * benchmarks/databrain/techniques.dry-run.*. No model call, no credits.
 *
 * With `--real`: the same A/B re-measured with real models — recall becomes
 * real answer grading, tokens become provider-reported usage — written to
 * benchmarks/databrain/techniques.real.* alongside the registered dry-run
 * deltas for comparison.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadRepositoryCorpus } from "./databrain-benchmark/context";
import { loadBenchmarkManifest } from "./databrain-benchmark/manifest";
import {
  createAnthropicBenchmarkModel,
  createOpenAiBenchmarkModel,
} from "./databrain-benchmark/model";
import {
  measureTechniques,
  measureTechniquesReal,
  renderTechniqueRealReport,
  renderTechniqueReport,
  TECHNIQUE_TOKEN_ASSUMPTION,
  type TechniqueMeasurement,
} from "./databrain-benchmark/techniques";

const PROVIDER_KEY_NAMES = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
} as const;

async function main(): Promise<void> {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const manifest = await loadBenchmarkManifest(
    resolve(repositoryRoot, "benchmarks/databrain/tasks.v3.json"),
  );
  if (manifest.schemaVersion !== 2) {
    throw new TypeError("The technique A/B reuses the frozen v3 registry.");
  }
  const tasks = manifest.tasks.filter(
    (task) =>
      task.repository === "fixtures/drifted-demo" &&
      task.grader.kind === "answer-manifest",
  );
  const corpus = await loadRepositoryCorpus(
    resolve(repositoryRoot, "fixtures/drifted-demo"),
  );

  if (process.argv.includes("--real")) {
    const models = manifest.models.map((spec) => {
      const keyName = PROVIDER_KEY_NAMES[spec.provider];
      const apiKey = process.env[keyName] ?? "";
      if (apiKey.trim().length === 0) {
        throw new TypeError(
          `${keyName} is required for the real technique A/B.`,
        );
      }
      return {
        runner:
          spec.provider === "anthropic"
            ? createAnthropicBenchmarkModel(apiKey)
            : createOpenAiBenchmarkModel(apiKey),
        spec,
      };
    });
    const repeatsOption = process.argv
      .find((argument) => argument.startsWith("--repeats="))
      ?.slice("--repeats=".length);
    const repeats = repeatsOption === undefined ? 1 : Number(repeatsOption);
    const dryRun = JSON.parse(
      await readFile(
        resolve(repositoryRoot, "benchmarks/databrain/techniques.dry-run.json"),
        "utf8",
      ),
    ) as { measurements: TechniqueMeasurement[] };
    const { measurements, trials } = await measureTechniquesReal({
      corpus,
      dryRunCacheStablePrefixTokens: Object.fromEntries(
        dryRun.measurements.map((measurement) => [
          measurement.technique,
          measurement.cacheStablePrefixTokens,
        ]),
      ),
      models,
      repeats,
      tasks,
    });
    const markdown = renderTechniqueRealReport({
      dryRun: dryRun.measurements,
      measurements,
    });
    const jsonPath = resolve(
      repositoryRoot,
      "benchmarks/databrain/techniques.real.json",
    );
    const markdownPath = resolve(
      repositoryRoot,
      "benchmarks/databrain/techniques.real.md",
    );
    await writeFile(
      jsonPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          repeats,
          measurements,
          registeredDryRun: dryRun.measurements,
          tokenAccounting:
            "Provider-reported usage.input_tokens per call; identical contexts share one call.",
          trials,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(markdownPath, markdown, "utf8");
    console.log(markdown);
    console.log(`written: ${jsonPath}`);
    console.log(`written: ${markdownPath}`);
    return;
  }

  const measurements = await measureTechniques({ corpus, tasks });

  const jsonPath = resolve(
    repositoryRoot,
    "benchmarks/databrain/techniques.dry-run.json",
  );
  const markdownPath = resolve(
    repositoryRoot,
    "benchmarks/databrain/techniques.dry-run.md",
  );
  await writeFile(
    jsonPath,
    `${JSON.stringify(
      {
        assumption: TECHNIQUE_TOKEN_ASSUMPTION,
        corpus: "fixtures/drifted-demo",
        measurements,
        taskSource:
          "benchmarks/databrain/tasks.v3.json (fixture answer-manifest tasks)",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(markdownPath, renderTechniqueReport(measurements), "utf8");
  console.log(renderTechniqueReport(measurements));
  console.log(`written: ${jsonPath}`);
  console.log(`written: ${markdownPath}`);
}

await main();
