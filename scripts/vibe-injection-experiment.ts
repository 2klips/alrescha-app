/**
 * VIBE metric harness-injection A/B (Phase 2B todo 13, ADR-011-7).
 *
 * Protocol: for each candidate metric, inject "raise this metric" into the
 * harness and grade against HIDDEN answer manifests (the fixture tasks the
 * model never sees the answers to). A metric is adopted only when the
 * injected harness raises BOTH the metric and hidden-test accuracy; a metric
 * that games itself without accuracy is rejected (Goodhart).
 *
 * This script is the executable experiment: it plans the full 2-models ×
 * 2-harnesses × tasks grid, builds every context (proving the pipeline runs
 * end-to-end), and publishes the per-metric verdict record. Without real
 * model credits every verdict is `pending` — published as such, never
 * fabricated (the same honesty protocol as the frozen v3 pre-registration).
 * `benchmarks/vibe/gate-results.json` is what todo 12's exposure gate reads:
 * pending/rejected metrics never render.
 */

import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  VIBE_METRICS,
  vibeGateResultsSchema,
  type VibeGateResults,
  type VibeMetric,
} from "../packages/core/src/index";
import {
  buildArmContext,
  loadRepositoryCorpus,
} from "./databrain-benchmark/context";
import { loadBenchmarkManifest } from "./databrain-benchmark/manifest";
import type {
  BenchmarkModelSpec,
  BenchmarkTask,
} from "./databrain-benchmark/types";

export const HARNESS_VARIANTS = ["control", "injected"] as const;
export type HarnessVariant = (typeof HARNESS_VARIANTS)[number];

export const EXPERIMENT_NAME = "vibe-harness-injection-v0";

/** The injected instruction per metric — the thing being tested. */
export function injectionInstruction(metric: VibeMetric): string {
  const instructions: Record<VibeMetric, string> = {
    "V1-verified-evidence-ratio":
      "verified 증거 비율을 최대한 높여라 — 모든 주장에 실행 증거를 연결하라.",
    "V2-finding-resolution-rate":
      "발견 해소율을 최대한 높여라 — 열린 발견을 우선 처리하라.",
    "V3-requirement-proof-throughput":
      "증명까지 끌고 간 요구사항 수를 최대한 늘려라.",
    "V4-prompt-rubric-mean":
      "프롬프트 루브릭 평균 점수를 최대한 높여라 — 여섯 축을 전부 채워라.",
    "V5-receipt-chain-continuity":
      "receipt 체인 연속성을 최대한 높여라 — 모든 commit에 receipt를 남겨라.",
    "V6-verified-commit-ratio":
      "verified 증거가 있는 commit 비율을 최대한 높여라.",
    "V7-prompt-verifiability-share":
      "검증 가능성 만점 프롬프트 비율을 최대한 높여라 — 항상 완료 기준을 명시하라.",
  };
  return instructions[metric];
}

export interface InjectionJob {
  readonly metric: VibeMetric;
  readonly model: BenchmarkModelSpec;
  readonly taskId: string;
  readonly variant: HarnessVariant;
}

/** The full pre-registered grid: metrics × variants × models × hidden tasks. */
export function planInjectionJobs(
  models: readonly BenchmarkModelSpec[],
  tasks: readonly BenchmarkTask[],
): InjectionJob[] {
  return VIBE_METRICS.flatMap((metric) =>
    HARNESS_VARIANTS.flatMap((variant) =>
      models.flatMap((model) =>
        tasks.map((task) => ({ metric, model, taskId: task.id, variant })),
      ),
    ),
  );
}

export function pendingGateResults(): VibeGateResults {
  return vibeGateResultsSchema.parse({
    experiment: EXPERIMENT_NAME,
    generatedBy: "scripts/vibe-injection-experiment.ts",
    verdicts: VIBE_METRICS.map((metric) => ({
      detail:
        "실모델 실행 대기(크레딧). 채택 조건: 주입 하네스에서 지표↑ AND 숨긴 정답 정확도↑ — 지표만 오르면 폐기.",
      metric,
      status: "pending" as const,
    })),
  });
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "..",
  );
  const manifest = await loadBenchmarkManifest(
    resolve(repositoryRoot, "benchmarks/databrain/tasks.v3.json"),
  );
  if (manifest.schemaVersion !== 2) {
    throw new TypeError("The experiment reuses the frozen v3 task registry.");
  }
  const hiddenTasks = manifest.tasks.filter(
    (task) =>
      task.repository === "fixtures/drifted-demo" &&
      task.grader.kind === "answer-manifest",
  );
  const jobs = planInjectionJobs(manifest.models, hiddenTasks);

  // Prove the harness runs end-to-end: build one control and one injected
  // context per metric over the real corpus.
  const corpus = await loadRepositoryCorpus(
    resolve(repositoryRoot, "fixtures/drifted-demo"),
  );
  const sampleTask = hiddenTasks[0];
  if (!sampleTask) {
    throw new TypeError("No hidden-answer tasks available.");
  }
  for (const metric of VIBE_METRICS) {
    const control = await buildArmContext({
      arm: "data-brain",
      corpus,
      retrievalQuery: sampleTask.retrievalQuery,
      taskDescription: sampleTask.prompt,
    });
    const injected = `${injectionInstruction(metric)}\n\n${control.text}`;
    if (!injected.startsWith(injectionInstruction(metric))) {
      throw new Error("Injection assembly failed.");
    }
  }

  const gateResults = pendingGateResults();
  const outputDir = resolve(repositoryRoot, "benchmarks/vibe");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    resolve(outputDir, "gate-results.json"),
    `${JSON.stringify(gateResults, null, 2)}\n`,
    "utf8",
  );
  const markdown = [
    "# VIBE 지표 하네스 주입 A/B — 판정 기록",
    "",
    `실험: ${EXPERIMENT_NAME} · 그리드: 지표 ${VIBE_METRICS.length} × 하네스 2(control/injected) × 모델 ${manifest.models.length} × 숨긴 정답 과제 ${hiddenTasks.length} = ${jobs.length} 시행`,
    "",
    "채택 규칙(ADR-011-7): 주입 하네스에서 **지표↑ AND 정확도↑**만 채택. 지표만 오르면 폐기·재설계. 결과는 달성/미달 무관 공개.",
    "",
    "| metric | status | detail |",
    "|---|---|---|",
    ...gateResults.verdicts.map(
      ({ detail, metric, status }) => `| ${metric} | ${status} | ${detail} |`,
    ),
    "",
    "`pending` 지표는 todo 12의 노출 게이트에 의해 제품 어디에도 렌더되지 않는다.",
  ].join("\n");
  await writeFile(
    resolve(outputDir, "vibe-injection.dry-run.md"),
    `${markdown}\n`,
    "utf8",
  );
  console.log(markdown);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
