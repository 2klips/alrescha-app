/**
 * Bounded-concurrency map (perf research MT-3).
 *
 * Deliberately small and deliberately *ordered*. Two properties matter more
 * than throughput here, because the scanner's output is a plan whose bytes
 * must not depend on how the work was scheduled:
 *
 *   1. **Results come back in input order**, never in completion order.
 *   2. **The error that surfaces is the first one in input order** — the same
 *      one a sequential loop would have thrown — and every task is settled
 *      before this function returns, so no request is left in flight behind a
 *      rejection.
 *
 * Property (2) costs a little latency on a failing run and buys determinism on
 * every run, which is the right trade for something whose job is to produce a
 * reproducible scan plan.
 */

/** Never fan out wider than this, whatever a caller or an operator asks for. */
export const MAX_CONCURRENCY = 32;

export function clampConcurrency(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(MAX_CONCURRENCY, value);
}

export async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  limit: number,
  task: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  const failures = new Map<number, unknown>();
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = await task(items[index] as Item, index);
      } catch (error) {
        failures.set(index, error);
      }
    }
  };

  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, () => worker()));

  if (failures.size > 0) {
    const first = Math.min(...failures.keys());
    throw failures.get(first);
  }
  return results;
}
