import { describe, expect, it } from "vitest";

import {
  ID_FILTER_BATCH,
  ID_FILTER_CONCURRENCY,
  firstRowsById,
  idBatches,
  readInBatches,
} from "./id-batches";

describe("id lists in batches", () => {
  it("cuts a list into sixty-id batches, in order, and nothing for nothing", () => {
    const ids = Array.from({ length: 130 }, (_, n) => `id${n}`);
    const batches = idBatches(ids);
    expect(batches.map((batch) => batch.length)).toEqual([60, 60, 10]);
    expect(batches.flat()).toEqual(ids);
    expect(idBatches([])).toEqual([]);
    expect(ID_FILTER_BATCH).toBe(60);
    expect(() => idBatches(ids, 0)).toThrow(RangeError);
  });

  it("reads one request per batch, a few at a time, answering in batch order", async () => {
    let inFlight = 0;
    let most = 0;
    const answers = await readInBatches(
      Array.from({ length: 600 }, (_, n) => n),
      async (batch) => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        // Later batches finish first; the answer order must not follow.
        await new Promise((resolve) =>
          setTimeout(resolve, 20 - (batch[0] ?? 0) / 60),
        );
        inFlight -= 1;
        return batch[0];
      },
    );
    expect(answers).toEqual([0, 60, 120, 180, 240, 300, 360, 420, 480, 540]);
    expect(most).toBe(ID_FILTER_CONCURRENCY);
  });

  it("sends nothing when there is nothing to ask for", async () => {
    let calls = 0;
    const answers = await readInBatches([], async () => {
      calls += 1;
      return null;
    });
    expect(answers).toEqual([]);
    expect(calls).toBe(0);
  });

  it("stops at the first failed batch rather than answering with part", async () => {
    await expect(
      readInBatches(
        Array.from({ length: 130 }, (_, n) => n),
        async (batch) => {
          if (batch[0] === 60) throw new Error("second batch failed");
          return batch.length;
        },
      ),
    ).rejects.toThrow("second batch failed");
  });

  it("keeps what one ordered, limited query would have kept", () => {
    const row = (id: string, from: string) => ({ from, id });
    const kept = firstRowsById(
      [
        [row("01C", "a"), row("01E", "a"), row("01A", "a")],
        // 01C again: an edge both batches touch.
        [row("01B", "b"), row("01C", "b"), row("01D", "b")],
      ],
      4,
    );
    expect(kept.map(({ id }) => id)).toEqual(["01A", "01B", "01C", "01D"]);
    expect(firstRowsById([], 10)).toEqual([]);
  });
});
