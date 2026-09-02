import { describe, expect, it, vi } from "vitest";

import { isNonBillableAiError } from "@alrescha/core";

import {
  createCoachingJobHandler,
  type CoachingProvider,
} from "./coaching-job";

/**
 * Phase 2C todo 8 — the coaching handler.
 *
 * The handler owns no billing logic; it owns the *signal* that billing reads.
 * So the tests below check that a schema-invalid output leaves through the
 * `schema_invalid` marker (which the worker loop turns into a refund) and
 * that a valid one saves without one.
 */

const PROMPT =
  "spec/auth.md의 REQ-AUTH-003을 구현해줘. tests/session.test.ts가 통과하면 완료이고, 결제 모듈은 건드리지 마.";

function job(overrides: Record<string, unknown> = {}) {
  return {
    attemptCount: 1,
    creditCost: 5,
    id: "job-coach-1",
    maxAttempts: 3,
    kind: "coach" as const,
    payload: {
      billingMode: "credits",
      promptRecordId: "prompt-1",
      provider: "anthropic",
    },
    repositoryId: "repo-1",
    runId: "run-1",
    workspaceId: "workspace-1",
    ...overrides,
  };
}

function provider(output: unknown): CoachingProvider {
  return {
    model: "claude-sonnet-5",
    name: "anthropic",
    run: vi.fn().mockResolvedValue(output),
  };
}

function store(model: CoachingProvider, promptText: string | null = PROMPT) {
  return {
    // The raw text is read at run time, never carried in the job (ADR-011).
    loadPromptText: vi.fn().mockResolvedValue(promptText),
    loadProvider: vi.fn().mockResolvedValue(model),
    recordInvalidOutput: vi.fn().mockResolvedValue(undefined),
    saveCoaching: vi.fn().mockResolvedValue(undefined),
  };
}

const context = { heartbeat: vi.fn() };

describe("coaching job handler", () => {
  it("saves a valid rubric and records no invalid output", async () => {
    const model = provider({
      grade: "inferred",
      rubric: {
        batchSize: 2,
        contextGrounding: 2,
        noOverInstruction: 2,
        specificity: 2,
        stopCondition: 2,
        verifiability: 2,
      },
      suggestions: [],
    });
    const coachingStore = store(model);
    await createCoachingJobHandler(coachingStore)(job(), context);

    expect(coachingStore.saveCoaching).toHaveBeenCalledTimes(1);
    expect(coachingStore.recordInvalidOutput).not.toHaveBeenCalled();
    expect(coachingStore.saveCoaching.mock.calls[0]?.[0]).toMatchObject({
      jobId: "job-coach-1",
      promptRecordId: "prompt-1",
    });
  });

  it("marks a schema-invalid output non-billable so the loop refunds it", async () => {
    const coachingStore = store(provider({ grade: "verified", rubric: {} }));
    const handler = createCoachingJobHandler(coachingStore);

    await expect(handler(job(), context)).rejects.toSatisfy(
      isNonBillableAiError,
    );
    expect(coachingStore.recordInvalidOutput).toHaveBeenCalledTimes(1);
    expect(coachingStore.recordInvalidOutput.mock.calls[0]?.[0]).toMatchObject({
      code: "schema_invalid",
    });
    expect(coachingStore.saveCoaching).not.toHaveBeenCalled();
  });

  it("treats a rubric above its observable ceiling as non-billable too", async () => {
    // The prompt below evidences nothing, so every axis is capped at 0; a
    // model claiming 2 is exactly the shell-prompt case the floor rules exist
    // for, and it must not be charged.
    const coachingStore = store(
      provider({
        grade: "inferred",
        rubric: {
          batchSize: 2,
          contextGrounding: 2,
          noOverInstruction: 2,
          specificity: 2,
          stopCondition: 2,
          verifiability: 2,
        },
        suggestions: [],
      }),
    );
    vi.mocked(coachingStore.loadPromptText).mockResolvedValue("잘 해줘");
    const handler = createCoachingJobHandler(coachingStore);

    await expect(handler(job(), context)).rejects.toSatisfy(
      isNonBillableAiError,
    );
    expect(coachingStore.saveCoaching).not.toHaveBeenCalled();
  });

  it("stops before the model when the record's raw text is gone (consent revoked)", async () => {
    const coachingStore = store(provider({}), null);
    const handler = createCoachingJobHandler(coachingStore);

    await expect(handler(job(), context)).rejects.toThrow(/no raw text/);
    // Nothing to coach means nothing to spend: the provider is never loaded.
    expect(coachingStore.loadProvider).not.toHaveBeenCalled();
    expect(coachingStore.saveCoaching).not.toHaveBeenCalled();
  });

  it("refuses a BYOK job that also carries a credit cost", async () => {
    const coachingStore = store(provider({}));
    const handler = createCoachingJobHandler(coachingStore);

    await expect(
      handler(
        job({ payload: { ...job().payload, billingMode: "byok" } }),
        context,
      ),
    ).rejects.toThrow(/bypass credits/i);
    // Rejected before the model is ever reached — no spend, no call.
    expect(coachingStore.loadProvider).not.toHaveBeenCalled();
  });
});
