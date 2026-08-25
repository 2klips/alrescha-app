/**
 * Graph-surface benchmark pre-registration loader (Phase 3 Wave F todo 15).
 *
 * The pre-registration file is frozen before execution: its SHA-256 is
 * recorded in every report, and the question set is resolved from the frozen
 * v3 manifest whose digest the pre-registration pins — the harness refuses to
 * run when either digest disagrees.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  benchmarkManifestDigest,
  loadBenchmarkManifest,
} from "../databrain-benchmark/manifest";
import type {
  BenchmarkModelSpec,
  BenchmarkTask,
} from "../databrain-benchmark/types";

export const GRAPH_SURFACE_ARMS = [
  "file-exploration",
  "graph-surface",
] as const;
export type GraphSurfaceArm = (typeof GRAPH_SURFACE_ARMS)[number];

export const MEMORY_BLOCK_NAMES = [
  "conventions",
  "decisions",
  "gotchas",
] as const;
export type MemoryBlockName = (typeof MEMORY_BLOCK_NAMES)[number];

export interface MemoryFixture {
  readonly corpus: string;
  readonly entryKey: string;
  readonly name: MemoryBlockName;
  readonly sourcePaths: readonly string[];
  readonly text: string;
}

export interface GraphSurfaceProtocol {
  readonly concurrency: number;
  readonly repeatsPerCell: number;
  readonly toolOutputCaps: {
    readonly fileContentChars: number;
    readonly grepExcerptChars: number;
    readonly grepFilesMaxHits: number;
    readonly listFilesMaxPaths: number;
    readonly repoMapDefaultBudget: number;
    readonly searchNodesMaxResults: number;
  };
  readonly trialCount: number;
  readonly turnCap: number;
}

export interface GraphSurfacePreregistration {
  readonly armTools: Readonly<Record<GraphSurfaceArm, readonly string[]>>;
  readonly memoryFixtures: readonly MemoryFixture[];
  readonly models: readonly BenchmarkModelSpec[];
  readonly name: string;
  readonly protocol: GraphSurfaceProtocol;
  readonly questionSource: {
    readonly manifestDigest: string;
    readonly taskIds: readonly string[];
  };
}

function invalid(field: string): never {
  throw new TypeError(
    `Graph-surface pre-registration is malformed at ${field}.`,
  );
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(field);
  }
  return value as Record<string, unknown>;
}

function asPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) invalid(field);
  return value as number;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) invalid(field);
  return value as string;
}

function asStringArray(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((entry) => typeof entry === "string" && entry.length > 0)
  ) {
    invalid(field);
  }
  return value as string[];
}

function parsePreregistration(raw: unknown): GraphSurfacePreregistration {
  const root = asRecord(raw, "$");
  if (root.schemaVersion !== "graph-surface-v1") invalid("schemaVersion");
  const name = asString(root.name, "name");

  const arms = asRecord(root.arms, "arms");
  const armTools: Record<GraphSurfaceArm, readonly string[]> = {
    "file-exploration": asStringArray(
      asRecord(arms["file-exploration"], "arms.file-exploration").tools,
      "arms.file-exploration.tools",
    ),
    "graph-surface": asStringArray(
      asRecord(arms["graph-surface"], "arms.graph-surface").tools,
      "arms.graph-surface.tools",
    ),
  };

  const models = (
    Array.isArray(root.models) && root.models.length >= 2
      ? root.models
      : invalid("models")
  ).map((entry, index) => {
    const model = asRecord(entry, `models[${index}]`);
    const provider = model.provider;
    if (provider !== "anthropic" && provider !== "openai") {
      invalid(`models[${index}].provider`);
    }
    return {
      id: asString(model.id, `models[${index}].id`),
      provider,
    } satisfies BenchmarkModelSpec;
  });

  const protocolRaw = asRecord(root.protocol, "protocol");
  const capsRaw = asRecord(
    protocolRaw.toolOutputCaps,
    "protocol.toolOutputCaps",
  );
  const protocol: GraphSurfaceProtocol = {
    concurrency: asPositiveInteger(
      protocolRaw.concurrency,
      "protocol.concurrency",
    ),
    repeatsPerCell: asPositiveInteger(
      protocolRaw.repeatsPerCell,
      "protocol.repeatsPerCell",
    ),
    toolOutputCaps: {
      fileContentChars: asPositiveInteger(
        capsRaw.fileContentChars,
        "caps.fileContentChars",
      ),
      grepExcerptChars: asPositiveInteger(
        capsRaw.grepExcerptChars,
        "caps.grepExcerptChars",
      ),
      grepFilesMaxHits: asPositiveInteger(
        capsRaw.grepFilesMaxHits,
        "caps.grepFilesMaxHits",
      ),
      listFilesMaxPaths: asPositiveInteger(
        capsRaw.listFilesMaxPaths,
        "caps.listFilesMaxPaths",
      ),
      repoMapDefaultBudget: asPositiveInteger(
        capsRaw.repoMapDefaultBudget,
        "caps.repoMapDefaultBudget",
      ),
      searchNodesMaxResults: asPositiveInteger(
        capsRaw.searchNodesMaxResults,
        "caps.searchNodesMaxResults",
      ),
    },
    trialCount: asPositiveInteger(
      protocolRaw.trialCount,
      "protocol.trialCount",
    ),
    turnCap: asPositiveInteger(protocolRaw.turnCap, "protocol.turnCap"),
  };

  const questionSourceRaw = asRecord(root.questionSource, "questionSource");
  const manifestDigest = asString(
    questionSourceRaw.manifestDigest,
    "questionSource.manifestDigest",
  );
  if (!/^[0-9a-f]{64}$/.test(manifestDigest)) {
    invalid("questionSource.manifestDigest");
  }

  const memoryRaw = asRecord(root.memoryFixtures, "memoryFixtures");
  const memoryFixtures = (
    Array.isArray(memoryRaw.entries) && memoryRaw.entries.length > 0
      ? memoryRaw.entries
      : invalid("memoryFixtures.entries")
  ).map((entry, index) => {
    const fixture = asRecord(entry, `memoryFixtures.entries[${index}]`);
    const blockName = fixture.name;
    if (
      blockName !== "conventions" &&
      blockName !== "decisions" &&
      blockName !== "gotchas"
    ) {
      invalid(`memoryFixtures.entries[${index}].name`);
    }
    return {
      corpus: asString(fixture.corpus, `memory[${index}].corpus`),
      entryKey: asString(fixture.entryKey, `memory[${index}].entryKey`),
      name: blockName,
      sourcePaths: asStringArray(
        fixture.sourcePaths,
        `memory[${index}].sourcePaths`,
      ),
      text: asString(fixture.text, `memory[${index}].text`),
    } satisfies MemoryFixture;
  });

  return {
    armTools,
    memoryFixtures,
    models,
    name,
    protocol,
    questionSource: {
      manifestDigest,
      taskIds: asStringArray(
        questionSourceRaw.taskIds,
        "questionSource.taskIds",
      ),
    },
  };
}

export interface LoadedGraphSurfaceBenchmark {
  readonly preregistration: GraphSurfacePreregistration;
  readonly preregistrationSha256: string;
  readonly tasks: readonly BenchmarkTask[];
}

export async function loadGraphSurfaceBenchmark(input: {
  preregistrationPath: string;
  v3ManifestPath: string;
}): Promise<LoadedGraphSurfaceBenchmark> {
  const raw = await readFile(input.preregistrationPath, "utf8");
  const preregistration = parsePreregistration(JSON.parse(raw));
  const preregistrationSha256 = createHash("sha256")
    .update(raw, "utf8")
    .digest("hex");

  const v3 = await loadBenchmarkManifest(input.v3ManifestPath);
  const v3Digest = benchmarkManifestDigest(v3);
  if (v3Digest !== preregistration.questionSource.manifestDigest) {
    throw new Error(
      `The frozen v3 manifest digest ${v3Digest} does not match the pre-registered ${preregistration.questionSource.manifestDigest}; refusing to run.`,
    );
  }
  const byId = new Map(v3.tasks.map((task) => [task.id, task]));
  const tasks = preregistration.questionSource.taskIds.map((taskId) => {
    const task = byId.get(taskId);
    if (!task || task.grader.kind !== "answer-manifest") {
      throw new Error(
        `Pre-registered task ${taskId} is not an answer-manifest task in the frozen v3 manifest.`,
      );
    }
    return task;
  });
  const expectedTrials =
    tasks.length *
    GRAPH_SURFACE_ARMS.length *
    preregistration.models.length *
    preregistration.protocol.repeatsPerCell;
  if (expectedTrials !== preregistration.protocol.trialCount) {
    throw new Error(
      `Pre-registered trialCount ${preregistration.protocol.trialCount} disagrees with the grid (${expectedTrials}).`,
    );
  }
  return { preregistration, preregistrationSha256, tasks };
}
