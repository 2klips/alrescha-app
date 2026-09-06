import { createHash } from "node:crypto";

import {
  parseMarkdownStructure,
  type MarkdownSpan,
  type ParseMarkdownInput,
  type ParsedTask,
  type TaskMarker,
} from "../parser/markdown";

export type TodoStatus = "open" | "in-progress" | "done" | "blocked";

export interface DocumentTodoSource {
  readonly kind: "document";
  readonly path: string;
  readonly span: MarkdownSpan;
}

export interface ParsedTodoItem {
  /** Source key of the enclosing task, when this one is nested under it. */
  readonly parentKey: string | null;
  readonly source: DocumentTodoSource;
  readonly sourceKey: string;
  readonly status: TodoStatus;
  readonly title: string;
}

/**
 * What a checkbox marker means. `[~]` and `[/]` are the two conventions for
 * "started", `[-]` for "parked"; anything else GFM parsed is open or done.
 */
const STATUS_BY_MARKER: Readonly<Record<TaskMarker, TodoStatus>> = {
  " ": "open",
  "-": "blocked",
  "/": "in-progress",
  x: "done",
  "~": "in-progress",
};

/**
 * Longest title a todo row stores, and the point this truncates at.
 *
 * The column has always had a 240-character CHECK, and a document with one
 * long checkbox therefore rolled back the *entire* scan — this repository's
 * own plan has eighteen items over 1,000 characters, so parsing its
 * checkboxes would have wedged its own ingest. Truncating follows the
 * rationale precedent (`MAX_RATIONALE_TEXT`): the graph keeps a usable title
 * and the scan keeps working.
 */
export const MAX_TODO_TITLE = 240;

/**
 * Identity of a checkbox across edits (Phase 4 Wave A todo 5, R5 §4.4).
 *
 * The key used to be the item's byte offset, so inserting a line at the top
 * of a document renamed every todo below it: on a ten-item document one id
 * survived a three-line insert, and that one was *misattributed* to a
 * different item. The title is what a person means by "that todo", so the
 * key is a hash of it, normalised for the whitespace and marker noise an
 * edit introduces, with a sequence number when a document repeats itself.
 *
 * The hash covers the *whole* title, not the truncated one, so two long
 * items that share a prefix stay distinct.
 */
function normalizedTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

function titleHash(title: string): string {
  return createHash("sha256")
    .update(normalizedTitle(title))
    .digest("hex")
    .slice(0, 16);
}

export function todoSourceKey(input: {
  readonly occurrence?: number;
  readonly path: string;
  readonly title: string;
}): string {
  const occurrence = input.occurrence ?? 1;
  const suffix = occurrence > 1 ? `#${occurrence}` : "";
  return `document:${input.path}:${titleHash(input.title)}${suffix}`;
}

/**
 * Truncate to what the column takes. Shared with the beads reader: a long
 * issue title has to be cut the same way a long checkbox is, or a
 * repository would fail its scan depending on which tool wrote its todos.
 */
export function truncateTodoTitle(title: string): string {
  return title.length <= MAX_TODO_TITLE
    ? title
    : `${title.slice(0, MAX_TODO_TITLE - 1)}…`;
}

export function parseTodoDocument(input: ParseMarkdownInput): ParsedTodoItem[] {
  const occurrences = new Map<string, number>();
  /** The most recent task seen at each depth, for `parentKey`. */
  const openAt = new Map<number, string>();
  const items: ParsedTodoItem[] = [];

  for (const task of parseMarkdownStructure(input).tasks as ParsedTask[]) {
    const title = task.text.trim();
    if (title.length === 0) continue;
    const hashKey = normalizedTitle(title);
    const occurrence = (occurrences.get(hashKey) ?? 0) + 1;
    occurrences.set(hashKey, occurrence);
    const sourceKey = todoSourceKey({
      occurrence,
      path: input.path,
      title,
    });

    // Nesting is depth-relative and documents are read top to bottom, so the
    // nearest shallower task still open above this one is its parent.
    let parentKey: string | null = null;
    for (let depth = task.depth - 1; depth >= 0; depth -= 1) {
      const candidate = openAt.get(depth);
      if (candidate) {
        parentKey = candidate;
        break;
      }
    }
    openAt.set(task.depth, sourceKey);
    for (const depth of [...openAt.keys()]) {
      if (depth > task.depth) openAt.delete(depth);
    }

    items.push({
      parentKey,
      source: { kind: "document", path: input.path, span: task.span },
      sourceKey,
      status: STATUS_BY_MARKER[task.marker],
      title: truncateTodoTitle(title),
    });
  }

  return items;
}
