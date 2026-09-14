/**
 * Graph-surface benchmark CLI (Phase 3 Wave F todo 15; v3 in Phase 4 Wave E
 * todo 25).
 *
 * `--dry-run`: mock agent over the full pre-registered grid — proves the
 * manifest lock, workspaces, tools, loop accounting, grading, and report
 * pipeline with zero credits. Writes results.dry-run.*.
 *
 * Real mode: executes the frozen trial grid against both providers and
 * writes the pre-registered results basename — published regardless of the
 * hypothesis verdict.
 *
 * `--preregistration=<repo-relative path>` selects the frozen file. A
 * `graph-surface-v3` file switches the graph arm to the production surface:
 * a body-less scan served by the hosted server factory, tool definitions
 * converted from its `tools/list`, the installed instruction block in the
 * system prompt, and the checkout tools the baseline has — one trial-owned
 * store per graph-arm trial.
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

import { renderAgentInstructionBlock } from "../packages/core/src/context/agent-instructions";
import {
  loadRepositoryCorpus,
  type RepositoryCorpus,
} from "./databrain-benchmark/context";
import { gradeBenchmarkOutput } from "./databrain-benchmark/grading";
import type { BenchmarkTask } from "./databrain-benchmark/types";
import {
  createAnthropicAgentModel,
  createMockAgentModel,
  createOpenAiAgentModel,
  type AgentModel,
} from "./graph-surface-benchmark/loop";
import {
  GRAPH_SURFACE_ARMS,
  loadGraphSurfaceBenchmark,
  type GraphSurfaceArm,
  type GraphSurfacePreregistration,
} from "./graph-surface-benchmark/manifest";
import {
  assertBodilessWorkspace,
  buildProductionWorkspace,
  createProductExecutor,
  openProductSurface,
  type ProductToolCatalog,
} from "./graph-surface-benchmark/product-surface";
import {
  judgeHypothesis,
  renderGraphSurfaceMarkdown,
  type GraphSurfaceTrial,
  type RenderGraphSurfaceInput,
  type TrialQuality,
} from "./graph-surface-benchmark/report";
import {
  createToolExecutor,
  SUBMIT_ANSWER_TOOL,
  toolDefinitionsForNames,
  type AgentToolExecutor,
  type ToolDefinition,
  type ToolExecutor,
} from "./graph-surface-benchmark/tools";
import {
  benchmarkWorkspace,
  memoryEntriesFromFixtures,
} from "./graph-surface-benchmark/workspace";

const SYSTEM_PROMPT =
  "You are answering a question about a repository using the provided tools. Each tool call costs a turn — explore efficiently. When you are confident, call submit_answer exactly once with a complete answer that includes the exact identifiers, paths, and values you found.";

const PROVIDER_KEY_NAMES = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
} as const;

/** What the local scan calls each corpus — cosmetic, and deterministic. */
function localRepositoryName(corpusKey: string): string {
  return corpusKey === "."
    ? "local/alrescha-app"
    : `local/${basename(corpusKey)}`;
}

async function runPool<T>(
  jobs: readonly (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = Array.from({ length: jobs.length });
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, jobs.length) },
    async () => {
      while (next < jobs.length) {
        const index = next;
        next += 1;
        const job = jobs[index];
        if (job) results[index] = await job();
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function corpusCommit(repositoryRoot: string): Promise<string | null> {
  try {
    const { stdout } = await promisify(execFile)("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
    });
    const sha = stdout.trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function scriptedAnswer(task: BenchmarkTask): string {
  return task.grader.kind === "answer-manifest"
    ? task.grader.requiredFacts.map((aliases) => aliases[0] ?? "").join(". ")
    : "";
}

interface CorpusScan {
  readonly artifactCount: number;
  readonly commitSha: string;
  readonly edgeCount: number;
}

/**
 * The v3 graph arm's fixed parts: production workspaces per corpus, the
 * product catalogue (checked against the lock), and the tool definitions.
 */
interface ProductionArm {
  readonly catalog: ProductToolCatalog;
  readonly graphTools: readonly ToolDefinition[];
  readonly scans: Readonly<Record<string, CorpusScan>>;
  readonly systemPrompt: string;
  readonly workspaces: ReadonlyMap<
    string,
    Awaited<ReturnType<typeof buildProductionWorkspace>>["workspace"]
  >;
}

async function prepareProductionArm(input: {
  corpusKeys: readonly string[];
  preregistration: GraphSurfacePreregistration;
  repositoryRoot: string;
}): Promise<ProductionArm> {
  const v3 = input.preregistration.v3;
  if (!v3) throw new TypeError("Not a graph-surface-v3 pre-registration.");
  const workspaces = new Map<
    string,
    Awaited<ReturnType<typeof buildProductionWorkspace>>["workspace"]
  >();
  const scans: Record<string, CorpusScan> = {};
  for (const corpusKey of input.corpusKeys) {
    const built = await buildProductionWorkspace({
      excludedSegments: v3.excludedSegments,
      memoryEntries: memoryEntriesFromFixtures(
        input.preregistration.memoryFixtures,
        corpusKey,
      ),
      repositoryFullName: localRepositoryName(corpusKey),
      rootDir: resolve(input.repositoryRoot, corpusKey),
    });
    assertBodilessWorkspace(built.workspace);
    workspaces.set(corpusKey, built.workspace);
    scans[corpusKey] = {
      artifactCount: built.artifactCount,
      commitSha: built.commitSha,
      edgeCount: built.edgeCount,
    };
    process.stdout.write(
      `production store ${corpusKey}: ${built.artifactCount} artifacts, ${built.edgeCount} edges, no bodies (scan ${built.commitSha.slice(0, 12)})\n`,
    );
  }
  // The catalogue is the server's, not the workspace's: read it once.
  const probeWorkspace = workspaces.values().next().value;
  if (!probeWorkspace) throw new TypeError("No corpus to probe.");
  const probe = await openProductSurface({
    scopes: v3.tokenScopes,
    toolResultChars: v3.toolResultChars,
    workspace: probeWorkspace,
  });
  const catalog = probe.catalog;
  await probe.close();
  if (catalog.sha256 !== v3.productCatalogSha256) {
    throw new Error(
      `The product tools/list catalogue digest ${catalog.sha256} does not match the pre-registered ${v3.productCatalogSha256}; refusing to run.`,
    );
  }
  const liveNames = catalog.tools.map(({ name }) => name);
  if (JSON.stringify(liveNames) !== JSON.stringify(v3.productTools)) {
    throw new Error(
      `The product tools/list names [${liveNames.join(", ")}] differ from the pre-registered [${v3.productTools.join(", ")}]; refusing to run.`,
    );
  }
  return {
    catalog,
    graphTools: [
      ...catalog.tools,
      ...toolDefinitionsForNames(v3.fileTools),
      SUBMIT_ANSWER_TOOL,
    ],
    scans,
    systemPrompt: v3.instructionBlock
      ? `${SYSTEM_PROMPT}\n\n${renderAgentInstructionBlock()}`
      : SYSTEM_PROMPT,
    workspaces,
  };
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const dryRun = process.argv.includes("--dry-run");
  const preregistrationOption = process.argv
    .find((argument) => argument.startsWith("--preregistration="))
    ?.slice("--preregistration=".length);
  const preregistrationFile =
    preregistrationOption ?? "benchmarks/graph-surface/preregistration.v1.json";
  const loaded = await loadGraphSurfaceBenchmark({
    preregistrationPath: resolve(repositoryRoot, preregistrationFile),
    v3ManifestPath: resolve(
      repositoryRoot,
      "benchmarks/databrain/tasks.v3.json",
    ),
  });
  const { preregistration, preregistrationSha256 } = loaded;
  // A preflight smoke: `--tasks=a,b --output-basename=results.v3.smoke` runs
  // part of the grid under a basename the audit never reads. Both flags are
  // required together so a partial grid can never land on a release name.
  const taskFilter = process.argv
    .find((argument) => argument.startsWith("--tasks="))
    ?.slice("--tasks=".length)
    .split(",")
    .filter((id) => id.length > 0);
  const outputBasename = process.argv
    .find((argument) => argument.startsWith("--output-basename="))
    ?.slice("--output-basename=".length);
  if ((taskFilter === undefined) !== (outputBasename === undefined)) {
    throw new TypeError("--tasks and --output-basename go together.");
  }
  if (
    outputBasename !== undefined &&
    /^results\.v\d+(-relational)?$/.test(outputBasename)
  ) {
    throw new TypeError("A partial run may not use a release basename.");
  }
  const tasks = taskFilter
    ? loaded.tasks.filter(({ id }) => taskFilter.includes(id))
    : loaded.tasks;
  if (tasks.length === 0) throw new TypeError("No tasks selected.");
  const v3 = preregistration.v3;

  const corpusKeys = [...new Set(tasks.map(({ repository }) => repository))];
  const corpora = new Map<string, RepositoryCorpus>();
  const executors = new Map<string, ToolExecutor>();
  for (const corpusKey of corpusKeys) {
    const corpus = await loadRepositoryCorpus(
      resolve(repositoryRoot, corpusKey),
    );
    corpora.set(corpusKey, corpus);
    if (v3) {
      // The baseline and the graph arm's checkout half are the same executor
      // over the same corpus — the only difference between the arms is the
      // product.
      executors.set(
        `file-exploration ${corpusKey}`,
        createToolExecutor({
          arm: "file-exploration",
          caps: preregistration.protocol.toolOutputCaps,
          corpus,
          toolNames: preregistration.armTools["file-exploration"],
          workspace: benchmarkWorkspace({
            corpus,
            corpusKey,
            memoryFixtures: [],
          }),
        }),
      );
      continue;
    }
    const workspace = benchmarkWorkspace({
      corpus,
      corpusKey,
      memoryFixtures: preregistration.memoryFixtures,
    });
    for (const arm of GRAPH_SURFACE_ARMS) {
      executors.set(
        `${arm} ${corpusKey}`,
        createToolExecutor({
          arm,
          caps: preregistration.protocol.toolOutputCaps,
          corpus,
          toolNames: preregistration.armTools[arm],
          workspace,
        }),
      );
    }
  }
  const production = v3
    ? await prepareProductionArm({
        corpusKeys,
        preregistration,
        repositoryRoot,
      })
    : null;

  const mock = createMockAgentModel();
  const runners = new Map<string, AgentModel>();
  for (const model of preregistration.models) {
    if (dryRun) {
      runners.set(model.id, mock);
      continue;
    }
    const keyName = PROVIDER_KEY_NAMES[model.provider];
    const apiKey = process.env[keyName] ?? "";
    if (apiKey.trim().length === 0) {
      throw new TypeError(`${keyName} is required for the real run.`);
    }
    runners.set(
      model.id,
      model.provider === "anthropic"
        ? createAnthropicAgentModel(apiKey)
        : createOpenAiAgentModel(apiKey),
    );
  }

  interface PlannedTrial {
    readonly arm: GraphSurfaceArm;
    readonly model: string;
    readonly repeat: number;
    readonly task: BenchmarkTask;
  }
  const plan: PlannedTrial[] = tasks.flatMap((task) =>
    GRAPH_SURFACE_ARMS.flatMap((arm) =>
      preregistration.models.flatMap((model) =>
        Array.from(
          { length: preregistration.protocol.repeatsPerCell },
          (_, repeatIndex) => ({
            arm,
            model: model.id,
            repeat: repeatIndex + 1,
            task,
          }),
        ),
      ),
    ),
  );

  const toolsForArm = (arm: GraphSurfaceArm): readonly ToolDefinition[] =>
    production && arm === "graph-surface"
      ? production.graphTools
      : toolDefinitionsForNames(preregistration.armTools[arm]);
  const systemForArm = (arm: GraphSurfaceArm): string =>
    production && arm === "graph-surface"
      ? production.systemPrompt
      : SYSTEM_PROMPT;

  let completed = 0;
  const trials = await runPool(
    plan.map((planned) => async (): Promise<GraphSurfaceTrial> => {
      const runner = runners.get(planned.model);
      if (!runner) throw new TypeError("Unplanned model.");
      const base = {
        arm: planned.arm,
        model: planned.model,
        repeat: planned.repeat,
        taskId: planned.task.id,
      } as const;
      // The graph arm under v3 owns a store for exactly this trial.
      const surface =
        production && planned.arm === "graph-surface" && v3
          ? await openProductSurface({
              scopes: v3.tokenScopes,
              toolResultChars: v3.toolResultChars,
              workspace: production.workspaces.get(planned.task.repository)!,
            })
          : null;
      try {
        let executor: AgentToolExecutor;
        if (surface && v3) {
          const fileExecutor = executors.get(
            `file-exploration ${planned.task.repository}`,
          );
          if (!fileExecutor) throw new TypeError("Unplanned corpus.");
          executor = createProductExecutor({
            fileExecutor,
            fileTools: v3.fileTools,
            productTools: v3.productTools,
            surface,
          });
        } else {
          const corpusExecutor = executors.get(
            `${planned.arm} ${planned.task.repository}`,
          );
          if (!corpusExecutor) throw new TypeError("Unplanned arm or corpus.");
          executor = corpusExecutor;
        }
        const outcome = await runner.runTrial({
          executor,
          model: planned.model,
          prompt: planned.task.prompt,
          scriptedAnswer: scriptedAnswer(planned.task),
          system: systemForArm(planned.arm),
          tools: toolsForArm(planned.arm),
          turnCap: preregistration.protocol.turnCap,
        });
        const grade =
          outcome.answer === null
            ? null
            : await gradeBenchmarkOutput({
                output: { answer: outcome.answer, files: [], findings: [] },
                task: planned.task,
              });
        const quality: TrialQuality =
          grade === null || grade.score === 0
            ? "FAIL"
            : grade.passed
              ? "PASS"
              : "PARTIAL";
        completed += 1;
        process.stdout.write(
          `graph-surface ${completed}/${plan.length}: ${planned.arm} ${planned.model} ${planned.task.id}#${planned.repeat} turns=${outcome.turns} ${quality}\n`,
        );
        return {
          ...base,
          answer: outcome.answer,
          cacheCreationTokens: outcome.cacheCreationTokens,
          cacheReadTokens: outcome.cacheReadTokens,
          calls: outcome.calls,
          errorMessage: null,
          inputTokens: outcome.inputTokens,
          ...(surface ? { observations: surface.observations() } : {}),
          outputTokens: outcome.outputTokens,
          quality,
          score: grade?.score ?? 0,
          status: "succeeded",
          toolCalls: outcome.toolCalls,
          toolNames: outcome.toolNames,
          turns: outcome.turns,
        };
      } catch (error) {
        completed += 1;
        process.stdout.write(
          `graph-surface ${completed}/${plan.length}: ${planned.arm} ${planned.model} ${planned.task.id}#${planned.repeat} FAILED\n`,
        );
        return {
          ...base,
          answer: null,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          calls: [],
          errorMessage:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Unknown failure",
          inputTokens: 0,
          outputTokens: 0,
          quality: "FAIL",
          score: 0,
          status: "failed",
          toolCalls: 0,
          toolNames: [],
          turns: preregistration.protocol.turnCap,
        };
      } finally {
        await surface?.close();
      }
    }),
    preregistration.protocol.concurrency,
  );

  const primaryHypothesis = v3?.primaryHypothesis ?? "turns-reduced";
  const judgment = judgeHypothesis(trials, primaryHypothesis);
  const generatedAt = new Date().toISOString();
  const commitSha = await corpusCommit(repositoryRoot);
  const outputDir = resolve(repositoryRoot, "benchmarks/graph-surface");
  await mkdir(outputDir, { recursive: true });
  const basenameOut =
    outputBasename ??
    (dryRun
      ? preregistration.resultsBasename.replace(/^results/, "results.dry-run")
      : preregistration.resultsBasename);
  const inline = preregistration.questionSource.manifestDigest === null;
  const armNotes = v3
    ? [
        `file-exploration: 체크아웃 툴 ${v3.fileTools.join(", ")} — MCP 없음.`,
        `graph-surface: 같은 체크아웃 툴 + 제품 tools/list ${v3.productTools.length}툴(요약 전용 스토어 — 본문 0) + 설치 지시 블록${v3.instructionBlock ? "" : " 없음"}.`,
        `프로덕션 스토어 스캔: ${Object.entries(production?.scans ?? {})
          .map(
            ([key, scan]) =>
              `${key} ${scan.artifactCount}노드·${scan.edgeCount}엣지 (scan ${scan.commitSha.slice(0, 12)})`,
          )
          .join(" · ")}.`,
      ]
    : null;
  const title = v3
    ? inline
      ? "그래프 표면 v3 — 관계형 질문 4개 세트 (부속 실험 ④)"
      : "그래프 표면 v3 — 설치된 예산 · 프로덕션 형태 스토어 vs 체크아웃 탐색"
    : null;
  const render: Omit<RenderGraphSurfaceInput, "judgment" | "trials"> = {
    ...(armNotes ? { armNotes } : {}),
    corpusCommit: commitSha,
    generatedAt,
    mode: dryRun ? "dry-run" : "real",
    models: preregistration.models.map(({ id }) => id),
    preregistrationFile,
    preregistrationSha256,
    productCatalogSha256: v3?.productCatalogSha256 ?? null,
    ...(inline
      ? {
          questionSourceLine: `- 질문 출처: 사전등록 파일 내 인라인 answer-manifest ${tasks.length}과제 (파일 다이제스트가 잠금)`,
        }
      : {}),
    ...(title ? { title } : {}),
    v3ManifestDigest: preregistration.questionSource.manifestDigest,
  };
  const markdown = renderGraphSurfaceMarkdown({ ...render, judgment, trials });
  await writeFile(
    resolve(outputDir, `${basenameOut}.json`),
    `${JSON.stringify(
      {
        corpusCommit: commitSha,
        corpusScans: production?.scans ?? null,
        generatedAt,
        judgment,
        mode: dryRun ? "dry-run" : "real",
        preregistrationFile,
        preregistrationSha256,
        primaryHypothesis,
        productCatalogSha256: v3?.productCatalogSha256 ?? null,
        render,
        schemaVersion: preregistration.schemaVersion,
        trials,
        v3ManifestDigest: preregistration.questionSource.manifestDigest,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(resolve(outputDir, `${basenameOut}.md`), markdown, "utf8");
  const failed = trials.filter(({ status }) => status === "failed").length;
  process.stdout.write(
    `Graph-surface ${dryRun ? "dry-run" : "real"}${taskFilter ? " (partial — not a release)" : ""}: ${trials.length}/${taskFilter ? plan.length : preregistration.protocol.trialCount} trials, ${failed} failed. Verdict: ${judgment.verdict}\n`,
  );
  process.stdout.write(
    `Reports: benchmarks/graph-surface/${basenameOut}.{json,md}\n`,
  );
}

await main();
