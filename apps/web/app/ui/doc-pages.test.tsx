import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  DocPageSummaryView,
  DocPageView,
} from "../../lib/docs/doc-pages-report";
import { DOCS } from "../../lib/strings/docs";
import { DocPageList, DocPageScreen } from "./doc-pages";

/**
 * The doc-page screens as static markup (Phase 4 Wave D todo 20): the
 * empty state names itself, a list row carries its scope and prose state,
 * and a page shows its prose only under the inferred badge — a page with
 * stale prose says so in the summary slot instead of serving it.
 */

const summary = (
  overrides: Partial<DocPageSummaryView> = {},
): DocPageSummaryView => ({
  id: "01JD000000000000000000000M",
  memberCount: 2,
  proseState: "missing",
  scope: "module",
  slug: "a".repeat(32),
  title: "src/session.ts",
  updatedAt: "2026-09-14T00:00:00.000Z",
  ...overrides,
});

const page = (overrides: Partial<DocPageView> = {}): DocPageView => ({
  ...summary(),
  anchorNodeId: null,
  citations: [
    { kind: "requirement", nodeId: "n-req", path: null, title: "R-01 세션 만료" },
  ],
  memberPaths: ["src/session.ts", "tests/session.test.ts"],
  previousSlugCount: 1,
  relations: [{ count: 1, relation: "imports" }],
  sourceCommitSha: "1234567" + "0".repeat(33),
  summary: null,
  symbols: ["createSession"],
  ...overrides,
});

describe("DocPageList", () => {
  it("renders the empty state when the skeleton pass has not run", () => {
    const html = renderToStaticMarkup(
      <DocPageList basePath="/app/docs" pages={[]} />,
    );
    expect(html).toContain('data-testid="docs-empty"');
    expect(html).toContain(DOCS.empty.title);
    expect(html).not.toContain('data-testid="docs-list"');
  });

  it("lists pages with their scope and prose state, linking by slug", () => {
    const html = renderToStaticMarkup(
      <DocPageList
        basePath="/app/docs"
        pages={[
          summary({ proseState: "current" }),
          summary({
            id: "01JD000000000000000000000R",
            proseState: "stale",
            scope: "repo",
            slug: "b".repeat(32),
            title: "acme/app",
          }),
        ]}
      />,
    );
    expect(html).toContain(DOCS.count(2));
    expect(html).toContain(`href="/app/docs/${"a".repeat(32)}"`);
    expect(html).toContain('data-scope="module" data-prose="current"');
    expect(html).toContain('data-scope="repo" data-prose="stale"');
    expect(html).toContain(DOCS.proseState.stale);
    expect(html).toContain('class="status-badge inferred"');
    expect(html).not.toContain("status-badge verified");
  });
});

describe("DocPageScreen", () => {
  it("shows current prose under the inferred badge with members, symbols, relations and citations", () => {
    const html = renderToStaticMarkup(
      <DocPageScreen
        backlinks={[summary({ id: "01JD000000000000000000000D", scope: "directory", title: "src" })]}
        basePath="/app/docs"
        page={page({
          proseState: "current",
          summary: { grade: "inferred", text: "세션 모듈은 만료 규칙을 구현합니다." },
        })}
      />,
    );
    expect(html).toContain('data-testid="doc-page"');
    expect(html).toContain('data-prose="current"');
    expect(html).toContain("세션 모듈은 만료 규칙을 구현합니다.");
    expect(html).toContain('class="status-badge inferred"');
    expect(html).not.toContain("status-badge verified");
    expect(html).toContain("tests/session.test.ts");
    expect(html).toContain("createSession");
    expect(html).toContain(DOCS.page.relationCount("imports", 1));
    expect(html).toContain("R-01 세션 만료");
    expect(html).toContain(`${DOCS.page.sourceCommit} 1234567`);
    expect(html).toContain(DOCS.page.previousSlugs(1));
    expect(html).toContain('data-testid="doc-page-backlinks"');
    expect(html).toContain(`href="/app/docs"`);
  });

  it("says which absence it is when the prose is missing or stale, and never serves the stale text", () => {
    const missing = renderToStaticMarkup(
      <DocPageScreen backlinks={[]} basePath="/app/docs" page={page()} />,
    );
    expect(missing).toContain(DOCS.proseState.missing);
    expect(missing).toContain(DOCS.page.backlinksEmpty);
    expect(missing).not.toContain("status-badge");

    const stale = renderToStaticMarkup(
      <DocPageScreen
        backlinks={[]}
        basePath="/app/docs"
        page={page({ proseState: "stale", summary: null })}
      />,
    );
    expect(stale).toContain(DOCS.proseState.stale);
    expect(stale).toContain('data-prose="stale"');
  });
});
