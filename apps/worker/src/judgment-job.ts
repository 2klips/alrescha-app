import { createHash } from "node:crypto";

import {
  JudgmentValidationError,
  applyJudgment,
  executeJudgment,
  judgmentRequestSchema,
  type JudgmentOutput,
  type JudgmentProvider,
  type JudgmentKind,
  type JudgmentTargetState,
} from "@alrescha/core";

import type { JobHandler } from "./worker";

export interface JudgmentJobStore {
  loadProvider(input: {
    readonly billingMode: "byok" | "credits";
    readonly provider: "anthropic" | "openai";
    readonly workspaceId: string;
  }): Promise<JudgmentProvider>;
  recordInvalidOutput(input: {
    readonly code: "schema_invalid";
    readonly issues: readonly {
      readonly code: string;
      readonly path: string;
    }[];
    readonly attemptCount: number;
    readonly jobId: string;
    readonly model: string;
    readonly payloadDigest: string;
    readonly provider: string;
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<void>;
  saveJudgment(input: {
    readonly jobId: string;
    readonly kind: JudgmentKind;
    readonly model: string;
    readonly payload: JudgmentOutput;
    readonly payloadDigest: string;
    readonly provider: string;
    readonly repositoryId: string;
    readonly target: JudgmentTargetState;
    readonly targetId: string;
    readonly workspaceId: string;
  }): Promise<void>;
}

function providerName(value: unknown): "anthropic" | "openai" {
  if (value === "anthropic" || value === "openai") return value;
  throw new Error("Judgment job requires a supported provider.");
}

function billingMode(value: unknown): "byok" | "credits" {
  if (value === "byok" || value === "credits") return value;
  throw new Error("Judgment job requires a billing mode.");
}

function digest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function createJudgmentJobHandler(store: JudgmentJobStore): JobHandler {
  return async (job, context) => {
    const {
      billingMode: rawBillingMode,
      provider: rawProvider,
      ...rawRequest
    } = job.payload;
    const providerNameValue = providerName(rawProvider);
    const billingModeValue = billingMode(rawBillingMode);
    if (billingModeValue === "byok" && job.creditCost !== 0) {
      throw new Error("BYOK judgment jobs must bypass credits.");
    }
    if (billingModeValue === "credits" && job.creditCost === 0) {
      throw new Error("Platform judgment jobs require a positive credit cost.");
    }
    const request = judgmentRequestSchema.parse(rawRequest);
    const provider = await store.loadProvider({
      billingMode: billingModeValue,
      provider: providerNameValue,
      workspaceId: job.workspaceId,
    });
    await context.heartbeat();

    try {
      const executed = await executeJudgment({ provider, request });
      await store.saveJudgment({
        jobId: job.id,
        kind: request.kind,
        model: executed.provider.model,
        payload: executed.output,
        payloadDigest: digest(executed.output),
        provider: executed.provider.name,
        repositoryId: job.repositoryId,
        target: applyJudgment(
          {
            confidence: request.currentConfidence,
            evidenceGrade: "inferred",
            severity: request.currentSeverity,
          },
          executed.output,
        ),
        targetId: request.targetId,
        workspaceId: job.workspaceId,
      });
    } catch (error) {
      if (error instanceof JudgmentValidationError) {
        await store.recordInvalidOutput({
          attemptCount: job.attemptCount,
          code: error.code,
          issues: error.issues,
          jobId: job.id,
          model: error.model,
          payloadDigest: error.payloadDigest,
          provider: error.provider,
          repositoryId: job.repositoryId,
          workspaceId: job.workspaceId,
        });
      }
      throw error;
    }
  };
}
