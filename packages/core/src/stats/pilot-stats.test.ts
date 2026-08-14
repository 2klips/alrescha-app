import { describe, expect, test } from "vitest";

import { computePilotStats } from "./pilot-stats";

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
