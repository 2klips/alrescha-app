/**
 * Every row a read matches, up to what the caller asked for, whatever the
 * server's own row cap (RE-04).
 *
 * PostgREST answers with at most `max_rows` rows and says nothing about it.
 * Supabase's default — and this repository's `supabase/config.toml` — is
 * 1,000. The workspace read asks each table for 2,001 rows so that a
 * 2,001st can say "there are more than 2,000"; a server that stops at 1,000
 * never sends it, so the read got the first thousand and reported itself
 * complete. With about 1,010 index entries on the pilot, that is ten files a
 * search can never find, and the newest ones, since ids sort by time.
 *
 * So the first page asks for an exact count, and later pages continue after
 * the last id seen until the rows the caller asked for are in hand, the
 * table is exhausted, or a page comes back empty. A table under the server's
 * cap is still one request. The count costs one `count(*)` the server runs
 * beside the select.
 */

/** One page, as supabase-js hands it back. */
export interface RowPage<Row> {
  readonly count?: number | null;
  readonly data: Row[] | null;
  readonly error: { code?: string; message: string } | null;
  readonly status?: number;
}

/** The rows, and the first error with the status it came with. */
export interface PagedRows<Row> {
  readonly data: Row[];
  readonly error: { code?: string; message: string } | null;
  readonly status?: number;
}

/** What one page request needs to say. */
export interface PageRequest {
  /**
   * Continue after this id; null for the first page, and for every page of
   * a read by position.
   */
  readonly after: string | null;
  /** Ask the server for the total — the first page only. */
  readonly count: boolean;
  /** Rows still wanted. */
  readonly limit: number;
  /** Rows already in hand: where a read by position starts its next page. */
  readonly offset: number;
  /**
   * The count the first page came back with: null until it has, and when the
   * server sent none. Where a read by position with no budget ends a range.
   */
  readonly total: number | null;
}

/**
 * `page` builds one request in id order; `limit` is the most rows the caller
 * wants back (a budget plus one, where the caller detects "more").
 *
 * With no count in the answer — a test double's — a page shorter than asked
 * is taken as the end, which is what every read here did before. Every page
 * that does not end the read adds at least one row, so a read makes at most
 * `limit` requests; there is no page cap that could stop it short silently.
 */
export function readByIdPages<Row extends { readonly id?: unknown }>(
  page: (request: PageRequest) => PromiseLike<RowPage<Row>>,
  limit: number,
): Promise<PagedRows<Row>> {
  return readPages(page, limit, (last) => String(last.id));
}

/**
 * The same, for a read with no id to continue after — `file_co_changes` is
 * keyed by its path pair — whose budget keeps rows by an order of its own:
 * each page starts at `offset`, where the rows in hand end. The caller's
 * order must be total, or two pages could repeat one row and skip another.
 * A position is only as steady as the rows: one that moves across a page
 * boundary between two requests is read twice or not at all, which a
 * display read survives until the next load.
 */
export function readByPositionPages<Row>(
  page: (request: PageRequest) => PromiseLike<RowPage<Row>>,
  limit: number,
): Promise<PagedRows<Row>> {
  return readPages(page, limit, () => null);
}

async function readPages<Row>(
  page: (request: PageRequest) => PromiseLike<RowPage<Row>>,
  limit: number,
  continueAfter: (last: Row) => string | null,
): Promise<PagedRows<Row>> {
  const rows: Row[] = [];
  let total: number | null = null;
  let after: string | null = null;
  let status: number | undefined;
  for (let request = 0; ; request += 1) {
    const wanted = limit - rows.length;
    const answer = await page({
      after,
      count: request === 0,
      limit: wanted,
      offset: rows.length,
      total,
    });
    status = answer.status;
    if (answer.error) {
      return {
        data: rows,
        error: answer.error,
        ...(status === undefined ? {} : { status }),
      };
    }
    const batch = answer.data ?? [];
    if (request === 0 && typeof answer.count === "number") {
      total = answer.count;
    }
    rows.push(...batch);
    const last = batch.at(-1);
    const done =
      rows.length >= limit ||
      batch.length === 0 ||
      last === undefined ||
      (total === null ? batch.length < wanted : rows.length >= total);
    if (done) break;
    after = continueAfter(last);
  }
  return {
    data: rows.slice(0, limit),
    error: null,
    ...(status === undefined ? {} : { status }),
  };
}
