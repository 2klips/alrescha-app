import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  VIBE_METRICS,
  buildVibeIndex,
  vibeGateResultsSchema,
  vibeInputSchema,
  type VibeGateResults,
  type VibeInput,
} from "../packages/core/src/index";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const ALICE = "alice";
const BOB = "bob";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);

const INPUT: VibeInput = {
  commits: [
    { authorUserId: ALICE, occurredAt: "2026-08-17T09:00:00.000Z", sha: SHA_A },
    { authorUserId: ALICE, occurredAt: "2026-08-17T10:00:00.000Z", sha: SHA_B },
    { authorUserId: BOB, occurredAt: "2026-08-17T11:00:00.000Z", sha: SHA_C },
  ],
  promptRecords: [
    { rubric: { specificity: 2, verifiability: 2 }, userId: ALICE },
    { rubric: { specificity: 1, verifiability: 0 }, userId: BOB },
  ],
  provenRequirements: [{ id: "REQ-AUTH-003", provenCommitSha: SHA_A }],
  receipts: [
    { commitSha: SHA_A, inferredCount: 1, verifiedCount: 3 },
    { commitSha: SHA_C, inferredCount: 2, verifiedCount: 0 },
  ],
  resolvedFindings: [{ id: "finding-1", resolvedCommitSha: SHA_B }],
};

function gates(adopted: readonly string[]): VibeGateResults {
  return vibeGateResultsSchema.parse({
    experiment: "vibe-harness-injection-v0",
    generatedBy: "test",
    verdicts: VIBE_METRICS.map((metric) => ({
      detail: "test verdict",
      metric,
      status: adopted.includes(metric) ? "adopted" : "pending",
    })),
  });
}

describe("VIBE index v0 (todo 12)", () => {
  it("computes each candidate formula deterministically", () => {
    const index = buildVibeIndex(INPUT, gates([...VIBE_METRICS]), {
      comparisonTableEnabled: false,
    });
    expect(index.personal.get(ALICE)).toMatchObject({
      "V1-verified-evidence-ratio": 0.75,
      "V2-finding-resolution-rate": 0.5,
      "V3-requirement-proof-throughput": 1,
      "V4-prompt-rubric-mean": 2,
      "V5-receipt-chain-continuity": 0.5,
      "V6-verified-commit-ratio": 0.5,
      "V7-prompt-verifiability-share": 1,
    });
    expect(index.personal.get(BOB)).toMatchObject({
      "V1-verified-evidence-ratio": 0,
      "V7-prompt-verifiability-share": 0,
    });
    const again = buildVibeIndex(INPUT, gates([...VIBE_METRICS]), {
      comparisonTableEnabled: false,
    });
    expect(again.personal).toEqual(index.personal);
  });

  it("proves there is no self-reported input: extra fields are rejected", () => {
    expect(
      vibeInputSchema.safeParse({
        ...INPUT,
        selfReportedProductivity: 1.2,
      }).success,
    ).toBe(false);
    expect(
      vibeInputSchema.safeParse({
        ...INPUT,
        commits: [{ ...INPUT.commits[0]!, selfAssessment: "great" }],
      }).success,
    ).toBe(false);
    // Every accepted field is a log-derived fact — the schema is the proof.
    expect(Object.keys(vibeInputSchema.shape).sort()).toEqual([
      "commits",
      "promptRecords",
      "provenRequirements",
      "receipts",
      "resolvedFindings",
    ]);
  });

  it("keeps the comparison table absent until the policy explicitly enables it", () => {
    const withoutPolicy = buildVibeIndex(INPUT, gates([...VIBE_METRICS]), {
      comparisonTableEnabled: false,
    });
    expect(withoutPolicy.comparisonTable).toBeNull();
    const withPolicy = buildVibeIndex(INPUT, gates([...VIBE_METRICS]), {
      comparisonTableEnabled: true,
    });
    expect(withPolicy.comparisonTable).toHaveLength(2);
  });

  it("never renders a metric the Goodhart gate has not adopted", () => {
    const oneAdopted = buildVibeIndex(
      INPUT,
      gates(["V1-verified-evidence-ratio"]),
      { comparisonTableEnabled: true },
    );
    expect(Object.keys(oneAdopted.teamView)).toEqual([
      "V1-verified-evidence-ratio",
    ]);
    for (const [, scores] of oneAdopted.personal) {
      const keys = Object.keys(scores);
      expect(keys).toEqual(
        keys.length === 0 ? [] : ["V1-verified-evidence-ratio"],
      );
    }
    // With no adopted metrics — the current published gate file — nothing renders.
    const noneAdopted = buildVibeIndex(INPUT, gates([]), {
      comparisonTableEnabled: true,
    });
    expect(noneAdopted.teamView).toEqual({});
    expect(
      [...noneAdopted.personal.values()].every(
        (scores) => Object.keys(scores).length === 0,
      ),
    ).toBe(true);
  });

  it("wires exposure to the PUBLISHED gate file — only adopted verdicts render", () => {
    const published = vibeGateResultsSchema.parse(
      JSON.parse(
        readFileSync(`${repoRoot}/benchmarks/vibe/gate-results.json`, "utf8"),
      ),
    );
    // The 2026-08-25 real 112-trial run: V1 adopted, V5/V6 rejected
    // (Goodhart — accuracy dropped under injection), the rest pending
    // pending a session-shaped harness (OQ-020).
    const byStatus = (status: string): string[] =>
      published.verdicts
        .filter((verdict) => verdict.status === status)
        .map(({ metric }) => metric);
    expect(byStatus("adopted")).toEqual(["V1-verified-evidence-ratio"]);
    expect(byStatus("rejected")).toEqual([
      "V5-receipt-chain-continuity",
      "V6-verified-commit-ratio",
    ]);
    const index = buildVibeIndex(INPUT, published, {
      comparisonTableEnabled: true,
    });
    // Exactly the adopted set renders — rejected/pending stay dark.
    expect(Object.keys(index.teamView)).toEqual(["V1-verified-evidence-ratio"]);
  });

  it("derives contribution rows from evidence: who carried which requirement to proof", () => {
    const index = buildVibeIndex(INPUT, gates([]), {
      comparisonTableEnabled: false,
    });
    expect(index.contributions).toEqual([
      {
        commitCount: 2,
        provenRequirementIds: ["REQ-AUTH-003"],
        resolvedFindingCount: 1,
        userId: ALICE,
        verifiedEvidenceCount: 3,
      },
      {
        commitCount: 1,
        provenRequirementIds: [],
        resolvedFindingCount: 0,
        userId: BOB,
        verifiedEvidenceCount: 0,
      },
    ]);
  });
});
