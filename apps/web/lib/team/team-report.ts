import type { SupabaseClient } from "@supabase/supabase-js";

import {
  VIBE_METRICS,
  buildVibeIndex,
  vibeGateResultsSchema,
  type VibeGateResults,
  type VibeIndex,
} from "@arr/core";

/**
 * `/team` from stored rows (Phase 2C todo 3).
 *
 * ADR-011 is enforced in the database, but a loader can still leak by
 * *shape* — so the row types below simply have no field for another
 * member's consent or for raw prompt text. `capture` carries the viewer's
 * own consent and nothing else, and the member list has no consent column at
 * all: what cannot be represented cannot be rendered.
 */

export interface TeamMemberRow {
  readonly role: string;
  readonly status: string;
  readonly user_id: string;
}

export interface TeamMember {
  readonly name: string;
  readonly role: "admin" | "member" | "owner" | "viewer";
  readonly status: "active" | "invited" | "revoked";
  readonly userId: string;
}

/** Metadata only. There is deliberately no `rawText` field. */
export interface TeamPromptRow {
  readonly occurred_at: string;
  readonly rubric: unknown;
  readonly token_count: number;
  readonly user_id: string;
}

export interface TeamCommitRow {
  readonly author_user_id: string;
  readonly occurred_at: string;
  readonly sha: string;
}

export interface TeamReceiptRow {
  readonly commit_sha: string;
  readonly inferred_count: number;
  readonly verified_count: number;
}

export interface TeamResolvedFindingRow {
  readonly id: string;
  readonly resolved_commit_sha: string;
}

export interface TeamProvenRequirementRow {
  readonly id: string;
  readonly proven_commit_sha: string;
}

export interface WorkspaceTeamRows {
  readonly captureEnabled: boolean;
  readonly commits: readonly TeamCommitRow[];
  readonly members: readonly TeamMemberRow[];
  readonly promptRecords: readonly TeamPromptRow[];
  readonly provenRequirements: readonly TeamProvenRequirementRow[];
  readonly receipts: readonly TeamReceiptRow[];
  readonly resolvedFindings: readonly TeamResolvedFindingRow[];
  /** The viewer's own consent — never anyone else's (ADR-011-4). */
  readonly viewerConsent: {
    readonly consented: boolean;
    readonly rawSyncEnabled: boolean;
  };
}

export interface WorkspaceTeamReport {
  readonly capture: {
    readonly consented: boolean;
    readonly rawSyncEnabled: boolean;
    readonly workspaceEnabled: boolean;
  };
  readonly gate: VibeGateResults;
  readonly members: readonly TeamMember[];
  readonly vibe: VibeIndex;
}

const ROLES = ["admin", "member", "owner", "viewer"] as const;
const STATUSES = ["active", "invited", "revoked"] as const;

function isOneOf<T extends string>(
  allowed: readonly T[],
  value: string,
): value is T {
  return (allowed as readonly string[]).includes(value);
}

function rubricOf(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

/** Every metric pending until the injection experiment publishes a verdict. */
export function pendingGate(): VibeGateResults {
  return vibeGateResultsSchema.parse({
    experiment: "vibe-harness-injection-v0",
    generatedBy: "scripts/vibe-injection-experiment.ts",
    verdicts: VIBE_METRICS.map((metric) => ({
      detail: "실모델 실행 대기(크레딧).",
      metric,
      status: "pending" as const,
    })),
  });
}

export function buildWorkspaceTeamReport(
  rows: WorkspaceTeamRows,
  gate: VibeGateResults = pendingGate(),
): WorkspaceTeamReport {
  const members: TeamMember[] = rows.members.flatMap((row) =>
    isOneOf(ROLES, row.role) && isOneOf(STATUSES, row.status)
      ? [
          {
            // No display name is stored yet; showing the id is honest,
            // and a name column can fill this in without touching callers.
            name: row.user_id,
            role: row.role,
            status: row.status,
            userId: row.user_id,
          },
        ]
      : [],
  );

  const vibe = buildVibeIndex(
    {
      commits: rows.commits.map((row) => ({
        authorUserId: row.author_user_id,
        occurredAt: row.occurred_at,
        sha: row.sha,
      })),
      // The VIBE input is a strict object: rubric and author only. Nothing
      // else about a prompt — text, timing, size — can reach the index.
      promptRecords: rows.promptRecords.map((row) => ({
        rubric: rubricOf(row.rubric),
        userId: row.user_id,
      })),
      provenRequirements: rows.provenRequirements.map((row) => ({
        id: row.id,
        provenCommitSha: row.proven_commit_sha,
      })),
      receipts: rows.receipts.map((row) => ({
        commitSha: row.commit_sha,
        inferredCount: row.inferred_count,
        verifiedCount: row.verified_count,
      })),
      resolvedFindings: rows.resolvedFindings.map((row) => ({
        id: row.id,
        resolvedCommitSha: row.resolved_commit_sha,
      })),
    },
    gate,
    // ADR-011-7: the cross-person comparison stays off until a workspace
    // policy turns it on. No policy row exists yet, so it is absent.
    { comparisonTableEnabled: false },
  );

  return {
    capture: {
      consented: rows.viewerConsent.consented,
      rawSyncEnabled: rows.viewerConsent.rawSyncEnabled,
      workspaceEnabled: rows.captureEnabled,
    },
    gate,
    members,
    vibe,
  };
}

export async function loadWorkspaceTeamReport(
  client: SupabaseClient,
  userId: string,
): Promise<{ report: WorkspaceTeamReport; workspaceId: string }> {
  const workspaceResult = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspaceResult.error || !workspaceResult.data) {
    throw new Error("Personal workspace is unavailable.");
  }
  const workspaceId = String(workspaceResult.data.id);

  const [members, settings, consent, prompts] = await Promise.all([
    client
      .from("workspace_members")
      .select("user_id,role,status")
      .eq("workspace_id", workspaceId),
    client
      .from("prompt_capture_settings")
      .select("enabled")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    // RLS already restricts this table to the subject; the explicit filter
    // keeps that true even if a policy is ever loosened by mistake.
    client
      .from("prompt_capture_consents")
      .select("raw_sync_enabled,revoked_at")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("prompt_records")
      .select("user_id,occurred_at,token_count,rubric")
      .eq("workspace_id", workspaceId),
  ]);
  for (const result of [members, settings, consent, prompts]) {
    if (result.error) throw new Error(result.error.message);
  }

  const consentRow = consent.data as {
    raw_sync_enabled?: boolean;
    revoked_at?: string | null;
  } | null;

  return {
    report: buildWorkspaceTeamReport({
      captureEnabled: Boolean(
        (settings.data as { enabled?: boolean } | null)?.enabled,
      ),
      // Contribution inputs need the evidence joins that Wave 2's live pilot
      // will populate; until a run has produced them the rows are empty and
      // the widgets say so rather than guessing.
      commits: [],
      members: (members.data ?? []) as TeamMemberRow[],
      promptRecords: (prompts.data ?? []) as TeamPromptRow[],
      provenRequirements: [],
      receipts: [],
      resolvedFindings: [],
      viewerConsent: {
        consented: Boolean(consentRow) && !consentRow?.revoked_at,
        rawSyncEnabled: Boolean(consentRow?.raw_sync_enabled),
      },
    }),
    workspaceId,
  };
}
