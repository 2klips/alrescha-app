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
  /** Continue after this id; null for the first page. */
  readonly after: string | null;
  /** Ask the server for the total — the first page only. */
  readonly count: boolean;
  /** Rows still wanted. */
  readonly limit: number;
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
export async function readByIdPages<Row extends { readonly id?: unknown }>(
  page: (request: PageRequest) => PromiseLike<RowPage<Row>>,
  limit: number,
): Promise<PagedRows<Row>> {
  const rows: Row[] = [];
  let total: number | null = null;
  let after: string | null = null;
  let status: number | undefined;
  for (let request = 0; ; request += 1) {
    const wanted = limit - rows.length;
    const answer = await page({ after, count: request === 0, limit: wanted });
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
    after = String(last.id);
  }
  return {
    data: rows.slice(0, limit),
    error: null,
    ...(status === undefined ? {} : { status }),
  };
}
