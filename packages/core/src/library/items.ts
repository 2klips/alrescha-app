import { createHash } from "node:crypto";

export type LibraryItemType = "instruction" | "rules" | "skill";

export interface LibraryItemSource {
  readonly commitSha: string;
  readonly path: string;
  readonly repository: string;
}

export interface CreateLibrarySnapshotInput {
  readonly content: string;
  readonly name: string;
  readonly source: LibraryItemSource;
  readonly tags: readonly string[];
  readonly type: LibraryItemType;
}

export interface LibrarySnapshot extends CreateLibrarySnapshotInput {
  readonly digest: string;
}

export interface LibraryItem extends LibrarySnapshot {
  readonly createdAt: string;
  readonly id: string;
}

export interface LibraryFilter {
  readonly query: string;
  readonly tag: string | null;
}

const ITEM_TYPES: readonly LibraryItemType[] = [
  "instruction",
  "rules",
  "skill",
];

export function createLibrarySnapshot(
  input: CreateLibrarySnapshotInput,
): LibrarySnapshot {
  const name = input.name.trim();
  const path = input.source.path.trim().replaceAll("\\", "/");
  const repository = input.source.repository.trim();
  if (!name) throw new TypeError("Library item name is required.");
  if (!input.content) throw new TypeError("Library item content is required.");
  if (!ITEM_TYPES.includes(input.type))
    throw new TypeError("Library item type is invalid.");
  if (!/^[^/]+\/[^/]+$/.test(repository)) {
    throw new TypeError("Library source repository must be owner/repository.");
  }
  if (!path || path.startsWith("/") || path.split("/").includes("..")) {
    throw new TypeError("Library source path must be repository-relative.");
  }
  if (!/^[0-9a-f]{40}$/.test(input.source.commitSha)) {
    throw new TypeError("Library source commit must be a 40-character SHA.");
  }
  const tags = [
    ...new Set(
      input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    ),
  ].sort();
  if (tags.some((tag) => tag.length > 40) || tags.length > 20) {
    throw new TypeError(
      "Library tags must contain at most 20 values of 40 characters.",
    );
  }

  return Object.freeze({
    content: input.content,
    digest: createHash("sha256").update(input.content).digest("hex"),
    name,
    source: Object.freeze({
      commitSha: input.source.commitSha,
      path,
      repository,
    }),
    tags: Object.freeze(tags),
    type: input.type,
  });
}

export function filterLibraryItems(
  items: readonly LibraryItem[],
  filter: LibraryFilter,
): LibraryItem[] {
  const query = filter.query.trim().toLowerCase();
  const tag = filter.tag?.trim().toLowerCase() || null;
  return items
    .filter((item) => {
      if (tag && !item.tags.includes(tag)) return false;
      if (!query) return true;
      return [
        item.name,
        item.type,
        item.content,
        item.source.repository,
        item.source.path,
        item.source.commitSha,
        ...item.tags,
      ]
        .join("\n")
        .toLowerCase()
        .includes(query);
    })
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        left.id.localeCompare(right.id),
    );
}
