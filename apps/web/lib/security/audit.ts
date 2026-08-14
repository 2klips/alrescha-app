import { createAdminClient } from "../supabase/admin";

export type SecurityAuditAction =
  | "github_installation_connected"
  | "github_installation_revoked"
  | "index_pr_proposed"
  | "repository_selected"
  | "scan_requested";

export async function recordSecurityAuditEvent(input: {
  action: SecurityAuditAction;
  actorId?: string;
  actorKind: "github" | "system" | "user";
  metadata?: Readonly<Record<string, string | number | boolean>>;
  sourceKey?: string;
  targetId?: string;
  targetType: string;
  workspaceId: string;
}): Promise<void> {
  const { error } = await createAdminClient().rpc(
    "record_security_audit_event",
    {
      target_action: input.action,
      target_actor_id: input.actorId ?? null,
      target_actor_kind: input.actorKind,
      target_id: input.targetId ?? null,
      target_metadata: input.metadata ?? {},
      target_source_key: input.sourceKey ?? null,
      target_type: input.targetType,
      target_workspace_id: input.workspaceId,
    },
  );
  if (error) throw new Error(`Failed to record security audit event: ${error.code}`);
}

export async function consumeWorkspaceSecurityLimit(input: {
  maximumRequests: number;
  operation: string;
  windowSeconds: number;
  workspaceId: string;
}): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc(
    "consume_workspace_security_limit",
    {
      maximum_requests: input.maximumRequests,
      target_operation: input.operation,
      target_workspace_id: input.workspaceId,
      window_seconds: input.windowSeconds,
    },
  );
  if (error) throw new Error(`Failed to enforce security rate limit: ${error.code}`);
  return data === true;
}
