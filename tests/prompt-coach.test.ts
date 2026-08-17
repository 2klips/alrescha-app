import { describe, expect, it } from "vitest";

import {
  CoachingValidationError,
  analyzePromptSignals,
  coachPrompt,
  coachingCreditCost,
  coachingSuggestions,
  parseLocalPromptLog,
  promptCoachingOutputSchema,
  rubricCeilings,
  serializeLocalPromptLog,
  type PromptCoachingOutput,
} from "../packages/core/src/index";

const RICH_PROMPT =
  "spec/auth.md의 REQ-AUTH-003을 구현해줘. tests/session.test.ts가 통과하면 완료이고, 결제 모듈은 건드리지 마.";
const SHELL_PROMPT = "잘 부탁해";

function output(
  rubric: Partial<PromptCoachingOutput["rubric"]>,
): PromptCoachingOutput {
  return {
    grade: "inferred",
    rubric: {
      batchSize: 0,
      contextGrounding: 0,
      noOverInstruction: 0,
      specificity: 0,
      stopCondition: 0,
      verifiability: 0,
      ...rubric,
    },
    suggestions: [],
  };
}

describe("prompt coaching (todo 11)", () => {
  it("enforces the output schema contract: six axes 0-2, inferred label, max 3 suggestions", () => {
    expect(
      promptCoachingOutputSchema.safeParse(output({ verifiability: 2 })).success,
    ).toBe(true);
    // Wrong grade, out-of-range axis, extra field, too many suggestions — all rejected.
    for (const invalid of [
      { ...output({}), grade: "verified" },
      output({ verifiability: 3 as never }),
      { ...output({}), confidence: 0.9 },
      { ...output({}), suggestions: ["a", "b", "c", "d"] },
    ]) {
      expect(promptCoachingOutputSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("reads observable signals deterministically", () => {
    const rich = analyzePromptSignals(RICH_PROMPT);
    expect(rich).toMatchObject({
      hasContextReference: true,
      hasStopCondition: true,
      hasVerificationSignal: true,
    });
    const shell = analyzePromptSignals(SHELL_PROMPT);
    expect(shell.hasVerificationSignal).toBe(false);
    expect(shell.wordCount).toBeLessThan(8);
  });

  it("a shell prompt cannot score high, whatever the model claims", async () => {
    const ceilings = rubricCeilings(analyzePromptSignals(SHELL_PROMPT));
    expect(ceilings).toMatchObject({
      contextGrounding: 0,
      specificity: 0,
      stopCondition: 0,
      verifiability: 0,
    });
    // A flattering scorer is not clamped — it is invalidated.
    const flattering = async () => output({ verifiability: 2, specificity: 2 });
    await expect(coachPrompt(SHELL_PROMPT, flattering)).rejects.toThrow(
      CoachingValidationError,
    );
    // An honest scorer for the rich prompt passes at full marks.
    const honest = async () =>
      output({
        batchSize: 2,
        contextGrounding: 2,
        noOverInstruction: 2,
        specificity: 2,
        stopCondition: 2,
        verifiability: 2,
      });
    const result = await coachPrompt(RICH_PROMPT, honest);
    expect(result.output.grade).toBe("inferred");
  });

  it("never charges a failed judgment: provider error, schema break, floor break", async () => {
    const cases: Promise<unknown>[] = [
      coachPrompt(RICH_PROMPT, async () => {
        throw new Error("provider down");
      }),
      coachPrompt(RICH_PROMPT, async () => ({ nonsense: true })),
      coachPrompt(SHELL_PROMPT, async () => output({ verifiability: 2 })),
    ];
    for (const attempt of cases) {
      const error = await attempt.then(
        () => null,
        (thrown) => thrown as CoachingValidationError,
      );
      expect(error).toBeInstanceOf(CoachingValidationError);
      expect(coachingCreditCost(error!)).toBe(0);
    }
    const success = await coachPrompt(RICH_PROMPT, async () => output({}));
    expect(coachingCreditCost(success)).toBe(1);
  });

  it("derives concrete suggestions from the missing signals", () => {
    const suggestions = coachingSuggestions(analyzePromptSignals(SHELL_PROMPT));
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.join(" ")).toContain("검증 신호");
  });

  it("works for a local-only user straight from the local prompt log", async () => {
    const log = serializeLocalPromptLog([
      {
        occurredAt: "2026-08-17T10:00:00.000Z",
        promptText: RICH_PROMPT,
        targetNodeIds: [],
        tokenCount: 64,
        toolName: "log_progress",
      },
    ]);
    const [record] = parseLocalPromptLog(log);
    const result = await coachPrompt(record!.promptText, async () =>
      output({ verifiability: 2, contextGrounding: 2 }),
    );
    // No workspace, no server, no consent machinery involved — pure local.
    expect(result.output.rubric.verifiability).toBe(2);
  });
});
