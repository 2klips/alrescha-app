import { describe, expect, it } from "vitest";

import {
  createFixtureGraph,
  type GraphData,
  type GraphNode,
} from "../apps/web/lib/dashboard/graph-model";
import {
  RAW_RENDER_NODE_LIMIT,
  SUPERNODE_PREFIX,
  collapseGraph,
  communityAssignment,
  hierarchyAssignment,
  hierarchyTemplates,
} from "../apps/web/lib/graph/clustering";
import {
  GRAPH_LAYERS,
  buildRenderFrame,
  type GraphLayer,
  type GraphPalette,
  type Viewport,
} from "../apps/web/lib/graph/render-frame";
import type { Position } from "../apps/web/lib/graph/simulation-protocol";

/**
 * Phase 4 Wave B todo 13 — filtering is visibility, and collapsing follows
 * the directory tree.
 */

const VIEWPORT: Viewport = { height: 800, width: 1200 };
const PALETTE: GraphPalette = { text: 0xffffff };

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

function positionsOf(data: GraphData): Map<string, Position> {
  return new Map(data.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}

describe("a filter hides nodes without moving them", () => {
  const data = createFixtureGraph(20);
  const positions = positionsOf(data);
  const keep = new Set(data.nodes.slice(0, 6).map((n) => n.id));

  const frameWith = (visible?: ReadonlySet<string>) =>
    buildRenderFrame({
      data,
      palette: PALETTE,
      positions,
      viewport: VIEWPORT,
      ...(visible ? { visible } : {}),
    });

  it("draws only what is visible, and every one of them", () => {
    const drawn = frameWith(keep)
      .nodes.map((n) => n.id)
      .sort();
    expect(drawn).toEqual([...keep].sort());
  });

  it("leaves the visible nodes exactly where they already were", () => {
    // The whole point. Filtering used to build a new graph and restart the
    // simulation, so a keystroke in the search box threw the layout away and
    // the map exploded and re-formed letter by letter.
    const before = new Map(
      frameWith().nodes.map((n) => [n.id, { x: n.x, y: n.y }]),
    );
    for (const rendered of frameWith(keep).nodes) {
      expect({ x: rendered.x, y: rendered.y }, rendered.id).toEqual(
        before.get(rendered.id),
      );
    }
  });

  it("drops an edge that reaches something hidden, rather than drawing a line to nowhere", () => {
    const frame = frameWith(keep);
    const drawn = new Set(frame.nodes.map((n) => n.id));
    for (const edge of data.edges) {
      const kept = frame.edges.some((rendered) => rendered.id === edge.id);
      expect(kept, edge.id).toBe(
        drawn.has(edge.source) && drawn.has(edge.target),
      );
    }
    // …and something was actually dropped, so the loop above is not vacuous.
    expect(frame.edges.length).toBeLessThan(data.edges.length);
  });

  it("labels nothing that is not drawn", () => {
    const labelled = new Set(frameWith(keep).labels.map((label) => label.id));
    for (const id of labelled) expect(keep.has(id)).toBe(true);
  });

  it("draws everything when no set is given", () => {
    expect(frameWith().nodes).toHaveLength(data.nodes.length);
  });
});

describe("the collapse follows the directory tree", () => {
  /** A repository shape: two packages, folders under them, files in those. */
  const repository: GraphData = {
    edges: [],
    nodes: [
      node({
        id: "d-web",
        path: "apps/web",
        role: "package",
        type: "directory",
      }),
      node({
        id: "d-worker",
        path: "apps/worker",
        role: "package",
        type: "directory",
      }),
      node({ id: "d-graph", path: "apps/web/lib/graph", type: "directory" }),
      node({ id: "f-camera", path: "apps/web/lib/graph/camera.ts" }),
      node({ id: "f-engine", path: "apps/web/lib/graph/engine.ts" }),
      node({ id: "f-queue", path: "apps/worker/src/queue.ts" }),
    ],
  };

  it("groups files under their package at Far", () => {
    const far = hierarchyAssignment(repository, "far");
    expect(far.get("f-camera")).toBe("d-web");
    expect(far.get("f-engine")).toBe("d-web");
    expect(far.get("f-queue")).toBe("d-worker");
    // A folder is its own group, so it never vanishes into its parent and
    // then reappears as one of that parent's members.
    expect(far.get("d-graph")).toBe("d-graph");
  });

  it("groups files under the folder they are actually in at Mid", () => {
    const mid = hierarchyAssignment(repository, "mid");
    expect(mid.get("f-camera")).toBe("d-graph");
    expect(mid.get("f-queue")).toBe("d-worker");
  });

  it("is the same answer every time, unlike the communities it replaced", () => {
    // Louvain's groups are named `c7` and their membership shifts when an
    // import is added. A folder is a folder.
    expect([...hierarchyAssignment(repository, "far")]).toEqual([
      ...hierarchyAssignment(repository, "far"),
    ]);
    expect([...hierarchyAssignment(repository, "far").values()]).not.toContain(
      "c0",
    );
  });

  it("falls back to communities when there is no hierarchy at all", () => {
    // Every demo fixture is in this state; grouping them by a path they do
    // not have would collapse the whole graph to one dot.
    const flat = createFixtureGraph(20);
    expect([...hierarchyAssignment(flat, "far")]).toEqual([
      ...communityAssignment(flat),
    ]);
  });

  it("gives the supernode the folder's own name and path", () => {
    const assignment = hierarchyAssignment(repository, "far");
    const collapsed = collapseGraph({
      assignment,
      data: repository,
      positions: positionsOf(repository),
      templates: hierarchyTemplates(repository),
    });
    const supernode = collapsed.data.nodes.find(
      (n) => n.id === `${SUPERNODE_PREFIX}d-web`,
    );

    // Not `c7` and not "3 indexed artifacts".
    expect(supernode?.label).toBe("d-web");
    expect(supernode?.path).toBe("apps/web");
    // A folder stays a folder rather than taking the shape of whatever it
    // holds most of.
    expect(supernode?.type).toBe("directory");
    expect(supernode?.clusterCount).toBeGreaterThan(1);
  });

  it("counts what each merged edge stands for", () => {
    const wired: GraphData = {
      edges: [
        {
          broken: false,
          grade: "inferred",
          id: "e1",
          provenance: {
            confidence: 1,
            endLine: 1,
            grade: "inferred",
            relation: "imports",
            sourcePath: "a",
            startLine: 1,
          },
          source: "f-camera",
          target: "f-queue",
        },
        {
          broken: false,
          grade: "inferred",
          id: "e2",
          provenance: {
            confidence: 1,
            endLine: 1,
            grade: "inferred",
            relation: "imports",
            sourcePath: "a",
            startLine: 1,
          },
          source: "f-engine",
          target: "f-queue",
        },
      ],
      nodes: repository.nodes,
    };
    const collapsed = collapseGraph({
      assignment: hierarchyAssignment(wired, "far"),
      data: wired,
      positions: positionsOf(wired),
      templates: hierarchyTemplates(wired),
    });

    // One line between two packages, standing for two imports — and saying so.
    const between = collapsed.data.edges.filter((edge) =>
      edge.id.startsWith("cluster-"),
    );
    expect(between).toHaveLength(1);
    expect(between[0]?.mergedCount).toBe(2);
  });

  it("keeps the raw-render limit where it was", () => {
    // Below it the graph renders raw, which is the Obsidian aesthetic.
    expect(RAW_RENDER_NODE_LIMIT).toBe(3_000);
  });
});

describe("a merged edge is drawn thicker than a single one", () => {
  it("scales with the logarithm, so a hub pair is not a slab", () => {
    const base = { x: 0, y: 0 };
    const build = (mergedCount?: number) =>
      buildRenderFrame({
        data: {
          edges: [
            {
              broken: false,
              grade: "inferred",
              id: "e",
              ...(mergedCount === undefined ? {} : { mergedCount }),
              provenance: {
                confidence: 1,
                endLine: 1,
                grade: "inferred",
                relation: "imports",
                sourcePath: "a",
                startLine: 1,
              },
              source: "a",
              target: "b",
            },
          ],
          nodes: [node({ id: "a" }), node({ id: "b", x: 50 })],
        },
        palette: PALETTE,
        positions: new Map([
          ["a", base],
          ["b", { x: 50, y: 0 }],
        ]),
        viewport: VIEWPORT,
      }).edges[0]?.width as number;

    const single = build();
    expect(build(1)).toBe(single);
    expect(build(10)).toBeGreaterThan(single);
    expect(build(1_000)).toBeGreaterThan(build(10));
    // Four times the width at a thousand, not a thousand times.
    expect(build(1_000)).toBeLessThan(single * 5);
  });
});

describe("layers switch off a whole kind of thing", () => {
  const data: GraphData = {
    edges: [
      {
        broken: false,
        grade: "inferred",
        id: "e-import",
        provenance: {
          confidence: 1,
          endLine: 1,
          grade: "inferred",
          relation: "imports",
          sourcePath: "a",
          startLine: 1,
        },
        source: "a",
        target: "b",
      },
      {
        broken: false,
        grade: "inferred",
        id: "e-contains",
        provenance: {
          confidence: 1,
          endLine: 1,
          grade: "inferred",
          relation: "contains",
          sourcePath: "a",
          startLine: 1,
        },
        source: "dir",
        target: "a",
      },
    ],
    nodes: [
      node({ id: "a" }),
      node({ id: "b", x: 40 }),
      node({ id: "dir", type: "directory", x: 80 }),
      node({ id: "idea", type: "concept", x: 120 }),
      node({ id: "prose", type: "document", x: 160 }),
    ],
  };

  const frameWith = (hidden: GraphLayer[]) =>
    buildRenderFrame({
      data,
      hiddenLayers: new Set(hidden),
      palette: PALETTE,
      positions: positionsOf(data),
      viewport: VIEWPORT,
    });

  it("hides a relation without touching the nodes it joined", () => {
    const frame = frameWith(["contains"]);
    expect(frame.edges.map((e) => e.id)).toEqual(["e-import"]);
    // The folder and the file are both still on the map — only the line
    // between them is gone.
    expect(frame.nodes.map((n) => n.id)).toContain("dir");
    expect(frame.nodes.map((n) => n.id)).toContain("a");
  });

  it("hides a node kind, and the edges that reached it go with it", () => {
    const frame = frameWith(["concept", "doc"]);
    const drawn = frame.nodes.map((n) => n.id);
    expect(drawn).not.toContain("idea");
    expect(drawn).not.toContain("prose");
    expect(drawn).toContain("a");
  });

  it("is independent of the filter, and composes with it", () => {
    // A viewer who turns off co-change should not have their search cleared,
    // and a search should not turn a layer back on.
    const both = buildRenderFrame({
      data,
      hiddenLayers: new Set<GraphLayer>(["contains"]),
      palette: PALETTE,
      positions: positionsOf(data),
      viewport: VIEWPORT,
      visible: new Set(["a", "b", "dir"]),
    });
    expect(both.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "dir"]);
    expect(both.edges.map((e) => e.id)).toEqual(["e-import"]);
  });

  it("draws everything when nothing is switched off", () => {
    expect(frameWith([]).nodes).toHaveLength(data.nodes.length);
    expect(frameWith([]).edges).toHaveLength(data.edges.length);
  });

  it("offers only the layers it can actually switch off", () => {
    // The plan names seven. `style` and `config` are not here: the scanner
    // classifies them, but both arrive at the map as `code` nodes, so a
    // toggle for them would be a control that silently does nothing.
    expect([...GRAPH_LAYERS]).toEqual([
      "co_changed",
      "concept",
      "contains",
      "doc",
      "section",
    ]);
  });
});
