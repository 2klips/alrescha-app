import { createHash } from "node:crypto";

import {
  CoachingValidationError,
  analyzePromptSignals,
  coachingSuggestions,
  validateCoachingOutput,
  type PromptCoachingOutput,
  type PromptSignals,
} from "@arr/core";

import type { JobHandler } from "./worker";

/**
 * The coaching job (Phase 2C todo 8).
 *
 * Coaching bills through the same ledger as judgment because it is the same
 * kind of act: a model call whose output either satisfies the schema or does
 * not. Everything billing-related is therefore delegated — the worker loop
 * reserves on claim, `finish` settles, and a `CoachingValidationError` routes
 * to `reject_job`, which refunds. This file adds no billing logic of its own;
 * that absence is what keeps the no-charge rule from drifting between the two
 * kinds.
 */

/**
 * Coaching's own provider port. `JudgmentProvider` takes a `JudgmentRequest`,
 * whose `kind` enum covers drift verdicts only — reusing it would mean
 * widening a schema that guards a different contract, so coaching gets a
 * narrow port of its own.
 */
export interface CoachingProvider {
  readonly model: string;
  readonly name: string;
  run(request: {
    readonly ceilings: PromptSignals;
    readonly promptText: string;
    readonly suggestions: readonly string[];
  }): Promise<unknown>;
}

export interface CoachingJobStore {
  loadProvider(input: {
    readonly billingMode: "byok" | "credits";
    readonly provider: "anthropic" | "openai";
    readonly workspaceId: string;
  }): Promise<CoachingProvider>;
  recordInvalidOutput(input: {
    readonly attemptCount: number;
    readonly code: "schema_invalid";
    readonly jobId: string;
    readonly message: string;
    readonly model: string;
    readonly payloadDigest: string;
    readonly provider: string;
    readonly workspaceId: string;
  }): Promise<void>;
  saveCoaching(input: {
    readonly jobId: string;
    readonly model: string;
    readonly payload: PromptCoachingOutput;
    readonly payloadDigest: string;
    readonly promptRecordId: string;
    readonly provider: string;
    readonly workspaceId: string;
  }): Promise<void>;
}

function providerName(value: unknown): "anthropic" | "openai" {
  if (value === "anthropic" || value === "openai") return value;
  throw new Error("Coaching job requires a supported provider.");
}

function billingMode(value: unknown): "byok" | "credits" {
  if (value === "byok" || value === "credits") return value;
  throw new Error("Coaching job requires a billing mode.");
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Coaching job requires ${field}.`);
  }
  return value;
}

function digest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function createCoachingJobHandler(store: CoachingJobStore): JobHandler {
  return async (job, context) => {
    const provider = providerName(job.payload["provider"]);
    const mode = billingMode(job.payload["billingMode"]);
    const promptText = requiredText(job.payload["promptText"], "promptText");
    const promptRecordId = requiredText(
      job.payload["promptRecordId"],
      "promptRecordId",
    );
    // Same invariant the judgment handler holds: a BYOK call spends the
    // member's own key, so it must not also reserve workspace credits.
    if (mode === "byok" && job.creditCost !== 0) {
      throw new Error("BYOK coaching jobs must bypass credits.");
    }

    const model = await store.loadProvider({
      billingMode: mode,
      provider,
      workspaceId: job.workspaceId,
    });
    context.heartbeat();

    const signals = analyzePromptSignals(promptText);
    // The floor rules are deterministic and computed here, not asked of the
    // model: an axis the prompt cannot evidence is capped before the model
    // ever sees it, so a confident-sounding answer cannot raise it.
    const raw = await model.run({
      ceilings: signals,
      promptText,
      suggestions: coachingSuggestions(signals),
    });
    context.heartbeat();

    const payloadDigest = digest(raw);
    try {
      const validated = validateCoachingOutput(promptText, raw);
      await store.saveCoaching({
        jobId: job.id,
        model: model.model,
        payload: validated,
        payloadDigest,
        promptRecordId,
        provider,
        workspaceId: job.workspaceId,
      });
    } catch (error) {
      if (error instanceof CoachingValidationError) {
        // Recorded, then rethrown: the worker loop reads the `schema_invalid`
        // marker and rejects the job, which refunds the reservation.
        await store.recordInvalidOutput({
          attemptCount: job.attemptCount,
          code: error.code,
          jobId: job.id,
          message: error.message,
          model: model.model,
          payloadDigest,
          provider,
          workspaceId: job.workspaceId,
        });
      }
      throw error;
    }
  };
}
