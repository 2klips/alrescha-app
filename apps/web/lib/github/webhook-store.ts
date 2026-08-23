import type {
  GitHubWebhookStore,
  PersistedGitHubWebhookEvent,
} from "@arr/core";

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
      if (data === false) {
        return "duplicate";
      }

      // Co-change counts (Wave B todo 4) — only for freshly inserted push
      // deliveries, so a replayed delivery cannot double-count a pair.
      if (event.event === "push" && event.commitFiles.length > 0) {
        const coChanges = await admin.rpc("record_push_co_changes", {
          commits: event.commitFiles,
          target_repository_id: event.repositoryId,
          target_workspace_id: event.workspaceId,
        });
        if (coChanges.error) {
          throw new Error(
            `Failed to record co-changes: ${coChanges.error.code}`,
          );
        }
      }
      return "inserted";
    },

    async resolveRepository({
      installationId,
      repositoryFullName,
      repositoryGitHubId,
    }) {
      const installation = await admin
        .from("github_installations")
        .select("id, revoked_at, workspace_id")
        .eq("github_installation_id", installationId)
        .maybeSingle();

      if (
        installation.error ||
        !installation.data ||
        installation.data.revoked_at
      ) {
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

      return {
        id: repository.data.id,
        workspaceId: repository.data.workspace_id,
      };
    },

    async revokeInstallation({ deliveryId, githubInstallationId, reason }) {
      const { data, error } = await admin.rpc("revoke_github_installation", {
        target_delivery_id: deliveryId,
        target_github_installation_id: githubInstallationId,
        target_reason: reason,
      });
      if (error)
        throw new Error(`Failed to revoke GitHub installation: ${error.code}`);
      if (data !== "duplicate" && data !== "revoked" && data !== "unknown") {
        throw new Error(
          "GitHub installation revocation returned an invalid outcome.",
        );
      }
      return data;
    },
  };
}
