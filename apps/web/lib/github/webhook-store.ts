import type { GitHubWebhookStore, PersistedGitHubWebhookEvent } from "@specproof/core";

import { createAdminClient } from "../supabase/admin";

export function createGitHubWebhookStore(): GitHubWebhookStore {
  const admin = createAdminClient();

  return {
    async insertEvent(event: PersistedGitHubWebhookEvent) {
      const { error } = await admin.from("github_webhook_deliveries").insert({
        action: event.action,
        commit_sha: event.commitSha,
        conclusion: event.conclusion,
        delivery_id: event.deliveryId,
        event: event.event,
        payload_digest: event.payloadDigest,
        repository_id: event.repositoryId,
        workspace_id: event.workspaceId,
      });

      if (!error) {
        return "inserted";
      }
      if (error.code === "23505") {
        return "duplicate";
      }
      throw new Error(`Failed to persist GitHub webhook: ${error.code}`);
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
