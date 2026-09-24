import type { PGlite } from "@electric-sql/pglite";

/**
 * A small PostgREST over PGlite, for reading the way the hosted store reads
 * (RE-04).
 *
 * The hosted MCP store never speaks SQL: it builds PostgREST requests with
 * supabase-js, and what it pays for is what those requests return. Tests
 * that fake the query builder pin which calls are made but not what they
 * cost or what a server does with them. This turns the requests the real
 * client sends into SQL on a real PostgreSQL (PGlite with every migration),
 * serialises rows the way PostgREST does — `row_to_json`, in query order —
 * and records, per request, the rows, the bytes and the time the database
 * took.
 *
 * It reads only the shapes this repository's store sends: `select` of plain
 * columns, `eq`/`neq`/`is`/`in`/`gt`/`gte`/`lt`/`lte` filters, an `or` over
 * those, `order`, `limit`/`offset`, `Prefer: count=exact`, and `rpc` calls
 * of scalar functions. Anything else is answered 501 so a test cannot pass
 * on a shape the emulator silently misread.
 *
 * `maxRows` is PostgREST's `db-max-rows`: no response carries more rows than
 * it, whatever `limit` asked for. Supabase's default is 1,000 — the value in
 * `supabase/config.toml`.
 */

export interface PostgrestRequestRecord {
  /** Response body, in bytes. */
  readonly bytes: number;
  readonly kind: "rpc" | "table";
  readonly method: string;
  /** Time the database took, count query included. */
  readonly ms: number;
  /** The table or function. */
  readonly name: string;
  /** Rows in the response; null for an rpc. */
  readonly rows: number | null;
  readonly status: number;
  /** The whole request URL — what a gateway would have been handed. */
  readonly url: string;
  readonly urlChars: number;
}

export interface PostgrestPgliteOptions {
  /** PostgREST's `db-max-rows`. Omitted means no server cap. */
  readonly maxRows?: number;
  /**
   * Run each statement as this role, the way PostgREST switches to the
   * JWT's role. `service_role` bypasses row security but not grants, so a
   * table the role cannot read fails here as it would hosted.
   */
  readonly role?: "service_role";
}

export interface PostgrestPglite {
  readonly fetch: typeof fetch;
  readonly requests: PostgrestRequestRecord[];
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const OPERATORS: Readonly<Record<string, string>> = {
  eq: "=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  neq: "<>",
};

class Unsupported extends Error {}

function identifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Unsupported(`identifier ${name}`);
  return `"${name}"`;
}

/** Split on commas that are not inside parentheses. */
function topLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

class Query {
  readonly params: unknown[] = [];

  param(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  /** `column` + `op.value`, as a condition. */
  condition(column: string, filter: string): string {
    const name = identifier(column);
    const dot = filter.indexOf(".");
    if (dot < 0) throw new Unsupported(`filter ${filter}`);
    const operator = filter.slice(0, dot);
    const value = filter.slice(dot + 1);
    if (operator === "is") {
      if (value === "null") return `${name} is null`;
      throw new Unsupported(`is.${value}`);
    }
    if (operator === "in") {
      if (!value.startsWith("(") || !value.endsWith(")")) {
        throw new Unsupported(`in ${value}`);
      }
      const items = value.slice(1, -1);
      const list = items.length === 0 ? [] : items.split(",");
      // Values the client quoted arrive quoted; these reads send ULIDs and
      // plain words, so a quote means a shape this emulator does not read.
      if (list.some((item) => item.startsWith('"'))) {
        throw new Unsupported("quoted in-list value");
      }
      // The parameter takes the column's type, as PostgREST's does, so the
      // column's indexes stay usable and the timings mean something.
      return `${name} = any(${this.param(list)})`;
    }
    const sql = OPERATORS[operator];
    if (!sql) throw new Unsupported(`operator ${operator}`);
    return `${name} ${sql} ${this.param(value)}`;
  }

  /** `(a.in.(…),b.eq.x)` as one disjunction. */
  disjunction(value: string): string {
    if (!value.startsWith("(") || !value.endsWith(")")) {
      throw new Unsupported(`or ${value}`);
    }
    const terms = topLevel(value.slice(1, -1)).map((term) => {
      const dot = term.indexOf(".");
      if (dot < 0) throw new Unsupported(`or term ${term}`);
      return this.condition(term.slice(0, dot), term.slice(dot + 1));
    });
    return `(${terms.join(" or ")})`;
  }
}

function order(value: string): string {
  return value
    .split(",")
    .map((term) => {
      const [column = "", direction = "asc", nulls] = term.split(".");
      if (direction !== "asc" && direction !== "desc") {
        throw new Unsupported(`order ${term}`);
      }
      const tail =
        nulls === undefined
          ? ""
          : nulls === "nullsfirst"
            ? " nulls first"
            : nulls === "nullslast"
              ? " nulls last"
              : (() => {
                  throw new Unsupported(`order ${term}`);
                })();
      return `${identifier(column)} ${direction}${tail}`;
    })
    .join(", ");
}

function json(
  body: string,
  status: number,
  headers: Record<string, string> = {},
) {
  return new Response(body, {
    headers: { "content-type": "application/json", ...headers },
    status,
  });
}

export function postgrestOverPglite(
  database: PGlite,
  options: PostgrestPgliteOptions = {},
): PostgrestPglite {
  const requests: PostgrestRequestRecord[] = [];
  const signatures = new Map<string, Map<string, string>>();

  async function run<T>(
    sql: string,
    params: unknown[],
  ): Promise<{ ms: number; rows: T[] }> {
    const started = performance.now();
    const result = options.role
      ? await database.transaction(async (transaction) => {
          await transaction.exec(`set local role ${options.role}`);
          return transaction.query<T>(sql, params);
        })
      : await database.query<T>(sql, params);
    return { ms: performance.now() - started, rows: result.rows };
  }

  /** The declared type of each argument, so a named call can cast. */
  async function argumentTypes(name: string): Promise<Map<string, string>> {
    const known = signatures.get(name);
    if (known) return known;
    const result = await database.query<{ name: string; type: string }>(
      `select unnest(p.proargnames) as name,
              format_type(unnest(p.proargtypes::oid[]), null) as type
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = $1`,
      [name],
    );
    const types = new Map(result.rows.map((row) => [row.name, row.type]));
    signatures.set(name, types);
    return types;
  }

  async function table(
    name: string,
    url: URL,
    prefer: string,
  ): Promise<{
    body: string;
    headers: Record<string, string>;
    ms: number;
    rows: number;
  }> {
    const query = new Query();
    let columns = "*";
    let orderBy = "";
    let limit: number | null = null;
    let offset = 0;
    const conditions: string[] = [];
    for (const [key, value] of url.searchParams) {
      if (key === "select") {
        columns =
          value === "*"
            ? "*"
            : value
                .split(",")
                .map((column) => identifier(column.trim()))
                .join(", ");
      } else if (key === "order") {
        orderBy = order(value);
      } else if (key === "limit") {
        limit = Number(value);
      } else if (key === "offset") {
        offset = Number(value);
      } else if (key === "or") {
        conditions.push(query.disjunction(value));
      } else {
        conditions.push(query.condition(key, value));
      }
    }
    const effective =
      options.maxRows === undefined
        ? limit
        : Math.min(limit ?? options.maxRows, options.maxRows);
    const where =
      conditions.length > 0 ? ` where ${conditions.join(" and ")}` : "";
    const from = `public.${identifier(name)}${where}`;
    const select =
      `select row_to_json(x)::text as row from (select ${columns} from ${from}` +
      (orderBy ? ` order by ${orderBy}` : "") +
      (effective === null ? "" : ` limit ${effective}`) +
      (offset > 0 ? ` offset ${offset}` : "") +
      ") x";
    const rows = await run<{ row: string }>(select, query.params);
    let ms = rows.ms;
    let total: number | null = null;
    if (/count=exact/.test(prefer)) {
      const counted = await run<{ total: number }>(
        `select count(*)::int as total from ${from}`,
        query.params,
      );
      ms += counted.ms;
      total = counted.rows[0]?.total ?? 0;
    }
    const n = rows.rows.length;
    const range = n === 0 ? "*" : `${offset}-${offset + n - 1}`;
    return {
      body: `[${rows.rows.map(({ row }) => row).join(",")}]`,
      headers: { "content-range": `${range}/${total ?? "*"}` },
      ms,
      rows: n,
    };
  }

  async function rpc(
    name: string,
    body: string,
  ): Promise<{ body: string; ms: number }> {
    identifier(name);
    const args = (body ? JSON.parse(body) : {}) as Record<string, unknown>;
    const types = await argumentTypes(name);
    const query = new Query();
    const named = Object.entries(args).map(([key, value]) => {
      const type = types.get(key);
      if (!type) throw new Unsupported(`argument ${key} of ${name}`);
      return `${identifier(key)} => ${query.param(value)}::${type}`;
    });
    const result = await run<{ body: string | null }>(
      `select to_json(public.${identifier(name)}(${named.join(", ")}))::text as body`,
      query.params,
    );
    return { body: result.rows[0]?.body ?? "null", ms: result.ms };
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const path = url.pathname.replace(/^\/rest\/v1\//, "");
    const record = (
      kind: "rpc" | "table",
      name: string,
      status: number,
      bytes: number,
      ms: number,
      rows: number | null,
    ) =>
      requests.push({
        bytes,
        kind,
        method,
        ms,
        name,
        rows,
        status,
        url: url.toString(),
        urlChars: url.toString().length,
      });
    try {
      if (path.startsWith("rpc/") && method === "POST") {
        const name = path.slice("rpc/".length);
        const text =
          typeof init?.body === "string"
            ? init.body
            : input instanceof Request
              ? await input.text()
              : "";
        const answer = await rpc(name, text);
        record(
          "rpc",
          name,
          200,
          Buffer.byteLength(answer.body),
          answer.ms,
          null,
        );
        return json(answer.body, 200);
      }
      if (method === "GET" && !path.includes("/")) {
        const answer = await table(path, url, headers.get("prefer") ?? "");
        record(
          "table",
          path,
          200,
          Buffer.byteLength(answer.body),
          answer.ms,
          answer.rows,
        );
        return json(answer.body, 200, answer.headers);
      }
      throw new Unsupported(`${method} ${path}`);
    } catch (error) {
      if (error instanceof Unsupported) {
        record(
          path.startsWith("rpc/") ? "rpc" : "table",
          path,
          501,
          0,
          0,
          null,
        );
        return json(
          JSON.stringify({
            code: "PGRST000",
            message: `emulator: ${error.message}`,
          }),
          501,
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      record(path.startsWith("rpc/") ? "rpc" : "table", path, 400, 0, 0, null);
      return json(JSON.stringify({ code: "22000", message }), 400);
    }
  };

  return { fetch: fetchImpl, requests };
}
