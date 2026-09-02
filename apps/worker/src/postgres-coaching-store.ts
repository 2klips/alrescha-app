import type postgres from "postgres";

import type { PromptCoachingOutput } from "@alrescha/core";

import type { CoachingJobStore, CoachingProvider } from "./coaching-job";
import { PostgresByokKeyStore } from "./postgres-judgment-store";
import { CoachingProviderLoader } from "./provider-loader";

/**
 * Coaching persistence (Phase 2C todo 5 runner wiring). A valid rubric lands
 * on the prompt record it scored — `prompt_records.rubric` is the column the
 * team surfaces read — and a schema-invalid output lands in the append-only
 * `prompt_coaching_attempts` log, mirroring judgment's no-charge audit trail.
 */
export class PostgresCoachingJobStore implements CoachingJobStore {
  private readonly providers: CoachingProviderLoader;

  constructor(
    private readonly sql: postgres.Sql,
    input: {
      readonly fetch?: typeof globalThis.fetch;
      readonly masterKey: string;
      readonly platformKeys: Readonly<
        Partial<Record<"anthropic" | "openai", string>>
      >;
    },
  ) {
    this.providers = new CoachingProviderLoader({
      byokKeys: new PostgresByokKeyStore(sql),
      ...(input.fetch ? { fetch: input.fetch } : {}),
      masterKey: input.masterKey,
      platformKeys: input.platformKeys,
    });
  }

  async loadPromptText(input: {
    readonly promptRecordId: string;
    readonly workspaceId: string;
  }): Promise<string | null> {
    // Joined to a live, raw-sync consent: text captured under a consent the
    // member has since revoked is not ours to coach anymore.
    const rows = await this.sql<{ raw_text: string | null }[]>`
      select r.raw_text
      from public.prompt_records r
      join public.prompt_capture_consents c
        on c.workspace_id = r.workspace_id
       and c.user_id = r.user_id
       and c.revoked_at is null
       and c.raw_sync_enabled
      where r.id = ${input.promptRecordId}
        and r.workspace_id = ${input.workspaceId}
    `;
    return rows[0]?.raw_text ?? null;
  }

  loadProvider(input: {
    readonly billingMode: "byok" | "credits";
    readonly provider: "anthropic" | "openai";
    readonly workspaceId: string;
  }): Promise<CoachingProvider> {
    return this.providers.load(input);
  }

  async recordInvalidOutput(input: {
    readonly attemptCount: number;
    readonly code: "schema_invalid";
    readonly jobId: string;
    readonly message: string;
    readonly model: string;
    readonly payloadDigest: string;
    readonly provider: string;
    readonly workspaceId: string;
  }): Promise<void> {
    await this.sql`
      select public.record_invalid_prompt_coaching(
        ${input.jobId}, ${input.workspaceId}, ${input.provider},
        ${input.model}, ${input.message}, ${input.payloadDigest},
        ${input.attemptCount}
      )
    `;
  }

  async saveCoaching(input: {
    readonly jobId: string;
    readonly model: string;
    readonly payload: PromptCoachingOutput;
    readonly payloadDigest: string;
    readonly promptRecordId: string;
    readonly provider: string;
    readonly workspaceId: string;
  }): Promise<void> {
    await this.sql`
      select public.apply_prompt_coaching(
        ${input.jobId}, ${input.workspaceId}, ${input.promptRecordId},
        ${input.provider}, ${input.model}, ${this.sql.json(input.payload)},
        ${input.payloadDigest}
      )
    `;
  }
}
