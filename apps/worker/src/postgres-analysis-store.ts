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
  PersistedImplementsEdge,
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

  /**
   * Paths the scan's `tests` relation reaches (Phase 4 Wave A todo 0). Read
   * from the graph rather than recomputed, so the rules see exactly the
   * coverage the map shows — and the same set on both ingest paths.
   */
  async loadTestedPaths(input: {
    repositoryId: string;
    workspaceId: string;
  }): Promise<readonly string[]> {
    const rows = await this.sql<{ path: string }[]>`
      select distinct a.path
      from public.edges e
      join public.artifacts a
        on a.workspace_id = e.workspace_id
       and a.repository_id = e.repository_id
       and a.id = e.target_node_id
      where e.workspace_id = ${input.workspaceId}
        and e.repository_id = ${input.repositoryId}
        and e.relation = 'tests'
    `;
    return rows.map(({ path }) => path);
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
            workspace_id, repository_id, title, source_node_id, target_node_id,
            kind, severity, status, provenance, confidence, evidence_grade,
            fingerprint
          ) values (
            ${input.workspaceId}, ${input.repositoryId}, ${finding.title},
            ${finding.sourceNodeId}, ${finding.targetNodeId}, ${finding.kind},
            ${finding.severity},
            'open', ${this.sql.json(finding.provenance as never)}::jsonb,
            ${finding.confidence}, ${finding.evidenceGrade},
            ${finding.fingerprint}
          )
          on conflict (workspace_id, repository_id, fingerprint)
            where fingerprint is not null
          do update set
            title = excluded.title,
            source_node_id = excluded.source_node_id,
            target_node_id = excluded.target_node_id,
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
    implementsEdges: readonly PersistedImplementsEdge[];
    repositoryId: string;
    requirements: readonly PersistedRequirement[];
    workspaceId: string;
  }): Promise<RequirementsDelta> {
    const ids = input.requirements.map(({ id }) => id);
    const edgeKeys = input.implementsEdges.map(
      ({ requirementId, targetNodeId }) => `${requirementId}|${targetNodeId}`,
    );

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

      // The `implements` edges those requirements carry. Written after the
      // nodes above because both endpoints are foreign keys onto them.
      for (const edge of input.implementsEdges) {
        await tx`
          insert into public.edges (
            workspace_id, repository_id, source_node_id, target_node_id,
            relation, family, provenance, confidence
          ) values (
            ${input.workspaceId}, ${input.repositoryId}, ${edge.requirementId},
            ${edge.targetNodeId}, 'implements', 'evidence',
            ${this.sql.json(edge.provenance as never)}::jsonb,
            ${edge.confidence}
          )
          on conflict (workspace_id, repository_id, source_node_id,
                       target_node_id, relation)
          do update set
            provenance = excluded.provenance,
            confidence = excluded.confidence
        `;
      }

      // A link this analysis no longer derives is removed rather than left
      // behind: the edge asserts a present-tense relationship, and a stale
      // one would keep counting toward requirement coverage. Only edges out
      // of this repository's requirement nodes are in scope — the concept
      // layer writes `implements` from concept nodes and owns those.
      await tx`
        delete from public.edges e
        where e.workspace_id = ${input.workspaceId}
          and e.repository_id = ${input.repositoryId}
          and e.relation = 'implements'
          and exists (
            select 1 from public.requirements r
            where r.workspace_id = e.workspace_id
              and r.repository_id = e.repository_id
              and r.id = e.source_node_id
          )
          and not (
            e.source_node_id || '|' || e.target_node_id
              = any(${edgeKeys}::text[])
          )
      `;

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

      // When a scan removes a spec, its artifact node cascades into the
      // requirement rows but nothing cascades into the requirement nodes.
      await tx`
        delete from public.graph_nodes n
        where n.workspace_id = ${input.workspaceId}
          and n.repository_id = ${input.repositoryId}
          and n.kind = 'requirement'
          and not exists (
            select 1 from public.requirements r where r.id = n.id
          )
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
