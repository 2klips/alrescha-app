import { describe, expect, it } from "vitest";

import { buildRenderFrame } from "../apps/web/lib/graph/render-frame";
import {
  GOLDEN_ANGLE,
  HALO_DRAW_LIMIT,
  HALO_LABEL_LIMIT,
  OWNER_LABEL_SECTOR,
  haloFor,
  haloShapeFor,
  layoutHalo,
  type HaloSymbol,
} from "../apps/web/lib/graph/symbol-halo";
import {
  SymbolHaloLoader,
  decodeSymbols,
  encodeSymbols,
  haloOwnerKind,
  symbolCacheKey,
} from "../apps/web/app/ui/symbol-halo-loader";
import { createMemoryLayoutStorage } from "../apps/web/lib/graph/layout-store";
import type {
  GraphData,
  GraphNode,
} from "../apps/web/lib/dashboard/graph-model";
import type { GraphPalette } from "../apps/web/lib/graph/render-frame";

/**
 * The symbol halo (Phase 4 Wave F todo 26): a file's exported symbols drawn
 * around it at Near zoom, placed by the golden angle, never simulated, and
 * loaded once per file per commit. The placement is a pure function, the
 * gating lives in the frame, and the loader is the cache — three things,
 * each pinned on its own.
 */

const symbols = (count: number): HaloSymbol[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `s${index}`,
    kind: index % 3 === 0 ? "class" : index % 3 === 1 ? "function" : "type",
    name: `Symbol${index}`,
  }));

const OWNER = { color: 0xabcdef, radius: 6, x: 100, y: -40 };
const DEFAULT_PALETTE: GraphPalette = {
  danger: 0xff0000,
  inferred: 0x00ff00,
  text: 0xffffff,
  verified: 0x0000ff,
};

function node(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    findingCount: 0,
    grade: "inferred",
    label: overrides.id,
    path: `src/${overrides.id}.ts`,
    type: "code",
    x: 0,
    y: 0,
    ...overrides,
  };
}

describe("placing a halo", () => {
  it("spreads symbols at the golden angle with a radius that opens by √i", () => {
    const items = layoutHalo(OWNER, symbols(12));
    expect(items).toHaveLength(12);
    const distances = items.map((item) =>
      Math.hypot(item.x - OWNER.x, item.y - OWNER.y),
    );
    // Nothing sits inside the owner, and the spiral only opens outward.
    for (const distance of distances) {
      expect(distance).toBeGreaterThan(OWNER.radius);
    }
    for (let index = 1; index < distances.length; index += 1) {
      expect(distances[index]).toBeGreaterThanOrEqual(
        distances[index - 1] as number,
      );
    }
    // The angle between consecutive items is the golden angle, modulo 2π.
    const angleOf = (item: { x: number; y: number }) =>
      Math.atan2(item.y - OWNER.y, item.x - OWNER.x);
    const first = angleOf(items[0]!);
    const second = angleOf(items[1]!);
    // The first item is one golden angle round, off the owner's label side.
    expect(first).toBeCloseTo(GOLDEN_ANGLE, 6);
    const step =
      (((second - first) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(step).toBeCloseTo(GOLDEN_ANGLE, 6);
    // Every item has a distinct place; neighbours are at least a diameter apart.
    const radius = items[0]!.radius;
    for (let a = 0; a < items.length; a += 1) {
      for (let b = a + 1; b < items.length; b += 1) {
        const gap = Math.hypot(
          items[a]!.x - items[b]!.x,
          items[a]!.y - items[b]!.y,
        );
        expect(gap).toBeGreaterThanOrEqual(radius * 2);
      }
    }
    // The owner's colour and the four-shape grammar travel with each item.
    expect(new Set(items.map(({ color }) => color))).toEqual(
      new Set([OWNER.color]),
    );
    expect(items.map(({ shape }) => shape).slice(0, 3)).toEqual([
      "square",
      "circle",
      "diamond",
    ]);
    // An item in the sector the owner's label occupies keeps its shape and
    // loses its name; every other item is labelled.
    for (const item of items) {
      const heading = Math.abs(angleOf(item));
      expect(item.labelled).toBe(heading > OWNER_LABEL_SECTOR);
    }
    // Over a fuller spiral some item does fall in that sector.
    expect(layoutHalo(OWNER, symbols(40)).some((item) => !item.labelled)).toBe(
      true,
    );
  });

  it("maps a symbol's kind onto the four shapes and nothing else", () => {
    expect(haloShapeFor("class")).toBe("square");
    expect(haloShapeFor("interface")).toBe("diamond");
    expect(haloShapeFor("type")).toBe("diamond");
    expect(haloShapeFor("function")).toBe("circle");
    expect(haloShapeFor("variable")).toBe("ring");
    expect(haloShapeFor("enum")).toBe("ring");
  });

  it("draws at most the limit and says how many it left out", () => {
    const halo = haloFor({
      halo: { ownerId: "f", symbols: symbols(HALO_DRAW_LIMIT + 9) },
      lod: "near",
      owner: OWNER,
    });
    expect(halo?.items).toHaveLength(HALO_DRAW_LIMIT);
    expect(halo?.overflow).toBe(9);
  });

  it("is a Near-zoom affordance: nothing at Mid or Far, nothing without an owner", () => {
    const loaded = { ownerId: "f", symbols: symbols(3) };
    expect(haloFor({ halo: loaded, lod: "mid", owner: OWNER })).toBeNull();
    expect(haloFor({ halo: loaded, lod: "far", owner: OWNER })).toBeNull();
    expect(haloFor({ halo: loaded, lod: "near", owner: undefined })).toBeNull();
    expect(haloFor({ halo: null, lod: "near", owner: OWNER })).toBeNull();
    expect(
      haloFor({
        halo: { ownerId: "f", symbols: [] },
        lod: "near",
        owner: OWNER,
      }),
    ).toBeNull();
    expect(haloFor({ halo: loaded, lod: "near", owner: OWNER })?.ownerId).toBe(
      "f",
    );
  });
});

describe("the halo on a frame", () => {
  const data: GraphData = {
    edges: [],
    nodes: [node({ id: "file" }), node({ id: "other" })],
  };
  const positions = new Map([
    ["file", { x: 0, y: 0 }],
    ["other", { x: 300, y: 0 }],
  ]);

  it("carries the placed halo and its names at Near, and nothing below", () => {
    const near = buildRenderFrame({
      camera: { scale: 8, x: 0, y: 0 },
      data,
      palette: DEFAULT_PALETTE,
      positions,
      selectedNodeId: "file",
      symbolHalo: { ownerId: "file", symbols: symbols(30) },
      viewport: { height: 600, width: 800 },
    });
    expect(near.lod).toBe("near");
    expect(near.halo?.ownerId).toBe("file");
    expect(near.halo?.items).toHaveLength(30);
    // The frame names the first items in the screen-space label layer, so a
    // halo reads as a legend rather than as confetti.
    const haloLabels = near.labels.filter(({ id }) => id.startsWith("halo:"));
    const labelled = near.halo?.items.filter((item) => item.labelled) ?? [];
    expect(haloLabels).toHaveLength(
      Math.min(HALO_LABEL_LIMIT, labelled.length),
    );
    expect(haloLabels.length).toBeGreaterThan(0);
    expect(haloLabels[0]?.text).toBe(labelled[0]?.name);
    // The nodes themselves are untouched: a symbol is not a node here.
    expect(near.nodes.map(({ id }) => id).sort()).toEqual(["file", "other"]);

    const far = buildRenderFrame({
      camera: { scale: 0.05, x: 0, y: 0 },
      data,
      palette: DEFAULT_PALETTE,
      positions,
      selectedNodeId: "file",
      symbolHalo: { ownerId: "file", symbols: symbols(30) },
      viewport: { height: 600, width: 800 },
    });
    expect(far.lod).not.toBe("near");
    expect(far.halo).toBeNull();
    expect(far.labels.some(({ id }) => id.startsWith("halo:"))).toBe(false);
  });

  it("follows the owner's position, not a position of its own", () => {
    const moved = new Map([
      ["file", { x: 50, y: 20 }],
      ["other", { x: 300, y: 0 }],
    ]);
    const input = {
      camera: { scale: 8, x: 0, y: 0 },
      data,
      palette: DEFAULT_PALETTE,
      selectedNodeId: "file",
      symbolHalo: { ownerId: "file", symbols: symbols(4) },
      viewport: { height: 600, width: 800 },
    };
    const before = buildRenderFrame({ ...input, positions });
    const after = buildRenderFrame({ ...input, positions: moved });
    const first = (frame: typeof before) => frame.halo?.items[0];
    expect(first(after)!.x - first(before)!.x).toBeCloseTo(50, 6);
    expect(first(after)!.y - first(before)!.y).toBeCloseTo(20, 6);
  });
});

describe("loading a file's layer", () => {
  const payload = {
    edges: [],
    files: ["01K287J3D18V7A1MZG9E8D1Y12"],
    symbols: [
      {
        container: null,
        endLine: 12,
        engine: "typescript-ast",
        fileId: "01K287J3D18V7A1MZG9E8D1Y12",
        id: "01K287J3D18V7A1MZG9E8D1Y81",
        kind: "class",
        name: "ReportParser",
        path: "src/a.ts",
        startLine: 1,
      },
    ],
    truncated: [],
  };

  function fakeFetch(calls: string[]): typeof globalThis.fetch {
    return (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return Response.json(payload);
    }) as typeof globalThis.fetch;
  }

  it("asks the network once per file, then answers from memory and from storage", async () => {
    const calls: string[] = [];
    const storage = createMemoryLayoutStorage();
    const loader = new SymbolHaloLoader({
      commitSha: "c".repeat(40),
      fetch: fakeFetch(calls),
      storage,
      workspaceId: "ws",
    });
    const first = await loader.load("01K287J3D18V7A1MZG9E8D1Y12");
    expect(first).toEqual([
      { id: "01K287J3D18V7A1MZG9E8D1Y81", kind: "class", name: "ReportParser" },
    ]);
    expect(calls).toEqual([
      "/api/map/symbols?files=01K287J3D18V7A1MZG9E8D1Y12",
    ]);
    // Memory: the same loader never asks again.
    await loader.load("01K287J3D18V7A1MZG9E8D1Y12");
    expect(loader.fetches).toBe(1);
    // Storage: a new loader at the same commit reads what the first wrote.
    const key = symbolCacheKey(
      "ws",
      "c".repeat(40),
      "01K287J3D18V7A1MZG9E8D1Y12",
    );
    expect(key).toBe(`symbols:ws:${"c".repeat(40)}:01K287J3D18V7A1MZG9E8D1Y12`);
    expect(decodeSymbols(storage.entries.get(key ?? ""))).toEqual(first);
    const again = new SymbolHaloLoader({
      commitSha: "c".repeat(40),
      fetch: fakeFetch(calls),
      storage,
      workspaceId: "ws",
    });
    expect(await again.load("01K287J3D18V7A1MZG9E8D1Y12")).toEqual(first);
    expect(again.fetches).toBe(0);
    // A new commit is a new key: the stored answer is never read for it.
    const later = new SymbolHaloLoader({
      commitSha: "d".repeat(40),
      fetch: fakeFetch(calls),
      storage,
      workspaceId: "ws",
    });
    await later.load("01K287J3D18V7A1MZG9E8D1Y12");
    expect(later.fetches).toBe(1);
  });

  it("treats storage as hostile and keys nothing without a commit", () => {
    const key = "symbols:ws:sha:file";
    const encoded = encodeSymbols(
      key,
      [{ id: "s", kind: "class", name: "S" }],
      7,
    );
    expect(encoded).toEqual({
      key,
      savedAt: 7,
      symbols: [{ id: "s", kind: "class", name: "S" }],
      version: 1,
    });
    expect(decodeSymbols({ ...encoded, version: 2 })).toBeNull();
    expect(decodeSymbols({ ...encoded, symbols: [{ id: 1 }] })).toBeNull();
    expect(decodeSymbols("nonsense")).toBeNull();
    expect(symbolCacheKey("ws", null, "file")).toBeNull();
    expect(symbolCacheKey("", "sha", "file")).toBeNull();
  });

  it("only a code or test file has a layer to ask for", () => {
    expect(haloOwnerKind("code")).toBe(true);
    expect(haloOwnerKind("test")).toBe(true);
    expect(haloOwnerKind("document")).toBe(false);
    expect(haloOwnerKind("directory")).toBe(false);
    expect(haloOwnerKind("concept")).toBe(false);
  });
});
