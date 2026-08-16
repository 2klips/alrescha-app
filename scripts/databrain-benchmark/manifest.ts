import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  BENCHMARK_ARMS,
  BENCHMARK_PROVIDERS,
  type BenchmarkCorpus,
  type BenchmarkGrader,
  type BenchmarkManifest,
  type BenchmarkManifestV1,
  type BenchmarkManifestV2,
  type BenchmarkModelSpec,
  type BenchmarkProvider,
  type BenchmarkTask,
  type BenchmarkTaskType,
} from "./types";

const MINIMUM_TASKS = 12;
const MINIMUM_REALISTIC_TASKS = 6;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty array.`);
  }
  return value.map((entry, index) =>
    nonemptyString(entry, `${label}[${index}]`),
  );
}

function parseGrader(value: unknown, id: string): BenchmarkGrader {
  const grader = object(value, `Task ${id} grading manifest`);
  if (grader.kind === "test-pass") {
    return {
      kind: "test-pass",
      testPath: nonemptyString(grader.testPath, `Task ${id} testPath`),
    };
  }
  if (grader.kind === "answer-manifest") {
    if (
      !Array.isArray(grader.requiredFacts) ||
      grader.requiredFacts.length === 0
    ) {
      throw new TypeError(`Task ${id} answer grading manifest requires facts.`);
    }
    return {
      kind: "answer-manifest",
      requiredFacts: grader.requiredFacts.map((aliases, index) =>
        stringArray(aliases, `Task ${id} fact ${index}`),
      ),
    };
  }
  if (grader.kind === "findings-manifest") {
    return {
      expectedFindings: stringArray(
        grader.expectedFindings,
        `Task ${id} expected findings`,
      ),
      kind: "findings-manifest",
    };
  }
  throw new TypeError(`Task ${id} has an unsupported grading manifest.`);
}

function parseTask(value: unknown): BenchmarkTask {
  const task = object(value, "Benchmark task");
  const id = nonemptyString(task.id, "Benchmark task id");
  if (!task.grader) {
    throw new TypeError(`Task ${id} is missing an objective grading manifest.`);
  }
  const type = task.type as BenchmarkTaskType;
  if (
    !(
      [
        "implementation",
        "question-answering",
        "drift-judgment",
        "policy-audit",
      ] as const
    ).includes(type)
  ) {
    throw new TypeError(`Task ${id} has an unsupported type.`);
  }
  const grader = parseGrader(task.grader, id);
  const expectedGrader = {
    implementation: "test-pass",
    "policy-audit": "findings-manifest",
    "question-answering": "answer-manifest",
    "drift-judgment": "findings-manifest",
  } as const;
  if (grader.kind !== expectedGrader[type]) {
    throw new TypeError(`Task ${id} grading manifest does not match ${type}.`);
  }
  return {
    grader,
    id,
    prompt: nonemptyString(task.prompt, `Task ${id} prompt`),
    repository: nonemptyString(task.repository, `Task ${id} repository`),
    retrievalQuery: nonemptyString(
      task.retrievalQuery,
      `Task ${id} retrieval query`,
    ),
    type,
  };
}

/**
 * Corpus class is derived from the pre-registered `repository` field rather
 * than stored separately, so it cannot drift from the corpus actually read.
 */
export function taskCorpus(task: BenchmarkTask): BenchmarkCorpus {
  return task.repository.replaceAll("\\", "/").startsWith("fixtures/")
    ? "fixture"
    : "realistic";
}

function parseTasks(parsed: Record<string, unknown>): BenchmarkTask[] {
  if (!Array.isArray(parsed.tasks))
    throw new TypeError("Benchmark manifest tasks must be an array.");
  const tasks = parsed.tasks.map(parseTask);
  if (tasks.length < MINIMUM_TASKS)
    throw new TypeError(
      `Benchmark manifest requires at least ${MINIMUM_TASKS} tasks.`,
    );
  if (new Set(tasks.map(({ id }) => id)).size !== tasks.length) {
    throw new TypeError("Benchmark task ids must be unique.");
  }
  if (JSON.stringify(parsed.arms) !== JSON.stringify(BENCHMARK_ARMS)) {
    throw new TypeError(
      "Benchmark arms must be checkout, full-dump, and data-brain.",
    );
  }
  if (new Set(tasks.map(({ repository }) => repository)).size < 2) {
    throw new TypeError(
      "Benchmark requires fixture and realistic-scale repositories.",
    );
  }
  return tasks;
}

function parseModels(value: unknown): BenchmarkModelSpec[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("Benchmark manifest models must be a non-empty array.");
  }
  const models = value.map((entry, index) => {
    const model = object(entry, `Benchmark model ${index}`);
    const provider = model.provider as BenchmarkProvider;
    if (!BENCHMARK_PROVIDERS.includes(provider)) {
      throw new TypeError(
        `Benchmark model ${index} has an unsupported provider.`,
      );
    }
    return {
      id: nonemptyString(model.id, `Benchmark model ${index} id`),
      provider,
    };
  });
  if (new Set(models.map(({ id }) => id)).size !== models.length) {
    throw new TypeError("Benchmark model ids must be unique.");
  }
  if (new Set(models.map(({ provider }) => provider)).size < 2) {
    throw new TypeError(
      "Benchmark schema 2 requires at least two model providers.",
    );
  }
  return models;
}

export async function loadBenchmarkManifest(
  path: string,
): Promise<BenchmarkManifest> {
  const parsed = object(
    JSON.parse(await readFile(path, "utf8")) as unknown,
    "Benchmark manifest",
  );

  if (parsed.schemaVersion === 1) {
    const tasks = parseTasks(parsed);
    if (parsed.trialsPerArm !== 3)
      throw new TypeError("Benchmark schema 1 requires three trials per arm.");
    const manifest: BenchmarkManifestV1 = {
      arms: [...BENCHMARK_ARMS],
      model: nonemptyString(parsed.model, "Benchmark model"),
      schemaVersion: 1,
      tasks,
      trialsPerArm: 3,
    };
    return manifest;
  }

  if (parsed.schemaVersion === 2) {
    const tasks = parseTasks(parsed);
    if (parsed.trialsPerArm !== 5)
      throw new TypeError("Benchmark schema 2 requires five trials per arm.");
    const realistic = tasks.filter(
      (task) => taskCorpus(task) === "realistic",
    ).length;
    if (realistic < MINIMUM_REALISTIC_TASKS) {
      throw new TypeError(
        `Benchmark schema 2 requires at least ${MINIMUM_REALISTIC_TASKS} realistic-repository tasks; found ${realistic}.`,
      );
    }
    if (realistic === tasks.length) {
      throw new TypeError("Benchmark schema 2 requires fixture tasks as well.");
    }
    const manifest: BenchmarkManifestV2 = {
      arms: [...BENCHMARK_ARMS],
      models: parseModels(parsed.models),
      schemaVersion: 2,
      tasks,
      trialsPerArm: 5,
    };
    return manifest;
  }

  throw new TypeError("Unsupported benchmark schema version.");
}

export function benchmarkManifestDigest(manifest: BenchmarkManifest): string {
  return createHash("sha256")
    .update(JSON.stringify(manifest), "utf8")
    .digest("hex");
}

export function benchmarkManifestModels(
  manifest: BenchmarkManifest,
): BenchmarkModelSpec[] {
  return manifest.schemaVersion === 1
    ? [{ id: manifest.model, provider: "openai" }]
    : manifest.models;
}
