import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  classifyArtifactPath,
  extractRationales,
  extractSymbols,
  scanRepository,
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

  it("still classifies ordinary documents as before", () => {
    expect(classifyArtifactPath("docs/guide.md")).toBeNull();
    expect(classifyArtifactPath("TODO.md")).toBe("todo_progress");
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
      expect.objectContaining({ kind: "function", name: "decide", startLine: 1 }),
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
      const artifact = plan.artifacts.find(({ path }) => path === "src/queue.ts");
      expect(artifact?.rationales).toHaveLength(1);
      expect(
        plan.artifacts.find(({ path }) => path === "current-task.md")?.todoItems,
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
      ).toEqual([
        expect.objectContaining({ title: "lease 판정 정리" }),
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
