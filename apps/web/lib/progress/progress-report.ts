import {
  buildProgressDashboard,
  type ProgressDashboard,
  type ProgressTodo,
} from "@alrescha/core";
import type { SupabaseClient } from "@supabase/supabase-js";

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
interface FindingRow {
  id: string;
  resolved_at: string | null;
  title: string;
}

export interface WorkspaceProgressRows {
  readonly edges: readonly EdgeRow[];
  readonly findings: readonly FindingRow[];
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

function receiptSummary(row: ReceiptRow): string {
  const summary = record(row.summary);
  for (const key of ["title", "message", "commit"]) {
    if (typeof summary[key] === "string" && summary[key]) return summary[key];
  }
  return `Receipt recorded for ${row.commit_sha.slice(0, 7)}`;
}

export function buildWorkspaceProgressReport(
  rows: WorkspaceProgressRows,
): ProgressDashboard {
  const activeRequirementIds = new Set(
    rows.requirements
      .filter(({ status }) => status === "active")
      .map(({ id }) => id),
  );
  const coveredRequirementIds = new Set(
    rows.edges
      .filter(
        ({ relation, source_node_id }) =>
          relation === "implements" && activeRequirementIds.has(source_node_id),
      )
      .map(({ source_node_id }) => source_node_id),
  );
  return buildProgressDashboard({
    commits: rows.receipts.map((receipt) => ({
      occurredAt: receipt.created_at,
      sha: receipt.commit_sha,
      summary: receiptSummary(receipt),
    })),
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
  const [requirements, edges, todos, events, receipts, findings] =
    await Promise.all([
      client
        .from("requirements")
        .select("id,status")
        .eq("workspace_id", workspaceId),
      client
        .from("edges")
        .select("relation,source_node_id")
        .eq("workspace_id", workspaceId)
        .eq("relation", "implements"),
      client
        .from("todos")
        .select(
          "id,requirement_id,source_event_id,source_kind,source_path,source_span,status,title,updated_at",
        )
        .eq("workspace_id", workspaceId),
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
    ]);
  if (
    [requirements, edges, todos, events, receipts, findings].some(
      ({ error }) => error,
    )
  ) {
    throw new Error("Progress dashboard is unavailable.");
  }
  return {
    report: buildWorkspaceProgressReport({
      edges: (edges.data ?? []) as EdgeRow[],
      findings: (findings.data ?? []) as FindingRow[],
      progressEvents: (events.data ?? []) as ProgressEventRow[],
      receipts: (receipts.data ?? []) as ReceiptRow[],
      requirements: (requirements.data ?? []) as RequirementRow[],
      todos: (todos.data ?? []) as TodoRow[],
    }),
    workspaceId,
  };
}
