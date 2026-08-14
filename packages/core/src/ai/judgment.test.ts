import { describe, expect, it } from "vitest";

import {
  applyJudgment,
  executeJudgment,
  judgmentOutputSchema,
  type JudgmentProvider,
} from "./judgment";

describe("AI judgment contract", () => {
  it("accepts a supported verdict and upgrades confidence without creating verified evidence", () => {
    const output = judgmentOutputSchema.parse({
      confidence: 0.91,
      evidenceGrade: "inferred",
      explanation: "Both instructions govern the same API response scope.",
      severity: "medium",
      verdict: "confirmed",
    });

    expect(
      applyJudgment(
        { confidence: 0.62, evidenceGrade: "inferred", severity: "low" },
        output,
      ),
    ).toEqual({
      confidence: 0.91,
      evidenceGrade: "inferred",
      severity: "medium",
    });
  });

  it("dispatches a judgment request through a vendor-neutral provider interface", async () => {
    const requests: unknown[] = [];
    const provider: JudgmentProvider = {
      model: "mock-model",
      name: "mock-provider",
      run: async (request) => {
        requests.push(request);
        return {
          confidence: 0.88,
          evidenceGrade: "inferred",
          explanation: "The source spans express incompatible requirements.",
          severity: "medium",
          verdict: "confirmed",
        };
      },
    };
    const request = {
      context: [
        "AGENTS.md:12 requires camelCase",
        "api/AGENTS.md:5 requires snake_case",
      ],
      currentConfidence: 0.62,
      currentSeverity: "medium" as const,
      kind: "contradiction-confirmation" as const,
      targetId: "contradicting-instructions:AGENTS.md:12:1",
    };

    const result = await executeJudgment({ provider, request });

    expect(requests).toEqual([request]);
    expect(result.provider).toEqual({
      model: "mock-model",
      name: "mock-provider",
    });
    expect(result.output.verdict).toBe("confirmed");
  });

  it("rejects schema-invalid provider output with recordable safe metadata", async () => {
    const provider: JudgmentProvider = {
      model: "mock-model",
      name: "mock-provider",
      run: async () => ({
        confidence: 1,
        evidenceGrade: "verified",
        explanation: "AI cannot establish execution evidence.",
        severity: "critical",
        verdict: "confirmed",
      }),
    };

    await expect(
      executeJudgment({
        provider,
        request: {
          context: ["ambiguous source"],
          currentConfidence: 0.5,
          currentSeverity: "low",
          kind: "drift-verdict-confirmation",
          targetId: "finding-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "schema_invalid",
      model: "mock-model",
      name: "JudgmentValidationError",
      payloadDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      provider: "mock-provider",
    });
  });
});
