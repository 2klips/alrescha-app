/**
 * Token-efficiency technique A/B report (Phase 2B todo 6).
 *
 * Dry-run measurement over the fixture corpus: per-technique token delta and
 * required-fact recall, written to benchmarks/databrain/techniques.dry-run.*.
 * No model call, no credits — the assumptions are printed in the report.
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadRepositoryCorpus } from "./databrain-benchmark/context";
import { loadBenchmarkManifest } from "./databrain-benchmark/manifest";
import {
  measureTechniques,
  renderTechniqueReport,
  TECHNIQUE_TOKEN_ASSUMPTION,
} from "./databrain-benchmark/techniques";

async function main(): Promise<void> {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const manifest = await loadBenchmarkManifest(
    resolve(repositoryRoot, "benchmarks/databrain/tasks.v3.json"),
  );
  const tasks = manifest.tasks.filter(
    (task) =>
      task.repository === "fixtures/drifted-demo" &&
      task.grader.kind === "answer-manifest",
  );
  const corpus = await loadRepositoryCorpus(
    resolve(repositoryRoot, "fixtures/drifted-demo"),
  );
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
        taskSource: "benchmarks/databrain/tasks.v3.json (fixture answer-manifest tasks)",
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
