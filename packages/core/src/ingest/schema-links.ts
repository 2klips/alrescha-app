import type { CodeLinkSpan, CodeLinkTier } from "./code-links";

/**
 * Database objects and the edges that reach them (Phase 4 Wave A′ todo 7,
 * design ① / Graphify).
 *
 * A repository's tables are a hub it already has: every migration defines
 * them, every alter touches them, and the code that reads them names them in
 * a string. None of that needs a database connection or a query planner — it
 * is in the files the scan already holds.
 *
 * Two tiers, the same honesty as everywhere else:
 * - `resolved` — the SQL says it. `create table x`, `alter table x`,
 *   `references x(id)`.
 * - `reference` — code names a string that happens to be an object this
 *   repository owns (`.from("todos")`). It is a name match, and a name match
 *   is not proof that the call reaches that table.
 *
 * **Only names and lines travel.** Column lists, function bodies and the
 * statements around them stay in the file (WORK_SPEC §3-3): a table name is
 * identifier metadata, the DDL that declares it is a source body.
 */

export type DbObjectKind = "function" | "table" | "view";

export interface DbObject {
  readonly kind: DbObjectKind;
  /** Unqualified name; `public.` and quoting are stripped. */
  readonly name: string;
  readonly sourcePath: string;
  readonly span: CodeLinkSpan;
}

export type SchemaLinkKind = "defines" | "modifies" | "queries" | "references";

export interface SchemaLink {
  readonly kind: SchemaLinkKind;
  readonly method: "sql-structural" | "table-literal";
  /**
   * The object a foreign key departs from; null when the file itself is the
   * source, as it is for `defines`, `modifies` and `queries`.
   */
  readonly sourceObject: string | null;
  /** The file the statement is written in. Always a real path. */
  readonly sourcePath: string;
  readonly span: CodeLinkSpan;
  readonly targetObject: string;
  readonly tier: CodeLinkTier;
}

export interface ParsedSchemaFile {
  readonly links: readonly SchemaLink[];
  readonly objects: readonly DbObject[];
}

const CREATE_TABLE = /^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/i;
const CREATE_FUNCTION =
  /^\s*create\s+(?:or\s+replace\s+)?function\s+([\w."]+)/i;
const CREATE_VIEW =
  /^\s*create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+([\w."]+)/i;
const ALTER_TABLE = /^\s*alter\s+table\s+(?:if\s+exists\s+)?([\w."]+)/i;
const FOREIGN_KEY = /\breferences\s+([\w."]+)\s*\(/gi;

/** `public."my_table"` → `my_table`. Schema qualification is not identity. */
function bareName(written: string): string {
  const last = written.split(".").pop() ?? written;
  return last.replaceAll('"', "").trim().toLowerCase();
}

function span(line: number): CodeLinkSpan {
  return { endLine: line, startLine: line };
}

/**
 * Objects a schema file declares and the edges its statements imply.
 *
 * Statement tracking is deliberately linear: the object a foreign key belongs
 * to is whichever table was last opened by a `create table` or `alter table`
 * above it. That is what a migration looks like, and a parser that tried to
 * be cleverer would need a SQL grammar the scan has no reason to carry
 * (ADR-014's rule, applied here).
 */
export function parseSchemaFile(input: {
  readonly path: string;
  readonly source: string;
}): ParsedSchemaFile {
  const objects: DbObject[] = [];
  const links: SchemaLink[] = [];
  const declared = new Set<string>();
  let current: string | null = null;

  input.source.split(/\r?\n/).forEach((text, index) => {
    const line = index + 1;
    const table = CREATE_TABLE.exec(text);
    const view = table ? null : CREATE_VIEW.exec(text);
    const routine = table || view ? null : CREATE_FUNCTION.exec(text);
    const altered = table || view || routine ? null : ALTER_TABLE.exec(text);

    const created = table ?? view ?? routine;
    if (created?.[1]) {
      const name = bareName(created[1]);
      current = name;
      if (!declared.has(name)) {
        declared.add(name);
        objects.push({
          kind: table ? "table" : view ? "view" : "function",
          name,
          sourcePath: input.path,
          span: span(line),
        });
      }
      links.push({
        kind: "defines",
        method: "sql-structural",
        sourceObject: null,
        sourcePath: input.path,
        span: span(line),
        targetObject: name,
        tier: "resolved",
      });
    } else if (altered?.[1]) {
      current = bareName(altered[1]);
      links.push({
        kind: "modifies",
        method: "sql-structural",
        sourceObject: null,
        sourcePath: input.path,
        span: span(line),
        targetObject: current,
        tier: "resolved",
      });
    }

    for (const [, referenced] of text.matchAll(FOREIGN_KEY)) {
      if (!referenced || current === null) continue;
      const target = bareName(referenced);
      if (target === current) continue;
      links.push({
        kind: "references",
        method: "sql-structural",
        sourceObject: current,
        sourcePath: input.path,
        span: span(line),
        targetObject: target,
        tier: "resolved",
      });
    }
  });

  return { links, objects };
}

/**
 * Table and function names a code file names in a string literal.
 *
 * The five conventions that put the name in the call: Supabase's `.from()`
 * and `.rpc()`, SQLAlchemy's `__tablename__` and `Table()`, and Prisma's
 * model accessor. A name built at run time — `.from(tableName)` — is not
 * here and cannot be: the scan reads text, and the value only exists while
 * the program runs. That is a known blind spot, not an oversight.
 */
const QUERY_LITERALS: readonly RegExp[] = [
  /\.from\(\s*['"`]([\w.]+)['"`]/g,
  /\.rpc\(\s*['"`]([\w.]+)['"`]/g,
  /__tablename__\s*=\s*['"]([\w.]+)['"]/g,
  /\bTable\(\s*['"]([\w.]+)['"]/g,
  /\bprisma\.(\w+)\s*\./g,
];

export interface ParsedQueryReference {
  readonly line: number;
  readonly name: string;
}

export function parseQueryReferences(
  source: string,
): readonly ParsedQueryReference[] {
  const references: ParsedQueryReference[] = [];
  const seen = new Set<string>();
  source.split(/\r?\n/).forEach((text, index) => {
    for (const pattern of QUERY_LITERALS) {
      pattern.lastIndex = 0;
      for (const [, written] of text.matchAll(pattern)) {
        if (!written) continue;
        const name = bareName(written);
        const key = `${name}:${index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        references.push({ line: index + 1, name });
      }
    }
  });
  return references;
}

export interface ResolveSchemaLinksInput {
  readonly objects: readonly DbObject[];
  /** Query candidates per code file path, as parsed. */
  readonly queries: ReadonlyMap<string, readonly ParsedQueryReference[]>;
  readonly schemaLinks: readonly SchemaLink[];
}

/**
 * Keep the links whose target this repository actually owns.
 *
 * A foreign key to a table no migration in the tree declares, and a
 * `.from("stripe_customers")` in a project with no such table, both point
 * outside the repository. The graph says nothing rather than inventing a
 * node for a table it has never seen.
 */
export function resolveSchemaLinks({
  objects,
  queries,
  schemaLinks,
}: ResolveSchemaLinksInput): readonly SchemaLink[] {
  const owned = new Set(objects.map(({ name }) => name));
  const resolved: SchemaLink[] = schemaLinks.filter(({ targetObject }) =>
    owned.has(targetObject),
  );
  const seen = new Set<string>();

  for (const [path, references] of queries) {
    for (const { line, name } of references) {
      if (!owned.has(name)) continue;
      const key = `${path}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push({
        kind: "queries",
        method: "table-literal",
        sourceObject: null,
        sourcePath: path,
        span: span(line),
        targetObject: name,
        tier: "reference",
      });
    }
  }

  return resolved.sort(
    (left, right) =>
      left.sourcePath.localeCompare(right.sourcePath) ||
      (left.sourceObject ?? "").localeCompare(right.sourceObject ?? "") ||
      left.targetObject.localeCompare(right.targetObject) ||
      left.kind.localeCompare(right.kind) ||
      left.span.startLine - right.span.startLine,
  );
}
