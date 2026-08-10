import { createAdminClient } from "../supabase/admin";
import type { RepositorySummary } from "./repository-route";

export async function findRepository(repositoryId: string): Promise<RepositorySummary | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("repositories")
    .select("id, workspace_id, full_name")
    .eq("id", repositoryId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return { fullName: data.full_name, id: data.id, workspaceId: data.workspace_id };
}

export async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("workspace_members")
    .select("workspace_id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  return !error && count === 1;
}

