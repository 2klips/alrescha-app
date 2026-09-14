/**
 * Graph-surface benchmark pre-registration loader (Phase 3 Wave F todo 15;
 * v3 contract added in Phase 4 Wave E todo 25).
 *
 * The pre-registration file is frozen before execution: its SHA-256 is
 * recorded in every report, and the question set is resolved from the frozen
 * v3 manifest whose digest the pre-registration pins — the harness refuses to
 * run when either digest disagrees.
 *
 * `graph-surface-v3` adds the production-shape contract: the graph arm is the
 * product's own `tools/list` catalogue (pinned by digest) over a body-less
 * store, with the installed instruction block, on top of the same checkout
 * tools the baseline has. A v3 file may also carry its questions inline —
 * the relational set — in which case the file's own digest is the lock.
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

export const GRAPH_SURFACE_SCHEMA_VERSIONS = [
  "graph-surface-v1",
  "graph-surface-v3",
] as const;
export type GraphSurfaceSchemaVersion =
  (typeof GRAPH_SURFACE_SCHEMA_VERSIONS)[number];

/**
 * What "fewer turns" means for the verdict.
 *
 * v1/v2 asked for a strict reduction. R5 §4.6 (d) states the installed
 * budget's bar as "PASS non-inferior and turns not increased", so v3
 * pre-registers the non-increasing form and the report prints both readings.
 */
export const PRIMARY_HYPOTHESES = [
  "turns-reduced",
  "turns-non-increasing",
] as const;
export type PrimaryHypothesis = (typeof PRIMARY_HYPOTHESES)[number];

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

/** The v3 production-shape contract (todo 25). */
export interface GraphSurfaceV3Contract {
  /**
   * Directory segments excluded from both the checkout corpus and the
   * production scan, so the two arms see the same universe of files. The
   * harness's own outputs live here and would otherwise leak answers.
   */
  readonly excludedSegments: readonly string[];
  /** Checkout tools both arms carry — the baseline is exactly these. */
  readonly fileTools: readonly string[];
  /** The graph arm's system prompt carries `renderAgentInstructionBlock()`. */
  readonly instructionBlock: boolean;
  readonly primaryHypothesis: PrimaryHypothesis;
  /**
   * SHA-256 of the product's `tools/list` catalogue (name, description,
   * inputSchema; sorted by name). The runner refuses to start when the live
   * catalogue differs — a tool definition edit after the lock is a different
   * experiment.
   */
  readonly productCatalogSha256: string;
  /** Tool names the product serves, in `tools/list` order. */
  readonly productTools: readonly string[];
  /** `buildLocalWorkspace` over a real scan: no bodies, ever. */
  readonly store: "production-shape";
  /** Scopes of the token the harness issues for the graph arm. */
  readonly tokenScopes: readonly ("mcp:read" | "mcp:write")[];
  /** Characters kept of one MCP tool result before the loop sees it. */
  readonly toolResultChars: number;
  /** Provider usage fields the loop records per model call. */
  readonly usageFields: readonly string[];
}

export interface GraphSurfaceQuestionSource {
  /** Pinned digest of the frozen manifest, or null when questions are inline. */
  readonly manifestDigest: string | null;
  readonly taskIds: readonly string[];
}

export interface GraphSurfacePreregistration {
  readonly armTools: Readonly<Record<GraphSurfaceArm, readonly string[]>>;
  readonly memoryFixtures: readonly MemoryFixture[];
  readonly models: readonly BenchmarkModelSpec[];
  readonly name: string;
  readonly protocol: GraphSurfaceProtocol;
  readonly questionSource: GraphSurfaceQuestionSource;
  /** Report basename for the real run (default "results.v1"). */
  readonly resultsBasename: string;
  readonly schemaVersion: GraphSurfaceSchemaVersion;
  /** Present only on `graph-surface-v3` files. */
  readonly v3: GraphSurfaceV3Contract | null;
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

function asSha256(value: unknown, field: string): string {
  const text = asString(value, field);
  if (!/^[0-9a-f]{64}$/.test(text)) invalid(field);
  return text;
}

function parseV3Contract(raw: unknown): GraphSurfaceV3Contract {
  const v3 = asRecord(raw, "v3");
  if (v3.store !== "production-shape") invalid("v3.store");
  if (typeof v3.instructionBlock !== "boolean") invalid("v3.instructionBlock");
  const primaryHypothesis = v3.primaryHypothesis;
  if (
    primaryHypothesis !== "turns-reduced" &&
    primaryHypothesis !== "turns-non-increasing"
  ) {
    invalid("v3.primaryHypothesis");
  }
  const tokenScopes = asStringArray(v3.tokenScopes, "v3.tokenScopes");
  if (
    !tokenScopes.every((scope) => scope === "mcp:read" || scope === "mcp:write")
  ) {
    invalid("v3.tokenScopes");
  }
  return {
    excludedSegments: asStringArray(v3.excludedSegments, "v3.excludedSegments"),
    fileTools: asStringArray(v3.fileTools, "v3.fileTools"),
    instructionBlock: v3.instructionBlock,
    primaryHypothesis,
    productCatalogSha256: asSha256(
      v3.productCatalogSha256,
      "v3.productCatalogSha256",
    ),
    productTools: asStringArray(v3.productTools, "v3.productTools"),
    store: "production-shape",
    tokenScopes: tokenScopes as ("mcp:read" | "mcp:write")[],
    toolResultChars: asPositiveInteger(
      v3.toolResultChars,
      "v3.toolResultChars",
    ),
    usageFields: asStringArray(v3.usageFields, "v3.usageFields"),
  };
}

/**
 * An inline answer-manifest task (the v3 relational set). The same shape the
 * frozen databrain manifest uses, so the frozen grader grades it unchanged.
 */
function parseInlineTask(raw: unknown, index: number): BenchmarkTask {
  const task = asRecord(raw, `questionSource.tasks[${index}]`);
  const grader = asRecord(task.grader, `questionSource.tasks[${index}].grader`);
  if (grader.kind !== "answer-manifest") {
    invalid(`questionSource.tasks[${index}].grader.kind`);
  }
  if (
    !Array.isArray(grader.requiredFacts) ||
    grader.requiredFacts.length === 0
  ) {
    invalid(`questionSource.tasks[${index}].grader.requiredFacts`);
  }
  return {
    grader: {
      kind: "answer-manifest",
      requiredFacts: grader.requiredFacts.map((aliases, factIndex) =>
        asStringArray(
          aliases,
          `questionSource.tasks[${index}].grader.requiredFacts[${factIndex}]`,
        ),
      ),
    },
    id: asString(task.id, `questionSource.tasks[${index}].id`),
    prompt: asString(task.prompt, `questionSource.tasks[${index}].prompt`),
    repository: asString(
      task.repository,
      `questionSource.tasks[${index}].repository`,
    ),
    retrievalQuery: asString(
      task.retrievalQuery,
      `questionSource.tasks[${index}].retrievalQuery`,
    ),
    type: "question-answering",
  };
}

interface ParsedPreregistration {
  readonly inlineTasks: readonly BenchmarkTask[] | null;
  readonly preregistration: GraphSurfacePreregistration;
}

function parsePreregistration(raw: unknown): ParsedPreregistration {
  const root = asRecord(raw, "$");
  const schemaVersion = root.schemaVersion;
  if (
    schemaVersion !== "graph-surface-v1" &&
    schemaVersion !== "graph-surface-v3"
  ) {
    invalid("schemaVersion");
  }
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
  const v3 =
    schemaVersion === "graph-surface-v3" ? parseV3Contract(root.v3) : null;
  let inlineTasks: BenchmarkTask[] | null = null;
  let manifestDigest: string | null = null;
  if (Array.isArray(questionSourceRaw.tasks)) {
    // Inline questions are a v3 affordance (the relational set); a v1 file
    // carrying them would be a question set nobody froze.
    if (v3 === null) invalid("questionSource.tasks");
    if (questionSourceRaw.tasks.length === 0) invalid("questionSource.tasks");
    inlineTasks = questionSourceRaw.tasks.map(parseInlineTask);
  } else {
    manifestDigest = asSha256(
      questionSourceRaw.manifestDigest,
      "questionSource.manifestDigest",
    );
  }
  const taskIds = inlineTasks
    ? inlineTasks.map(({ id }) => id)
    : asStringArray(questionSourceRaw.taskIds, "questionSource.taskIds");
  if (new Set(taskIds).size !== taskIds.length) {
    invalid("questionSource.taskIds");
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

  if (v3) {
    // The graph arm is the checkout tools plus the product catalogue plus
    // submit_answer — as a set. Anything else is a surface nobody registered.
    const expected = new Set([
      ...v3.fileTools,
      ...v3.productTools,
      "submit_answer",
    ]);
    const declared = new Set(armTools["graph-surface"]);
    if (
      expected.size !== declared.size ||
      [...expected].some((tool) => !declared.has(tool))
    ) {
      invalid(
        "arms.graph-surface.tools (must equal fileTools ∪ productTools ∪ submit_answer)",
      );
    }
    const baseline = new Set(armTools["file-exploration"]);
    const expectedBaseline = new Set([...v3.fileTools, "submit_answer"]);
    if (
      baseline.size !== expectedBaseline.size ||
      [...expectedBaseline].some((tool) => !baseline.has(tool))
    ) {
      invalid(
        "arms.file-exploration.tools (must equal fileTools ∪ submit_answer)",
      );
    }
  }

  return {
    inlineTasks,
    preregistration: {
      armTools,
      memoryFixtures,
      models,
      name,
      protocol,
      questionSource: { manifestDigest, taskIds },
      resultsBasename:
        root.resultsBasename === undefined
          ? "results.v1"
          : asString(root.resultsBasename, "resultsBasename"),
      schemaVersion,
      v3,
    },
  };
}

export interface LoadedGraphSurfaceBenchmark {
  readonly preregistration: GraphSurfacePreregistration;
  readonly preregistrationSha256: string;
  readonly tasks: readonly BenchmarkTask[];
}

export function preregistrationSha256(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function loadGraphSurfaceBenchmark(input: {
  preregistrationPath: string;
  v3ManifestPath: string;
}): Promise<LoadedGraphSurfaceBenchmark> {
  const raw = await readFile(input.preregistrationPath, "utf8");
  const { inlineTasks, preregistration } = parsePreregistration(
    JSON.parse(raw),
  );
  const sha256 = preregistrationSha256(raw);

  let tasks: BenchmarkTask[];
  if (inlineTasks) {
    tasks = [...inlineTasks];
  } else {
    const v3 = await loadBenchmarkManifest(input.v3ManifestPath);
    const v3Digest = benchmarkManifestDigest(v3);
    if (v3Digest !== preregistration.questionSource.manifestDigest) {
      throw new Error(
        `The frozen v3 manifest digest ${v3Digest} does not match the pre-registered ${preregistration.questionSource.manifestDigest}; refusing to run.`,
      );
    }
    const byId = new Map(v3.tasks.map((task) => [task.id, task]));
    tasks = preregistration.questionSource.taskIds.map((taskId) => {
      const task = byId.get(taskId);
      if (!task || task.grader.kind !== "answer-manifest") {
        throw new Error(
          `Pre-registered task ${taskId} is not an answer-manifest task in the frozen v3 manifest.`,
        );
      }
      return task;
    });
  }
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
  return { preregistration, preregistrationSha256: sha256, tasks };
}
