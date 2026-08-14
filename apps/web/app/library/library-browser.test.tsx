import { createLibrarySnapshot, type LibraryItem } from "@specproof/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HarnessAssetCard } from "../harness/harness-asset-card";
import { LibraryBrowser } from "./library-browser";

const AUTH_ITEM: LibraryItem = {
  ...createLibrarySnapshot({
    content: "Review OAuth callbacks and session ownership.",
    name: "Review auth",
    source: {
      commitSha: "1".repeat(40),
      path: ".agents/skills/review-auth/SKILL.md",
      repository: "specproof/drifted-demo",
    },
    tags: ["auth", "review"],
    type: "skill",
  }),
  createdAt: "2026-08-14T09:00:00.000Z",
  id: "library-auth",
};

const DATABASE_ITEM: LibraryItem = {
  ...createLibrarySnapshot({
    content: "Keep tenant queries workspace-scoped.",
    name: "Database rules",
    source: {
      commitSha: "2".repeat(40),
      path: ".cursor/rules/database.mdc",
      repository: "specproof/api",
    },
    tags: ["database"],
    type: "rules",
  }),
  createdAt: "2026-08-14T08:00:00.000Z",
  id: "library-database",
};

describe("personal library UI", () => {
  it("filters by search and tag while showing immutable source provenance", () => {
    const html = renderToStaticMarkup(
      createElement(LibraryBrowser, {
        deleteAction: "/delete-library-item",
        items: [AUTH_ITEM, DATABASE_ITEM],
        query: "oauth",
        selectedTag: "auth",
      }),
    );

    expect(html).toContain('value="oauth"');
    expect(html).toContain("Review auth");
    expect(html).not.toContain("Database rules");
    expect(html).toContain("specproof/drifted-demo");
    expect(html).toContain(".agents/skills/review-auth/SKILL.md");
    expect(html).toContain("1".repeat(40));
    expect(html).toContain("sha256:");
    expect(html).toContain("Delete snapshot");
  });

  it("offers only save, browse, filter, provenance, and delete scope", () => {
    const libraryHtml = renderToStaticMarkup(
      createElement(LibraryBrowser, {
        deleteAction: "/delete-library-item",
        items: [AUTH_ITEM],
        query: "",
        selectedTag: null,
      }),
    );
    const harnessHtml = renderToStaticMarkup(
      createElement(HarnessAssetCard, {
        asset: AUTH_ITEM,
      }),
    );
    const combined = `${libraryHtml}${harnessHtml}`;

    expect(harnessHtml).toContain("Save to library");
    expect(harnessHtml).toContain("specproof/drifted-demo");
    expect(harnessHtml).toContain("1".repeat(40));
    expect(combined).not.toMatch(/import into project/i);
    expect(combined).not.toMatch(/pull request/i);
    expect(combined).not.toMatch(/team sharing/i);
    expect(combined).not.toMatch(/marketplace/i);
  });
});
