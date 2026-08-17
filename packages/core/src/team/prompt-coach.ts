/**
 * Prompt coaching (Phase 2B todo 11, ADR-011-4).
 *
 * A judgment job scores a prompt on six axes (0–2) and proposes
 * improvements. Two honesty rules are structural:
 *   - the output is ALWAYS `inferred` — the schema hard-codes the label;
 *   - a deterministic floor stops shell prompts from scoring high: axes
 *     whose observable signal is absent are capped regardless of what the
 *     model claims, and a violation invalidates the output (no charge).
 * The coach is a pure function of the prompt text plus an injected provider,
 * so a local-only user (ADR-011-2) can run it against the local prompt log
 * without any server or workspace.
 */

import { z } from "zod";

const axisSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const promptRubricSchema = z.strictObject({
  batchSize: axisSchema,
  contextGrounding: axisSchema,
  noOverInstruction: axisSchema,
  specificity: axisSchema,
  stopCondition: axisSchema,
  verifiability: axisSchema,
});

export type PromptRubric = z.infer<typeof promptRubricSchema>;

export const promptCoachingOutputSchema = z.strictObject({
  grade: z.literal("inferred"),
  rubric: promptRubricSchema,
  suggestions: z.array(z.string().min(1).max(300)).max(3),
});

export type PromptCoachingOutput = z.infer<typeof promptCoachingOutputSchema>;

export class CoachingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoachingValidationError";
  }
}

/** Observable signals the floor rules key on — deterministic, no model. */
export interface PromptSignals {
  readonly hasContextReference: boolean;
  readonly hasStopCondition: boolean;
  readonly hasVerificationSignal: boolean;
  readonly wordCount: number;
}

const VERIFICATION_PATTERN =
  /테스트|검증|증명|기준|수용|통과|\btest(s|ed|ing)?\b|\bassert\b|\bexpect\b|\bverif|\bcriteri|\bpass(es|ing)?\b/iu;
const CONTEXT_PATTERN =
  /[\w-]+\.[a-z]{1,4}\b|`[^`]+`|#\d+|[\w-]+\/[\w-]+|스펙|문서|ADR-\d+|경로/iu;
const STOP_PATTERN =
  /까지만|멈춰|중단|지\s?(?:마(?:라|세요)?|말)(?=[\s.,!?"']|$)|금지|않는다|\bonly\b|\bstop\b|\bdo not\b|\bdon't\b|범위/iu;

export function analyzePromptSignals(promptText: string): PromptSignals {
  return {
    hasContextReference: CONTEXT_PATTERN.test(promptText),
    hasStopCondition: STOP_PATTERN.test(promptText),
    hasVerificationSignal: VERIFICATION_PATTERN.test(promptText),
    wordCount: promptText
      .trim()
      .split(/\s+/u)
      .filter((word) => word.length > 0).length,
  };
}

/**
 * The anti-shell floor: axis ceilings implied by the prompt's own text.
 * A model score above a ceiling is not clamped — it is INVALID, because a
 * scorer claiming evidence that observably is not there cannot be charged
 * for or trusted.
 */
export function rubricCeilings(signals: PromptSignals): PromptRubric {
  const shell = signals.wordCount < 8;
  return {
    batchSize: shell ? 1 : 2,
    contextGrounding: signals.hasContextReference ? 2 : 0,
    noOverInstruction: 2,
    specificity: shell ? 0 : 2,
    stopCondition: signals.hasStopCondition ? 2 : 0,
    verifiability: signals.hasVerificationSignal ? 2 : 0,
  };
}

export function validateCoachingOutput(
  promptText: string,
  candidate: unknown,
): PromptCoachingOutput {
  const parsed = promptCoachingOutputSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new CoachingValidationError(
      `Coaching output failed the schema contract: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  const ceilings = rubricCeilings(analyzePromptSignals(promptText));
  for (const axis of Object.keys(ceilings) as (keyof PromptRubric)[]) {
    if (parsed.data.rubric[axis] > ceilings[axis]) {
      throw new CoachingValidationError(
        `Rubric axis ${axis} exceeds its observable ceiling (${ceilings[axis]}).`,
      );
    }
  }
  return parsed.data;
}

/** Deterministic suggestions derived from the missing signals. */
export function coachingSuggestions(signals: PromptSignals): string[] {
  const suggestions: string[] = [];
  if (!signals.hasVerificationSignal) {
    suggestions.push(
      "검증 신호를 넣으세요 — 어떤 테스트/기준이 통과하면 완료인지 명시하면 채택 확률이 크게 오릅니다.",
    );
  }
  if (!signals.hasContextReference) {
    suggestions.push(
      "컨텍스트 근거를 넣으세요 — 파일 경로·스펙 문서·노드 id를 인용하면 추측이 줄어듭니다.",
    );
  }
  if (!signals.hasStopCondition) {
    suggestions.push(
      "정지 조건을 넣으세요 — 어디까지 하고 멈출지, 무엇은 하지 말지를 적으세요.",
    );
  }
  return suggestions.slice(0, 3);
}

export type CoachingProvider = (input: {
  readonly promptText: string;
}) => Promise<unknown>;

export interface CoachingResult {
  readonly output: PromptCoachingOutput;
  /** Judgment jobs bill on success only (WORK_SPEC §14). */
  readonly billable: true;
}

/**
 * Run the coaching judgment. A provider failure, schema mismatch, or floor
 * violation throws `CoachingValidationError` — the caller must not charge
 * (`coachingCreditCost` encodes that rule).
 */
export async function coachPrompt(
  promptText: string,
  provider: CoachingProvider,
): Promise<CoachingResult> {
  if (promptText.trim().length === 0) {
    throw new CoachingValidationError("An empty prompt cannot be coached.");
  }
  let candidate: unknown;
  try {
    candidate = await provider({ promptText });
  } catch (error) {
    throw new CoachingValidationError(
      `Coaching provider failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const output = validateCoachingOutput(promptText, candidate);
  return { billable: true, output };
}

/** No charge on failed or invalid coaching — idempotent billing input. */
export function coachingCreditCost(
  outcome: CoachingResult | CoachingValidationError,
): number {
  return outcome instanceof CoachingValidationError ? 0 : 1;
}
