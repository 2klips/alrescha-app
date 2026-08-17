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

export interface PilotStatsInput {
  readonly enabled: boolean;
  readonly packRequestCount?: number;
  readonly packs: readonly PilotPackMeasurement[];
  readonly receipts: readonly PilotReceiptSnapshot[];
  readonly runs: readonly PilotRunMeasurement[];
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

  return {
    context: {
      baselineTokens,
      packRequests: packRequestCount,
      selectedTokens,
      tokenReductionPercent:
        baselineTokens > 0
          ? roundOne(((baselineTokens - selectedTokens) / baselineTokens) * 100)
          : null,
    },
    evidence: {
      completedRuns: runs.length,
      packMeasurements: input.packs.length,
      receipts: receipts.length,
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
      findingTrend:
        "Opened and resolved counts come from ordered receipt summaries; change compares first and latest open totals.",
      scanDuration:
        "Duration is completed_at minus started_at for succeeded analysis runs; change requires at least two runs.",
      tokenBaseline:
        "Selected and naive full-dump totals use the same deterministic per-document estimates; formatting overhead is excluded.",
    },
    state: !input.enabled
      ? ("consent-required" as const)
      : receipts.length < 2
        ? ("insufficient-evidence" as const)
        : ("ready" as const),
  };
}

export type PilotStatsReport = ReturnType<typeof computePilotStats>;
