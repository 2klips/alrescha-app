/**
 * Evidence-based contribution + VIBE Index v0 (Phase 2B todo 12, ADR-011).
 *
 * Every number is derived from logs, commits, receipts, and findings — the
 * input schema is strict, so a self-reported field cannot even enter
 * (ADR-011-5, METR: perceived +20% vs actual −19%). Exposure is gated
 * twice: a candidate metric renders ONLY with an `adopted` Goodhart-gate
 * verdict (ADR-011-7, produced by the todo-13 harness-injection experiment),
 * and the per-person comparison table exists ONLY after the workspace
 * explicitly enables that policy (ADR-011-4).
 */

import { z } from "zod";

export const VIBE_METRICS = [
  "V1-verified-evidence-ratio",
  "V2-finding-resolution-rate",
  "V3-requirement-proof-throughput",
  "V4-prompt-rubric-mean",
  "V5-receipt-chain-continuity",
  "V6-verified-commit-ratio",
  "V7-prompt-verifiability-share",
] as const;
export type VibeMetric = (typeof VIBE_METRICS)[number];

export const vibeGateVerdictSchema = z.strictObject({
  detail: z.string().max(500),
  metric: z.enum(VIBE_METRICS),
  status: z.enum(["adopted", "pending", "rejected"]),
});
export const vibeGateResultsSchema = z.strictObject({
  experiment: z.string().min(1),
  generatedBy: z.string().min(1),
  verdicts: z.array(vibeGateVerdictSchema).length(VIBE_METRICS.length),
});
export type VibeGateResults = z.infer<typeof vibeGateResultsSchema>;

/** Inputs are logs only — strict objects reject any self-reported extras. */
const commitSchema = z.strictObject({
  authorUserId: z.string().min(1),
  occurredAt: z.iso.datetime({ offset: true }),
  sha: z.string().regex(/^[0-9a-f]{40}$/),
});
const receiptSchema = z.strictObject({
  commitSha: z.string().regex(/^[0-9a-f]{40}$/),
  inferredCount: z.number().int().nonnegative(),
  verifiedCount: z.number().int().nonnegative(),
});
const resolvedFindingSchema = z.strictObject({
  id: z.string().min(1),
  resolvedCommitSha: z.string().regex(/^[0-9a-f]{40}$/),
});
const provenRequirementSchema = z.strictObject({
  id: z.string().min(1),
  provenCommitSha: z.string().regex(/^[0-9a-f]{40}$/),
});
const promptRecordSchema = z.strictObject({
  rubric: z.record(z.string(), z.number().min(0).max(2)),
  userId: z.string().min(1),
});

export const vibeInputSchema = z.strictObject({
  commits: z.array(commitSchema),
  promptRecords: z.array(promptRecordSchema),
  provenRequirements: z.array(provenRequirementSchema),
  receipts: z.array(receiptSchema),
  resolvedFindings: z.array(resolvedFindingSchema),
});
export type VibeInput = z.infer<typeof vibeInputSchema>;

export interface ContributionRow {
  readonly commitCount: number;
  readonly provenRequirementIds: readonly string[];
  readonly resolvedFindingCount: number;
  readonly userId: string;
  readonly verifiedEvidenceCount: number;
}

export interface VibeIndex {
  /** Per-person rows — for the subject themselves (ADR-011-4). */
  readonly personal: ReadonlyMap<
    string,
    Readonly<Partial<Record<VibeMetric, number>>>
  >;
  /**
   * The cross-person comparison table. `null` until the workspace policy
   * explicitly enables it — absence, not an empty list.
   */
  readonly comparisonTable:
    | readonly {
        metrics: Readonly<Partial<Record<VibeMetric, number>>>;
        userId: string;
      }[]
    | null;
  readonly contributions: readonly ContributionRow[];
  /** Team view: aggregates only — mean per adopted metric. */
  readonly teamView: Readonly<Partial<Record<VibeMetric, number>>>;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** All seven candidate formulas — deterministic, per user. */
function candidateScores(
  input: VibeInput,
  userId: string,
): Record<VibeMetric, number | null> {
  const commits = input.commits.filter(
    ({ authorUserId }) => authorUserId === userId,
  );
  const shas = new Set(commits.map(({ sha }) => sha));
  const receipts = input.receipts.filter(({ commitSha }) =>
    shas.has(commitSha),
  );
  const verified = receipts.reduce((sum, r) => sum + r.verifiedCount, 0);
  const inferred = receipts.reduce((sum, r) => sum + r.inferredCount, 0);
  const prompts = input.promptRecords.filter(
    (record) => record.userId === userId,
  );
  const rubricMeans = prompts.map((record) => {
    const values = Object.values(record.rubric);
    return values.length === 0
      ? 0
      : values.reduce((sum, value) => sum + value, 0) / values.length;
  });
  const proven = input.provenRequirements.filter(({ provenCommitSha }) =>
    shas.has(provenCommitSha),
  );
  const resolved = input.resolvedFindings.filter(({ resolvedCommitSha }) =>
    shas.has(resolvedCommitSha),
  );
  const commitsWithReceipt = commits.filter(({ sha }) =>
    input.receipts.some(({ commitSha }) => commitSha === sha),
  );
  const commitsWithVerified = commits.filter(({ sha }) =>
    input.receipts.some(
      ({ commitSha, verifiedCount }) => commitSha === sha && verifiedCount > 0,
    ),
  );
  return {
    "V1-verified-evidence-ratio":
      verified + inferred === 0 ? null : verified / (verified + inferred),
    "V2-finding-resolution-rate":
      commits.length === 0 ? null : resolved.length / commits.length,
    "V3-requirement-proof-throughput": proven.length,
    "V4-prompt-rubric-mean": mean(rubricMeans),
    "V5-receipt-chain-continuity":
      commits.length === 0 ? null : commitsWithReceipt.length / commits.length,
    "V6-verified-commit-ratio":
      commits.length === 0 ? null : commitsWithVerified.length / commits.length,
    "V7-prompt-verifiability-share":
      prompts.length === 0
        ? null
        : prompts.filter((record) => (record.rubric["verifiability"] ?? 0) >= 2)
            .length / prompts.length,
  };
}

export function buildVibeIndex(
  rawInput: unknown,
  gateResults: VibeGateResults,
  policy: { readonly comparisonTableEnabled: boolean },
): VibeIndex {
  const input = vibeInputSchema.parse(rawInput);
  const adopted = new Set(
    gateResults.verdicts
      .filter(({ status }) => status === "adopted")
      .map(({ metric }) => metric),
  );
  const userIds = [
    ...new Set([
      ...input.commits.map(({ authorUserId }) => authorUserId),
      ...input.promptRecords.map(({ userId }) => userId),
    ]),
  ].sort();

  const personal = new Map<string, Partial<Record<VibeMetric, number>>>();
  for (const userId of userIds) {
    const scores = candidateScores(input, userId);
    const exposed: Partial<Record<VibeMetric, number>> = {};
    for (const metric of VIBE_METRICS) {
      const score = scores[metric];
      // The Goodhart gate: metrics without an adopted verdict never render.
      if (adopted.has(metric) && score !== null) {
        exposed[metric] = round(score);
      }
    }
    personal.set(userId, exposed);
  }

  const teamView: Partial<Record<VibeMetric, number>> = {};
  for (const metric of VIBE_METRICS) {
    if (!adopted.has(metric)) {
      continue;
    }
    const values = [...personal.values()]
      .map((scores) => scores[metric])
      .filter((value): value is number => value !== undefined);
    const aggregate = mean(values);
    if (aggregate !== null) {
      teamView[metric] = round(aggregate);
    }
  }

  const contributions: ContributionRow[] = userIds.map((userId) => {
    const shas = new Set(
      input.commits
        .filter(({ authorUserId }) => authorUserId === userId)
        .map(({ sha }) => sha),
    );
    return {
      commitCount: shas.size,
      provenRequirementIds: input.provenRequirements
        .filter(({ provenCommitSha }) => shas.has(provenCommitSha))
        .map(({ id }) => id)
        .sort(),
      resolvedFindingCount: input.resolvedFindings.filter(
        ({ resolvedCommitSha }) => shas.has(resolvedCommitSha),
      ).length,
      userId,
      verifiedEvidenceCount: input.receipts
        .filter(({ commitSha }) => shas.has(commitSha))
        .reduce((sum, receipt) => sum + receipt.verifiedCount, 0),
    };
  });

  return {
    comparisonTable: policy.comparisonTableEnabled
      ? userIds.map((userId) => ({
          metrics: personal.get(userId) ?? {},
          userId,
        }))
      : null,
    contributions,
    personal,
    teamView,
  };
}
