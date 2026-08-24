import type postgres from "postgres";

import type { FileSummaryInput, SynthesizedConcept } from "@arr/core";

import type { EnrichProvider } from "./ai-providers";
import type {
  EnrichJobStore,
  EnrichPendingFile,
  EnrichResultItem,
} from "./enrich-job";
import { PostgresByokKeyStore } from "./postgres-judgment-store";
import { EnrichProviderLoader } from "./provider-loader";

/**
 * Postgres store for the enrich job (Phase 3 Wave C todo 6). The pending
 * query is the same predicate `enqueue_enrich_job` uses in SQL; persistence
 * goes through `apply_artifact_summaries`, the single security-definer
 * write path for summary metadata.
 */
export class PostgresEnrichJobStore implements EnrichJobStore {
  private readonly providers: EnrichProviderLoader;

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
    this.providers = new EnrichProviderLoader({
      byokKeys: new PostgresByokKeyStore(sql),
      ...(input.fetch ? { fetch: input.fetch } : {}),
      masterKey: input.masterKey,
      platformKeys: input.platformKeys,
    });
  }

  async listPendingFiles(input: {
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<readonly EnrichPendingFile[]> {
    const rows = await this.sql<
      {
        last_seen_commit_sha: string;
        path: string;
        source_blob_sha: string;
        summary_blob_sha: string | null;
      }[]
    >`
      select path, source_blob_sha, last_seen_commit_sha,
             metadata->>'summaryBlobSha' as summary_blob_sha
      from public.artifacts
      where workspace_id = ${input.workspaceId}
        and repository_id = ${input.repositoryId}
        and source_blob_sha is not null
        and last_seen_commit_sha is not null
      order by path
    `;
    return rows.map((row) => ({
      lastSeenCommitSha: row.last_seen_commit_sha,
      path: row.path,
      sourceBlobSha: row.source_blob_sha,
      summaryBlobSha: row.summary_blob_sha,
    }));
  }

  async listSummarizedFiles(input: {
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<readonly FileSummaryInput[]> {
    const rows = await this.sql<
      { path: string; source_blob_sha: string; summary: string }[]
    >`
      select path, source_blob_sha, metadata->>'summary' as summary
      from public.artifacts
      where workspace_id = ${input.workspaceId}
        and repository_id = ${input.repositoryId}
        and (metadata->>'summaryBlobSha') = source_blob_sha
      order by path
    `;
    return rows.map((row) => ({
      blobSha: row.source_blob_sha,
      path: row.path,
      summary: row.summary,
    }));
  }

  async loadConceptDigest(input: {
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<string | null> {
    const rows = await this.sql<{ digest: string | null }[]>`
      select min(source_digest) as digest
      from public.concepts
      where workspace_id = ${input.workspaceId}
        and repository_id = ${input.repositoryId}
    `;
    return rows[0]?.digest ?? null;
  }

  loadProvider(input: {
    readonly billingMode: "byok" | "credits";
    readonly provider: "anthropic" | "openai";
    readonly workspaceId: string;
  }): Promise<EnrichProvider> {
    return this.providers.load(input);
  }

  async saveModuleSummary(input: {
    readonly memberDigest: string;
    readonly memberPaths: readonly string[];
    readonly model: string;
    readonly moduleKey: string;
    readonly name: string;
    readonly provider: string;
    readonly repositoryId: string;
    readonly summary: string;
    readonly workspaceId: string;
  }): Promise<void> {
    await this.sql`
      select public.apply_module_summary(
        ${input.workspaceId}, ${input.repositoryId}, ${input.moduleKey},
        ${input.name}, ${input.memberPaths as string[]},
        ${input.memberDigest}, ${input.summary}, ${input.model},
        ${input.provider}
      )
    `;
  }

  async saveConceptGraph(input: {
    readonly concepts: readonly SynthesizedConcept[];
    readonly digest: string;
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<void> {
    await this.sql`
      select public.apply_concept_graph(
        ${input.workspaceId}, ${input.repositoryId},
        ${this.sql.json(input.concepts as unknown as postgres.JSONValue)},
        ${input.digest}
      )
    `;
  }

  async saveResults(input: {
    readonly items: readonly EnrichResultItem[];
    readonly repositoryId: string;
    readonly workspaceId: string;
  }): Promise<void> {
    await this.sql`
      select public.apply_artifact_summaries(
        ${input.workspaceId}, ${input.repositoryId},
        ${this.sql.json(input.items as unknown as postgres.JSONValue)}
      )
    `;
  }
}
