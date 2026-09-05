import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  classifyArtifactPath,
  extractRationales,
  extractSymbols,
  scanRepository,
  type RepositorySource,
  type RepositoryTree,
} from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import { buildWorkspaceProgressReport } from "../apps/web/lib/progress/progress-report";
import {
  AI_JUDGMENT_MIGRATION,
  AUTH_TENANCY_MIGRATION,
  EVIDENCE_GRAPH_MIGRATION,
  GITHUB_APP_MIGRATION,
  HOSTED_MCP_MIGRATION,
  LIBRARY_MIGRATION,
  LOCAL_INGEST_MIGRATION,
  PILOT_INSTRUMENTATION_MIGRATION,
  PROGRESS_DASHBOARD_MIGRATION,
  RATIONALE_NODES_MIGRATION,
  RELEASE_HARDENING_MIGRATION,
  REPOSITORY_SCAN_MIGRATION,
  RUN_LIFECYCLE_MIGRATION,
  SYMBOL_ENGINE_MIGRATION,
  WORKER_CREDIT_MIGRATION,
  createTestDatabase,
} from "./helpers/database";

const USER = "51111111-1111-4111-8111-111111111111";

describe("handoff/session file classification (todo 7 ⑶)", () => {
  it.each([
    "current-task.md",
    "session-state.md",
    "session-notes.md",
    "HANDOFF.md",
    "handoff-2026-08-17.md",
    ".claude/session-state.md",
    "docs/current_task.md",
  ])("classifies %s as todo_progress", (path) => {
    expect(classifyArtifactPath(path)).toBe("todo_progress");
  });

  it("keeps the specific document rules ahead of the generic one", () => {
    // Ordinary prose became an artifact in Phase 4 Wave A todo 2 — it was
    // not one before, which is why a README had no node to link to — but the
    // named rules still win, or a TODO would stop being a todo.
    expect(classifyArtifactPath("docs/guide.md")).toBe("doc");
    expect(classifyArtifactPath("TODO.md")).toBe("todo_progress");
    expect(classifyArtifactPath("docs/adr/ADR-001.md")).toBe("adr");
    expect(classifyArtifactPath("AGENTS.md")).toBe("agents");
  });
});

describe("non-code text files (Phase 4 Wave A todo 2)", () => {
  it.each([
    ["README.md", "doc"],
    ["notes/meeting.txt", "doc"],
    ["docs/api.rst", "doc"],
    ["supabase/migrations/202609050001_x.sql", "schema"],
    ["prisma/schema.prisma", "schema"],
    ["apps/web/app/styles/tokens.css", "style"],
    ["apps/web/styles/main.scss", "style"],
    ["package.json", "config"],
    ["apps/web/tsconfig.json", "config"],
    ["pyproject.toml", "config"],
    ["docker-compose.yml", "config"],
    ["Dockerfile", "config"],
    [".env.example", "config"],
    ["vitest.config.ts", "code_metadata"],
  ])("classifies %s as %s", (path, expected) => {
    expect(classifyArtifactPath(path)).toBe(expected);
  });

  it("leaves data files, lockfiles and build output out of the graph", () => {
    // Not "every `.json`": a recorded API response and a fixture are data,
    // and a lockfile is generated. None of them says anything about intent.
    expect(classifyArtifactPath("fixtures/recordings/tree.json")).toBeNull();
    expect(classifyArtifactPath("data/users.json")).toBeNull();
    expect(classifyArtifactPath("pnpm-lock.yaml")).toBeNull();
    expect(classifyArtifactPath("package-lock.json")).toBeNull();
    expect(classifyArtifactPath("dist/index.js")).toBeNull();
    expect(classifyArtifactPath("coverage/report.md")).toBeNull();
    expect(classifyArtifactPath("node_modules/pkg/readme.md")).toBeNull();
    expect(
      classifyArtifactPath(".claude/worktrees/copy/spec/WORK_SPEC.md"),
    ).toBeNull();
    // …while a hand-written evidence log stays in (OQ-043): the CLI used to
    // drop `.omo` and the GitHub path kept it, so the two disagreed.
    expect(classifyArtifactPath(".omo/evidence/phase4/density.md")).toBe("doc");
  });
});

describe("multi-language symbol extraction (todo 7 ⑵)", () => {
  it("keeps the TypeScript AST engine for ts/js", () => {
    const { engine, symbols } = extractSymbols(
      "src/engine.ts",
      "export function decide(): number { return 1; }\nconst hidden = 2;\n",
    );
    expect(engine).toBe("typescript-ast");
    expect(symbols).toEqual([
      expect.objectContaining({
        kind: "function",
        name: "decide",
        startLine: 1,
      }),
    ]);
  });

  it("extracts top-level Python defs and classes, skipping private names", () => {
    const { engine, symbols } = extractSymbols(
      "svc/worker.py",
      [
        "import os",
        "",
        "def handle_job(payload):",
        "    return payload",
        "",
        "async def stream_events():",
        "    pass",
        "",
        "def _internal():",
        "    pass",
        "",
        "class JobRunner:",
        "    def run(self):",
        "        pass",
      ].join("\n"),
    );
    expect(engine).toBe("python-structural");
    expect(symbols.map(({ kind, name }) => `${kind}:${name}`)).toEqual([
      "function:handle_job",
      "function:stream_events",
      "class:JobRunner",
    ]);
    expect(symbols[0]).toMatchObject({ startLine: 3 });
  });

  it("records which engine read the symbols, so precision is not assumed (ADR-014)", async () => {
    const root = await mkdtemp(join(tmpdir(), "arr-engine-provenance-"));
    try {
      await writeFile(join(root, "a.ts"), "export const a = 1;\n", "utf8");
      await writeFile(join(root, "b.py"), "def handle():\n    pass\n", "utf8");
      await writeFile(join(root, "c.go"), "package c\nfunc Do() {}\n", "utf8");
      await writeFile(join(root, "TODO.md"), "- [ ] 문서\n", "utf8");

      const { commitSha, source } = await createLocalRepositorySource(root);
      const plan = await scanRepository({ commitSha, source });
      const engines = Object.fromEntries(
        plan.artifacts.map(({ path, symbolEngine }) => [path, symbolEngine]),
      );
      expect(engines).toEqual({
        "TODO.md": null,
        "a.ts": "typescript-ast",
        "b.py": "python-structural",
        "c.go": "go-structural",
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("extracts exported Go declarations by the capital-initial rule", () => {
    const { engine, symbols } = extractSymbols(
      "svc/queue.go",
      [
        "package queue",
        "",
        "type Job struct {}",
        "type worker struct {}",
        "",
        "func Claim(id string) *Job { return nil }",
        "func (j *Job) Finish() {}",
        "func helper() {}",
        "",
        "const MaxAttempts = 3",
        "var leaseSeconds = 30",
      ].join("\n"),
    );
    expect(engine).toBe("go-structural");
    expect(symbols.map(({ kind, name }) => `${kind}:${name}`)).toEqual([
      "struct:Job",
      "function:Claim",
      "function:Finish",
      "variable:MaxAttempts",
    ]);
  });
});

describe("rationale extraction (todo 7 ⑴)", () => {
  it("lifts WHY/NOTE markers and ADR citations with their lines", () => {
    const rationales = extractRationales(
      "src/queue.ts",
      [
        "// WHY: lease 만료가 재시도보다 먼저 온다",
        "export function claim() {}",
        "# NOTE: ADR-013 경계 안에서만 업로드한다",
        "/* 결정 근거는 ADR-007 참조 */",
        "// 평범한 주석",
      ].join("\n"),
    );
    expect(rationales).toEqual([
      {
        adrRef: null,
        kind: "why",
        line: 1,
        sourceKey: "rationale:src/queue.ts:1",
        text: "lease 만료가 재시도보다 먼저 온다",
      },
      {
        adrRef: "ADR-013",
        kind: "note",
        line: 3,
        sourceKey: "rationale:src/queue.ts:3",
        text: "ADR-013 경계 안에서만 업로드한다",
      },
      {
        adrRef: "ADR-007",
        kind: "adr-reference",
        line: 4,
        sourceKey: "rationale:src/queue.ts:4",
        text: "결정 근거는 ADR-007 참조",
      },
    ]);
  });

  it("keeps only the comment text, truncated to the node limit", () => {
    const rationales = extractRationales(
      "a.py",
      `# WHY: ${"긴 설명 ".repeat(100)}`,
    );
    expect(rationales[0]!.text.length).toBeLessThanOrEqual(240);
  });
});

describe("rationale nodes and handoff todos reach the database and dashboard", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>> | null = null;

  afterEach(async () => {
    await database?.close();
    database = null;
  });

  it("persists rationale as a first-class node with a provenance edge, and handoff todos flow to the progress board", async () => {
    database = await createTestDatabase([
      AUTH_TENANCY_MIGRATION,
      EVIDENCE_GRAPH_MIGRATION,
      GITHUB_APP_MIGRATION,
      WORKER_CREDIT_MIGRATION,
      REPOSITORY_SCAN_MIGRATION,
      HOSTED_MCP_MIGRATION,
      AI_JUDGMENT_MIGRATION,
      PILOT_INSTRUMENTATION_MIGRATION,
      RELEASE_HARDENING_MIGRATION,
      PROGRESS_DASHBOARD_MIGRATION,
      LIBRARY_MIGRATION,
      RUN_LIFECYCLE_MIGRATION,
      LOCAL_INGEST_MIGRATION,
      RATIONALE_NODES_MIGRATION,
      SYMBOL_ENGINE_MIGRATION,
    ]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'scanner-ext@example.test')",
      [USER],
    );
    const workspace = (
      await database.query<{ id: string }>(
        "select id from public.workspaces where owner_user_id = $1",
        [USER],
      )
    ).rows[0]!.id;

    const root = await mkdtemp(join(tmpdir(), "arr-scanner-ext-"));
    try {
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(
        join(root, "src", "queue.ts"),
        "// WHY: lease 만료가 재시도보다 먼저 온다\nexport function claim() {}\n",
        "utf8",
      );
      await writeFile(
        join(root, "current-task.md"),
        "- [ ] 큐 재시도 로직 마무리\n- [x] lease 판정 정리\n",
        "utf8",
      );

      const { commitSha, source } = await createLocalRepositorySource(root);
      const plan = await scanRepository({ commitSha, source });
      const artifact = plan.artifacts.find(
        ({ path }) => path === "src/queue.ts",
      );
      expect(artifact?.rationales).toHaveLength(1);
      expect(
        plan.artifacts.find(({ path }) => path === "current-task.md")
          ?.todoItems,
      ).toHaveLength(2);

      const repositoryId = (
        await database.query<{ id: string }>(
          "select public.ensure_local_repository($1, 'local/scanner-ext') as id",
          [workspace],
        )
      ).rows[0]!.id;
      await database.query(
        "select public.apply_repository_scan($1, $2, $3::jsonb)",
        [workspace, repositoryId, JSON.stringify(plan)],
      );

      // First-class node + provenance row + edge to the code artifact.
      const rationaleRows = await database.query<{
        adr_ref: string | null;
        kind: string;
        source_line: number;
        source_path: string;
        text: string;
      }>(
        "select kind, text, adr_ref, source_path, source_line from public.rationales where workspace_id = $1",
        [workspace],
      );
      expect(rationaleRows.rows).toEqual([
        {
          adr_ref: null,
          kind: "why",
          source_line: 1,
          source_path: "src/queue.ts",
          text: "lease 만료가 재시도보다 먼저 온다",
        },
      ]);
      const nodeRows = await database.query<{ kind: string }>(
        "select kind from public.graph_nodes where workspace_id = $1 and kind = 'rationale'",
        [workspace],
      );
      expect(nodeRows.rows).toHaveLength(1);

      // ADR-014: the engine reaches the artifact row as provenance. A
      // judgment summary written here must survive the rescan below —
      // `metadata` is merged, never replaced (asserted after the rescan).
      await database.query(
        `update public.artifacts set metadata = metadata || '{"summary":"판단 잡 요약"}'::jsonb
         where workspace_id = $1 and path = 'src/queue.ts'`,
        [workspace],
      );
      const edgeRows = await database.query<{
        provenance: { span?: { path?: string; startLine?: number } };
        relation: string;
      }>(
        "select relation, provenance from public.edges where workspace_id = $1",
        [workspace],
      );
      expect(edgeRows.rows).toHaveLength(1);
      expect(edgeRows.rows[0]!.relation).toBe("references");
      expect(edgeRows.rows[0]!.provenance.span).toMatchObject({
        path: "src/queue.ts",
        startLine: 1,
      });

      // Rescan without the rationale → the node disappears (sync, not append).
      await writeFile(
        join(root, "src", "queue.ts"),
        "export function claim() {}\n",
        "utf8",
      );
      const second = await createLocalRepositorySource(root);
      const secondPlan = await scanRepository({
        commitSha: second.commitSha,
        previousArtifacts: plan.artifacts,
        previousCommitSha: commitSha,
        source: second.source,
      });
      await database.query(
        "select public.apply_repository_scan($1, $2, $3::jsonb)",
        [workspace, repositoryId, JSON.stringify(secondPlan)],
      );
      expect(
        (
          await database.query(
            "select id from public.rationales where workspace_id = $1",
            [workspace],
          )
        ).rows,
      ).toEqual([]);

      // The rescan refreshed the engine provenance without clobbering the
      // stored summary, and a non-code artifact carries no engine at all.
      const metadataRows = await database.query<{
        metadata: { summary?: string; symbolEngine?: string };
        path: string;
      }>(
        "select path, metadata from public.artifacts where workspace_id = $1 order by path",
        [workspace],
      );
      expect(
        metadataRows.rows.find(({ path }) => path === "src/queue.ts")?.metadata,
      ).toEqual({ summary: "판단 잡 요약", symbolEngine: "typescript-ast" });
      expect(
        metadataRows.rows.find(({ path }) => path === "current-task.md")
          ?.metadata,
      ).toEqual({});

      // Handoff file → todos rows → progress dashboard board.
      const todoRows = await database.query<{
        id: string;
        requirement_id: string | null;
        source_event_id: string | null;
        source_kind: string;
        source_path: string | null;
        source_span: unknown;
        status: string;
        title: string;
        updated_at: string;
      }>(
        `select id, requirement_id, source_event_id, source_kind, source_path,
                source_span, status, title, updated_at
         from public.todos where workspace_id = $1 order by title`,
        [workspace],
      );
      expect(todoRows.rows.map(({ source_path }) => source_path)).toEqual([
        "current-task.md",
        "current-task.md",
      ]);

      const dashboard = buildWorkspaceProgressReport({
        edges: [],
        findings: [],
        progressEvents: [],
        receipts: [],
        requirements: [],
        todos: todoRows.rows.map((row) => ({
          ...row,
          updated_at: String(row.updated_at),
        })),
      });
      const boardTitles = dashboard.columns.flatMap(({ items }) =>
        items.map(({ title }) => title),
      );
      expect(boardTitles).toContain("큐 재시도 로직 마무리");
      expect(
        dashboard.columns.find(({ status }) => status === "done")?.items,
      ).toEqual([expect.objectContaining({ title: "lease 판정 정리" })]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("repository scan settings (.alrescha.json)", () => {
  function treeOf(paths: readonly string[]): RepositoryTree {
    return {
      entries: paths.map((path, index) => ({
        mode: "100644",
        path,
        sha: index.toString(16).padStart(40, "0"),
        size: 80,
        type: "blob" as const,
      })),
      treeSha: "d".repeat(40),
      truncated: false,
    };
  }

  function sourceOf(files: Record<string, string>): RepositorySource {
    return {
      fetchContent: async (path) => {
        const body = files[path];
        if (body === undefined) throw new Error(`no such file: ${path}`);
        return new TextEncoder().encode(body);
      },
      listTree: async () => treeOf(Object.keys(files)),
    };
  }

  it("honours the repository's own ignore list", async () => {
    const files = {
      ".alrescha.json": JSON.stringify({ ignore: [".omo/**", "notes/*.md"] }),
      ".omo/evidence/run.md": "# Run\n",
      "README.md": "# Readme\n",
      "notes/scratch.md": "# Scratch\n",
      "src/keep.ts": "export const keep = 1;\n",
    };
    const plan = await scanRepository({
      commitSha: "a".repeat(40),
      source: sourceOf(files),
    });

    // OQ-043: evidence logs are in scope by default — the CLI used to drop
    // them and the GitHub path kept them — so the way out is the repository
    // saying so, in a file both ingest paths read from the same commit.
    expect(plan.artifacts.map(({ path }) => path).sort()).toEqual([
      ".alrescha.json",
      "README.md",
      "src/keep.ts",
    ]);
  });

  it("scans everything when the settings file is absent or unreadable", async () => {
    const paths = [".omo/evidence/run.md", "README.md"];
    const withoutConfig = await scanRepository({
      commitSha: "a".repeat(40),
      source: sourceOf({
        ".omo/evidence/run.md": "# Run\n",
        "README.md": "# Readme\n",
      }),
    });
    const withBrokenConfig = await scanRepository({
      commitSha: "a".repeat(40),
      source: sourceOf({
        ".alrescha.json": "{ not json",
        ".omo/evidence/run.md": "# Run\n",
        "README.md": "# Readme\n",
      }),
    });

    expect(withoutConfig.artifacts.map(({ path }) => path).sort()).toEqual(
      [...paths].sort(),
    );
    // A settings file with a typo is a setting we do not have, not a scan
    // that fails or a repository that silently loses half its notes.
    expect(withBrokenConfig.artifacts.map(({ path }) => path).sort()).toEqual(
      [".alrescha.json", ...paths].sort(),
    );
  });
});

describe("repository layout config", () => {
  function treeOf(files: Record<string, string>): RepositoryTree {
    return {
      entries: Object.keys(files).map((path, index) => ({
        mode: "100644",
        path,
        sha: index.toString(16).padStart(40, "0"),
        size: 120,
        type: "blob" as const,
      })),
      treeSha: "d".repeat(40),
      truncated: false,
    };
  }

  function sourceOf(files: Record<string, string>): RepositorySource {
    return {
      fetchContent: async (path) => {
        const body = files[path];
        if (body === undefined) throw new Error(`no such file: ${path}`);
        return new TextEncoder().encode(body);
      },
      listTree: async () => treeOf(files),
    };
  }

  const CONFIG = {
    ignore: ["notes/**"],
    layers: { hidden: ["statistical", "semantic"] },
    layout: { backend: ["svc/"], database: ["store/"] },
    progressDocs: ["PROGRESS.md"],
    todoFiles: ["BACKLOG.md"],
  };

  it("carries the parsed conventions in the plan, never the file's text", async () => {
    const plan = await scanRepository({
      commitSha: "a".repeat(40),
      source: sourceOf({
        ".alrescha.json": JSON.stringify(CONFIG, null, 2),
        "svc/orders.ts": "export const orders = 1;\n",
      }),
    });

    expect(plan.layoutConfig).toEqual({
      ignore: ["notes/**"],
      layersHidden: ["statistical", "semantic"],
      layout: { backend: ["svc/"], database: ["store/"] },
      progressDocs: ["PROGRESS.md"],
      todoFiles: ["BACKLOG.md"],
    });
    // Parsed values travel; the document does not (WORK_SPEC §3-3). The
    // source file nests `hidden` under `layers`; what leaves the scan is
    // the parser's own five keys, with no formatting and no unknown fields.
    expect(Object.keys(plan.layoutConfig).sort()).toEqual([
      "ignore",
      "layersHidden",
      "layout",
      "progressDocs",
      "todoFiles",
    ]);
    expect(JSON.stringify(plan.layoutConfig)).not.toContain("hidden");
  });

  it("states an empty config for a repository that says nothing", async () => {
    const plan = await scanRepository({
      commitSha: "a".repeat(40),
      source: sourceOf({ "src/index.ts": "export const x = 1;\n" }),
    });

    expect(plan.layoutConfig).toEqual({
      ignore: [],
      layersHidden: [],
      layout: {},
      progressDocs: [],
      todoFiles: [],
    });
  });

  it("ignores keys it does not understand rather than failing the scan", async () => {
    const plan = await scanRepository({
      commitSha: "a".repeat(40),
      source: sourceOf({
        ".alrescha.json": JSON.stringify({
          futureSetting: { deeply: ["nested"] },
          layout: { galaxy: ["everything/"] },
        }),
        "src/index.ts": "export const x = 1;\n",
      }),
    });

    expect(plan.layoutConfig.layout).toEqual({});
    expect(plan.artifacts.map(({ path }) => path)).toContain("src/index.ts");
  });
});
