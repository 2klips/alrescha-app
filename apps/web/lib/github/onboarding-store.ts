import type {
  GitHubOnboardingStore,
  GitHubRepositoryChoice,
} from "@alrescha/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "../supabase/admin";
import { recordSecurityAuditEvent } from "../security/audit";

export function createGitHubOnboardingStore(): GitHubOnboardingStore {
  const admin = createAdminClient();

  return {
    async savePendingInstallation({
      installation,
      permissionMode,
      workspaceId,
    }) {
      const existing = await admin
        .from("github_installations")
        .select("id, workspace_id")
        .eq("github_installation_id", installation.githubInstallationId)
        .maybeSingle();
      if (existing.error) {
        throw new Error(
          `Failed to inspect GitHub installation: ${existing.error.code}`,
        );
      }
      if (existing.data && existing.data.workspace_id !== workspaceId) {
        throw new Error(
          "GitHub installation is already linked to another workspace.",
        );
      }

      const saved = existing.data
        ? await admin
            .from("github_installations")
            .update({
              account_id: installation.accountId,
              account_login: installation.accountLogin,
              permission_mode: permissionMode,
              revoked_at: null,
              revocation_reason: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.data.id)
            .select("id")
            .single()
        : await admin
            .from("github_installations")
            .insert({
              account_id: installation.accountId,
              account_login: installation.accountLogin,
              github_installation_id: installation.githubInstallationId,
              permission_mode: permissionMode,
              workspace_id: workspaceId,
            })
            .select("id")
            .single();
      if (saved.error || !saved.data) {
        throw new Error(
          `Failed to save GitHub installation: ${saved.error?.code ?? "unknown"}`,
        );
      }

      const rows = installation.repositories.map((repository) => ({
        default_branch: repository.defaultBranch,
        full_name: repository.fullName,
        github_repository_id: repository.githubRepositoryId,
        installation_id: saved.data.id,
        observed_at: new Date().toISOString(),
        workspace_id: workspaceId,
      }));
      const repositories = await admin
        .from("github_available_repositories")
        .upsert(rows, {
          onConflict: "workspace_id,installation_id,github_repository_id",
        });
      if (repositories.error) {
        throw new Error(
          `Failed to save available repositories: ${repositories.error.code}`,
        );
      }

      await recordSecurityAuditEvent({
        action: "github_installation_connected",
        actorId: String(installation.accountId),
        actorKind: "github",
        metadata: {
          permissionMode,
          repositoryCount: installation.repositories.length,
        },
        targetId: saved.data.id,
        targetType: "github_installation",
        workspaceId,
      });

      return { installationId: saved.data.id };
    },
  };
}

/**
 * Where a selection's name and default branch came from: GitHub's current
 * record, read by id a moment ago, or the inventory the picker listed. The
 * inventory is written once, when the App is installed, and can be stale
 * (PR #10 follow-up: a repository renamed on GitHub kept its old label there,
 * and selecting it wrote that label over the canonical name), so it is
 * stored only where no row exists yet.
 */
export type RepositoryMetadataSource = "github" | "inventory";

export interface SelectedRepository {
  /**
   * Whether an existing row kept its own name and branch because the
   * selection could not vouch for new ones.
   */
  kept: boolean;
  repositoryId: string;
  /** What the row holds now. */
  stored: GitHubRepositoryChoice;
}

const SELECTION_CONFLICT = "workspace_id,github_repository_id";

/**
 * Persists a selection, keyed by the workspace and the GitHub repository id
 * — the identity a rename keeps — so a repeated selection updates the one
 * row instead of creating another.
 *
 * With GitHub's record in hand the row takes its name and branch. Without
 * it, an existing row keeps what it has (only `selected_at` and the
 * installation move) and a first connect stores the inventory's values,
 * which are all there is. A `23505` on the confirmed write is
 * `repositories_workspace_full_name_unique` — the current name is already
 * another row's in this workspace — and the row keeps its own name rather
 * than failing the connect.
 */
export async function saveSelectedRepository(input: {
  actorUserId?: string | undefined;
  /** Extra fields for the `repository_selected` audit row. */
  auditMetadata?: Readonly<Record<string, string | number | boolean>>;
  client?: SupabaseClient | undefined;
  installationId: string;
  recordAudit?: typeof recordSecurityAuditEvent | undefined;
  repository: GitHubRepositoryChoice;
  source: RepositoryMetadataSource;
  workspaceId: string;
}): Promise<SelectedRepository> {
  const admin = input.client ?? createAdminClient();
  const selectedAt = new Date().toISOString();
  const row = {
    default_branch: input.repository.defaultBranch,
    full_name: input.repository.fullName,
    github_repository_id: input.repository.githubRepositoryId,
    installation_id: input.installationId,
    selected_at: selectedAt,
    workspace_id: input.workspaceId,
  };

  let repositoryId: string | null = null;
  let kept = false;
  let stored = input.repository;

  if (input.source === "github") {
    const written = await admin
      .from("repositories")
      .upsert(row, { onConflict: SELECTION_CONFLICT })
      .select("id")
      .single();
    if (written.error && written.error.code !== "23505") {
      throw new Error(
        `Failed to select GitHub repository: ${written.error.code}`,
      );
    }
    if (written.data) repositoryId = String(written.data.id);
  }

  if (repositoryId === null) {
    const existing = await admin
      .from("repositories")
      .update({
        installation_id: input.installationId,
        selected_at: selectedAt,
      })
      .eq("workspace_id", input.workspaceId)
      .eq("github_repository_id", input.repository.githubRepositoryId)
      .select("id, default_branch, full_name")
      .maybeSingle();
    if (existing.error) {
      throw new Error(
        `Failed to select GitHub repository: ${existing.error.code}`,
      );
    }
    if (existing.data) {
      repositoryId = String(existing.data.id);
      kept = true;
      stored = {
        defaultBranch: String(existing.data.default_branch),
        fullName: String(existing.data.full_name),
        githubRepositoryId: input.repository.githubRepositoryId,
      };
    }
  }

  if (repositoryId === null) {
    const inserted = await admin
      .from("repositories")
      .upsert(row, { onConflict: SELECTION_CONFLICT })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      throw new Error(
        `Failed to select GitHub repository: ${inserted.error?.code ?? "unknown"}`,
      );
    }
    repositoryId = String(inserted.data.id);
  }

  if (input.actorUserId) {
    await (input.recordAudit ?? recordSecurityAuditEvent)({
      action: "repository_selected",
      actorId: input.actorUserId,
      actorKind: "user",
      metadata: { ...input.auditMetadata, kept, metadataSource: input.source },
      targetId: repositoryId,
      targetType: "repository",
      workspaceId: input.workspaceId,
    });
  }
  return { kept, repositoryId, stored };
}

/**
 * Brings the picker's inventory row up to GitHub's current record, so the
 * label it lists converges on the canonical name after one selection.
 */
export async function refreshAvailableRepository(input: {
  client?: SupabaseClient | undefined;
  installationId: string;
  repository: GitHubRepositoryChoice;
  workspaceId: string;
}): Promise<void> {
  const admin = input.client ?? createAdminClient();
  const refreshed = await admin
    .from("github_available_repositories")
    .update({
      default_branch: input.repository.defaultBranch,
      full_name: input.repository.fullName,
      observed_at: new Date().toISOString(),
    })
    .eq("workspace_id", input.workspaceId)
    .eq("installation_id", input.installationId)
    .eq("github_repository_id", input.repository.githubRepositoryId);
  if (refreshed.error) {
    throw new Error(
      `Failed to refresh available repository: ${refreshed.error.code}`,
    );
  }
}
