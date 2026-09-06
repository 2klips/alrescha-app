import { computePilotStats, type PilotUsageDay } from "@alrescha/core/stats";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { PilotStatsDashboard } from "../../app/app/(shell)/stats/pilot-stats-dashboard";
import { STATS } from "../strings";
import { createPilotStatsExportResponse } from "./export";
import { buildPilotStatsReport } from "./pilot-report";

describe("workspace pilot report", () => {
  test("maps stored receipt summaries, pack events, and completed runs", () => {
    const report = buildPilotStatsReport({
      enabled: true,
      packEvents: [
        {
          occurred_at: "2026-08-13T11:00:00.000Z",
          pack_baseline_tokens: 1_000,
          pack_selected_tokens: 400,
        },
        {
          occurred_at: "2026-08-13T11:05:00.000Z",
          pack_baseline_tokens: null,
          pack_selected_tokens: null,
        },
      ],
      receipts: [
        {
          commit_sha: "a".repeat(40),
          created_at: "2026-08-11T12:00:00.000Z",
          id: "receipt-1",
          summary: {
            findings: {
              open_total: 4,
              opened: [{ id: "f1" }, { id: "f2" }, { id: "f3" }, { id: "f4" }],
              resolved: [],
            },
          },
        },
        {
          commit_sha: "b".repeat(40),
          created_at: "2026-08-12T12:00:00.000Z",
          id: "receipt-2",
          summary: {
            findings: {
              open_total: 2,
              opened: [],
              resolved: [{ id: "f1" }, { id: "f2" }],
            },
          },
        },
      ],
      runs: [
        {
          completed_at: "2026-08-13T12:00:02.500Z",
          id: "run-1",
          started_at: "2026-08-13T12:00:00.000Z",
        },
      ],
    });

    expect(report.state).toBe("ready");
    expect(report.findings).toMatchObject({
      latestOpenTotal: 2,
      netOpenChange: -2,
      opened: 4,
      resolved: 2,
    });
    expect(report.context).toMatchObject({
      baselineTokens: 1_000,
      packRequests: 2,
      selectedTokens: 400,
      tokenReductionPercent: 60,
    });
    expect(report.evidence.packMeasurements).toBe(1);
    expect(report.scans.latestDurationMs).toBe(2_500);
  });
});

describe("pilot stats JSON export", () => {
  test("exports the same documented report behind authenticated workspace scope", async () => {
    const report = computePilotStats({
      enabled: true,
      packs: [],
      receipts: [
        {
          commitSha: "a".repeat(40),
          createdAt: "2026-08-12T00:00:00Z",
          findings: { opened: 2, openTotal: 2, resolved: 0 },
          id: "r1",
        },
        {
          commitSha: "b".repeat(40),
          createdAt: "2026-08-13T00:00:00Z",
          findings: { opened: 0, openTotal: 1, resolved: 1 },
          id: "r2",
        },
      ],
      runs: [],
    });
    const response = await createPilotStatsExportResponse({
      getCurrentUserId: vi.fn().mockResolvedValue("user-owner"),
      loadReport: vi
        .fn()
        .mockResolvedValue({ report, workspaceId: "workspace-owner" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      "alrescha-pilot-stats.json",
    );
    await expect(response.json()).resolves.toEqual({
      report,
      schemaVersion: "alrescha.pilot-stats.v1",
      workspaceId: "workspace-owner",
    });
  });

  test("does not load workspace stats for an unauthenticated request", async () => {
    const loadReport = vi.fn();
    const response = await createPilotStatsExportResponse({
      getCurrentUserId: vi.fn().mockResolvedValue(null),
      loadReport,
    });

    expect(response.status).toBe(401);
    expect(loadReport).not.toHaveBeenCalled();
  });

  test("blocks export until workspace measurement consent exists", async () => {
    const response = await createPilotStatsExportResponse({
      getCurrentUserId: vi.fn().mockResolvedValue("user-owner"),
      loadReport: vi.fn().mockResolvedValue({
        report: computePilotStats({
          enabled: false,
          packs: [],
          receipts: [],
          runs: [],
        }),
        workspaceId: "workspace-owner",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "pilot_measurement_consent_required",
    });
  });
});

describe("pilot stats dashboard", () => {
  test("shows measured trends after three analyses with a JSON export", () => {
    const report = computePilotStats({
      enabled: true,
      packs: [
        {
          baselineTokens: 2_000,
          occurredAt: "2026-08-11T12:00:00Z",
          selectedTokens: 600,
        },
        {
          baselineTokens: 1_900,
          occurredAt: "2026-08-12T12:00:00Z",
          selectedTokens: 500,
        },
      ],
      receipts: [
        {
          commitSha: "a".repeat(40),
          createdAt: "2026-08-10T12:00:00Z",
          findings: { opened: 5, openTotal: 5, resolved: 0 },
          id: "r1",
        },
        {
          commitSha: "b".repeat(40),
          createdAt: "2026-08-11T12:00:00Z",
          findings: { opened: 2, openTotal: 4, resolved: 3 },
          id: "r2",
        },
        {
          commitSha: "c".repeat(40),
          createdAt: "2026-08-12T12:00:00Z",
          findings: { opened: 1, openTotal: 3, resolved: 2 },
          id: "r3",
        },
      ],
      runs: [
        {
          completedAt: "2026-08-10T12:00:05Z",
          id: "run1",
          startedAt: "2026-08-10T12:00:00Z",
        },
        {
          completedAt: "2026-08-11T12:00:03Z",
          id: "run2",
          startedAt: "2026-08-11T12:00:00Z",
        },
        {
          completedAt: "2026-08-12T12:00:04Z",
          id: "run3",
          startedAt: "2026-08-12T12:00:00Z",
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(PilotStatsDashboard, { report }),
    );

    expect(html).toContain(STATS.toolbar.receiptCount(3));
    expect(html).toContain(STATS.findings.resolvedOpened(5, 8));
    expect(html).toContain(STATS.context.reduction(71.8));
    expect(html).toContain(STATS.scan.average(4_000));
    expect(html).toContain(STATS.context.packRequests(2));
    expect(html).toContain("deterministic per-document estimates");
    expect(html).toContain('href="/api/stats/export"');
    expect(html).toContain(
      'href="https://github.com/2klips/alrescha-app/blob/main/benchmarks/databrain/results.real.md"',
    );
  });

  test("prompts for explicit consent before showing or collecting stats", () => {
    const report = computePilotStats({
      enabled: false,
      packs: [],
      receipts: [],
      runs: [],
    });
    const html = renderToStaticMarkup(
      createElement(PilotStatsDashboard, { report }),
    );

    expect(html).toContain(STATS.consent.title);
    expect(html).toContain(STATS.consent.scope);
    expect(html).toContain(STATS.consent.noThirdParty);
    expect(html).toContain(STATS.consent.enable);
    expect(html).not.toContain(STATS.toolbar.export);
  });

  test("renders insufficient evidence for a single receipt without a fake delta", () => {
    const report = computePilotStats({
      enabled: true,
      packs: [],
      receipts: [
        {
          commitSha: "a".repeat(40),
          createdAt: "2026-08-13T12:00:00Z",
          findings: { opened: 3, openTotal: 3, resolved: 0 },
          id: "only-receipt",
        },
      ],
      runs: [],
    });
    const html = renderToStaticMarkup(
      createElement(PilotStatsDashboard, { report }),
    );

    expect(html).toContain(STATS.insufficient.title);
    expect(html).toContain(STATS.insufficient.receiptsRecorded(1));
    expect(html).toContain("Receipt 2건");
    expect(html).not.toContain("0% improvement");
  });
});

describe("three separated cards (todo 24)", () => {
  const usageDay = (overrides: Partial<PilotUsageDay>): PilotUsageDay => ({
    day: "2026-09-06",
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

  const readyReport = () =>
    computePilotStats({
      enabled: true,
      packs: [
        {
          baselineTokens: 2_000,
          occurredAt: "2026-09-05T12:00:00Z",
          selectedTokens: 600,
        },
        {
          baselineTokens: 2_000,
          occurredAt: "2026-09-06T12:00:00Z",
          selectedTokens: 600,
        },
      ],
      receipts: [
        {
          commitSha: "a".repeat(40),
          createdAt: "2026-09-05T12:00:00Z",
          findings: { opened: 2, openTotal: 2, resolved: 0 },
          id: "r1",
        },
        {
          commitSha: "b".repeat(40),
          createdAt: "2026-09-06T12:00:00Z",
          findings: { opened: 0, openTotal: 1, resolved: 1 },
          id: "r2",
        },
      ],
      repositories: [{ fullName: "2klips/alrescha-app", id: "repo-1" }],
      repositoryFilter: "repo-1",
      runs: [],
      usage: [
        usageDay({
          reportedCacheReadTokens: 40_000,
          reportedInputTokens: 6_000,
          reportedOutputTokens: 900,
          reportedReports: 7,
          servedCalls: 26,
          servedEstimatedTokens: 4_000,
          servedMeasuredCalls: 24,
          servedResponseChars: 16_000,
        }),
      ],
    });

  test("labels each number by the kind of number it is", () => {
    const html = renderToStaticMarkup(
      createElement(PilotStatsDashboard, { report: readyReport() }),
    );

    expect(html).toContain(STATS.served.label);
    expect(html).toContain(STATS.reported.label);
    expect(html).toContain(STATS.context.label);
    // Each card carries its own one-line assumption, so a measured number
    // and an estimate cannot be read as the same kind of claim.
    expect(html).toContain(STATS.served.assumption);
    expect(html).toContain(STATS.reported.assumption);
    expect(html).toContain(STATS.context.assumption);
    expect(html).toContain(STATS.served.tokens("4,000"));
    expect(html).toContain(STATS.reported.reports(7));
    // Two of the 26 served calls were never measured, and the card says so
    // rather than counting them as zero-byte answers.
    expect(html).toContain(STATS.served.unmeasured(2));
  });

  test("says benchmark numbers are not the reader's numbers", () => {
    const html = renderToStaticMarkup(
      createElement(PilotStatsDashboard, { report: readyReport() }),
    );

    expect(html).toContain(STATS.methodology.benchmarkCaveat);
    expect(html).toContain("not yours");
  });

  test("offers the repository filter with the workspace as the default", () => {
    const html = renderToStaticMarkup(
      createElement(PilotStatsDashboard, { report: readyReport() }),
    );

    expect(html).toContain(STATS.filter.all);
    expect(html).toContain("2klips/alrescha-app");
    expect(html).toContain('name="repository"');
    expect(html).toContain('value="repo-1"');
  });

  test("withholds a headline the evidence cannot support", () => {
    const report = computePilotStats({
      enabled: true,
      packs: [],
      receipts: [
        {
          commitSha: "a".repeat(40),
          createdAt: "2026-09-05T12:00:00Z",
          findings: { opened: 2, openTotal: 2, resolved: 0 },
          id: "r1",
        },
        {
          commitSha: "b".repeat(40),
          createdAt: "2026-09-06T12:00:00Z",
          findings: { opened: 0, openTotal: 1, resolved: 1 },
          id: "r2",
        },
      ],
      runs: [],
      usage: [
        usageDay({
          reportedInputTokens: 300,
          reportedReports: 1,
          servedCalls: 3,
          servedEstimatedTokens: 120,
          servedMeasuredCalls: 3,
          servedResponseChars: 480,
        }),
      ],
    });
    const html = renderToStaticMarkup(
      createElement(PilotStatsDashboard, { report }),
    );

    expect(html).toContain(STATS.cards.insufficient(3, 20));
    expect(html).toContain(STATS.cards.insufficient(1, 5));
    // The total exists in the export; it is the headline that is withheld.
    expect(report.served.estimatedTokens).toBe(120);
    expect(html).not.toContain(STATS.served.tokens("120"));
  });
});
