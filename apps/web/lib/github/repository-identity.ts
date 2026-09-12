import type { GitHubRepositoryChoice } from "@alrescha/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { RepositoryRecord } from "./api";
import {
  refreshAvailableRepository,
  saveSelectedRepository,
  type RepositoryMetadataSource,
} from "./onboarding-store";
import type { recordSecurityAuditEvent } from "../security/audit";

/**
 * What a connect stored for the repository, and whether GitHub vouched for
 * it (PR #10 follow-up).
 *
 * A GitHub repository is identified by its numeric id; its name and default
 * branch are metadata that can change. The picker's inventory is a snapshot
 * of that metadata from the day the App was installed, and it is what every
 * selection used to copy into `repositories` — so a repository renamed on
 * GitHub was renamed *back* on the home and the header each time it was
 * chosen. The connect now reads GitHub's current record by id while it
 * holds a token scoped to that id, stores that, and refreshes the inventory
 * row. When the read fails, or names a different id, nothing is overwritten
 * and the outcome says so.
 */
export type ConnectedRepositoryMetadata =
  | {
      /** GitHub's current record was read by id and stored. */
      confirmed: true;
      /** The inventory the picker listed differed from GitHub's record. */
      renamed: boolean;
      repository: GitHubRepositoryChoice;
    }
  | {
      confirmed: false;
      /**
       * Why what stands was left as it was. A status, a shape complaint or a
       * local reason — never a response body or a token.
       */
      reason: string;
      /** What the row holds. */
      repository: GitHubRepositoryChoice;
    };

export function repositoryMetadataDiffers(
  left: GitHubRepositoryChoice,
  right: GitHubRepositoryChoice,
): boolean {
  return (
    left.fullName !== right.fullName ||
    left.defaultBranch !== right.defaultBranch
  );
}

const NAME_TAKEN =
  "GitHub's current name is already another repository's in this workspace";

/**
 * Stores a selection under GitHub's current record when it can be read by
 * id, and under what already stands when it cannot. The inventory row is
 * refreshed first, so the picker converges even when the row keeps its name.
 */
export async function reconcileConnectedRepository(input: {
  readonly actorUserId?: string | undefined;
  /** The inventory row the picker listed. */
  readonly cached: GitHubRepositoryChoice;
  readonly client?: SupabaseClient | undefined;
  readonly installationId: string;
  readonly readRepository: (input: {
    githubRepositoryId: number;
    token: string;
  }) => Promise<RepositoryRecord>;
  readonly recordAudit?: typeof recordSecurityAuditEvent | undefined;
  /** The repository-scoped installation token the connect minted, if any. */
  readonly token: string | null;
  readonly workspaceId: string;
}): Promise<{ metadata: ConnectedRepositoryMetadata; repositoryId: string }> {
  const record: RepositoryRecord =
    input.token === null
      ? { error: "no installation token was minted for the repository" }
      : await input.readRepository({
          githubRepositoryId: input.cached.githubRepositoryId,
          token: input.token,
        });
  const current = "repository" in record ? record.repository : null;
  const renamed =
    current !== null && repositoryMetadataDiffers(input.cached, current);

  if (current !== null && renamed) {
    await refreshAvailableRepository({
      client: input.client,
      installationId: input.installationId,
      repository: current,
      workspaceId: input.workspaceId,
    });
  }

  const source: RepositoryMetadataSource =
    current === null ? "inventory" : "github";
  const saved = await saveSelectedRepository({
    actorUserId: input.actorUserId,
    auditMetadata: { renamed },
    client: input.client,
    installationId: input.installationId,
    recordAudit: input.recordAudit,
    repository: current ?? input.cached,
    source,
    workspaceId: input.workspaceId,
  });

  if (current !== null && !saved.kept) {
    return {
      metadata: { confirmed: true, renamed, repository: saved.stored },
      repositoryId: saved.repositoryId,
    };
  }
  return {
    metadata: {
      confirmed: false,
      reason: "error" in record ? record.error : NAME_TAKEN,
      repository: saved.stored,
    },
    repositoryId: saved.repositoryId,
  };
}
