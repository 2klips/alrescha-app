import { describe, expect, it } from "vitest";

import {
  readByIdPages,
  readByPositionPages,
  type PageRequest,
  type RowPage,
} from "./row-pages";

/**
 * A server that stops every answer at `cap` rows, over rows already in the
 * order the caller asks for — PostgREST's `max_rows`, and what it says with
 * `count=exact`.
 */
function cappedServer<Row>(
  rows: readonly Row[],
  cap: number,
  start: (request: PageRequest) => number,
) {
  const requests: PageRequest[] = [];
  const page = async (request: PageRequest): Promise<RowPage<Row>> => {
    requests.push(request);
    const from = start(request);
    return {
      count: request.count ? rows.length : null,
      data: rows.slice(from, from + Math.min(request.limit, cap)),
      error: null,
      status: 200,
    };
  };
  return { page, requests };
}

const PAIRS = Array.from({ length: 25 }, (_, n) => ({
  pair: `p${String(n).padStart(2, "0")}`,
}));

describe("a read by position past the server's row cap", () => {
  it("starts each page where the rows in hand end, and asks for the count once", async () => {
    const server = cappedServer(PAIRS, 10, (request) => request.offset);
    const read = await readByPositionPages(server.page, 100);
    expect(read.data).toEqual(PAIRS);
    expect(read.error).toBeNull();
    expect(
      server.requests.map(({ count, offset }) => ({ count, offset })),
    ).toEqual([
      { count: true, offset: 0 },
      { count: false, offset: 10 },
      { count: false, offset: 20 },
    ]);
    // Nothing to continue after: position is the whole cursor.
    expect(server.requests.every(({ after }) => after === null)).toBe(true);
  });

  it("stops at its budget, asking the last page only for what is left", async () => {
    const server = cappedServer(PAIRS, 10, (request) => request.offset);
    const read = await readByPositionPages(server.page, 15);
    expect(read.data).toEqual(PAIRS.slice(0, 15));
    expect(server.requests.map(({ limit }) => limit)).toEqual([15, 5]);
  });

  it("hands every later page the count the first came back with", async () => {
    const server = cappedServer(PAIRS, 10, (request) => request.offset);
    await readByPositionPages(server.page, Number.POSITIVE_INFINITY);
    expect(server.requests.map(({ total }) => total)).toEqual([null, 25, 25]);
  });

  it("takes a short page for the end when no count came back, as before", async () => {
    const page = async (): Promise<RowPage<{ pair: string }>> => ({
      data: PAIRS.slice(0, 10),
      error: null,
    });
    const read = await readByPositionPages(page, 100);
    expect(read.data).toHaveLength(10);
  });

  it("returns what it had and the error when a page fails", async () => {
    let calls = 0;
    const page = async (): Promise<RowPage<{ pair: string }>> => {
      calls += 1;
      return calls === 1
        ? { count: 25, data: PAIRS.slice(0, 10), error: null }
        : {
            data: null,
            error: { code: "57014", message: "canceling statement" },
            status: 500,
          };
    };
    const read = await readByPositionPages(page, 100);
    expect(read.data).toEqual(PAIRS.slice(0, 10));
    expect(read.error?.code).toBe("57014");
    expect(read.status).toBe(500);
  });
});

describe("a read by id past the server's row cap", () => {
  it("continues after the last id, the offset riding along unused", async () => {
    const rows = Array.from({ length: 12 }, (_, n) => ({
      id: `01K${String(n).padStart(23, "0")}`,
    }));
    const server = cappedServer(rows, 5, (request) =>
      request.after === null
        ? 0
        : rows.findIndex(({ id }) => id === request.after) + 1,
    );
    const read = await readByIdPages(server.page, 100);
    expect(read.data).toEqual(rows);
    expect(server.requests.map(({ after }) => after)).toEqual([
      null,
      rows[4]?.id,
      rows[9]?.id,
    ]);
    expect(server.requests.map(({ offset }) => offset)).toEqual([0, 5, 10]);
  });
});
