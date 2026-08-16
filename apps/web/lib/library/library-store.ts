import type { LibraryItem, LibrarySnapshot } from "@arr/core";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function requiredString(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Malformed library row: ${key}`);
  }
  return value;
}

function tags(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new Error("Malformed library row: tags");
  }
  return value as string[];
}

function isLibraryItemType(value: string): value is LibraryItem["type"] {
  return value === "instruction" || value === "rules" || value === "skill";
}

function itemFromRow(row: Row): LibraryItem {
  const type = requiredString(row, "item_type");
  if (!isLibraryItemType(type)) {
    throw new Error("Malformed library row: item_type");
  }
  return {
    content: requiredString(row, "content_snapshot"),
    createdAt: requiredString(row, "created_at"),
    digest: requiredString(row, "digest"),
    id: requiredString(row, "id"),
    name: requiredString(row, "name"),
    source: {
      commitSha: requiredString(row, "source_commit_sha"),
      path: requiredString(row, "source_path"),
      repository: requiredString(row, "source_repository"),
    },
    tags: tags(row.tags),
    type,
  };
}

export async function saveLibrarySnapshot(
  client: SupabaseClient,
  workspaceId: string,
  snapshot: LibrarySnapshot,
): Promise<{ id: string; outcome: "duplicate" | "saved" }> {
  const result = await client.rpc("save_library_item", {
    p_content_snapshot: snapshot.content,
    p_digest: snapshot.digest,
    p_item_type: snapshot.type,
    p_name: snapshot.name,
    p_source_commit_sha: snapshot.source.commitSha,
    p_source_path: snapshot.source.path,
    p_source_repository: snapshot.source.repository,
    p_tags: [...snapshot.tags],
    p_workspace_id: workspaceId,
  });
  if (result.error) {
    throw new Error(`Library snapshot save failed: ${result.error.message}`);
  }
  const row = rows(result.data)[0];
  if (!row || typeof row.created !== "boolean") {
    throw new Error("Library snapshot save failed: empty result");
  }
  return {
    id: requiredString(row, "id"),
    outcome: row.created ? "saved" : "duplicate",
  };
}

export async function listLibraryItems(
  client: SupabaseClient,
  workspaceId: string,
): Promise<LibraryItem[]> {
  const result = await client
    .from("library_items")
    .select(
      "id,name,item_type,source_repository,source_path,source_commit_sha,content_snapshot,digest,tags,created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (result.error) {
    throw new Error(`Library list failed: ${result.error.message}`);
  }
  return rows(result.data).map(itemFromRow);
}

export async function deleteLibraryItem(
  client: SupabaseClient,
  workspaceId: string,
  itemId: string,
): Promise<void> {
  const result = await client
    .from("library_items")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", itemId)
    .select("id")
    .maybeSingle();
  if (result.error) {
    throw new Error(`Library delete failed: ${result.error.message}`);
  }
  if (!result.data) throw new Error("Library snapshot not found.");
}
