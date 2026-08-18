import { describe, expect, it } from "vitest";

import {
  buildWorkspaceTeamReport,
  pendingGate,
  type WorkspaceTeamRows,
} from "./team-report";

/**
 * Phase 2C todo 3 — the `/team` loader.
 *
 * ADR-011 marker: ADR-011:no-consent-status-exposure
 *
 * The database already refuses to store or return another member's consent
 * and raw text. These tests cover the layer above it — that the loader's own
 * output cannot carry either, whatever it was handed.
 */

const RAW_SENTINEL = "RAW_PROMPT_SENTINEL_9fc2";

const BASE: WorkspaceTeamRows = {
  captureEnabled: true,
  commits: [],
  members: [
    { role: "owner", status: "active", user_id: "user-owner" },
    { role: "member", status: "active", user_id: "user-member" },
    { role: "viewer", status: "invited", user_id: "user-viewer" },
  ],
  promptRecords: [],
  provenRequirements: [],
  receipts: [],
  resolvedFindings: [],
  viewerConsent: { consented: true, rawSyncEnabled: false },
};

describe("workspace team report", () => {
  it("carries roles and invitation status through", () => {
    const report = buildWorkspaceTeamReport(BASE);
    expect(report.members).toEqual([
      {
        name: "user-owner",
        role: "owner",
        status: "active",
        userId: "user-owner",
      },
      {
        name: "user-member",
        role: "member",
        status: "active",
        userId: "user-member",
      },
      {
        name: "user-viewer",
        role: "viewer",
        status: "invited",
        userId: "user-viewer",
      },
    ]);
  });

  it("exposes only the viewer's own consent — no member carries one", () => {
    const report = buildWorkspaceTeamReport(BASE);
    expect(report.capture).toEqual({
      consented: true,
      rawSyncEnabled: false,
      workspaceEnabled: true,
    });
    for (const member of report.members) {
      expect(member).not.toHaveProperty("consented");
      expect(member).not.toHaveProperty("rawSyncEnabled");
    }
    // ADR-011:no-consent-status-exposure — the serialized report has exactly
    // one consent, the viewer's, and it is not attributed to anyone.
    const serialized = JSON.stringify(report);
    expect(serialized.match(/"consented"/g)).toHaveLength(1);
  });

  it("no prompt text can reach the report — the metadata path has no field for it", () => {
    const report = buildWorkspaceTeamReport({
      ...BASE,
      promptRecords: [
        {
          occurred_at: "2026-08-18T00:00:00.000Z",
          // A raw column smuggled onto the row must still not survive.
          rubric: { verifiability: 2 },
          token_count: 120,
          user_id: "user-member",
          ...({ raw_text: RAW_SENTINEL } as object),
        },
      ],
    });
    expect(JSON.stringify(report)).not.toContain(RAW_SENTINEL);
  });

  it("renders no VIBE metric while every gate verdict is pending", () => {
    const report = buildWorkspaceTeamReport({
      ...BASE,
      commits: [
        {
          author_user_id: "user-member",
          occurred_at: "2026-08-18T00:00:00.000Z",
          sha: "a".repeat(40),
        },
      ],
      promptRecords: [
        {
          occurred_at: "2026-08-18T00:00:00.000Z",
          rubric: { verifiability: 2 },
          token_count: 100,
          user_id: "user-member",
        },
      ],
    });
    expect(
      report.gate.verdicts.every(({ status }) => status === "pending"),
    ).toBe(true);
    expect(report.vibe.teamView).toEqual({});
    for (const metrics of report.vibe.personal.values()) {
      expect(metrics).toEqual({});
    }
  });

  it("keeps the comparison table absent, not empty (ADR-011-7)", () => {
    expect(buildWorkspaceTeamReport(BASE).vibe.comparisonTable).toBeNull();
  });

  it("a solo workspace stays solo", () => {
    const report = buildWorkspaceTeamReport({
      ...BASE,
      members: [{ role: "owner", status: "active", user_id: "user-owner" }],
    });
    expect(report.members).toHaveLength(1);
    expect(report.vibe.contributions).toEqual([]);
  });

  it("drops a member row whose role or status is not one the contract knows", () => {
    const report = buildWorkspaceTeamReport({
      ...BASE,
      members: [{ role: "superuser", status: "active", user_id: "x" }],
    });
    expect(report.members).toEqual([]);
  });

  it("pendingGate covers every candidate metric", () => {
    const gate = pendingGate();
    expect(gate.verdicts.length).toBeGreaterThan(0);
    expect(gate.verdicts.every(({ status }) => status === "pending")).toBe(
      true,
    );
  });
});
