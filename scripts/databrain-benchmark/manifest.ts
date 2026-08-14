import { readFile } from "node:fs/promises";

import {
  BENCHMARK_ARMS,
  type BenchmarkGrader,
  type BenchmarkManifest,
  type BenchmarkTask,
  type BenchmarkTaskType,
} from "./types";

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
      ["implementation", "question-answering", "drift-judgment"] as const
    ).includes(type)
  ) {
    throw new TypeError(`Task ${id} has an unsupported type.`);
  }
  const grader = parseGrader(task.grader, id);
  const expectedGrader = {
    implementation: "test-pass",
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

export async function loadBenchmarkManifest(
  path: string,
): Promise<BenchmarkManifest> {
  const parsed = object(
    JSON.parse(await readFile(path, "utf8")) as unknown,
    "Benchmark manifest",
  );
  if (!Array.isArray(parsed.tasks))
    throw new TypeError("Benchmark manifest tasks must be an array.");
  const tasks = parsed.tasks.map(parseTask);
  if (tasks.length < 12)
    throw new TypeError("Benchmark manifest requires at least 12 tasks.");
  if (new Set(tasks.map(({ id }) => id)).size !== tasks.length) {
    throw new TypeError("Benchmark task ids must be unique.");
  }
  if (parsed.schemaVersion !== 1)
    throw new TypeError("Unsupported benchmark schema version.");
  if (parsed.trialsPerArm !== 3)
    throw new TypeError("Benchmark requires exactly three trials per arm.");
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

  return {
    arms: [...BENCHMARK_ARMS],
    model: nonemptyString(parsed.model, "Benchmark model"),
    schemaVersion: 1,
    tasks,
    trialsPerArm: 3,
  };
}
