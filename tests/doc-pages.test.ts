import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DOC_PAGE_NODE_SCOPES,
  buildDocPageSkeleton,
  docPageNeedsNode,
  docPageSlug,
  validateDocPageProse,
  type DocPageCitation,
} from "../packages/core/src/index";
import {
  ALL_MIGRATIONS,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * Doc pages (Phase 4 Wave D todo 20, 설계 ④, OQ-033).
 *
 * The graph knows what a module contains. Nobody reads a graph, so a page is
 * its readable face — and the thing that keeps a page from becoming a second,
 * drifting copy of the repository is that the skeleton is *derived* and only
 * the prose is written.
 *
 * Three properties carry that: the slug does not move when a module gains a
 * file, a page may cite only what its own skeleton listed, and prose is
 * stored **conditionally** on the member set it was generated from (보완
 * R-02) — the same rule `apply_artifact_summaries` has followed since S1.
 */

const OWNER = "7F000000-0000-4000-8000-000000000001".toLowerCase();
const fixedUlid = (suffix: string) => `01JA000000000000000000000${suffix}`;
const REPOSITORY = fixedUlid("B");
const ARTIFACT = fixedUlid("A");

/** A module page addresses itself by its member directories. */
const moduleSlug = (memberPaths: string[]) =>
  docPageSlug({ identityKey: "module:src/a.ts", memberPaths, scope: "module" });

describe("the doc page slug", () => {
  it("hashes the member directories, not the member files", () => {
    // Adding a file to a directory the module already spans does not rename
    // the page — which is what makes a link to it worth keeping.
    expect(moduleSlug(["src/a.ts", "src/b.ts"])).toBe(
      moduleSlug(["src/a.ts", "src/b.ts", "src/c.ts"]),
    );
    // Spanning a new directory is a different shape, so a different page.
    expect(moduleSlug(["src/a.ts"])).not.toBe(
      moduleSlug(["src/a.ts", "lib/b.ts"]),
    );
  });

  it("does not depend on member order or on duplicates", () => {
    expect(moduleSlug(["lib/b.ts", "src/a.ts"])).toBe(
      moduleSlug(["src/a.ts", "lib/b.ts", "src/a.ts"]),
    );
  });

  it("tells a root-level page from one over a directory", () => {
    // The empty directory is a real distinction, not a missing value.
    expect(moduleSlug(["README.md"])).not.toBe(moduleSlug(["src/a.ts"]));
    expect(moduleSlug([])).toMatch(/^[0-9a-f]{32}$/);
  });

  it("gives a node of its own only to the three scopes that need one", () => {
    expect([...DOC_PAGE_NODE_SCOPES].sort()).toEqual([
      "feature",
      "module",
      "repo",
    ]);
    // A file, a directory and a concept already are nodes; a second one
    // would make "which node is this file" a question with two answers.
    expect(docPageNeedsNode("file")).toBe(false);
    expect(docPageNeedsNode("directory")).toBe(false);
    expect(docPageNeedsNode("concept")).toBe(false);
    expect(docPageNeedsNode("module")).toBe(true);
  });
});

describe("the doc page skeleton", () => {
  const nodes = [
    { kind: "artifact", nodeId: "n:src/a.ts", path: "src/a.ts", title: "a.ts" },
    { kind: "artifact", nodeId: "n:src/b.ts", path: "src/b.ts", title: "b.ts" },
    {
      kind: "artifact",
      nodeId: "n:lib/dep.ts",
      path: "lib/dep.ts",
      title: "dep.ts",
    },
    {
      kind: "requirement",
      nodeId: "n:req-1",
      path: null,
      title: "The app MUST rotate tokens.",
    },
  ];

  function skeleton() {
    return buildDocPageSkeleton({
      edges: [
        // Inside the module: counted as a relation, cited by nobody.
        {
          relation: "imports",
          sourceNodeId: "n:src/a.ts",
          targetNodeId: "n:src/b.ts",
        },
        // Leaving it: a citation candidate.
        {
          relation: "imports",
          sourceNodeId: "n:src/a.ts",
          targetNodeId: "n:lib/dep.ts",
        },
        // Entering it: also a candidate.
        {
          relation: "implements",
          sourceNodeId: "n:req-1",
          targetNodeId: "n:src/b.ts",
        },
        // Neither end is a member: not this page's business at all.
        {
          relation: "imports",
          sourceNodeId: "n:lib/dep.ts",
          targetNodeId: "n:req-1",
        },
      ],
      memberPaths: ["src/b.ts", "src/a.ts"],
      nodes,
      scope: "module",
      symbolsByPath: { "src/a.ts": ["rotate", "issue"], "src/b.ts": ["issue"] },
      title: "src",
    });
  }

  it("counts every relation that touches a member", () => {
    expect(skeleton().relations).toEqual({ implements: 1, imports: 2 });
  });

  it("offers only the nodes on the other end as citations", () => {
    // A page does not cite itself, and it cannot cite a node the read did
    // not carry — which is the dangling link this set exists to prevent.
    expect(skeleton().citations.map(({ nodeId }) => nodeId)).toEqual([
      "n:lib/dep.ts",
      "n:req-1",
    ]);
  });

  it("carries member names and symbol names, sorted and deduplicated", () => {
    expect(skeleton().memberPaths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(skeleton().symbols).toEqual(["issue", "rotate"]);
  });

  it("drops a neighbour the read did not carry rather than citing it", () => {
    const partial = buildDocPageSkeleton({
      edges: [
        {
          relation: "imports",
          sourceNodeId: "n:src/a.ts",
          targetNodeId: "n:absent",
        },
      ],
      memberPaths: ["src/a.ts"],
      nodes: nodes.slice(0, 1),
      scope: "module",
      title: "src",
    });

    // The relation is real and counted; the citation is not offered.
    expect(partial.relations).toEqual({ imports: 1 });
    expect(partial.citations).toEqual([]);
  });
});

describe("validating generated page prose", () => {
  const candidates: DocPageCitation[] = [
    {
      kind: "artifact",
      nodeId: "n:lib/dep.ts",
      path: "lib/dep.ts",
      title: "dep",
    },
  ];
  const body =
    "이 모듈은 세션 토큰을 발급하고 회전시킵니다. 만료 판정은 저장된 정책을 " +
    "읽어 수행하며, 외부 의존성은 하나뿐입니다. 토큰 회전은 정책이 정한 " +
    "주기마다 일어나고, 만료된 토큰은 저장소에서 지워지지 않고 무효로 표시됩니다.";

  function validate(raw: unknown, memberSources?: string[]) {
    return validateDocPageProse({
      candidates,
      ...(memberSources ? { memberSources } : {}),
      raw,
      slug: "a".repeat(32),
    });
  }

  it("accepts prose that cites only what the skeleton listed", () => {
    expect(validate({ body, citedNodeIds: ["n:lib/dep.ts"] })).toEqual({
      body,
      citedNodeIds: ["n:lib/dep.ts"],
    });
  });

  /**
   * The failure that makes generated documentation worse than none: a link
   * that looks right and goes nowhere.
   */
  it("refuses a citation outside the candidate set", () => {
    expect(() =>
      validate({ body, citedNodeIds: ["n:lib/dep.ts", "n:invented"] }),
    ).toThrow(/outside its skeleton/);
  });

  it("refuses a code fence and a verbatim member line", () => {
    expect(() => validate({ body: `${body}\n\`\`\`ts\ncode\n\`\`\`` })).toThrow(
      /code fence/,
    );
    const source = "export function rotateSessionToken(input: Input) {";
    expect(() => validate({ body: `${body} ${source}` }, [source])).toThrow(
      /verbatim/,
    );
  });

  it("refuses a page that is too short, too long, or too wide", () => {
    expect(() => validate({ body: "짧다." })).toThrow(/too short/);
    expect(() => validate({ body: "가".repeat(4_001) })).toThrow(
      /exceeds 4000/,
    );
    expect(() => validate({ body: `${body}\n${"x".repeat(201)}` })).toThrow(
      /line over 200/,
    );
  });

  it("refuses a shape that is not the schema", () => {
    expect(() => validate({ summary: body })).toThrow(/did not match/);
    expect(() => validate(null)).toThrow(/did not match/);
  });

  it("keeps citations deduplicated and sorted", () => {
    expect(
      validate({ body, citedNodeIds: ["n:lib/dep.ts", "n:lib/dep.ts"] })
        .citedNodeIds,
    ).toEqual(["n:lib/dep.ts"]);
  });
});

describe("doc pages in the database", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;

  async function applySkeletons(pages: unknown[]) {
    const rows = await asServiceRole(database, async (tx) =>
      tx.query<{ result: { renamed: number; written: number } }>(
        "select public.apply_doc_page_skeletons($1, $2, $3::jsonb) as result",
        [workspace, REPOSITORY, JSON.stringify(pages)],
      ),
    );
    return rows.rows[0]?.result as { renamed: number; written: number };
  }

  async function applyProse(items: unknown[]) {
    const rows = await asServiceRole(database, async (tx) =>
      tx.query<{
        result: {
          applied: number;
          invalid: number;
          missing: number;
          superseded: number;
        };
      }>("select public.apply_doc_page_prose($1, $2, $3::jsonb) as result", [
        workspace,
        REPOSITORY,
        JSON.stringify(items),
      ]),
    );
    return rows.rows[0]?.result as {
      applied: number;
      invalid: number;
      missing: number;
      superseded: number;
    };
  }

  async function pages() {
    const rows = await database.query<{
      anchor_node_id: string | null;
      previous_slugs: string[];
      scope: string;
      slug: string;
      summary: string | null;
      summary_grade: string | null;
      title: string;
    }>(
      `select scope, slug, previous_slugs, anchor_node_id, title, summary,
              summary_grade
       from public.doc_pages where workspace_id = $1 order by scope, slug`,
      [workspace],
    );
    return rows.rows;
  }

  const modulePage = (memberPaths: string[], memberDigest = "d1") => ({
    commitSha: "1".repeat(40),
    // The stable identity, unchanged by the member set moving: the same key
    //  uses.
    identityKey: "module:src/a.ts",
    memberDigest,
    memberPaths,
    scope: "module",
    skeleton: { citations: [], relations: {}, symbols: [] },
    title: "src",
  });

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'docs@example.test')",
      [OWNER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [OWNER],
    );
    workspace = workspaces.rows[0]?.id ?? "";
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, 'owner/docs')",
      [REPOSITORY, workspace],
    );
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, 'artifact', 'src/a.ts')`,
      [ARTIFACT, workspace, REPOSITORY],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  /**
   * One rule, two implementations — the lesson `next_route_url` and
   * `bestHome` already carry. If the SQL and the TypeScript ever disagree
   * about a slug, every stored page is addressable by one and not the other.
   */
  it("hashes a slug exactly as the TypeScript does", async () => {
    for (const members of [
      ["src/a.ts", "src/b.ts"],
      ["README.md"],
      ["src/deep/a.ts", "lib/b.ts", "src/deep/c.ts"],
      [],
    ]) {
      for (const scope of ["module", "file"] as const) {
        const rows = await database.query<{ slug: string }>(
          "select public.doc_page_slug($1, $2::text[], $3) as slug",
          [scope, members, members[0] ?? ""],
        );
        expect(rows.rows[0]?.slug).toBe(
          docPageSlug({
            identityKey: members[0] ?? "",
            memberPaths: members,
            scope,
          }),
        );
      }
    }
  });

  it("keeps a module page's slug when it gains a file", async () => {
    await applySkeletons([modulePage(["src/a.ts", "src/b.ts"])]);
    const before = (await pages())[0];

    const second = await applySkeletons([
      modulePage(["src/a.ts", "src/b.ts", "src/c.ts"], "d2"),
    ]);

    // Same directory set, same page — not a second one, and not renamed.
    expect(second).toEqual({ renamed: 0, written: 1 });
    const after = await pages();
    expect(after).toHaveLength(1);
    expect(after[0]?.slug).toBe(before?.slug);
    expect(after[0]?.previous_slugs).toEqual([]);
  });

  it("remembers the old name when the shape does change", async () => {
    await applySkeletons([modulePage(["src/a.ts"])]);
    const before = (await pages())[0]?.slug ?? "";

    const second = await applySkeletons([
      modulePage(["src/a.ts", "lib/b.ts"], "d2"),
    ]);

    expect(second.renamed).toBe(1);
    const after = await pages();
    // One page, a new name, and the old one still answers.
    expect(after).toHaveLength(1);
    expect(after[0]?.slug).not.toBe(before);
    expect(after[0]?.previous_slugs).toEqual([before]);
  });

  it("gives a module page a graph node and an attached page none", async () => {
    await applySkeletons([
      modulePage(["src/a.ts"]),
      {
        anchorNodeId: ARTIFACT,
        commitSha: "1".repeat(40),
        identityKey: "src/a.ts",
        memberDigest: "d1",
        memberPaths: ["src/a.ts"],
        scope: "file",
        skeleton: {},
        title: "src/a.ts",
      },
    ]);

    const rows = await pages();
    expect(rows.map(({ scope }) => scope)).toEqual(["file", "module"]);
    expect(rows[0]?.anchor_node_id).toBe(ARTIFACT);
    expect(rows[1]?.anchor_node_id).toBeNull();

    const nodes = await database.query<{ id: string; label: string }>(
      "select id, label from public.graph_nodes where workspace_id = $1 and kind = 'doc_page'",
      [workspace],
    );
    // Exactly one: the module page. The file page attached to the node the
    // file already had.
    expect(nodes.rows).toHaveLength(1);
    expect(nodes.rows[0]?.label).toBe("src");
  });

  it("refuses a page whose scope and anchor disagree", async () => {
    const fileSlug = docPageSlug({ identityKey: "src/a.ts", scope: "file" });
    // An attached scope with no anchor is not a page, it is an orphan.
    await expect(
      database.query(
        `insert into public.doc_pages
          (workspace_id, repository_id, scope, identity_key, slug, title,
           member_digest)
         values ($1, $2, 'file', 'src/a.ts', $3, 'no anchor', 'd1')`,
        [workspace, REPOSITORY, fileSlug],
      ),
    ).rejects.toThrow(/doc_pages_anchor_shape/);

    // …and a node scope that anchors is the same mistake from the other side.
    await expect(
      database.query(
        `insert into public.doc_pages
          (workspace_id, repository_id, scope, identity_key, slug, title,
           member_digest, anchor_node_id)
         values ($1, $2, 'module', 'module:src/a.ts', $3, 'anchored', 'd1', $4)`,
        [workspace, REPOSITORY, moduleSlug(["src/a.ts"]), ARTIFACT],
      ),
    ).rejects.toThrow(/doc_pages_anchor_shape/);
  });

  /**
   * 보완 R-02. A page generated from one member set must not be written on
   * top of a page whose members have since moved, and the four outcomes are
   * reported rather than collapsed into a count.
   */
  it("stores prose only when the members have not moved", async () => {
    await applySkeletons([modulePage(["src/a.ts"], "digest-one")]);
    const slug = (await pages())[0]?.slug ?? "";

    expect(
      await applyProse([
        {
          body: "이 모듈은 세션을 다룹니다.",
          citedNodeIds: [],
          memberDigest: "digest-one",
          model: "test-model",
          provider: "anthropic",
          slug,
        },
      ]),
    ).toEqual({ applied: 1, invalid: 0, missing: 0, superseded: 0 });
    expect((await pages())[0]).toMatchObject({
      summary: "이 모듈은 세션을 다룹니다.",
      // ADR-001: page prose is a model reading stored facts, never verified.
      summary_grade: "inferred",
    });

    // The members moved while the model was running.
    await applySkeletons([modulePage(["src/a.ts"], "digest-two")]);
    expect(
      await applyProse([
        {
          body: "옛 멤버 집합에서 만든 글.",
          memberDigest: "digest-one",
          model: "test-model",
          provider: "anthropic",
          slug,
        },
      ]),
    ).toEqual({ applied: 0, invalid: 0, missing: 0, superseded: 1 });
    // Superseded is not an instruction to call the model again, and it does
    // not overwrite: the earlier prose is still what is stored.
    expect((await pages())[0]?.summary).toBe("이 모듈은 세션을 다룹니다.");
  });

  it("separates a missing page from an unconditional write", async () => {
    expect(
      await applyProse([
        { body: "x", memberDigest: "d1", slug: "b".repeat(32) },
        { body: "y", slug: "c".repeat(32) },
        { body: "z", memberDigest: "d1" },
      ]),
    ).toEqual({ applied: 0, invalid: 2, missing: 1, superseded: 0 });
  });

  it("leaves prose alone when a later skeleton pass runs", async () => {
    await applySkeletons([modulePage(["src/a.ts"], "digest-one")]);
    const slug = (await pages())[0]?.slug ?? "";
    await applyProse([
      {
        body: "값을 치른 글.",
        memberDigest: "digest-one",
        model: "m",
        provider: "anthropic",
        slug,
      },
    ]);

    await applySkeletons([modulePage(["src/a.ts"], "digest-one")]);

    // A free pass that erased paid work would make every rescan a way to
    // lose it.
    expect((await pages())[0]?.summary).toBe("값을 치른 글.");
  });

  it("keeps a skeleton job free and lets a page job be billed", async () => {
    await database.query(
      `insert into public.runs (id, workspace_id, repository_id, trigger_kind, trigger_key)
       values ($1, $2, $3, 'manual', 'docs:1')`,
      [fixedUlid("N"), workspace, REPOSITORY],
    );
    const enqueue = async (kind: string, cost: number) =>
      asServiceRole(database, async (tx) =>
        tx.query(
          "select public.enqueue_job($1, $2, $3, $4, $5, '{}'::jsonb, $6)",
          [
            workspace,
            REPOSITORY,
            fixedUlid("N"),
            kind,
            `${kind}:${cost}`,
            cost,
          ],
        ),
      );

    await expect(enqueue("docskeleton", 1)).rejects.toThrow(
      /deterministic jobs must have zero credit cost/,
    );
    await enqueue("docskeleton", 0);
    await enqueue("docpage", 1);

    const ledger = await database.query<{ count: string }>(
      `select count(*)::text as count from public.jobs
       where workspace_id = $1 and kind = 'docskeleton' and credit_cost = 0`,
      [workspace],
    );
    expect(ledger.rows[0]?.count).toBe("1");
  });
});
