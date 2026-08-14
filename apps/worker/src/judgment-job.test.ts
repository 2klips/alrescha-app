import { describe, expect, it, vi } from "vitest";

import type { ClaimedJob } from "./queue";
import {
  createJudgmentJobHandler,
  type JudgmentJobStore,
} from "./judgment-job";

const job = (payload: Readonly<Record<string, unknown>>): ClaimedJob => ({
  attemptCount: 1,
  creditCost: 10,
  id: "01J0000000000000000000000A",
  kind: "judge",
  maxAttempts: 3,
  payload,
  repositoryId: "01J0000000000000000000000B",
  runId: "01J0000000000000000000000C",
  workspaceId: "01J0000000000000000000000D",
});

function store(): JudgmentJobStore {
  return {
    loadProvider: vi.fn().mockResolvedValue({
      model: "mock-model",
      name: "mock-provider",
      run: vi.fn().mockResolvedValue({
        confidence: 0.9,
        evidenceGrade: "inferred",
        explanation: "The candidate is confirmed.",
        severity: "medium",
        verdict: "confirmed",
      }),
    }),
    recordInvalidOutput: vi.fn().mockResolvedValue(undefined),
    saveJudgment: vi.fn().mockResolvedValue(undefined),
  };
}

describe("judgment job handler", () => {
  it("dispatches, validates, and stores an inferred judgment payload", async () => {
    const judgmentStore = store();
    const handler = createJudgmentJobHandler(judgmentStore);
    const claimed = job({
      billingMode: "credits",
      context: ["source A", "source B"],
      currentConfidence: 0.6,
      currentSeverity: "medium",
      kind: "contradiction-confirmation",
      provider: "openai",
      targetId: "finding-1",
    });

    await handler(claimed, { heartbeat: vi.fn().mockResolvedValue(true) });

    expect(judgmentStore.loadProvider).toHaveBeenCalledWith({
      billingMode: "credits",
      provider: "openai",
      workspaceId: claimed.workspaceId,
    });
    expect(judgmentStore.saveJudgment).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: claimed.id,
        payload: expect.objectContaining({
          evidenceGrade: "inferred",
          verdict: "confirmed",
        }),
        target: {
          confidence: 0.9,
          evidenceGrade: "inferred",
          severity: "medium",
        },
      }),
    );
  });

  it("records safe metadata and rejects a schema-invalid output", async () => {
    const judgmentStore = store();
    vi.mocked(judgmentStore.loadProvider).mockResolvedValue({
      model: "mock-model",
      name: "mock-provider",
      run: vi.fn().mockResolvedValue({
        confidence: 1,
        evidenceGrade: "verified",
        explanation: "invalid grade",
        severity: "critical",
        verdict: "confirmed",
      }),
    });
    const handler = createJudgmentJobHandler(judgmentStore);
    const claimed = job({
      billingMode: "credits",
      context: ["source"],
      currentConfidence: 0.5,
      currentSeverity: "low",
      kind: "drift-verdict-confirmation",
      provider: "anthropic",
      targetId: "finding-2",
    });

    await expect(
      handler(claimed, { heartbeat: vi.fn().mockResolvedValue(true) }),
    ).rejects.toMatchObject({ code: "schema_invalid" });
    expect(judgmentStore.saveJudgment).not.toHaveBeenCalled();
    expect(judgmentStore.recordInvalidOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "schema_invalid",
        jobId: claimed.id,
        payloadDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it("allows a zero-credit BYOK judgment and selects the workspace credential", async () => {
    const judgmentStore = store();
    const handler = createJudgmentJobHandler(judgmentStore);
    const claimed = job({
      billingMode: "byok",
      context: ["source"],
      currentConfidence: 0.5,
      currentSeverity: "low",
      kind: "requirement-disambiguation",
      provider: "openai",
      targetId: "requirement-1",
    });
    const byokJob = { ...claimed, creditCost: 0 };

    await handler(byokJob, { heartbeat: vi.fn().mockResolvedValue(true) });

    expect(judgmentStore.loadProvider).toHaveBeenCalledWith({
      billingMode: "byok",
      provider: "openai",
      workspaceId: claimed.workspaceId,
    });
  });
});
