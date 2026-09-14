/**
 * Aggregation and rendering for the graph-surface benchmark (todo 15; v3
 * additions in todo 25). PASS/PARTIAL/FAIL follows the pre-registered
 * grading; the primary metric is turns (model invocations per trial).
 * Published regardless of outcome.
 */

import type { ModelCallUsage } from "./loop";
import {
  GRAPH_SURFACE_ARMS,
  type GraphSurfaceArm,
  type PrimaryHypothesis,
} from "./manifest";

export type TrialQuality = "PASS" | "PARTIAL" | "FAIL";

/**
 * What a graph-arm trial left in its own store (todo 25 auxiliary ①③). Counts
 * and the writer's `matched` verdicts only — never the text the model wrote.
 */
export interface TrialObservations {
  /** `log_progress` events, by how the writer matched them to a todo. */
  readonly progressMatched: Readonly<Record<string, number>>;
  /** Todos the trial minted (`matched: "created"`). */
  readonly todosCreated: number;
  /**
   * Of the minted todos, how many share a normalised title with another todo
   * the store already held — a duplicate the title matcher did not catch.
   */
  readonly todosDuplicated: number;
}

export interface GraphSurfaceTrial {
  readonly answer: string | null;
  readonly arm: GraphSurfaceArm;
  /** Absent on v1/v2 reports, which predate the cache halves. */
  readonly cacheCreationTokens?: number;
  readonly cacheReadTokens?: number;
  /** Per-call usage (v3). Absent on v1/v2 reports. */
  readonly calls?: readonly ModelCallUsage[];
  readonly errorMessage: string | null;
  readonly inputTokens: number;
  readonly model: string;
  /** Present on v3 graph-arm trials. */
  readonly observations?: TrialObservations;
  readonly outputTokens: number;
  readonly quality: TrialQuality;
  readonly repeat: number;
  readonly score: number;
  readonly status: "succeeded" | "failed";
  readonly taskId: string;
  readonly toolCalls: number;
  /** Tool names in call order (v3). Absent on v1/v2 reports. */
  readonly toolNames?: readonly string[];
  readonly turns: number;
}

export interface ArmAggregate {
  readonly arm: GraphSurfaceArm;
  readonly cacheCreationTokens: number;
  readonly cacheReadTokens: number;
  readonly failCount: number;
  readonly failedTrials: number;
  readonly inputTokens: number;
  readonly meanScore: number;
  readonly meanToolCalls: number;
  readonly meanTurns: number;
  readonly model: string | "pooled";
  readonly outputTokens: number;
  readonly partialCount: number;
  readonly passCount: number;
  readonly passRate: number;
  readonly trialCount: number;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function aggregateArm(
  trials: readonly GraphSurfaceTrial[],
  arm: GraphSurfaceArm,
  model: string | "pooled",
): ArmAggregate {
  const mine = trials.filter(
    (trial) =>
      trial.arm === arm && (model === "pooled" || trial.model === model),
  );
  const passCount = mine.filter(({ quality }) => quality === "PASS").length;
  return {
    arm,
    cacheCreationTokens: mine.reduce(
      (sum, { cacheCreationTokens }) => sum + (cacheCreationTokens ?? 0),
      0,
    ),
    cacheReadTokens: mine.reduce(
      (sum, { cacheReadTokens }) => sum + (cacheReadTokens ?? 0),
      0,
    ),
    failCount: mine.filter(({ quality }) => quality === "FAIL").length,
    failedTrials: mine.filter(({ status }) => status === "failed").length,
    inputTokens: mine.reduce((sum, { inputTokens }) => sum + inputTokens, 0),
    meanScore: round(mean(mine.map(({ score }) => score))),
    meanToolCalls: round(mean(mine.map(({ toolCalls }) => toolCalls))),
    meanTurns: round(mean(mine.map(({ turns }) => turns))),
    model,
    outputTokens: mine.reduce((sum, { outputTokens }) => sum + outputTokens, 0),
    partialCount: mine.filter(({ quality }) => quality === "PARTIAL").length,
    passCount,
    passRate: mine.length === 0 ? 0 : round(passCount / mine.length),
    trialCount: mine.length,
  };
}

export interface HypothesisJudgment {
  readonly baselineMeanTurns: number;
  readonly baselinePassRate: number;
  readonly graphMeanTurns: number;
  readonly graphPassRate: number;
  readonly passRateDelta: number;
  /** The reading the verdict used. */
  readonly primaryHypothesis: PrimaryHypothesis;
  readonly primaryMet: boolean;
  readonly qualityNonInferior: boolean;
  readonly turnsDelta: number;
  /** The v1 reading (strict reduction), printed beside a v3 verdict. */
  readonly turnsReduced: boolean;
  readonly verdict: "MET" | "NOT MET";
}

export function judgeHypothesis(
  trials: readonly GraphSurfaceTrial[],
  primaryHypothesis: PrimaryHypothesis = "turns-reduced",
): HypothesisJudgment {
  const baseline = aggregateArm(trials, "file-exploration", "pooled");
  const graph = aggregateArm(trials, "graph-surface", "pooled");
  const turnsDelta = round(graph.meanTurns - baseline.meanTurns);
  const passRateDelta = round(graph.passRate - baseline.passRate);
  const turnsReduced = turnsDelta < 0;
  const primaryMet =
    primaryHypothesis === "turns-reduced" ? turnsReduced : turnsDelta <= 0;
  const qualityNonInferior = passRateDelta >= -0.05;
  return {
    baselineMeanTurns: baseline.meanTurns,
    baselinePassRate: baseline.passRate,
    graphMeanTurns: graph.meanTurns,
    graphPassRate: graph.passRate,
    passRateDelta,
    primaryHypothesis,
    primaryMet,
    qualityNonInferior,
    turnsDelta,
    turnsReduced,
    verdict: primaryMet && qualityNonInferior ? "MET" : "NOT MET",
  };
}

export interface RenderGraphSurfaceInput {
  /** One line per arm describing what it carried (v3). */
  readonly armNotes?: readonly string[];
  readonly corpusCommit: string | null;
  readonly generatedAt: string;
  readonly judgment: HypothesisJudgment;
  readonly mode: "dry-run" | "real";
  readonly models: readonly string[];
  /** Pinned `tools/list` digest (v3). */
  readonly productCatalogSha256?: string | null;
  /** Repository-relative pre-registration path shown in the contract line. */
  readonly preregistrationFile?: string;
  readonly preregistrationSha256: string;
  /** How the question set was frozen. */
  readonly questionSourceLine?: string;
  readonly title?: string;
  readonly trials: readonly GraphSurfaceTrial[];
  readonly v3ManifestDigest: string | null;
}

export function renderGraphSurfaceMarkdown(
  input: RenderGraphSurfaceInput,
): string {
  const rows: string[] = [];
  for (const model of ["pooled", ...input.models]) {
    for (const arm of GRAPH_SURFACE_ARMS) {
      const aggregate = aggregateArm(input.trials, arm, model);
      rows.push(
        `| ${model} | ${arm} | ${aggregate.trialCount} | ${aggregate.meanTurns} | ${aggregate.meanToolCalls} | ${aggregate.passCount}/${aggregate.partialCount}/${aggregate.failCount} | ${aggregate.passRate} | ${aggregate.meanScore} | ${aggregate.inputTokens} | ${aggregate.cacheCreationTokens} | ${aggregate.cacheReadTokens} | ${aggregate.outputTokens} | ${aggregate.failedTrials} |`,
      );
    }
  }
  const judgment = input.judgment;
  const preregistrationFile =
    input.preregistrationFile ??
    "benchmarks/graph-surface/preregistration.v1.json";
  const perModel = input.models.length;
  const perCell =
    perModel === 0
      ? 0
      : Math.round(
          input.trials.length / (GRAPH_SURFACE_ARMS.length * perModel),
        );
  const primaryLine =
    judgment.primaryHypothesis === "turns-reduced"
      ? `- 1차(턴 수 절감): graph-surface ${judgment.graphMeanTurns} vs file-exploration ${judgment.baselineMeanTurns} → Δ ${judgment.turnsDelta} — ${judgment.primaryMet ? "충족" : "미충족"}`
      : `- 1차(턴 비증가, Δ ≤ 0 — R5 §4.6 (d)): graph-surface ${judgment.graphMeanTurns} vs file-exploration ${judgment.baselineMeanTurns} → Δ ${judgment.turnsDelta} — ${judgment.primaryMet ? "충족" : "미충족"} (v1 기준 절감 Δ < 0: ${judgment.turnsReduced ? "충족" : "미충족"})`;
  return `${[
    `# ${input.title ?? "그래프 표면 벤치마크 — repo_map · PPR 검색 · 메모리 블록 vs 파일 탐색"}`,
    "",
    "## 실행 계약",
    "",
    `- Mode: \`${input.mode}\`${input.mode === "dry-run" ? " — **릴리스 불가(모의 실행)**" : ""}`,
    `- 생성: ${input.generatedAt}`,
    `- 사전등록 SHA-256: \`${input.preregistrationSha256}\` (${preregistrationFile} — 실행 전 잠금)`,
    input.questionSourceLine ??
      `- 질문 출처: 동결 v3 매니페스트 다이제스트 \`${input.v3ManifestDigest ?? "inline"}\`의 answer-manifest 12과제`,
    ...(input.productCatalogSha256
      ? [
          `- 제품 \`tools/list\` 카탈로그 SHA-256: \`${input.productCatalogSha256}\` (사전등록과 일치해야 실행)`,
        ]
      : []),
    `- 코퍼스 커밋: \`${input.corpusCommit ?? "unknown"}\``,
    "- 토큰 회계: provider 보고 usage 합계(시행 내 전 호출). 로컬 추정 없음. cache creation/read는 provider가 보고한 값 그대로(명시적 캐시 브레이크포인트 없음).",
    `- 소표본(군·모델당 ${perCell}시행) — 점추정 단독 해석 금지. 시행 전량은 JSON에 게시.`,
    ...(input.armNotes ?? []).map((note) => `- ${note}`),
    "",
    "## 군별 집계",
    "",
    "| model | arm | trials | mean turns | mean tool calls | PASS/PARTIAL/FAIL | PASS rate | mean score | input tokens | cache creation | cache read | output tokens | failed |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## 사전등록 가설 판정",
    "",
    primaryLine,
    `- 품질 비열등(PASS율 −5pp 이내): ${judgment.graphPassRate} vs ${judgment.baselinePassRate} → Δ ${judgment.passRateDelta} — ${judgment.qualityNonInferior ? "충족" : "미충족"}`,
    `- **판정: ${judgment.verdict}**`,
    "",
    "판정과 무관하게 수치 그대로 게시한다(ADR-012 문구 규칙 — 효율 주장은 이 리포트 인용으로만, 구간·가정 병기).",
  ].join("\n")}\n`;
}
