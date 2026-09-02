import type { PGlite, Transaction } from "@electric-sql/pglite";

/**
 * The slice of postgres.js's `Sql` that the worker stores use — the tagged
 * template, `sql.json()`, and `sql.begin()` — over a PGlite database, so a
 * store class can be exercised against the real migrations without a server.
 *
 * Kept deliberately narrow: parameters become `$n` placeholders, `json()`
 * values are sent as JSON text (the stores always cast them `::jsonb`), and
 * string arrays become array literals for `= any($n::text[])`.
 */

interface JsonParam {
  readonly __json: string;
}

type Queryable = Pick<PGlite, "query"> | Pick<Transaction, "query">;

function serialize(value: unknown): unknown {
  if (value !== null && typeof value === "object" && "__json" in value) {
    return (value as JsonParam).__json;
  }
  if (Array.isArray(value)) {
    return `{${value
      .map((item) => `"${String(item).replace(/(["\\])/g, "\\$1")}"`)
      .join(",")}}`;
  }
  return value;
}

function tag(target: Queryable) {
  const run = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce(
      (query, part, index) => `${query}$${index}${part}`,
    );
    const result = await target.query(text, values.map(serialize));
    return result.rows;
  };
  return run;
}

export function pgliteSql(database: PGlite) {
  const root = tag(database) as ReturnType<typeof tag> & {
    begin: <T>(callback: (tx: ReturnType<typeof tag>) => Promise<T>) => Promise<T>;
    json: (value: unknown) => JsonParam;
  };
  root.json = (value: unknown) => ({ __json: JSON.stringify(value) });
  root.begin = <T>(callback: (tx: ReturnType<typeof tag>) => Promise<T>) =>
    database.transaction(async (transaction) => callback(tag(transaction)));
  return root;
}
