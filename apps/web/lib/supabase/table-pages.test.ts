import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  EVERY_ROW,
  readEveryRowByPosition,
  readRowsByPosition,
} from "./table-pages";

describe("a table read by position", () => {
  it("refuses a read with no budget, which a range cannot end", () => {
    // Refused before any request is made, so no client is needed.
    const client = {} as SupabaseClient;
    expect(() =>
      readRowsByPosition(
        client,
        "file_co_changes",
        "path_a",
        EVERY_ROW,
        [["path_a", true]],
        (query) => query,
      ),
    ).toThrow(RangeError);
  });
});

/**
 * A client whose one table stops every answer at `cap` rows, over rows
 * already in order, recording what each request asked: PostgREST's
 * `max_rows`, and its count when one is asked for.
 */
function cappedClient(rows: readonly { n: number }[], cap: number) {
  const requests: string[][] = [];
  const client = {
    from: () => ({
      select: (_columns: string, options?: { count?: string }) => {
        const asked: string[] = options?.count ? ["count"] : [];
        requests.push(asked);
        let from = 0;
        let to = Number.POSITIVE_INFINITY;
        const query = {
          eq: (column: string, value: unknown) => {
            asked.push(`eq ${column} ${String(value)}`);
            return query;
          },
          order: (column: string, { ascending }: { ascending: boolean }) => {
            asked.push(`order ${column} ${ascending ? "asc" : "desc"}`);
            return query;
          },
          range: (start: number, end: number) => {
            asked.push(`range ${start}-${end}`);
            from = start;
            to = end;
            return query;
          },
          then: (resolve: (page: unknown) => unknown) =>
            resolve({
              count: options?.count ? rows.length : null,
              data: rows.slice(from, Math.min(to + 1, from + cap)),
              error: null,
              status: 200,
            }),
        };
        return query;
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, requests };
}

describe("a table read by position with no budget", () => {
  const ROWS = Array.from({ length: 25 }, (_, n) => ({ n }));

  it("asks the first page with no limit, and ends every later range at its count", async () => {
    const { client, requests } = cappedClient(ROWS, 10);
    const read = await readEveryRowByPosition<{ n: number }>(
      client,
      "things",
      "n",
      [["n", true]],
      (query) => query.eq("workspace_id", "W"),
    );
    expect(read.data).toEqual(ROWS);
    expect(read.error).toBeNull();
    expect(requests).toEqual([
      ["count", "eq workspace_id W", "order n asc"],
      ["eq workspace_id W", "order n asc", "range 10-24"],
      ["eq workspace_id W", "order n asc", "range 20-24"],
    ]);
  });

  it("is one request when the server holds every row in one answer", async () => {
    const { client, requests } = cappedClient(ROWS, 1_000);
    const read = await readEveryRowByPosition<{ n: number }>(
      client,
      "things",
      "n",
      [["n", true]],
      (query) => query,
    );
    expect(read.data).toEqual(ROWS);
    expect(requests).toHaveLength(1);
  });
});
