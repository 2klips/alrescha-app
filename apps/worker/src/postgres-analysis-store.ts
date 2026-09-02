/**
 * Postgres side of the `analyze` job (Phase 2C todo 5 follow-up).
 *
 * Reconciliation is one statement per direction so a re-analysis cannot leave
 * the table half-updated: findings that reproduce are upserted on their
 * fingerprint, and open findings whose fingerprint no longer appears are
 * resolved. Nothing here ever sees a file body.
 */

import type postgres from "postgres";

import type {
  AnalysisJobStore,
  FindingsDelta,
  PersistedFinding,
  PersistedRequirement,
  RequirementsDelta,
  StoredArtifact,
} from "./analysis-job";
import type { InTotoStatement } from "@alrescha/core";

interface ArtifactRow {
  readonly classification: StoredArtifact["classification"];
  readonly digest: string;
  readonly exported_symbols: StoredArtifact["exportedSymbols"] | null;
  readonly id: string;
  readonly path: string;
}

export class PostgresAnalysisStore implements AnalysisJobStore {
  constructor(private readonly sql: postgres.Sql) {}

  async repositoryFullName(input: {
    repositoryId: string;
    workspaceId: string;
  }): Promise<string> {
    const rows = await this.sql<{ full_name: string }[]>`
      select full_name from public.repositories
      where workspace_id = ${input.workspaceId} and id = ${input.repositoryId}
      limit 1
    `;
    const fullName = rows[0]?.full_name;
    if (!fullName) {
      throw new Error(`repository ${input.repositoryId} is not connected`);
    }
    return fullName;
  }

  async loadArtifacts(input: {
    repositoryId: string;
    workspaceId: string;
  }): Promise<readonly StoredArtifact[]> {
    const rows = await this.sql<ArtifactRow[]>`
      select id, path, classification, digest, exported_symbols
      from public.artifacts
      where workspace_id = ${input.workspaceId}
        and repository_id = ${input.repositoryId}
      order by path
    `;
    return rows.map((row) => ({
      classification: row.classification,
      digest: row.digest,
      exportedSymbols: row.exported_symbols ?? [],
      nodeId: row.id,
      path: row.path,
    }));
  }

  async reconcileFindings(input: {
    findings: readonly PersistedFinding[];
    repositoryId: string;
    workspaceId: string;
  }): Promise<FindingsDelta> {
    const fingerprints = input.findings.map(({ fingerprint }) => fingerprint);

    return this.sql.begin(async (tx) => {
      const before = await tx<{ fingerprint: string }[]>`
        select fingerprint from public.findings
        where workspace_id = ${input.workspaceId}
          and repository_id = ${input.repositoryId}
          and status = 'open'
          and fingerprint is not null
      `;
      const wasOpen = new Set(before.map(({ fingerprint }) => fingerprint));

      for (const finding of input.findings) {
        await tx`
          insert into public.findings (
            workspace_id, repository_id, title, source_node_id, kind, severity,
            status, provenance, confidence, evidence_grade, fingerprint
          ) values (
            ${input.workspaceId}, ${input.repositoryId}, ${finding.title},
            ${finding.sourceNodeId}, ${finding.kind}, ${finding.severity},
            'open', ${this.sql.json(finding.provenance as never)}::jsonb,
            ${finding.confidence}, ${finding.evidenceGrade},
            ${finding.fingerprint}
          )
          on conflict (workspace_id, repository_id, fingerprint)
            where fingerprint is not null
          do update set
            title = excluded.title,
            source_node_id = excluded.source_node_id,
            kind = excluded.kind,
            severity = excluded.severity,
            status = 'open',
            provenance = excluded.provenance,
            confidence = excluded.confidence,
            evidence_grade = excluded.evidence_grade,
            resolved_at = null
        `;
      }

      // A finding that no longer reproduces at this commit is resolved, not
      // deleted: the receipt for the earlier commit still refers to it.
      const resolved = await tx<{ fingerprint: string }[]>`
        update public.findings
        set status = 'resolved', resolved_at = now()
        where workspace_id = ${input.workspaceId}
          and repository_id = ${input.repositoryId}
          and status = 'open'
          and fingerprint is not null
          and not (fingerprint = any(${fingerprints}::text[]))
        returning fingerprint
      `;

      return {
        openTotal: fingerprints.length,
        opened: fingerprints.filter((fingerprint) => !wasOpen.has(fingerprint)),
        resolved: resolved.map(({ fingerprint }) => fingerprint),
      };
    });
  }

  async reconcileRequirements(input: {
    repositoryId: string;
    requirements: readonly PersistedRequirement[];
    workspaceId: string;
  }): Promise<RequirementsDelta> {
    const ids = input.requirements.map(({ id }) => id);

    return this.sql.begin(async (tx) => {
      for (const requirement of input.requirements) {
        // The node first: `requirements.id` is a foreign key onto it.
        await tx`
          insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
          values (${requirement.id}, ${input.workspaceId}, ${input.repositoryId},
                  'requirement', ${requirement.label})
          on conflict (id) do update
            set label = excluded.label, updated_at = now()
        `;
        await tx`
          insert into public.requirements (
            id, workspace_id, repository_id, source_artifact_id, statement,
            source_span, status
          ) values (
            ${requirement.id}, ${input.workspaceId}, ${input.repositoryId},
            ${requirement.sourceArtifactId}, ${requirement.statement},
            ${this.sql.json({
              ...requirement.sourceSpan,
              origin: requirement.origin,
            } as never)}::jsonb,
            'active'
          )
          on conflict (id) do update set
            source_artifact_id = excluded.source_artifact_id,
            statement = excluded.statement,
            source_span = excluded.source_span,
            status = 'active'
        `;
      }

      // A requirement the documents no longer state is superseded, not
      // deleted: judgments and edges that pointed at it keep their target.
      const superseded = await tx<{ id: string }[]>`
        update public.requirements
        set status = 'superseded'
        where workspace_id = ${input.workspaceId}
          and repository_id = ${input.repositoryId}
          and status = 'active'
          and not (id = any(${ids}::text[]))
        returning id
      `;

      return { active: ids.length, superseded: superseded.length };
    });
  }

  async latestReceiptDigest(input: {
    repositoryId: string;
    workspaceId: string;
  }): Promise<string | null> {
    const rows = await this.sql<{ digest: string | null }[]>`
      select digest from public.receipts
      where workspace_id = ${input.workspaceId}
        and repository_id = ${input.repositoryId}
        and digest is not null
      order by created_at desc
      limit 1
    `;
    return rows[0]?.digest ?? null;
  }

  async recordReceipt(input: {
    commitSha: string;
    delta: FindingsDelta;
    digest: string;
    repositoryId: string;
    runId: string;
    statement: InTotoStatement;
    workspaceId: string;
  }): Promise<string> {
    const summary = {
      findings: {
        open_total: input.delta.openTotal,
        opened: input.delta.opened,
        resolved: input.delta.resolved,
      },
      statement: input.statement,
    };
    const rows = await this.sql<{ id: string }[]>`
      insert into public.receipts (
        workspace_id, repository_id, commit_sha, run_id, status, summary, digest
      ) values (
        ${input.workspaceId}, ${input.repositoryId}, ${input.commitSha},
        ${input.runId}, 'generated', ${this.sql.json(summary as never)}::jsonb,
        ${input.digest}
      )
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error("receipt insert returned no id");
    return id;
  }
}
