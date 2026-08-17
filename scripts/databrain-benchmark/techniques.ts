/**
 * Token-efficiency technique measurement (Phase 2B todo 6).
 *
 * Each technique is measured A/B against the all-off measurement context on
 * the same tasks: token estimate (the dry-run assumption, ceil(chars/4)) and
 * required-fact recall — the deterministic proxy for accuracy, since the
 * dry-run mock answers from the task itself. A technique may only default to
 * ON when its recall does not drop (the plan's "정확도 하락 시 기본값 off").
 * The compaction technique is judged on the recall that survives a simulated
 * tail-keeping compaction.
 */

import { buildArmContext, type RepositoryCorpus } from "./context";
import {
  NO_TECHNIQUES,
  TOKEN_TECHNIQUES,
  type BenchmarkTask,
  type TechniqueFlags,
  type TokenTechnique,
} from "./types";

export const TECHNIQUE_TOKEN_ASSUMPTION =
  "Token estimate is the dry-run assumption ceil(context characters / 4); recall is deterministic required-fact coverage, not a model run.";

export interface TechniqueMeasurement {
  readonly baselineRecallPercent: number;
  readonly baselineTokens: number;
  readonly cacheStablePrefixTokens: number;
  readonly defaultOn: boolean;
  readonly enabledRecallPercent: number;
  readonly enabledTokens: number;
  readonly recallDeltaPercentagePoints: number;
  readonly taskCount: number;
  readonly technique: TokenTechnique;
  readonly tokenDeltaPercent: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Simulated compaction: the most recent (tail) half of the context survives. */
export function compactContext(text: string): string {
  return text.slice(-Math.floor(text.length / 2));
}

function requiredFactGroups(task: BenchmarkTask): string[][] {
  return task.grader.kind === "answer-manifest"
    ? task.grader.requiredFacts
    : [];
}

/** A fact group is recalled when any of its alternative spellings appears. */
function groupRecalled(text: string, group: readonly string[]): boolean {
  const haystack = text.toLocaleLowerCase("en-US");
  return group.some((alternative) =>
    haystack.includes(alternative.toLocaleLowerCase("en-US")),
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

async function measureSide(
  corpus: RepositoryCorpus,
  tasks: readonly BenchmarkTask[],
  flags: TechniqueFlags,
  compacted: boolean,
): Promise<{
  recallPercent: number;
  stablePrefixChars: number;
  tokens: number;
}> {
  let tokens = 0;
  let recalledFacts = 0;
  let totalFacts = 0;
  let stablePrefix: string | null = null;
  for (const task of tasks) {
    const context = await buildArmContext({
      arm: "data-brain",
      corpus,
      retrievalQuery: task.retrievalQuery,
      taskDescription: task.prompt,
      techniques: flags,
    });
    tokens += estimateTokens(context.text);
    stablePrefix =
      stablePrefix === null
        ? context.text
        : commonPrefix(stablePrefix, context.text);
    const visible = compacted ? compactContext(context.text) : context.text;
    for (const group of requiredFactGroups(task)) {
      totalFacts += 1;
      if (groupRecalled(visible, group)) {
        recalledFacts += 1;
      }
    }
  }
  return {
    recallPercent: totalFacts === 0 ? 0 : (recalledFacts / totalFacts) * 100,
    stablePrefixChars: tasks.length > 1 ? (stablePrefix?.length ?? 0) : 0,
    tokens,
  };
}

function commonPrefix(left: string, right: string): string {
  let index = 0;
  const limit = Math.min(left.length, right.length);
  while (index < limit && left[index] === right[index]) {
    index += 1;
  }
  return left.slice(0, index);
}

export async function measureTechniques(input: {
  corpus: RepositoryCorpus;
  tasks: readonly BenchmarkTask[];
}): Promise<TechniqueMeasurement[]> {
  const measurements: TechniqueMeasurement[] = [];
  for (const technique of TOKEN_TECHNIQUES) {
    const compacted = technique === "compaction-safe-session";
    const baseline = await measureSide(
      input.corpus,
      input.tasks,
      NO_TECHNIQUES,
      compacted,
    );
    const enabled = await measureSide(
      input.corpus,
      input.tasks,
      { ...NO_TECHNIQUES, [technique]: true },
      compacted,
    );
    const tokenDeltaPercent =
      baseline.tokens === 0
        ? 0
        : round(((enabled.tokens - baseline.tokens) / baseline.tokens) * 100);
    const recallDeltaPercentagePoints = round(
      enabled.recallPercent - baseline.recallPercent,
    );
    const cacheStablePrefixTokens =
      technique === "static-prefix"
        ? Math.ceil(enabled.stablePrefixChars / 4)
        : 0;
    measurements.push({
      baselineRecallPercent: round(baseline.recallPercent),
      baselineTokens: baseline.tokens,
      cacheStablePrefixTokens,
      // The gate: never default-on a technique whose recall drops; to turn
      // on, it must earn it — fewer tokens, a cacheable stable prefix, or a
      // measured recall improvement.
      defaultOn:
        recallDeltaPercentagePoints >= 0 &&
        (tokenDeltaPercent < 0 ||
          cacheStablePrefixTokens > 0 ||
          recallDeltaPercentagePoints > 0),
      enabledRecallPercent: round(enabled.recallPercent),
      enabledTokens: enabled.tokens,
      recallDeltaPercentagePoints,
      taskCount: input.tasks.length,
      technique,
      tokenDeltaPercent,
    });
  }
  return measurements;
}

export function renderTechniqueReport(
  measurements: readonly TechniqueMeasurement[],
): string {
  const lines = [
    "# 토큰 효율 기법 A/B (dry-run 측정)",
    "",
    `> ${TECHNIQUE_TOKEN_ASSUMPTION}`,
    "",
    "| technique | tokens off→on | Δtokens % | recall off→on (pp) | cacheable prefix (tokens) | default |",
    "|---|---|---|---|---|---|",
    ...measurements.map(
      (m) =>
        `| ${m.technique} | ${m.baselineTokens} → ${m.enabledTokens} | ${m.tokenDeltaPercent} | ${m.baselineRecallPercent} → ${m.enabledRecallPercent} (${m.recallDeltaPercentagePoints}) | ${m.cacheStablePrefixTokens} | ${m.defaultOn ? "on" : "off"} |`,
    ),
    "",
    "정확도(회수율) 하락이 측정된 기법은 기본값 off를 유지한다.",
  ];
  return `${lines.join("\n")}\n`;
}
