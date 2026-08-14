import {
  parseMarkdownStructure,
  type MarkdownSpan,
  type ParseMarkdownInput,
} from "../parser/markdown";

export type TodoStatus = "open" | "in-progress" | "done" | "blocked";

export interface DocumentTodoSource {
  readonly kind: "document";
  readonly path: string;
  readonly span: MarkdownSpan;
}

export interface ParsedTodoItem {
  readonly source: DocumentTodoSource;
  readonly sourceKey: string;
  readonly status: "open" | "done";
  readonly title: string;
}

export function parseTodoDocument(input: ParseMarkdownInput): ParsedTodoItem[] {
  return parseMarkdownStructure(input).tasks.map((task) => ({
    source: {
      kind: "document",
      path: input.path,
      span: task.span,
    },
    sourceKey: `document:${input.path}:${task.span.startByte}`,
    status: task.checked ? "done" : "open",
    title: task.text,
  }));
}
