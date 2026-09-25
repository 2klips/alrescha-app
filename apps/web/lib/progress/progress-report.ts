import {
  buildProgressDashboard,
  type ProgressDashboard,
  type ProgressTodo,
} from "@alrescha/core";
import { storedInTotoStatementSchema } from "@alrescha/core/receipts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PROGRESS } from "../strings";
import {
  EVERY_ROW,
  readRowsById,
  type TableQuery,
} from "../supabase/table-pages";

interface RequirementRow {
  id: string;
  status: string;
}
interface EdgeRow {
  relation: string;
  source_node_id: string;
}
interface TodoRow {
  id: string;
  requirement_id: string | null;
  source_event_id: string | null;
  source_kind: string;
  source_path: string | null;
  source_span: unknown;
  status: string;
  title: string;
  updated_at: string;
}
interface ProgressEventRow {
  id: string;
  occurred_at: string;
  refs: string[];
  status: string;
  summary: string;
  task: string;
  todo_id: string | null;
}
interface ReceiptRow {
  commit_sha: string;
  created_at: string;
  summary: unknown;
}
interface LocalScanRow {
  commit_sha: string | null;
  completed_at: string | null;
  trigger_key: string;
}
interface FindingRow {
  id: string;
  resolved_at: string | null;
  title: string;
}

/** The digest's inputs that do not come from a table (todo 19 ②). */
export interface ProgressSession {
  /** Null means this member has never opened the screen. */
  readonly lastVisitedAt: string | null;
}

export interface WorkspaceProgressRows {
  readonly edges: readonly EdgeRow[];
  readonly findings: readonly FindingRow[];
  /** Runs the CLI applied, which write no receipt (todo 19 ⑸). */
  readonly localScans?: readonly LocalScanRow[];
  readonly progressEvents: readonly ProgressEventRow[];
  readonly receipts: readonly ReceiptRow[];
  readonly requirements: readonly RequirementRow[];
  readonly todos: readonly TodoRow[];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function todoFromRow(row: TodoRow): ProgressTodo | null {
  if (!["open", "in-progress", "done", "blocked"].includes(row.status))
    return null;
  if (row.source_kind === "progress_event" && row.source_event_id) {
    return {
      id: row.id,
      requirementId: row.requirement_id,
      source: { eventId: row.source_event_id, kind: "progress-event" },
      status: row.status as ProgressTodo["status"],
      title: row.title,
      updatedAt: row.updated_at,
    };
  }
  const span = record(row.source_span);
  if (
    row.source_kind !== "document" ||
    !row.source_path ||
    typeof span.startLine !== "number" ||
    typeof span.endLine !== "number"
  )
    return null;
  return {
    id: row.id,
    requirementId: row.requirement_id,
    source: {
      endLine: span.endLine,
      kind: "document",
      path: row.source_path,
      startLine: span.startLine,
    },
    status: row.status as ProgressTodo["status"],
    title: row.title,
    updatedAt: row.updated_at,
  };
}

/**
 * What the commit entry says it measured.
 *
 * The receipt already carries deterministic coverage in its statement
 * (WORK_SPEC §13), so the timeline can name it without a schema change —
 * before this every commit read `Receipt recorded for <sha7>`, which told a
 * reader nothing about the analysis it stands for (R5 §4.2).
 */
function receiptSummary(row: ReceiptRow): string {
  const summary = record(row.summary);
  const statement = storedInTotoStatementSchema.safeParse(summary["statement"]);
  if (statement.success) {
    const { coverage } = statement.data.predicate;
    return PROGRESS.timeline.receiptCoverage(
      coverage.requirements,
      coverage.implVerified,
      coverage.testVerified,
    );
  }
  for (const key of ["title", "message", "commit"]) {
    if (typeof summary[key] === "string" && summary[key]) return summary[key];
  }
  return PROGRESS.timeline.receiptWithoutStatement(row.commit_sha.slice(0, 7));
}

export function buildWorkspaceProgressReport(
  rows: WorkspaceProgressRows,
  session: { lastVisitedAt?: string | null; now?: string } = {},
): ProgressDashboard {
  const activeRequirementIds = new Set(
    rows.requirements
      .filter(({ status }) => status === "active")
      .map(({ id }) => id),
  );
  const implementsEdges = rows.edges.filter(
    ({ relation }) => relation === "implements",
  );
  const coveredRequirementIds = new Set(
    implementsEdges
      .filter(({ source_node_id }) => activeRequirementIds.has(source_node_id))
      .map(({ source_node_id }) => source_node_id),
  );
  return buildProgressDashboard({
    ...(session.lastVisitedAt === undefined
      ? {}
      : { lastVisitedAt: session.lastVisitedAt }),
    ...(session.now === undefined ? {} : { now: session.now }),
    commits: rows.receipts.map((receipt) => ({
      occurredAt: receipt.created_at,
      sha: receipt.commit_sha,
      summary: receiptSummary(receipt),
    })),
    localScans: (rows.localScans ?? []).flatMap((run) =>
      run.commit_sha && run.completed_at
        ? [{ occurredAt: run.completed_at, sha: run.commit_sha }]
        : [],
    ),
    findings: rows.findings.flatMap((finding) =>
      finding.resolved_at
        ? [
            {
              id: finding.id,
              occurredAt: finding.resolved_at,
              title: finding.title,
            },
          ]
        : [],
    ),
    progressEvents: rows.progressEvents.flatMap((event) =>
      event.todo_id &&
      ["started", "progress", "done", "blocked"].includes(event.status)
        ? [
            {
              id: event.id,
              occurredAt: event.occurred_at,
              refs: event.refs,
              status: event.status as
                "started" | "progress" | "done" | "blocked",
              summary: event.summary,
              task: event.task,
              todoId: event.todo_id,
            },
          ]
        : [],
    ),
    requirements: {
      covered: coveredRequirementIds.size,
      // Repository-wide, not just the active requirements: no `implements`
      // edge anywhere means coverage was never linked, which is a different
      // statement from "linked, and none of these requirements is covered".
      links: implementsEdges.length,
      total: activeRequirementIds.size,
    },
    todos: rows.todos.flatMap((todo) => {
      const parsed = todoFromRow(todo);
      return parsed ? [parsed] : [];
    }),
  });
}

export async function loadWorkspaceProgressReport(
  client: SupabaseClient,
  userId: string,
): Promise<{ report: ProgressDashboard; workspaceId: string }> {
  const workspaceResult = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspaceResult.error || !workspaceResult.data) {
    throw new Error("Personal workspace is unavailable.");
  }
  const workspaceId = String(workspaceResult.data.id);
  const inWorkspace = <Row>(query: TableQuery<Row>) =>
    query.eq("workspace_id", workspaceId);
  const [requirements, edges, todos, events, receipts, findings, localScans] =
    await Promise.all([
      // The ledger is a count, so its three reads have no budget and page
      // past PostgREST's row cap (RE-04): the server answers with at most
      // 1,000 rows and says nothing, and a capped page under-reported every
      // number on the screen. Todos come in id order, the order they were
      // written; the reads below with a budget of 100 stay one request.
      readRowsById<RequirementRow>(
        client,
        "requirements",
        "id,status",
        EVERY_ROW,
        inWorkspace,
      ),
      // `id` is selected only to continue past a page.
      readRowsById<EdgeRow & { readonly id: string }>(
        client,
        "edges",
        "id,relation,source_node_id",
        EVERY_ROW,
        (query) => inWorkspace(query).eq("relation", "implements"),
      ),
      readRowsById<TodoRow>(
        client,
        "todos",
        "id,requirement_id,source_event_id,source_kind,source_path,source_span,status,title,updated_at",
        EVERY_ROW,
        inWorkspace,
      ),
      client
        .from("progress_events")
        .select("id,occurred_at,refs,status,summary,task,todo_id")
        .eq("workspace_id", workspaceId)
        .order("occurred_at", { ascending: false })
        .limit(100),
      client
        .from("receipts")
        .select("commit_sha,created_at,summary")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100),
      client
        .from("findings")
        .select("id,resolved_at,title")
        .eq("workspace_id", workspaceId)
        .eq("status", "resolved")
        .not("resolved_at", "is", null)
        .order("resolved_at", { ascending: false })
        .limit(100),
      // `alrescha push` records a `manual` run keyed `local:<sha>` and writes
      // no receipt, so a repository maintained entirely through the CLI had
      // an empty ledger while its graph was updated daily (todo 19 ⑸).
      client
        .from("runs")
        .select("commit_sha,completed_at,trigger_key")
        .eq("workspace_id", workspaceId)
        .like("trigger_key", "local:%")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(100),
    ]);
  if (
    [requirements, edges, todos, events, receipts, findings, localScans].some(
      ({ error }) => error,
    )
  ) {
    throw new Error("Progress dashboard is unavailable.");
  }
  /**
   * Read the previous visit and stamp this one, in that order (todo 19 ⑵).
   * A failure here costs the digest's third window and nothing else: a
   * screen that would not render because it could not remember being opened
   * would be a worse trade than a missing line.
   */
  const visit = await client.rpc("touch_screen_view", {
    target_screen: "progress",
    target_workspace_id: workspaceId,
  });
  const lastVisitedAt =
    !visit.error && typeof visit.data === "string" ? visit.data : null;

  return {
    report: buildWorkspaceProgressReport(
      {
        edges: edges.data,
        findings: (findings.data ?? []) as FindingRow[],
        localScans: (localScans.data ?? []) as LocalScanRow[],
        progressEvents: (events.data ?? []) as ProgressEventRow[],
        receipts: (receipts.data ?? []) as ReceiptRow[],
        requirements: requirements.data,
        todos: todos.data,
      },
      { lastVisitedAt },
    ),
    workspaceId,
  };
}
