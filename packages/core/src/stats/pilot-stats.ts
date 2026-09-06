export interface PilotReceiptSnapshot {
  readonly commitSha: string;
  readonly createdAt: string;
  readonly findings: {
    readonly opened: number;
    readonly openTotal: number;
    readonly resolved: number;
  };
  readonly id: string;
}

export interface PilotPackMeasurement {
  readonly baselineTokens: number;
  readonly occurredAt: string;
  readonly selectedTokens: number;
}

export interface PilotRunMeasurement {
  readonly completedAt: string;
  readonly id: string;
  readonly startedAt: string;
}

/**
 * One `usage_daily` row (Phase 4 Wave E todo 23 → 24). Served bytes and
 * agent-reported provider counters share a key and nothing else: the first is
 * what left this server, the second is what a client says its model charged.
 */
export interface PilotUsageDay {
  readonly day: string;
  readonly repositoryId: string | null;
  readonly reportedCacheCreationTokens: number;
  readonly reportedCacheReadTokens: number;
  readonly reportedInputTokens: number;
  readonly reportedOutputTokens: number;
  readonly reportedReports: number;
  readonly servedCalls: number;
  readonly servedEstimatedTokens: number;
  readonly servedMeasuredCalls: number;
  readonly servedResponseChars: number;
}

export interface PilotRepository {
  readonly fullName: string;
  readonly id: string;
}

export interface PilotStatsInput {
  readonly enabled: boolean;
  readonly packRequestCount?: number;
  readonly packs: readonly PilotPackMeasurement[];
  readonly receipts: readonly PilotReceiptSnapshot[];
  readonly repositories?: readonly PilotRepository[];
  /** The repository the numbers were narrowed to; `null` is the workspace. */
  readonly repositoryFilter?: string | null;
  readonly runs: readonly PilotRunMeasurement[];
  readonly usage?: readonly PilotUsageDay[];
}

/**
 * Below these counts a card says "not enough evidence" instead of a number.
 *
 * They are judgements, not measurements, so they are named and exported
 * rather than inlined: a reader who disagrees can see what they disagreed
 * with. Two pack measurements is the smallest set that is not a single
 * observation; twenty served calls is where one oversized answer stops
 * dominating the mean; five self-reports is where a client's own accounting
 * has settled into a habit rather than a first try.
 */
export const PILOT_EVIDENCE_THRESHOLDS = {
  packMeasurements: 2,
  reportedReports: 5,
  servedMeasuredCalls: 20,
} as const;

type CardState = "insufficient-evidence" | "ready";

function cardState(count: number, threshold: number): CardState {
  return count >= threshold ? "ready" : "insufficient-evidence";
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computePilotStats(input: PilotStatsInput) {
  const receipts = [...input.receipts].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
  const runs = [...input.runs]
    .map((run) => ({
      ...run,
      durationMs: Date.parse(run.completedAt) - Date.parse(run.startedAt),
    }))
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const selectedTokens = input.packs.reduce(
    (total, pack) => total + pack.selectedTokens,
    0,
  );
  const baselineTokens = input.packs.reduce(
    (total, pack) => total + pack.baselineTokens,
    0,
  );
  const firstReceipt = receipts[0];
  const latestReceipt = receipts.at(-1);
  const firstRun = runs[0];
  const latestRun = runs.at(-1);
  const packRequestCount = Math.max(
    input.packs.length,
    input.packRequestCount ?? input.packs.length,
  );
  const usage = input.usage ?? [];
  const sum = (pick: (day: PilotUsageDay) => number): number =>
    usage.reduce((total, day) => total + pick(day), 0);
  const servedMeasuredCalls = sum(({ servedMeasuredCalls: n }) => n);
  const reportedReports = sum(({ reportedReports: n }) => n);

  return {
    context: {
      baselineTokens,
      packRequests: packRequestCount,
      selectedTokens,
      state: cardState(
        input.packs.length,
        PILOT_EVIDENCE_THRESHOLDS.packMeasurements,
      ),
      tokenReductionPercent:
        baselineTokens > 0
          ? roundOne(((baselineTokens - selectedTokens) / baselineTokens) * 100)
          : null,
    },
    evidence: {
      completedRuns: runs.length,
      packMeasurements: input.packs.length,
      receipts: receipts.length,
      reportedReports,
      servedMeasuredCalls,
      usageDays: usage.length,
    },
    findings: {
      latestOpenTotal: latestReceipt?.findings.openTotal ?? null,
      netOpenChange:
        receipts.length >= 2 && firstReceipt && latestReceipt
          ? latestReceipt.findings.openTotal - firstReceipt.findings.openTotal
          : null,
      opened: receipts.reduce(
        (total, receipt) => total + receipt.findings.opened,
        0,
      ),
      resolved: receipts.reduce(
        (total, receipt) => total + receipt.findings.resolved,
        0,
      ),
    },
    scans: {
      averageDurationMs:
        runs.length > 0
          ? Math.round(
              runs.reduce((total, run) => total + run.durationMs, 0) /
                runs.length,
            )
          : null,
      completedRuns: runs.length,
      durationChangePercent:
        runs.length >= 2 && firstRun && latestRun && firstRun.durationMs > 0
          ? roundOne(
              ((latestRun.durationMs - firstRun.durationMs) /
                firstRun.durationMs) *
                100,
            )
          : null,
      latestDurationMs: latestRun?.durationMs ?? null,
    },
    methodology: {
      /**
       * The three cards below are three different kinds of number and the
       * screen keeps them apart on purpose (todo 24). One is bytes this
       * server actually sent, one is what your own client says it paid, and
       * one is an estimate of a dump nobody ran.
       */
      benchmarkCaveat:
        "Benchmark results are from our corpus and models, not yours. Nothing on this page is derived from them, and no number here is pooled with another workspace.",
      findingTrend:
        "Opened and resolved counts come from ordered receipt summaries; change compares first and latest open totals.",
      packEstimate:
        "An estimate: the selected pack against a naive full dump nobody ran, both from the same deterministic per-document estimates.",
      reportedUsage:
        "Provider counters your own client reported, opt-in and unverified. They are what a model charged; the served figure is what this server sent.",
      scanDuration:
        "Duration is completed_at minus started_at for succeeded analysis runs; change requires at least two runs.",
      servedTokens:
        "Measured: characters this server sent, converted at a fixed 4 chars/token. The characters are counted; the ratio is an assumption.",
      tokenBaseline:
        "Selected and naive full-dump totals use the same deterministic per-document estimates; formatting overhead is excluded.",
    },
    /** Which repository the numbers were narrowed to, and the choices. */
    repositories: [...(input.repositories ?? [])].sort((left, right) =>
      left.fullName.localeCompare(right.fullName),
    ),
    repositoryFilter: input.repositoryFilter ?? null,
    /** What this server sent. Counted, then converted at a stated ratio. */
    served: {
      calls: sum(({ servedCalls }) => servedCalls),
      days: usage.filter(({ servedCalls }) => servedCalls > 0).length,
      estimatedTokens: sum(
        ({ servedEstimatedTokens }) => servedEstimatedTokens,
      ),
      measuredCalls: servedMeasuredCalls,
      responseChars: sum(({ servedResponseChars }) => servedResponseChars),
      state: cardState(
        servedMeasuredCalls,
        PILOT_EVIDENCE_THRESHOLDS.servedMeasuredCalls,
      ),
    },
    /** What the agent says it paid. Self-reported, and labelled as such. */
    reported: {
      cacheCreationTokens: sum(
        ({ reportedCacheCreationTokens }) => reportedCacheCreationTokens,
      ),
      cacheReadTokens: sum(
        ({ reportedCacheReadTokens }) => reportedCacheReadTokens,
      ),
      days: usage.filter(({ reportedReports }) => reportedReports > 0).length,
      inputTokens: sum(({ reportedInputTokens }) => reportedInputTokens),
      outputTokens: sum(({ reportedOutputTokens }) => reportedOutputTokens),
      reports: reportedReports,
      state: cardState(
        reportedReports,
        PILOT_EVIDENCE_THRESHOLDS.reportedReports,
      ),
    },
    thresholds: PILOT_EVIDENCE_THRESHOLDS,
    state: !input.enabled
      ? ("consent-required" as const)
      : receipts.length < 2
        ? ("insufficient-evidence" as const)
        : ("ready" as const),
  };
}

export type PilotStatsReport = ReturnType<typeof computePilotStats>;
