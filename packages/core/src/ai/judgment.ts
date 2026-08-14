import { createHash } from "node:crypto";

import { z } from "zod";

export const judgmentOutputSchema = z.strictObject({
  confidence: z.number().min(0).max(1),
  evidenceGrade: z.literal("inferred"),
  explanation: z.string().trim().min(1).max(2_000),
  severity: z.enum(["low", "medium", "high", "critical"]),
  verdict: z.enum(["confirmed", "rejected", "ambiguous"]),
});

export type JudgmentOutput = z.infer<typeof judgmentOutputSchema>;

export type JudgmentKind =
  | "contradiction-confirmation"
  | "drift-verdict-confirmation"
  | "requirement-disambiguation";

export const judgmentRequestSchema = z.strictObject({
  context: z.array(z.string().trim().min(1).max(4_000)).min(1).max(20),
  currentConfidence: z.number().min(0).max(1),
  currentSeverity: z.enum(["low", "medium", "high", "critical"]),
  kind: z.enum([
    "contradiction-confirmation",
    "drift-verdict-confirmation",
    "requirement-disambiguation",
  ]),
  targetId: z.string().trim().min(1).max(300),
});

export type JudgmentRequest = z.infer<typeof judgmentRequestSchema>;

export interface JudgmentProvider {
  readonly model: string;
  readonly name: string;
  run(request: JudgmentRequest): Promise<unknown>;
}

export interface ExecutedJudgment {
  readonly output: JudgmentOutput;
  readonly provider: {
    readonly model: string;
    readonly name: string;
  };
}

export class JudgmentValidationError extends Error {
  readonly code = "schema_invalid" as const;

  constructor(
    readonly provider: string,
    readonly model: string,
    readonly payloadDigest: string,
    readonly issues: readonly {
      readonly code: string;
      readonly path: string;
    }[],
  ) {
    super("Provider returned a schema-invalid judgment.");
    this.name = "JudgmentValidationError";
  }
}

function digestPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function executeJudgment(input: {
  readonly provider: JudgmentProvider;
  readonly request: JudgmentRequest;
}): Promise<ExecutedJudgment> {
  const rawOutput = await input.provider.run(input.request);
  const parsed = judgmentOutputSchema.safeParse(rawOutput);
  if (!parsed.success) {
    throw new JudgmentValidationError(
      input.provider.name,
      input.provider.model,
      digestPayload(rawOutput),
      parsed.error.issues.map(({ code, path }) => ({
        code,
        path: path.join("."),
      })),
    );
  }
  return {
    output: parsed.data,
    provider: { model: input.provider.model, name: input.provider.name },
  };
}

export interface JudgmentTargetState {
  readonly confidence: number;
  readonly evidenceGrade: "inferred";
  readonly severity: "critical" | "high" | "low" | "medium";
}

export function applyJudgment(
  target: JudgmentTargetState,
  output: JudgmentOutput,
): JudgmentTargetState {
  const requestedSeverity = output.severity;
  return {
    confidence: Math.max(target.confidence, output.confidence),
    evidenceGrade: "inferred",
    severity:
      requestedSeverity === "critical" || requestedSeverity === "high"
        ? "medium"
        : requestedSeverity,
  };
}
