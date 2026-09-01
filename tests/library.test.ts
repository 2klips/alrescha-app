import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createLibrarySnapshot,
  filterLibraryItems,
} from "../packages/core/src/index";

describe("personal library", () => {
  it("captures a sourced immutable skill snapshot with a deterministic digest", async () => {
    const content = await readFile(
      resolve(
        import.meta.dirname,
        "../fixtures/drifted-demo/.agents/skills/review-auth/SKILL.md",
      ),
      "utf8",
    );

    const snapshot = createLibrarySnapshot({
      content,
      name: "Review auth",
      source: {
        commitSha: "1".repeat(40),
        path: ".agents/skills/review-auth/SKILL.md",
        repository: "alrescha/drifted-demo",
      },
      tags: ["Auth", "review", "auth"],
      type: "skill",
    });

    expect(snapshot).toEqual({
      content,
      digest: createHash("sha256").update(content).digest("hex"),
      name: "Review auth",
      source: {
        commitSha: "1".repeat(40),
        path: ".agents/skills/review-auth/SKILL.md",
        repository: "alrescha/drifted-demo",
      },
      tags: ["auth", "review"],
      type: "skill",
    });
    expect(snapshot).not.toHaveProperty("import");
    expect(snapshot).not.toHaveProperty("pullRequest");
  });

  it("searches workspace-wide snapshots and applies an exact normalized tag filter", () => {
    const items = [
      {
        ...createLibrarySnapshot({
          content: "Check OAuth evidence.",
          name: "Review auth",
          source: {
            commitSha: "1".repeat(40),
            path: ".agents/skills/review-auth/SKILL.md",
            repository: "alrescha/api",
          },
          tags: ["auth", "review"],
          type: "skill",
        }),
        createdAt: "2026-08-13T10:00:00Z",
        id: "item-auth",
      },
      {
        ...createLibrarySnapshot({
          content: "Keep database changes tenant-scoped.",
          name: "Database rules",
          source: {
            commitSha: "2".repeat(40),
            path: ".cursor/rules/database.mdc",
            repository: "alrescha/web",
          },
          tags: ["database", "review"],
          type: "rules",
        }),
        createdAt: "2026-08-13T11:00:00Z",
        id: "item-db",
      },
    ];

    expect(
      filterLibraryItems(items, { query: " oauth ", tag: null }).map(
        ({ id }) => id,
      ),
    ).toEqual(["item-auth"]);
    expect(
      filterLibraryItems(items, { query: "", tag: "REVIEW" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["item-db", "item-auth"]);
    expect(
      filterLibraryItems(items, { query: "database", tag: "auth" }),
    ).toEqual([]);
  });
});
