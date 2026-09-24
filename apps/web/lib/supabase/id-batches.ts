/**
 * Id lists in PostgREST filters, in pieces a gateway accepts (RE-04).
 *
 * A PostgREST filter travels in the query string, so `in.(…)` and an `or`
 * over id lists make a request's URL grow with the list: a ULID is 26
 * characters and postgrest-js form-encodes each separating comma as three
 * (`%2C`). The symbol layer asked for a file's edges with every symbol of the
 * file in one `or`, once per endpoint column, so a barrel re-exporting 485
 * names was one request of about 28,000 characters. Supabase does not publish
 * where its gateway refuses; postgrest-js warns past 8,000.
 *
 * Sixty ids is 1,737 characters a list, so even an `or` over two lists keeps
 * the whole URL under 4 KB — half the library's own line, whatever the file.
 */
export const ID_FILTER_BATCH = 60;

/**
 * Batches of one read in flight at once. A short URL per request is the fix;
 * every batch at once would trade one long URL for a burst the database
 * pooler has to absorb.
 */
export const ID_FILTER_CONCURRENCY = 4;

export function idBatches<T>(
  ids: readonly T[],
  size: number = ID_FILTER_BATCH,
): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`batch size must be a positive integer, got ${size}`);
  }
  const batches: T[][] = [];
  for (let at = 0; at < ids.length; at += size) {
    batches.push(ids.slice(at, at + size));
  }
  return batches;
}

/**
 * One request per batch of ids, a few in flight at a time, answered in batch
 * order. No ids, no request.
 *
 * The caller merges. Whether two batches can return the same row, and which
 * order and limit the merged answer keeps, belong to the query, not here —
 * see `firstRowsById` for the common case.
 */
export async function readInBatches<T, R>(
  ids: readonly T[],
  read: (batch: T[]) => PromiseLike<R>,
): Promise<R[]> {
  const batches = idBatches(ids);
  const answers = new Array<R>(batches.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < batches.length) {
      const at = next;
      next += 1;
      answers[at] = await read(batches[at] as T[]);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(ID_FILTER_CONCURRENCY, batches.length) },
      worker,
    ),
  );
  return answers;
}

/**
 * The rows one `order by id limit n` query would have kept, from the batches
 * that replaced it: each row once, the first `limit` by id.
 *
 * Each batch ran the same ordered, limited query over part of the ids, so
 * every row among the overall first `limit` is among its own batch's first
 * `limit` — the union holds the answer, and trimming it gives exactly that
 * answer. An edge whose two ends fell in different batches arrives twice
 * and is kept once. Ids are ULIDs, whose character order is the database's.
 */
export function firstRowsById<Row extends { readonly id?: unknown }>(
  batches: readonly (readonly Row[])[],
  limit: number,
): Row[] {
  const byId = new Map<string, Row>();
  for (const batch of batches) {
    for (const row of batch) byId.set(String(row.id), row);
  }
  return [...byId.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .slice(0, limit)
    .map(([, row]) => row);
}
