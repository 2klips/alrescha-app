import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  parseDocumentSections,
  parseMarkdownStructure,
  parseSectionReferences,
  resolveSectionLinks,
  type DocumentSection,
} from "../packages/core/src/index";
import { EMPTY_REPOSITORY_CONFIG } from "../packages/core/src/ingest/repository-config";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";

/**
 * Section nodes (Phase 4 Wave A′ todo 8).
 *
 * A named decision becomes a node so the citations of it become edges. The
 * two rules that make that safe are the declaration rule — a heading has to
 * *open* with the token to be its home — and the home rank, which picks one
 * home when two headings both open with it.
 */

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const USER = "73000000-0000-4000-8000-000000000001";

function sectionsOf(
  path: string,
  source: string,
  config = EMPTY_REPOSITORY_CONFIG,
): readonly DocumentSection[] {
  return parseDocumentSections({
    config,
    document: parseMarkdownStructure({ path, source }),
    path,
  });
}

describe("declaring a section", () => {
  it("promotes a heading that opens with its own token", () => {
    const sections = sectionsOf(
      "spec/DECISIONS-ADR.md",
      [
        "# Decisions",
        "",
        "## ADR-015 — OQ-016 판정: 보증은 서버가 관측한 증거에만",
        "",
        "본문.",
        "",
        "## ADR-013 — 스코프 경계 재정의",
        "",
        "## MT-7",
      ].join("\n"),
    );

    expect(
      sections.map(({ span, token }) => `${token}@${span.startLine}`),
    ).toEqual(["ADR-015@3", "ADR-013@7", "MT-7@9"]);
    // The heading cites OQ-016 too. A citation is not a home: only the token
    // the heading opens with declares one.
    expect(sections.map(({ token }) => token)).not.toContain("OQ-016");
  });

  it("does not promote a heading that only cites a token", () => {
    const sections = sectionsOf(
      "spec/BUILD_PLAN.md",
      [
        "## Wave 2 — GitHub App 실기 완주 _(G2)_",
        "",
        "## 1. 레포 구조 (ADR-007)",
        "",
        // Glued to more text: `ADR-002와의` is not `ADR-002` followed by a
        // space, so this is prose about ADR-002, not its home.
        "## ADR-002와의 관계",
      ].join("\n"),
    );
    expect(sections).toEqual([]);
  });

  it("ranks a titled record above prose that opens with the same name", () => {
    const record = sectionsOf(
      "spec/DECISIONS-ADR.md",
      "## ADR-012 — OQ-011 판정: 정확도 주장 철회\n",
    );
    const log = sectionsOf(
      ".omo/evidence/benchmark-v3.md",
      "### ADR-012 복원 절차 이행\n",
    );
    expect(record[0]?.homeRank).toBeLessThan(log[0]?.homeRank ?? 0);
  });

  it("declares a token once per document", () => {
    const sections = sectionsOf(
      "spec/OPEN_QUESTIONS.md",
      ["## OQ-050 — 첫 번째", "", "## OQ-050 — 다시 쓴 제목"].join("\n"),
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]?.span.startLine).toBe(1);
  });

  it("takes literal prefixes from the repository config and nothing else", () => {
    const source = "# RFC-42 — a proposal\n\n# WEIRD/RE(GEX)+ — no\n";
    expect(sectionsOf("docs/rfc.md", source)).toEqual([]);
    expect(
      sectionsOf("docs/rfc.md", source, {
        ...EMPTY_REPOSITORY_CONFIG,
        // Lower case is normalised; a value that is not a prefix shape is
        // dropped rather than compiled into a pattern (OQ-054).
        sectionTokens: ["rfc", "WEIRD/RE(GEX)+"],
      }).map(({ token }) => token),
    ).toEqual(["RFC-42"]);
  });
});

describe("citing a section", () => {
  it("keeps one mention per token, at its first line", () => {
    expect(
      parseSectionReferences({
        source: [
          "본문에서 ADR-013을 인용한다.",
          "여기서도 ADR-013, 그리고 G3.",
          "MT-7과 OQ-041.",
        ].join("\n"),
      }),
    ).toEqual([
      { line: 1, token: "ADR-013" },
      { line: 2, token: "G3" },
      { line: 3, token: "MT-7" },
      { line: 3, token: "OQ-041" },
    ]);
  });

  it("does not link a document to a section it declares itself", () => {
    const sections = sectionsOf(
      "spec/DECISIONS-ADR.md",
      "## ADR-013 — 스코프 경계\n\n본문이 ADR-013을 다시 부른다.\n",
    );
    const links = resolveSectionLinks({
      rationales: [],
      references: new Map([
        [
          "spec/DECISIONS-ADR.md",
          [
            { line: 1, token: "ADR-013" },
            { line: 3, token: "ADR-011" },
          ],
        ],
      ]),
      sections,
    });
    expect(links).toEqual([
      {
        method: "id-token",
        sourcePath: "spec/DECISIONS-ADR.md",
        span: { endLine: 3, startLine: 3 },
        targetToken: "ADR-011",
        tier: "resolved",
        via: "document",
      },
    ]);
  });

  it("turns a WHY comment's ADR citation into a link of its own", () => {
    const links = resolveSectionLinks({
      rationales: [
        { adrRef: "ADR-013", line: 12, sourcePath: "packages/core/src/x.ts" },
        { adrRef: null, line: 40, sourcePath: "packages/core/src/x.ts" },
      ],
      references: new Map(),
      sections: [],
    });
    expect(links).toEqual([
      {
        method: "id-token",
        sourcePath: "packages/core/src/x.ts",
        span: { endLine: 12, startLine: 12 },
        targetToken: "ADR-013",
        tier: "resolved",
        via: "rationale",
      },
    ]);
  });
});

describe("sections in the database", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'sections@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/sections') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function apply(plan: unknown): Promise<void> {
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [workspaceId, repositoryId, JSON.stringify(plan)],
    );
  }

  function artifact(path: string) {
    return {
      classification: "spec",
      digest: path.length.toString(16).padStart(2, "0").repeat(32),
      exportedSymbols: [],
      kind: "spec",
      path,
      rationales: [],
      sizeBytes: 64,
      sourceBlobSha: SHA_A,
      sourceCommitSha: SHA_A,
      symbolEngine: null,
      todoItems: [],
    };
  }

  function planOf(input: {
    artifacts: readonly string[];
    linkScope?: "full" | "incremental";
    sectionLinks?: readonly unknown[];
    sections?: readonly unknown[];
    unchangedPaths?: readonly string[];
  }) {
    return {
      artifacts: input.artifacts.map(artifact),
      codeLinks: [],
      commitSha: SHA_A,
      docLinks: [],
      linkScope: input.linkScope ?? "full",
      removedPaths: [],
      routes: [],
      schemaLinks: [],
      schemaObjects: [],
      sectionLinks: input.sectionLinks ?? [],
      sections: input.sections ?? [],
      skipped: [],
      touchedRows: input.artifacts.length,
      treeSha: SHA_B,
      unchangedPaths: input.unchangedPaths ?? [],
    };
  }

  async function sections(): Promise<
    { heading: string; home_rank: number; source_path: string; token: string }[]
  > {
    const rows = await database.query<{
      heading: string;
      home_rank: number;
      source_path: string;
      token: string;
    }>(
      `select token, heading, home_rank, source_path from public.sections
       where workspace_id = $1 order by token`,
      [workspaceId],
    );
    return rows.rows;
  }

  async function citations(): Promise<string[]> {
    const rows = await database.query<{ line: string }>(
      `select a.path || ' -> ' || s.token as line
       from public.edges e
       join public.sections s on s.id = e.target_node_id
       join public.artifacts a on a.id = e.source_node_id
       where e.workspace_id = $1 and e.family = 'doc'
       order by line`,
      [workspaceId],
    );
    return rows.rows.map(({ line }) => line);
  }

  const RECORD = {
    heading: "ADR-013 — 스코프 경계 재정의",
    homeRank: 2,
    path: "spec/DECISIONS-ADR.md",
    span: { endLine: 51, startLine: 51 },
    token: "ADR-013",
  };

  it("resolves a citation against a section the plan did not re-read", async () => {
    await apply(
      planOf({
        artifacts: ["spec/DECISIONS-ADR.md"],
        sections: [RECORD],
      }),
    );
    expect((await sections()).map(({ token }) => token)).toEqual(["ADR-013"]);

    // An incremental scan that touched only the plan document declares no
    // section at all — and its citation still lands, because the apply
    // function joins against the persisted table rather than the plan
    // (the trap `queries` still has, OQ-055).
    await apply(
      planOf({
        artifacts: ["spec/BUILD_PLAN.md"],
        linkScope: "incremental",
        sectionLinks: [
          {
            method: "id-token",
            sourcePath: "spec/BUILD_PLAN.md",
            span: { endLine: 4, startLine: 4 },
            targetToken: "ADR-013",
            tier: "resolved",
            via: "document",
          },
        ],
        unchangedPaths: ["spec/DECISIONS-ADR.md"],
      }),
    );

    expect(await citations()).toEqual(["spec/BUILD_PLAN.md -> ADR-013"]);
    // And the section the incremental plan never mentioned survives.
    expect((await sections()).map(({ token }) => token)).toEqual(["ADR-013"]);
  });

  it("does not let a worse-ranked declaration evict the home", async () => {
    await apply(
      planOf({ artifacts: ["spec/DECISIONS-ADR.md"], sections: [RECORD] }),
    );

    await apply(
      planOf({
        artifacts: [".omo/evidence/benchmark-v3.md"],
        linkScope: "incremental",
        sections: [
          {
            heading: "ADR-013 복원 절차 이행",
            homeRank: 103,
            path: ".omo/evidence/benchmark-v3.md",
            span: { endLine: 289, startLine: 289 },
            token: "ADR-013",
          },
        ],
        unchangedPaths: ["spec/DECISIONS-ADR.md"],
      }),
    );

    expect(await sections()).toEqual([
      {
        heading: "ADR-013 — 스코프 경계 재정의",
        home_rank: 2,
        source_path: "spec/DECISIONS-ADR.md",
        token: "ADR-013",
      },
    ]);
  });

  it("sweeps a section a full relink no longer declares", async () => {
    await apply(
      planOf({ artifacts: ["spec/DECISIONS-ADR.md"], sections: [RECORD] }),
    );
    await apply(planOf({ artifacts: ["spec/DECISIONS-ADR.md"] }));

    expect(await sections()).toEqual([]);
    const nodes = await database.query<{ count: string }>(
      `select count(*)::text as count from public.graph_nodes
       where workspace_id = $1 and kind = 'section'`,
      [workspaceId],
    );
    expect(nodes.rows[0]?.count).toBe("0");
  });
});
