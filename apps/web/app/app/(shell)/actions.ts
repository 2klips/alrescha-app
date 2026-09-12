"use server";

import { LINK_SCHEMA_VERSION } from "@alrescha/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../lib/auth/current-user";
import {
  consumeWorkspaceSecurityLimit,
  recordSecurityAuditEvent,
} from "../../../lib/security/audit";
import { createAdminClient } from "../../../lib/supabase/admin";
import { createClient } from "../../../lib/supabase/server";

/**
 * "다시 스캔" (Phase 4 Wave C todo 16, OQ-029 ⑴).
 *
 * The same queue function the MCP `request_rescan` tool calls, behind the
 * home screen's button: a scan at the head the repository was last seen at,
 * followed by its analysis, free, idempotent on (head, mode). The queue
 * decides the mode — an incremental request whose stored links are from an
 * older resolver comes back as a full relink, with the reason — and refuses
 * a locally pushed repository before a job exists (todo 17). The outcome
 * rides the redirect so the page can say which of those happened.
 */
export type RescanOutcome =
  | "scheduled"
  /** The first scan, which had failed for good, was queued again (202609120004). */
  | "first-scan"
  | "never-scanned"
  | "local"
  | "rate-limited"
  | "error";

interface RescanQueueResult {
  readonly jobId: string | null;
  readonly mode: "full" | "incremental" | null;
  readonly reason: string;
  readonly scheduled: boolean;
}

function outcomeOf(result: RescanQueueResult): RescanOutcome {
  if (result.scheduled) {
    return result.reason === "first-scan-retry" ? "first-scan" : "scheduled";
  }
  if (result.reason === "never-scanned") return "never-scanned";
  return "local";
}

function home(outcome: RescanOutcome, mode?: string | null): string {
  const url = new URLSearchParams({ rescan: outcome });
  if (mode) url.set("mode", mode);
  return `/app?${url.toString()}`;
}

export async function requestRepositoryRescan(
  formData: FormData,
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const repositoryId = String(formData.get("repositoryId") ?? "");
  const requestedMode = formData.get("mode") === "full" ? "full" : null;

  const client = await createClient();
  const workspace = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspace.error || !workspace.data) {
    throw new Error("Personal workspace is unavailable.");
  }
  const workspaceId = String(workspace.data.id);

  // Through RLS, so a repository id from another tenant is simply not found.
  const repository = await client
    .from("repositories")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", repositoryId)
    .maybeSingle();
  if (repository.error || !repository.data) {
    redirect(home("error"));
  }

  const withinLimit = await consumeWorkspaceSecurityLimit({
    maximumRequests: 10,
    operation: "repository_rescan",
    windowSeconds: 60,
    workspaceId,
  });
  if (!withinLimit) {
    redirect(home("rate-limited"));
  }

  const queued = await createAdminClient().rpc("enqueue_repository_rescan", {
    expected_link_schema_version: LINK_SCHEMA_VERSION,
    requested_mode: requestedMode,
    target_repository_id: repositoryId,
    target_workspace_id: workspaceId,
  });
  if (queued.error || typeof queued.data !== "object" || !queued.data) {
    redirect(home("error"));
  }
  const result = queued.data as RescanQueueResult;
  const outcome = outcomeOf(result);

  await recordSecurityAuditEvent({
    action: "scan_requested",
    actorId: userId,
    actorKind: "user",
    metadata: {
      mode: result.mode ?? "",
      outcome,
      scheduled: result.scheduled,
    },
    targetId: repositoryId,
    targetType: "repository",
    workspaceId,
  });

  revalidatePath("/app");
  redirect(home(outcome, result.mode));
}
