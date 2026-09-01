import { createLibrarySnapshot, type LibraryItem } from "@alrescha/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HarnessAssetCard } from "./harness-asset-card";
import { HARNESS } from "../../lib/strings/harness";
import { LIBRARY } from "../../lib/strings/library";
import { LibraryBrowser } from "./library-browser";

const AUTH_ITEM: LibraryItem = {
  ...createLibrarySnapshot({
    content: "Review OAuth callbacks and session ownership.",
    name: "Review auth",
    source: {
      commitSha: "1".repeat(40),
      path: ".agents/skills/review-auth/SKILL.md",
      repository: "alrescha/drifted-demo",
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
      repository: "arr/api",
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
    expect(html).toContain("alrescha/drifted-demo");
    expect(html).toContain(".agents/skills/review-auth/SKILL.md");
    expect(html).toContain("1".repeat(40));
    expect(html).toContain("sha256:");
    expect(html).toContain(LIBRARY.card.deleteSnapshot);
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

    expect(harnessHtml).toContain(HARNESS.card.save);
    expect(harnessHtml).toContain("alrescha/drifted-demo");
    expect(harnessHtml).toContain("1".repeat(40));
    expect(combined).not.toMatch(
      /import into project|프로젝트로 가져오기|프로젝트에 추가/i,
    );
    expect(combined).not.toMatch(/pull request|풀 리퀘스트/i);
    expect(combined).not.toMatch(/team sharing|팀 공유/i);
    expect(combined).not.toMatch(/marketplace|마켓플레이스/i);
  });
});
