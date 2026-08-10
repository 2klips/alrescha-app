import type { GitHubWebhookStore, PersistedGitHubWebhookEvent } from "@specproof/core";

import { createAdminClient } from "../supabase/admin";

export function createGitHubWebhookStore(): GitHubWebhookStore {
  const admin = createAdminClient();

  return {
    async insertEvent(event: PersistedGitHubWebhookEvent) {
      const { data, error } = await admin.rpc("ingest_github_webhook_event", {
        target_action: event.action,
        target_commit_sha: event.commitSha,
        target_conclusion: event.conclusion,
        target_delivery_id: event.deliveryId,
        target_event: event.event,
        target_payload_digest: event.payloadDigest,
        target_repository_id: event.repositoryId,
        target_workspace_id: event.workspaceId,
      });

      if (error) {
        throw new Error(`Failed to persist GitHub webhook: ${error.code}`);
      }
      return data === false ? "duplicate" : "inserted";
    },

    async resolveRepository({ installationId, repositoryFullName, repositoryGitHubId }) {
      const installation = await admin
        .from("github_installations")
        .select("id, workspace_id")
        .eq("github_installation_id", installationId)
        .maybeSingle();

      if (installation.error || !installation.data) {
        return null;
      }

      const repository = await admin
        .from("repositories")
        .select("id, workspace_id")
        .eq("workspace_id", installation.data.workspace_id)
        .eq("installation_id", installation.data.id)
        .eq("github_repository_id", repositoryGitHubId)
        .eq("full_name", repositoryFullName)
        .maybeSingle();

      if (repository.error || !repository.data) {
        return null;
      }

      return { id: repository.data.id, workspaceId: repository.data.workspace_id };
    },
  };
}
