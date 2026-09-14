import { describe, expect, it } from "vitest";

import {
  docPageList,
  docPageView,
  proseStateOf,
  type DocPageRow,
} from "./doc-pages-report";

/**
 * The doc-page views as pure functions of stored rows (Phase 4 Wave D
 * todo 20): the prose is served only under the digest it was written for,
 * a malformed skeleton field drops itself and not the page, and the list
 * puts the repository first.
 */

const DIGEST = "d".repeat(64);

const row = (overrides: Partial<DocPageRow> = {}): DocPageRow => ({
  anchor_node_id: null,
  cited_node_ids: [],
  id: "01JD000000000000000000000M",
  member_digest: DIGEST,
  member_paths: ["tests/session.test.ts", "src/session.ts"],
  previous_slugs: [],
  repository_id: "01JD000000000000000000000B",
  scope: "module",
  skeleton: {
    citations: [
      {
        kind: "requirement",
        nodeId: "n-req",
        path: null,
        title: "R-01 session timeout",
      },
      // Malformed: no title. Dropped on its own.
      { kind: "artifact", nodeId: "n-x" },
    ],
    relations: { implements: 1, imports: 3, weird: "many" },
    symbols: ["createSession", 42],
  },
  slug: "a".repeat(32),
  source_commit_sha: "1".repeat(40),
  summary: null,
  summary_member_digest: null,
  title: "src/session.ts",
  updated_at: "2026-09-14T00:00:00.000Z",
  ...overrides,
});

describe("proseStateOf", () => {
  it("is missing without prose, current under the same digest, stale under another", () => {
    expect(proseStateOf(row())).toBe("missing");
    expect(
      proseStateOf(
        row({ summary: "세션 모듈입니다.", summary_member_digest: DIGEST }),
      ),
    ).toBe("current");
    expect(
      proseStateOf(
        row({
          summary: "세션 모듈입니다.",
          summary_member_digest: "e".repeat(64),
        }),
      ),
    ).toBe("stale");
    // Whitespace is not prose.
    expect(
      proseStateOf(row({ summary: "  ", summary_member_digest: DIGEST })),
    ).toBe("missing");
  });
});

describe("docPageView", () => {
  it("reads the skeleton field by field, sorts members and relations, and serves no stale prose", () => {
    const view = docPageView(
      row({
        summary: "이전 멤버 구성의 산문",
        summary_member_digest: "e".repeat(64),
      }),
    )!;
    expect(view.proseState).toBe("stale");
    expect(view.summary).toBeNull();
    expect(view.memberPaths).toEqual([
      "src/session.ts",
      "tests/session.test.ts",
    ]);
    expect(view.memberCount).toBe(2);
    expect(view.symbols).toEqual(["createSession"]);
    expect(view.relations).toEqual([
      { count: 3, relation: "imports" },
      { count: 1, relation: "implements" },
    ]);
    expect(view.citations).toEqual([
      {
        kind: "requirement",
        nodeId: "n-req",
        path: null,
        title: "R-01 session timeout",
      },
    ]);
    expect(view.sourceCommitSha).toBe("1".repeat(40));
    expect(view.previousSlugCount).toBe(0);
  });

  it("serves current prose as inferred, never as anything else", () => {
    const view = docPageView(
      row({ summary: "세션 모듈입니다.", summary_member_digest: DIGEST }),
    )!;
    expect(view.summary).toEqual({
      grade: "inferred",
      text: "세션 모듈입니다.",
    });
  });

  it("tolerates an empty or non-object skeleton and an unknown scope drops the page", () => {
    const bare = docPageView(row({ skeleton: null }))!;
    expect(bare.citations).toEqual([]);
    expect(bare.relations).toEqual([]);
    expect(bare.symbols).toEqual([]);
    expect(docPageView(row({ scope: "chapter" }))).toBeNull();
  });
});

describe("docPageList", () => {
  it("orders the repository first, then modules, then directories, and by title within a scope", () => {
    const list = docPageList([
      row({ id: "01JD000000000000000000000D", scope: "directory", title: "src", anchor_node_id: "n-dir" }),
      row({ id: "01JD000000000000000000000N", title: "src/b.ts" }),
      row({ id: "01JD000000000000000000000M", title: "src/a.ts" }),
      row({ id: "01JD000000000000000000000R", scope: "repo", title: "acme/app" }),
    ]);
    expect(list.map(({ scope, title }) => `${scope} ${title}`)).toEqual([
      "repo acme/app",
      "module src/a.ts",
      "module src/b.ts",
      "directory src",
    ]);
  });
});
