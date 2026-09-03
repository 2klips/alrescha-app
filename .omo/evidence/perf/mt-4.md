# MT-4 — graph engine dirty flag + frame invariant cache

Perf research mid-term wave 1, item 1 of 3. Selection and reasons:
[`midterm-wave-1.md`](./midterm-wave-1.md).

## What changed

Three separate wastes, all in the per-animation-frame path:

1. **`degreeMap` and the LOD median were recomputed every frame.** Both are
   functions of the `GraphData` object alone, so both are now cached in a
   `WeakMap` keyed by it — the pattern `importanceMap` already used one
   function above. The median radius replaces `resolveLod`'s per-frame O(n)
   radius array and O(n log n) sort with a single cached number.
   (`apps/web/lib/graph/render-frame.ts`)

2. **`collapseGraph` rebuilt the whole collapsed graph every frame.**
   Membership, the merged inter-community edge set, and every supernode field
   except its centroid depend only on `(data, assignment, expanded)`. Those are
   now cached per that triple; each call recomputes only the centroids, which
   are the one part that genuinely moves. The member-grouping loop was also
   quadratic in community size (`members.set(c, [...members.get(c), node])`
   copied the array on every insert) and is now a `push`.
   (`apps/web/lib/graph/clustering.ts`)

3. **The render loop painted every animation frame forever.** The engine now
   tracks a revision counter bumped by every mutation a frame can see, and
   compares the position buffer's output by identity — which is stable exactly
   when interpolation has finished. `paintIfChanged()` returns `null` on a tick
   where neither moved, and `brain-map.tsx` uses it. `paint()` is unchanged and
   still paints unconditionally. (`apps/web/lib/graph/engine.ts`,
   `apps/web/app/ui/brain-map.tsx`)

The simulation worker stops emitting positions once alpha falls under
`SIMULATION_ALPHA_MIN`, so "settled and untouched" is a state the app really
reaches — that is what makes (3) worth anything.

## Measurement

Script added for this item: `scripts/bench-graph-frame.ts`. Deterministic —
fixed fixture, fixed layout seed, fixed camera path, fixed glow churn.

```
node --import tsx scripts/bench-graph-frame.ts
```

Host (same machine as `.omo/evidence/phase2a/task-9.md`, so its recorded
numbers stay comparable):

| | |
| --- | --- |
| CPU | AMD Ryzen 7 9800X3D, 8C/16T |
| RAM | 61.6 GB |
| Node | v24.14.0 |
| OS | Windows 11 (10.0.26200) |

Method: 60 warm-up frames, then 240 measured frames per case, `performance.now()`
around each `buildRenderFrame` call. Three runs of the whole script per
revision; the tables below quote the **median of the three runs** for each
statistic. "Before" is `HEAD` (3826fa5) with only the bench script added;
"after" is this commit. Raw per-run JSON is not committed — rerun the script to
reproduce.

### Frame plan

| case | statistic | before | after |
| --- | --- | ---: | ---: |
| `frame-500` (500 nodes, camera across all three LOD bands) | p50 | 0.214 ms | 0.147 ms |
| | p95 | 0.370 ms | 0.240 ms |
| `frame-3500-near` (3,500 nodes, zoomed in — collapse off) | p50 | 1.372 ms | 0.948 ms |
| | p95 | 1.854 ms | 1.396 ms |
| `frame-3500-far` (3,500 nodes, far zoom — collapse on) | p50 | 1.846 ms | 0.103 ms |
| | p95 | 2.336 ms | 0.197 ms |

The far-zoom case is where the collapse cache lands: that frame shape rebuilt
the whole collapsed graph, including the quadratic grouping loop, sixty times a
second.

### Settled idle loop

120 animation ticks on the 3,500-node graph after the simulation has settled,
with no input. Both loop strategies are measured in the same run, so the
baseline stays reproducible from any commit.

| strategy | frames painted | total main-thread time |
| --- | ---: | ---: |
| `always` (the loop before this change) | 120 / 120 | 175.770 ms |
| `always`, measured after this change | 120 / 120 | 113.418 ms |
| `dirty` (`paintIfChanged`) | **0 / 120** | **0.018 ms** |

Painted frames drop to zero, so the GPU pass goes with them. Not measured:
GPU time itself, which needs a browser; `tests/e2e/brain-map.spec.ts` covers
that the canvas still renders and leaks no WebGL context.

### The existing automated gate

`tests/graph-perf.test.ts` is unchanged — no assertion was relaxed.

```
pnpm exec vitest run tests/graph-perf.test.ts --reporter=verbose
```

```
[perf] buildRenderFrame(500)        n= 240 p50=   0.174ms p95=   0.283ms max=   2.973ms mean=   0.206ms budget=16.7ms
[perf] buildRenderFrame+collapse    n= 240 p50=   0.180ms p95=   0.356ms max=   1.534ms mean=   0.207ms budget=16.7ms
[perf] worker tick + encode(500)    n= 120 p50=   0.835ms p95=   1.496ms max=   1.833ms mean=   0.910ms budget=33.3ms
[perf] scaling 125→500 nodes         p50 0.030ms → 0.132ms (×4.39, quadratic would be ×16)
```

p95 0.283 ms against the 16.7 ms budget, from the 0.385 ms task-9 recorded.
The 125→500 scaling ratio rose from ×2.56 to ×4.39 because the work removed was
the part that did **not** scale with the node pass; the assertion bound is ×12
and quadratic would be ×16, so the guard still has its margin.

## Tests

New in `tests/graph-engine.test.ts`:

- a settled graph nobody touches paints once and then stops (31 ticks, 1 paint);
- each of the ten engine mutations repaints exactly once, then goes quiet again;
- a fresh simulation frame repaints, and a disposed engine paints nothing;
- explicit `paint()` still paints unconditionally;
- `degreeMap` returns the same object for the same graph and a different one
  for a different graph;
- a cached collapse still moves its supernodes when members move, two results
  held at once do not overwrite each other, and expanding a community is a
  different cache key rather than a stale hit.

## Assumptions and limits

- Timings are wall clock on one host; absolute numbers are host-specific and
  only the before/after pairing is meaningful.
- The idle case models the loop, not the compositor: it counts frames the
  engine hands to the backend and the main-thread time to decide, not GPU work.
- The dirty flag is deliberately conservative — a mutation that happens to
  produce an identical frame still repaints once. It never suppresses a frame
  that differs.
- `degreeMap` now returns a `ReadonlyMap` shared with every holder of that
  `GraphData`. No caller mutated it.
