import {
  CONCEPT_BATCH_MAX_CHARS,
  EnrichValidationError,
  batchSummaries,
  clipSummaryInput,
  conceptSynthesisDigest,
  mergeConceptBatches,
  moduleMemberDigest,
  moduleNameForMembers,
  selectFilesForSummarization,
  validateConceptSynthesis,
  validateProseSummary,
  type FileSummaryInput,
  type SynthesizedConcept,
} from "@arr/core";

import type { EnrichProvider } from "./ai-providers";
import type { JobHandler } from "./worker";

/**
 * The enrich job, part ① — prose file summaries (Phase 3 Wave C todo 6).
 *
 * Billing is inherited, never reimplemented: `enqueue_enrich_job` already
 * decided the cost from the blob-hash cache, the worker loop reserves on
 * claim, and a `schema_invalid` throw refunds through `reject_job`. This
 * handler's own obligations are the hard rules: the source body stays
 * transient (fetched, clipped, summarized, dropped), only validated prose is
 * persisted, and a provider failure on one file skips that file (the gate)
 * instead of wasting the batch.
 */

export interface EnrichPendingFile {
  readonly lastSeenCommitSha: string;
  readonly path: string;
  readonly sourceBlobSha: string;
  readonly summaryBlobSha: string | null;
}

export type EnrichResultItem =
  | {
      readonly kind: "summary";
      readonly model: string;
      readonly path: string;
      readonly provider: string;
      readonly summary: string;
      readonly summaryBlobSha: string;
    }
  | {
      readonly kind: "skip";
      readonly path: string;
      readonly reason: string;
    };

export interface EnrichJobStore {
  listPendingFiles(input: {
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<readonly EnrichPendingFile[]>;
  /** Files whose summary cache is current — the concept pass input. */
  listSummarizedFiles(input: {
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<readonly FileSummaryInput[]>;
  /** The digest the stored concept layer was built from, if any. */
  loadConceptDigest(input: {
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<string | null>;
  loadProvider(input: {
    readonly billingMode: "byok" | "credits";
    readonly provider: "anthropic" | "openai";
    readonly workspaceId: string;
  }): Promise<EnrichProvider>;
  saveConceptGraph(input: {
    readonly concepts: readonly SynthesizedConcept[];
    readonly digest: string;
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<void>;
  saveModuleSummary(input: {
    readonly memberDigest: string;
    readonly memberPaths: readonly string[];
    readonly model: string;
    readonly moduleKey: string;
    readonly name: string;
    readonly provider: string;
    readonly repositoryId: string;
    readonly summary: string;
    readonly workspaceId: string;
  }): Promise<void>;
  saveResults(input: {
    readonly items: readonly EnrichResultItem[];
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<void>;
}

/** Transient source access — the same port analysis uses. */
export type EnrichSourceReader = (input: {
  readonly commitSha: string;
  readonly path: string;
  readonly repositoryId: string;
  readonly workspaceId: string;
}) => Promise<string | null>;

function providerName(value: unknown): "anthropic" | "openai" {
  if (value === "anthropic" || value === "openai") return value;
  throw new Error("Enrich job requires a supported provider.");
}

function billingMode(value: unknown): "byok" | "credits" {
  if (value === "byok" || value === "credits") return value;
  throw new Error("Enrich job requires a billing mode.");
}

export function createEnrichJobHandler(input: {
  readonly readSource: EnrichSourceReader;
  readonly store: EnrichJobStore;
}): JobHandler {
  return async (job, context) => {
    const provider = providerName(job.payload["provider"]);
    const mode = billingMode(job.payload["billingMode"]);
    // Same invariant as judge/coach: a BYOK call spends the member's own key,
    // so it must not also reserve workspace credits.
    if (mode === "byok" && job.creditCost !== 0) {
      throw new Error("BYOK enrich jobs must bypass credits.");
    }

    // Re-derive the pending set at claim time: a rescan between enqueue and
    // claim changes blob shas, and stale work must be neither done nor billed
    // as if it were fresh.
    const pending = selectFilesForSummarization(
      await input.store.listPendingFiles({
        repositoryId: job.repositoryId,
        workspaceId: job.workspaceId,
      }),
    );

    // Lazy, memoized: an all-cached run that only refreshes the concept
    // layer still needs the provider, but a fully idle run never loads one.
    let loadedModel: EnrichProvider | null = null;
    const model = async (): Promise<EnrichProvider> => {
      loadedModel ??= await input.store.loadProvider({
        billingMode: mode,
        provider,
        workspaceId: job.workspaceId,
      });
      return loadedModel;
    };

    // A module-scoped job (todo 8, lazy summaries) summarizes exactly one
    // cluster and skips the repository-wide passes.
    const moduleKey = job.payload["moduleKey"];
    if (typeof moduleKey === "string" && moduleKey.length > 0) {
      const memberPaths = Array.isArray(job.payload["memberPaths"])
        ? (job.payload["memberPaths"] as unknown[]).filter(
            (path): path is string => typeof path === "string",
          )
        : [];
      const members = new Set(memberPaths);
      if (pending.some((file) => members.has(file.path))) {
        await summarizePendingFiles({
          context,
          input,
          job,
          model,
          pending: pending.filter((file) => members.has(file.path)),
        });
      }
      await summarizeModule({
        context,
        input,
        job,
        memberPaths,
        model,
        moduleKey,
      });
      return;
    }

    const outcome =
      pending.length > 0
        ? await summarizePendingFiles({ context, input, job, model, pending })
        : { schemaInvalidCount: 0, skippedCount: 0, summaryCount: 0 };
    const conceptsSynthesized = await synthesizeConceptLayer({
      context,
      input,
      job,
      model,
    });

    // The no-free-charge guard, at job scope: fail only when nothing at all
    // was delivered — no prose landed and the concept layer had no work.
    // Stubborn files must not block the concept stage (pilot round 4), but a
    // run that delivered *nothing* is not billable either: schema-invalid
    // outputs reject (refund), pure provider failures retry.
    if (
      pending.length > 0 &&
      outcome.summaryCount === 0 &&
      !conceptsSynthesized
    ) {
      if (outcome.schemaInvalidCount > 0) {
        throw new EnrichValidationError(
          `Enrich delivered nothing: ${outcome.schemaInvalidCount} ` +
            `schema-invalid output(s) among ${outcome.skippedCount} skipped file(s).`,
        );
      }
      throw new Error(
        `Enrich produced no summaries: ${outcome.skippedCount} file(s) skipped.`,
      );
    }
  };
}

/**
 * Part ③ (todo 8): one module's prose from its members' prose. The cache key
 * saved alongside is the digest of the members as they are *now* — if a
 * rescan moved a blob between enqueue and claim, the summary honestly covers
 * (and is keyed to) the fresher state.
 */
async function summarizeModule(run: {
  readonly context: Parameters<JobHandler>[1];
  readonly input: {
    readonly readSource: EnrichSourceReader;
    readonly store: EnrichJobStore;
  };
  readonly job: Parameters<JobHandler>[0];
  readonly memberPaths: readonly string[];
  readonly model: () => Promise<EnrichProvider>;
  readonly moduleKey: string;
}): Promise<void> {
  const { context, input, job } = run;
  const members = new Set(run.memberPaths);
  const summarized = (
    await input.store.listSummarizedFiles({
      repositoryId: job.repositoryId,
      workspaceId: job.workspaceId,
    })
  ).filter((file) => members.has(file.path));
  if (summarized.length === 0) {
    throw new Error(
      `Module ${run.moduleKey} has no summarized members to explain.`,
    );
  }

  const model = await run.model();
  const name = moduleNameForMembers(summarized.map(({ path }) => path));
  const raw = await model.summarizeModule({
    members: summarized.map(({ path, summary }) => ({ path, summary })),
    name,
  });
  await context.heartbeat();
  // Prose contract, minus the verbatim check (there is no source here —
  // the inputs are already prose).
  const summary = validateProseSummary({
    path: run.moduleKey,
    raw,
    source: "",
  });

  await input.store.saveModuleSummary({
    memberDigest: moduleMemberDigest(
      summarized.map(({ blobSha, path }) => ({ blobSha, path })),
    ),
    memberPaths: summarized.map(({ path }) => path),
    model: model.model,
    moduleKey: run.moduleKey,
    name,
    provider: model.name,
    repositoryId: job.repositoryId,
    summary,
    workspaceId: job.workspaceId,
  });
}

async function summarizePendingFiles(run: {
  readonly context: Parameters<JobHandler>[1];
  readonly input: {
    readonly readSource: EnrichSourceReader;
    readonly store: EnrichJobStore;
  };
  readonly job: Parameters<JobHandler>[0];
  readonly model: () => Promise<EnrichProvider>;
  readonly pending: readonly EnrichPendingFile[];
}): Promise<{
  schemaInvalidCount: number;
  skippedCount: number;
  summaryCount: number;
}> {
  const { context, input, job, pending } = run;
  const model = await run.model();
  await context.heartbeat();

  // Chunked persistence: a 370-file batch that dies at file 300 keeps its
  // completed summaries (each is cached by blob sha), so the retry only
  // pays for the remainder. Billing stays honest — the reservation refunds
  // on rejection regardless of how much prose already landed.
  const PERSIST_CHUNK = 10;
  let persisted = 0;
  let schemaInvalidCount = 0;
  const items: EnrichResultItem[] = [];
  const flush = async (force: boolean) => {
    const unsaved = items.slice(persisted);
    if (unsaved.length === 0 || (!force && unsaved.length < PERSIST_CHUNK)) {
      return;
    }
    await input.store.saveResults({
      items: unsaved,
      repositoryId: job.repositoryId,
      workspaceId: job.workspaceId,
    });
    persisted = items.length;
  };
  for (const file of pending) {
    const source = await input.readSource({
      commitSha: file.lastSeenCommitSha,
      path: file.path,
      repositoryId: job.repositoryId,
      workspaceId: job.workspaceId,
    });
    if (source === null) {
      // Gone between scan and enrich — a smaller repository, not a failure.
      items.push({ kind: "skip", path: file.path, reason: "source-missing" });
      continue;
    }
    const { clipped, truncated } = clipSummaryInput(source);
    let raw: unknown;
    try {
      raw = await model.summarize({
        path: file.path,
        source: clipped,
        truncated,
      });
    } catch (error) {
      // The failure gate (Graft precedent): one provider failure skips one
      // file and the run keeps going. The cache key stays untouched, so the
      // next enqueue picks the file up again.
      items.push({
        kind: "skip",
        path: file.path,
        reason: error instanceof Error ? error.message : "provider-failure",
      });
      await context.heartbeat();
      continue;
    }
    // A schema-invalid output is discarded and gated per file — never
    // persisted, cache key untouched, so the next run re-attempts it. The
    // pilot showed why this cannot reject the whole job: one verbatim-happy
    // file early in path order would block every file after it, forever.
    // The no-charge rule keeps its teeth below: a run that delivers
    // *nothing* because of invalid outputs rejects and refunds.
    try {
      const summary = validateProseSummary({
        path: file.path,
        raw,
        source: clipped,
      });
      items.push({
        kind: "summary",
        model: model.model,
        path: file.path,
        provider: model.name,
        summary,
        summaryBlobSha: file.sourceBlobSha,
      });
    } catch (error) {
      if (!(error instanceof EnrichValidationError)) throw error;
      schemaInvalidCount += 1;
      items.push({
        kind: "skip",
        path: file.path,
        reason: `schema-invalid: ${error.message}`,
      });
    }
    await flush(false);
    await context.heartbeat();
  }

  await flush(true);
  return {
    schemaInvalidCount,
    skippedCount: items.filter((item) => item.kind === "skip").length,
    summaryCount: items.filter((item) => item.kind === "summary").length,
  };
}

/**
 * Part ② (todo 7): summaries → concept layer, invalidated by the digest of
 * the summarized set (LazyGraphRAG-style cache). Structural failure of the
 * synthesis output rejects through `schema_invalid` (refund); dubious pieces
 * inside a structurally valid output were already discarded by the clean
 * pass rather than guessed at.
 */
async function synthesizeConceptLayer(run: {
  readonly context: Parameters<JobHandler>[1];
  readonly input: {
    readonly readSource: EnrichSourceReader;
    readonly store: EnrichJobStore;
  };
  readonly job: Parameters<JobHandler>[0];
  readonly model: () => Promise<EnrichProvider>;
}): Promise<boolean> {
  const { context, input, job } = run;
  const summarized = await input.store.listSummarizedFiles({
    repositoryId: job.repositoryId,
    workspaceId: job.workspaceId,
  });
  if (summarized.length === 0) return false;

  const digest = conceptSynthesisDigest(summarized);
  const stored = await input.store.loadConceptDigest({
    repositoryId: job.repositoryId,
    workspaceId: job.workspaceId,
  });
  if (stored === digest) return false; // fresh — zero model calls

  const model = await run.model();
  const knownPaths = new Set(summarized.map(({ path }) => path));
  const batches = batchSummaries(summarized, CONCEPT_BATCH_MAX_CHARS);
  const validated: SynthesizedConcept[][] = [];
  let failedBatches = 0;
  for (const batch of batches) {
    // One structurally invalid batch must not nuke an 18-batch synthesis
    // (pilot round 5): retry once, then gate the batch. Nothing invalid is
    // ever persisted; a fully failed synthesis still rejects (refund).
    let cleaned: SynthesizedConcept[] | null = null;
    for (let attempt = 0; attempt < 2 && cleaned === null; attempt += 1) {
      try {
        const raw = await model.synthesizeConcepts(
          batch.map(({ path, summary }) => ({ path, summary })),
        );
        cleaned = validateConceptSynthesis({ knownPaths, raw });
      } catch (error) {
        if (!(error instanceof EnrichValidationError) || attempt === 1) {
          if (error instanceof EnrichValidationError) break;
          throw error;
        }
      }
      await context.heartbeat();
    }
    if (cleaned === null) {
      failedBatches += 1;
      continue;
    }
    validated.push(cleaned);
  }
  if (validated.length === 0 && batches.length > 0) {
    throw new EnrichValidationError(
      `Concept synthesis failed structurally in all ${batches.length} batch(es).`,
    );
  }
  if (failedBatches > 0) {
    // Partial coverage is served honestly; the gap closes when content moves.
    console.warn(
      `enrich: ${failedBatches}/${batches.length} concept batch(es) gated after retry`,
    );
  }

  await input.store.saveConceptGraph({
    concepts: mergeConceptBatches(validated),
    digest,
    repositoryId: job.repositoryId,
    workspaceId: job.workspaceId,
  });
  return true;
}

export { EnrichValidationError };
