import type { SupabaseClient } from "@supabase/supabase-js";

import {
  readByIdPages,
  readByPositionPages,
  type PagedRows,
  type RowPage,
} from "./row-pages";

/**
 * A table read past PostgREST's row cap, for the screens' loaders (RE-04).
 *
 * The server answers with at most `max_rows` rows — 1,000 here and by
 * Supabase's default — and says nothing about it, so a loader that asked for
 * 2,000 nodes in one request drew the first thousand as the whole workspace.
 * These put `readByIdPages`' rule behind one call: the first page asks for
 * the exact count, the rest continue until the rows are in hand. `narrow`
 * shapes every page, so a scope it names — the workspace, a repository, a
 * set of files — is on every page, not only the first. A table under the
 * cap is still one request, and that request is the one the read made
 * before.
 */

/** The limit of a read with no budget of its own: every row it matches. */
export const EVERY_ROW = Number.POSITIVE_INFINITY;

/**
 * The part of a PostgREST query builder a paged read uses.
 *
 * Stated structurally because supabase-js types a select from its column
 * string, and a column list chosen at run time sends that inference into a
 * recursion TypeScript gives up on. One cast, where the builder is made.
 */
export interface TableQuery<Row> extends PromiseLike<RowPage<Row>> {
  eq(column: string, value: unknown): TableQuery<Row>;
  gt(column: string, value: unknown): TableQuery<Row>;
  gte(column: string, value: unknown): TableQuery<Row>;
  in(column: string, values: readonly unknown[]): TableQuery<Row>;
  is(column: string, value: null): TableQuery<Row>;
  limit(count: number): TableQuery<Row>;
  neq(column: string, value: unknown): TableQuery<Row>;
  or(filters: string): TableQuery<Row>;
  order(column: string, options: { ascending: boolean }): TableQuery<Row>;
  range(from: number, to: number): TableQuery<Row>;
}

export type Narrow<Row> = (query: TableQuery<Row>) => TableQuery<Row>;

function tableQuery<Row>(
  client: SupabaseClient,
  table: string,
  columns: string,
  count: boolean,
): TableQuery<Row> {
  return client
    .from(table)
    .select(
      columns,
      count ? { count: "exact" } : undefined,
    ) as unknown as TableQuery<Row>;
}

/**
 * `table`'s rows that `narrow` selects, in id order, up to `limit` —
 * `EVERY_ROW` for a read with no budget. `columns` must include `id`.
 */
export function readRowsById<Row extends { readonly id?: unknown }>(
  client: SupabaseClient,
  table: string,
  columns: string,
  limit: number,
  narrow: Narrow<Row>,
): Promise<PagedRows<Row>> {
  return readByIdPages<Row>((page) => {
    let query = narrow(tableQuery<Row>(client, table, columns, page.count));
    if (page.after !== null) query = query.gt("id", page.after);
    query = query.order("id", { ascending: true });
    return Number.isFinite(page.limit) ? query.limit(page.limit) : query;
  }, limit);
}

/**
 * `table`'s rows that `narrow` selects, up to a budget that keeps rows by an
 * order of their own — for a table with no id, or a read whose order the
 * caller depends on: pages by position in `order`, which must be total, so
 * end it with the table's key. The offset joins from the second page.
 */
export function readRowsByPosition<Row>(
  client: SupabaseClient,
  table: string,
  columns: string,
  limit: number,
  order: readonly (readonly [column: string, ascending: boolean])[],
  narrow: Narrow<Row>,
): Promise<PagedRows<Row>> {
  if (!Number.isFinite(limit)) {
    // A range needs an end; a read with no budget pages by id instead, or
    // by `readEveryRowByPosition`, which ends it at the count.
    throw new RangeError(`a read by position needs a budget, got ${limit}`);
  }
  return readByPositionPages<Row>((page) => {
    let query = narrow(tableQuery<Row>(client, table, columns, page.count));
    for (const [column, ascending] of order) {
      query = query.order(column, { ascending });
    }
    return page.offset > 0
      ? query.range(page.offset, page.offset + page.limit - 1)
      : query.limit(page.limit);
  }, limit);
}

/**
 * Every row `narrow` selects, in `order`, for a read with no budget whose
 * order only the database can give: text under the database's own
 * collation, which no TypeScript sort reproduces — one that ignores
 * punctuation files `.claude/…` among the c's, not before the capitals.
 * Pages by position as `readRowsByPosition` does, `order` total as there.
 * The first page is the read with no limit, as it was; a later one exists
 * only once that page's exact count is in hand, and its range ends there.
 */
export function readEveryRowByPosition<Row>(
  client: SupabaseClient,
  table: string,
  columns: string,
  order: readonly (readonly [column: string, ascending: boolean])[],
  narrow: Narrow<Row>,
): Promise<PagedRows<Row>> {
  return readByPositionPages<Row>((page) => {
    let query = narrow(tableQuery<Row>(client, table, columns, page.count));
    for (const [column, ascending] of order) {
      query = query.order(column, { ascending });
    }
    // Without a count the first page ends the read, as a page shorter than
    // an unlimited ask does, so no later page is asked without one.
    return page.total === null
      ? query
      : query.range(page.offset, page.total - 1);
  }, EVERY_ROW);
}
