/**
 * Aggregation and rendering for the graph-surface benchmark (todo 15).
 * PASS/PARTIAL/FAIL follows the pre-registered grading; the primary metric is
 * turns (model invocations per trial). Published regardless of outcome.
 */

import { GRAPH_SURFACE_ARMS, type GraphSurfaceArm } from "./manifest";

export type TrialQuality = "PASS" | "PARTIAL" | "FAIL";

export interface GraphSurfaceTrial {
  readonly answer: string | null;
  readonly arm: GraphSurfaceArm;
  readonly errorMessage: string | null;
  readonly inputTokens: number;
  readonly model: string;
  readonly outputTokens: number;
  readonly quality: TrialQuality;
  readonly repeat: number;
  readonly score: number;
  readonly status: "succeeded" | "failed";
  readonly taskId: string;
  readonly toolCalls: number;
  readonly turns: number;
}

export interface ArmAggregate {
  readonly arm: GraphSurfaceArm;
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
  readonly primaryMet: boolean;
  readonly qualityNonInferior: boolean;
  readonly turnsDelta: number;
  readonly verdict: "MET" | "NOT MET";
}

export function judgeHypothesis(
  trials: readonly GraphSurfaceTrial[],
): HypothesisJudgment {
  const baseline = aggregateArm(trials, "file-exploration", "pooled");
  const graph = aggregateArm(trials, "graph-surface", "pooled");
  const turnsDelta = round(graph.meanTurns - baseline.meanTurns);
  const passRateDelta = round(graph.passRate - baseline.passRate);
  const primaryMet = turnsDelta < 0;
  const qualityNonInferior = passRateDelta >= -0.05;
  return {
    baselineMeanTurns: baseline.meanTurns,
    baselinePassRate: baseline.passRate,
    graphMeanTurns: graph.meanTurns,
    graphPassRate: graph.passRate,
    passRateDelta,
    primaryMet,
    qualityNonInferior,
    turnsDelta,
    verdict: primaryMet && qualityNonInferior ? "MET" : "NOT MET",
  };
}

export function renderGraphSurfaceMarkdown(input: {
  corpusCommit: string | null;
  generatedAt: string;
  judgment: HypothesisJudgment;
  mode: "dry-run" | "real";
  models: readonly string[];
  preregistrationSha256: string;
  trials: readonly GraphSurfaceTrial[];
  v3ManifestDigest: string;
}): string {
  const rows: string[] = [];
  for (const model of ["pooled", ...input.models]) {
    for (const arm of GRAPH_SURFACE_ARMS) {
      const aggregate = aggregateArm(input.trials, arm, model);
      rows.push(
        `| ${model} | ${arm} | ${aggregate.trialCount} | ${aggregate.meanTurns} | ${aggregate.meanToolCalls} | ${aggregate.passCount}/${aggregate.partialCount}/${aggregate.failCount} | ${aggregate.passRate} | ${aggregate.meanScore} | ${aggregate.inputTokens} | ${aggregate.outputTokens} | ${aggregate.failedTrials} |`,
      );
    }
  }
  const judgment = input.judgment;
  return `${[
    "# 그래프 표면 벤치마크 — repo_map · PPR 검색 · 메모리 블록 vs 파일 탐색",
    "",
    "## 실행 계약",
    "",
    `- Mode: \`${input.mode}\`${input.mode === "dry-run" ? " — **릴리스 불가(모의 실행)**" : ""}`,
    `- 생성: ${input.generatedAt}`,
    `- 사전등록 SHA-256: \`${input.preregistrationSha256}\` (benchmarks/graph-surface/preregistration.v1.json — 실행 전 잠금)`,
    `- 질문 출처: 동결 v3 매니페스트 다이제스트 \`${input.v3ManifestDigest}\`의 answer-manifest 12과제`,
    `- 코퍼스 커밋: \`${input.corpusCommit ?? "unknown"}\``,
    "- 토큰 회계: provider 보고 usage 합계(시행 내 전 호출). 로컬 추정 없음.",
    "- 소표본(군·모델당 24시행) — 점추정 단독 해석 금지. 시행 전량은 JSON에 게시.",
    "",
    "## 군별 집계",
    "",
    "| model | arm | trials | mean turns | mean tool calls | PASS/PARTIAL/FAIL | PASS rate | mean score | input tokens | output tokens | failed |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## 사전등록 가설 판정",
    "",
    `- 1차(턴 수 절감): graph-surface ${judgment.graphMeanTurns} vs file-exploration ${judgment.baselineMeanTurns} → Δ ${judgment.turnsDelta} — ${judgment.primaryMet ? "충족" : "미충족"}`,
    `- 품질 비열등(PASS율 −5pp 이내): ${judgment.graphPassRate} vs ${judgment.baselinePassRate} → Δ ${judgment.passRateDelta} — ${judgment.qualityNonInferior ? "충족" : "미충족"}`,
    `- **판정: ${judgment.verdict}**`,
    "",
    "판정과 무관하게 수치 그대로 게시한다(ADR-012 문구 규칙 — 효율 주장은 이 리포트 인용으로만, 구간·가정 병기).",
  ].join("\n")}\n`;
}
