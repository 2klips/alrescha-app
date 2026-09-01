import type postgres from "postgres";

import type {
  JudgmentKind,
  JudgmentOutput,
  JudgmentProvider,
  JudgmentTargetState,
} from "@alrescha/core";
import type { ByokKeyEnvelope } from "@alrescha/core/byok";

import type { JudgmentJobStore } from "./judgment-job";
import { JudgmentProviderLoader, type ByokKeyStore } from "./provider-loader";

interface StoredByokKeyRow {
  algorithm: "aes-256-gcm";
  auth_tag: string;
  ciphertext: string;
  iv: string;
  key_version: 1;
}

export class PostgresByokKeyStore implements ByokKeyStore {
  constructor(private readonly sql: postgres.Sql) {}

  async load(input: {
    readonly provider: "anthropic" | "openai";
    readonly workspaceId: string;
  }): Promise<ByokKeyEnvelope | null> {
    const rows = await this.sql<StoredByokKeyRow[]>`
      select algorithm, auth_tag, ciphertext, iv, key_version
      from public.workspace_ai_keys
      where workspace_id = ${input.workspaceId} and provider = ${input.provider}
    `;
    const row = rows[0];
    return row
      ? {
          algorithm: row.algorithm,
          authTag: row.auth_tag,
          ciphertext: row.ciphertext,
          iv: row.iv,
          version: row.key_version,
        }
      : null;
  }
}

export class PostgresJudgmentJobStore implements JudgmentJobStore {
  private readonly providers: JudgmentProviderLoader;

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
    this.providers = new JudgmentProviderLoader({
      byokKeys: new PostgresByokKeyStore(sql),
      ...(input.fetch ? { fetch: input.fetch } : {}),
      masterKey: input.masterKey,
      platformKeys: input.platformKeys,
    });
  }

  loadProvider(input: {
    readonly billingMode: "byok" | "credits";
    readonly provider: "anthropic" | "openai";
    readonly workspaceId: string;
  }): Promise<JudgmentProvider> {
    return this.providers.load(input);
  }

  async recordInvalidOutput(input: {
    readonly attemptCount: number;
    readonly code: "schema_invalid";
    readonly issues: readonly {
      readonly code: string;
      readonly path: string;
    }[];
    readonly jobId: string;
    readonly model: string;
    readonly payloadDigest: string;
    readonly provider: string;
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<void> {
    await this.sql`
      select public.record_invalid_judgment(
        ${input.jobId}, ${input.workspaceId}, ${input.repositoryId},
        ${input.provider}, ${input.model}, ${this.sql.json(input.issues)},
        ${input.payloadDigest}, ${input.attemptCount}
      )
    `;
  }

  async saveJudgment(input: {
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
  }): Promise<void> {
    await this.sql`
      select public.apply_successful_judgment(
        ${input.jobId}, ${input.workspaceId}, ${input.repositoryId},
        ${input.kind}, ${input.targetId}, ${input.provider},
        ${this.sql.json(input.payload)}, ${input.payloadDigest}, ${input.model},
        ${input.target.confidence}, ${input.target.severity}
      )
    `;
  }
}
