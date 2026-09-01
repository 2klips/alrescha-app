import { computePilotStats } from "@alrescha/core/stats";
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
