import { describe, expect, test } from "vitest";

import {
  computePilotStats,
  type PilotReceiptSnapshot,
  type PilotRunMeasurement,
  type PilotUsageDay,
} from "./pilot-stats";

describe("pilot stats", () => {
  test("computes documented trends over a three-receipt chain", () => {
    const report = computePilotStats({
      enabled: true,
      packs: [
        {
          baselineTokens: 2_000,
          occurredAt: "2026-08-10T12:05:00.000Z",
          selectedTokens: 600,
        },
        {
          baselineTokens: 1_900,
          occurredAt: "2026-08-12T12:05:00.000Z",
          selectedTokens: 500,
        },
      ],
      receipts: [
        {
          commitSha: "a".repeat(40),
          createdAt: "2026-08-10T12:00:00.000Z",
          findings: { opened: 5, openTotal: 5, resolved: 0 },
          id: "receipt-1",
        },
        {
          commitSha: "b".repeat(40),
          createdAt: "2026-08-11T12:00:00.000Z",
          findings: { opened: 2, openTotal: 4, resolved: 3 },
          id: "receipt-2",
        },
        {
          commitSha: "c".repeat(40),
          createdAt: "2026-08-12T12:00:00.000Z",
          findings: { opened: 1, openTotal: 3, resolved: 2 },
          id: "receipt-3",
        },
      ],
      runs: [
        {
          completedAt: "2026-08-10T12:00:05.000Z",
          id: "run-1",
          startedAt: "2026-08-10T12:00:00.000Z",
        },
        {
          completedAt: "2026-08-11T12:00:03.000Z",
          id: "run-2",
          startedAt: "2026-08-11T12:00:00.000Z",
        },
        {
          completedAt: "2026-08-12T12:00:04.000Z",
          id: "run-3",
          startedAt: "2026-08-12T12:00:00.000Z",
        },
      ],
    });

    expect(report.state).toBe("ready");
    expect(report.findings).toMatchObject({
      latestOpenTotal: 3,
      netOpenChange: -2,
      opened: 8,
      resolved: 5,
    });
    expect(report.context).toEqual({
      baselineTokens: 3_900,
      packRequests: 2,
      selectedTokens: 1_100,
      state: "ready",
      tokenReductionPercent: 71.8,
    });
    expect(report.scans).toEqual({
      averageDurationMs: 4_000,
      completedRuns: 3,
      durationChangePercent: -20,
      latestDurationMs: 4_000,
    });
    expect(report.evidence).toEqual({
      completedRuns: 3,
      packMeasurements: 2,
      receipts: 3,
      reportedReports: 0,
      servedMeasuredCalls: 0,
      usageDays: 0,
    });
    expect(report.methodology.tokenBaseline).toContain(
      "deterministic per-document estimates",
    );
  });

  test("does not fabricate a trend from one receipt or run", () => {
    const report = computePilotStats({
      enabled: true,
      packs: [],
      receipts: [
        {
          commitSha: "d".repeat(40),
          createdAt: "2026-08-13T12:00:00.000Z",
          findings: { opened: 4, openTotal: 4, resolved: 0 },
          id: "receipt-only",
        },
      ],
      runs: [
        {
          completedAt: "2026-08-13T12:00:05.000Z",
          id: "run-only",
          startedAt: "2026-08-13T12:00:00.000Z",
        },
      ],
    });

    expect(report.state).toBe("insufficient-evidence");
    expect(report.findings.netOpenChange).toBeNull();
    expect(report.scans.durationChangePercent).toBeNull();
    expect(report.context.tokenReductionPercent).toBeNull();
  });
});

describe("three kinds of number, kept apart (todo 24)", () => {
  const usageDay = (
    overrides: Partial<PilotUsageDay> & Pick<PilotUsageDay, "day">,
  ): PilotUsageDay => ({
    repositoryId: "repo-1",
    reportedCacheCreationTokens: 0,
    reportedCacheReadTokens: 0,
    reportedInputTokens: 0,
    reportedOutputTokens: 0,
    reportedReports: 0,
    servedCalls: 0,
    servedEstimatedTokens: 0,
    servedMeasuredCalls: 0,
    servedResponseChars: 0,
    ...overrides,
  });

  test("totals served bytes and agent-reported usage separately", () => {
    const report = computePilotStats({
      enabled: true,
      packs: [],
      receipts: [],
      runs: [],
      usage: [
        usageDay({
          day: "2026-09-05",
          servedCalls: 14,
          servedEstimatedTokens: 900,
          servedMeasuredCalls: 12,
          servedResponseChars: 3_600,
        }),
        usageDay({
          day: "2026-09-06",
          reportedCacheReadTokens: 40_000,
          reportedInputTokens: 6_000,
          reportedOutputTokens: 900,
          reportedReports: 6,
          servedCalls: 9,
          servedEstimatedTokens: 300,
          servedMeasuredCalls: 9,
          servedResponseChars: 1_200,
        }),
      ],
    });

    expect(report.served).toEqual({
      calls: 23,
      days: 2,
      estimatedTokens: 1_200,
      measuredCalls: 21,
      responseChars: 4_800,
      state: "ready",
    });
    expect(report.reported).toEqual({
      cacheCreationTokens: 0,
      cacheReadTokens: 40_000,
      days: 1,
      inputTokens: 6_000,
      outputTokens: 900,
      reports: 6,
      state: "ready",
    });
    // Two calls were served without being measured, and the card says so
    // rather than folding them in as zero-byte answers.
    expect(report.evidence.servedMeasuredCalls).toBe(21);
    expect(report.served.calls - report.served.measuredCalls).toBe(2);
  });

  test("says 'not enough evidence' per card instead of showing a thin number", () => {
    const report = computePilotStats({
      enabled: true,
      packs: [],
      receipts: [],
      runs: [],
      usage: [
        usageDay({
          day: "2026-09-06",
          reportedInputTokens: 500,
          reportedReports: 1,
          servedCalls: 3,
          servedEstimatedTokens: 90,
          servedMeasuredCalls: 3,
          servedResponseChars: 360,
        }),
      ],
    });

    expect(report.served.state).toBe("insufficient-evidence");
    expect(report.reported.state).toBe("insufficient-evidence");
    expect(report.context.state).toBe("insufficient-evidence");
    // The totals are still computed — the export keeps them; only the card
    // withholds a headline it cannot support.
    expect(report.served.estimatedTokens).toBe(90);
    expect(report.thresholds).toEqual({
      packMeasurements: 2,
      reportedReports: 5,
      servedMeasuredCalls: 20,
    });
  });

  test("carries the repository choices and the one in force", () => {
    const report = computePilotStats({
      enabled: true,
      packs: [],
      receipts: [],
      repositories: [
        { fullName: "2klips/zeta", id: "repo-2" },
        { fullName: "2klips/alpha", id: "repo-1" },
      ],
      repositoryFilter: "repo-1",
      runs: [],
    });

    expect(report.repositories.map(({ fullName }) => fullName)).toEqual([
      "2klips/alpha",
      "2klips/zeta",
    ]);
    expect(report.repositoryFilter).toBe("repo-1");
  });

  test("states that benchmark numbers are not the reader's numbers", () => {
    const report = computePilotStats({
      enabled: true,
      packs: [],
      receipts: [],
      runs: [],
    });

    expect(report.methodology.benchmarkCaveat).toContain("not yours");
    expect(report.methodology.servedTokens).toContain("assumption");
    expect(report.methodology.reportedUsage).toContain("unverified");
    expect(report.methodology.packEstimate).toContain("An estimate");
  });
});

describe("first and latest by time, not by collation", () => {
  // PostgREST writes timestamptz with trailing fractional zeros trimmed and
  // no fraction at all at zero microseconds: `…:56+00:00` is half a second
  // before `…:56.5+00:00`, yet a collating compare ranks `.` before `+` and
  // put it last. Where the times differ, the ids sort against them, and every
  // pair is read in both orders — the query's `order by` and a read paged by
  // id — so neither the ids nor the read order can supply the answer.
  const receipt = (
    id: string,
    createdAt: string,
    openTotal: number,
  ): PilotReceiptSnapshot => ({
    commitSha: "e".repeat(40),
    createdAt,
    findings: { opened: 0, openTotal, resolved: 0 },
    id,
  });
  const bothOrders = <T>(earlier: T, later: T): T[][] => [
    [earlier, later],
    [later, earlier],
  ];
  const findingsOf = (receipts: readonly PilotReceiptSnapshot[]) =>
    computePilotStats({ enabled: true, packs: [], receipts, runs: [] })
      .findings;
  const scansOf = (runs: readonly PilotRunMeasurement[]) =>
    computePilotStats({ enabled: true, packs: [], receipts: [], runs }).scans;

  test("a receipt at zero microseconds precedes a later one in its second", () => {
    const earlier = receipt("receipt-b", "2026-09-24T03:12:56+00:00", 7);
    const later = receipt("receipt-a", "2026-09-24T03:12:56.5+00:00", 4);

    expect(bothOrders(earlier, later).map(findingsOf)).toMatchObject([
      { latestOpenTotal: 4, netOpenChange: -3 },
      { latestOpenTotal: 4, netOpenChange: -3 },
    ]);
  });

  test("a run started at zero microseconds precedes a later one in its second", () => {
    const earlier: PilotRunMeasurement = {
      completedAt: "2026-09-24T03:13:06+00:00",
      id: "run-b",
      startedAt: "2026-09-24T03:12:56+00:00",
    };
    const later: PilotRunMeasurement = {
      completedAt: "2026-09-24T03:13:04.5+00:00",
      id: "run-a",
      startedAt: "2026-09-24T03:12:56.5+00:00",
    };

    expect(bothOrders(earlier, later).map(scansOf)).toMatchObject([
      { durationChangePercent: -20, latestDurationMs: 8_000 },
      { durationChangePercent: -20, latestDurationMs: 8_000 },
    ]);
  });

  test("digits past the millisecond still order two receipts", () => {
    // Date.parse keeps milliseconds only, so these two parse equal.
    const earlier = receipt("receipt-b", "2026-09-24T03:12:56+00:00", 7);
    const later = receipt("receipt-a", "2026-09-24T03:12:56.0001+00:00", 4);

    expect(bothOrders(earlier, later).map(findingsOf)).toMatchObject([
      { latestOpenTotal: 4, netOpenChange: -3 },
      { latestOpenTotal: 4, netOpenChange: -3 },
    ]);
  });

  test("two offsets compare as instants across a fall-back hour", () => {
    // Postgres in a zone with daylight time writes the repeated hour with two
    // offsets; by text alone, the later of these reads as the earlier.
    const earlier = receipt("receipt-b", "2026-11-01T01:30:00-04:00", 7);
    const later = receipt("receipt-a", "2026-11-01T01:10:00-05:00", 4);

    expect(bothOrders(earlier, later).map(findingsOf)).toMatchObject([
      { latestOpenTotal: 4, netOpenChange: -3 },
      { latestOpenTotal: 4, netOpenChange: -3 },
    ]);
  });

  test("the id settles an exact tie the same way on every read", () => {
    const first = receipt("receipt-a", "2026-09-24T03:12:56.5+00:00", 7);
    const second = receipt("receipt-b", "2026-09-24T03:12:56.5+00:00", 4);

    expect(bothOrders(first, second).map(findingsOf)).toMatchObject([
      { latestOpenTotal: 4, netOpenChange: -3 },
      { latestOpenTotal: 4, netOpenChange: -3 },
    ]);
  });
});
