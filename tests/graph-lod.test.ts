import { describe, expect, test } from "vitest";

import {
  createFixtureGraph,
  type GraphData,
} from "../apps/web/lib/dashboard/graph-model";
import {
  RAW_RENDER_NODE_LIMIT,
  collapseGraph,
  communityAssignment,
  folderCommunity,
  isSupernodeId,
  shouldCollapse,
} from "../apps/web/lib/graph/clustering";
import { runForceLayout } from "../apps/web/lib/graph/force-simulation";
import {
  DEFAULT_PANEL_SETTINGS,
  GRAPH_PANEL_STORAGE_KEY,
  clampPanelSettings,
  forceConfigOf,
  parsePanelSettings,
  serializePanelSettings,
} from "../apps/web/lib/graph/graph-panel-settings";
import {
  LABEL_GRID_CELL_SIZE,
  LOD_PIXEL_THRESHOLDS,
  labelSizeFloor,
  lodForPixelSize,
  nodePixelSize,
  resolveLod,
  selectLabels,
  showsStatusBadges,
  type LabelCandidate,
} from "../apps/web/lib/graph/lod";
import {
  buildRenderFrame,
  nodeRadius,
  type GraphPalette,
} from "../apps/web/lib/graph/render-frame";
import { DEFAULT_FORCE_CONFIG } from "../apps/web/lib/graph/simulation-protocol";

const PALETTE: GraphPalette = {
  danger: 0x111111,
  inferred: 0x222222,
  "node-code": 0x333333,
  "node-doc": 0x444444,
  "node-requirement": 0x555555,
  "node-test": 0x666666,
  text: 0x777777,
  verified: 0x888888,
};

const VIEWPORT = { height: 800, width: 1200 };

function candidate(
  id: string,
  overrides: Partial<LabelCandidate> = {},
): LabelCandidate {
  return {
    degree: 1,
    id,
    label: id,
    pixelSize: 20,
    screenX: 100,
    screenY: 100,
    ...overrides,
  };
}

describe("zoom level of detail", () => {
  test("the three bands are decided by rendered node size, not raw zoom", () => {
    expect(lodForPixelSize(LOD_PIXEL_THRESHOLDS.mid - 0.1)).toBe("far");
    expect(lodForPixelSize(LOD_PIXEL_THRESHOLDS.mid)).toBe("mid");
    expect(lodForPixelSize(LOD_PIXEL_THRESHOLDS.near - 0.1)).toBe("mid");
    expect(lodForPixelSize(LOD_PIXEL_THRESHOLDS.near)).toBe("near");
  });

  test("the median radius decides the level so one huge hub cannot drag the view", () => {
    const radii = [4, 4, 4, 4, 40];

    expect(nodePixelSize(4, 1)).toBe(8);
    expect(resolveLod(radii, 1)).toBe("mid");
    expect(resolveLod(radii, 0.4)).toBe("far");
    expect(resolveLod(radii, 3)).toBe("near");
  });

  test("status badges are a Near-zoom affordance only", () => {
    expect(showsStatusBadges("far")).toBe(false);
    expect(showsStatusBadges("mid")).toBe(false);
    expect(showsStatusBadges("near")).toBe(true);
  });
});

describe("grid label decluttering", () => {
  test("Far zoom shows only the top hub labels", () => {
    const candidates = Array.from({ length: 40 }, (_, index) =>
      candidate(`n${String(index).padStart(2, "0")}`, {
        degree: index,
        screenX: 20 + index * 25,
      }),
    );

    const selected = selectLabels(candidates, {
      farHubLimit: 3,
      lod: "far",
      viewport: VIEWPORT,
    });

    expect(selected).toEqual(["n37", "n38", "n39"]);
  });

  test("Mid zoom keeps exactly one label per screen grid cell", () => {
    const cell = LABEL_GRID_CELL_SIZE;
    const candidates = [
      candidate("a", { degree: 1, screenX: 10, screenY: 10 }),
      candidate("b", { degree: 9, screenX: 40, screenY: 40 }),
      candidate("c", { degree: 4, screenX: 20, screenY: 60 }),
      candidate("d", { degree: 2, screenX: cell + 20, screenY: 10 }),
    ];

    expect(
      selectLabels(candidates, { lod: "mid", viewport: VIEWPORT }),
    ).toEqual(["b", "d"]);
  });

  test("the cell winner is degree-weighted and ties break deterministically", () => {
    const tied = [
      candidate("zeta", { degree: 5, pixelSize: 20 }),
      candidate("alpha", { degree: 5, pixelSize: 20 }),
    ];

    expect(selectLabels(tied, { lod: "mid", viewport: VIEWPORT })).toEqual([
      "alpha",
    ]);
    expect(
      selectLabels([...tied].reverse(), { lod: "mid", viewport: VIEWPORT }),
    ).toEqual(["alpha"]);
  });

  test("nodes rendered below the size threshold get no label", () => {
    const tiny = [candidate("tiny", { pixelSize: 1 })];

    expect(selectLabels(tiny, { lod: "mid", viewport: VIEWPORT })).toEqual([]);
    expect(selectLabels(tiny, { lod: "near", viewport: VIEWPORT })).toEqual([]);
  });

  test("raising the text fade threshold thins labels out", () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      candidate(`n${index}`, {
        degree: index,
        pixelSize: 4 + index,
        screenX: 30 + index * (LABEL_GRID_CELL_SIZE + 4),
      }),
    );
    const relaxed = selectLabels(candidates, {
      lod: "mid",
      textFadeThreshold: 0,
      viewport: VIEWPORT,
    });
    const strict = selectLabels(candidates, {
      lod: "mid",
      textFadeThreshold: 1,
      viewport: VIEWPORT,
    });

    expect(labelSizeFloor("mid", 1)).toBeGreaterThan(labelSizeFloor("mid", 0));
    expect(strict.length).toBeLessThan(relaxed.length);
    expect(relaxed).toEqual(expect.arrayContaining(strict));
  });

  test("Near zoom labels everything on screen and drops what is off it", () => {
    const candidates = [
      candidate("on", { screenX: 400, screenY: 400 }),
      candidate("off", { screenX: 9_000, screenY: 400 }),
    ];

    expect(
      selectLabels(candidates, { lod: "near", viewport: VIEWPORT }),
    ).toEqual(["on"]);
  });

  test("selection is stable across repeated calls", () => {
    const candidates = Array.from({ length: 60 }, (_, index) =>
      candidate(`n${index}`, {
        degree: index % 7,
        pixelSize: 8 + (index % 5),
        screenX: (index * 37) % VIEWPORT.width,
        screenY: (index * 53) % VIEWPORT.height,
      }),
    );
    const first = selectLabels(candidates, { lod: "mid", viewport: VIEWPORT });

    expect(
      selectLabels(candidates, { lod: "mid", viewport: VIEWPORT }),
    ).toEqual(first);
    expect([...first].sort()).toEqual(first);
  });
});

describe("render frame level of detail", () => {
  const data = createFixtureGraph(15);
  const positions = runForceLayout(data, undefined, 60, 9);

  /** Nodes whose screen position lands inside the viewport (plus the margin). */
  function onScreenCount(frame: ReturnType<typeof buildRenderFrame>): number {
    const { scale, x, y } = frame.camera;
    return frame.nodes.filter((node) => {
      const screenX = VIEWPORT.width / 2 + x + node.x * scale;
      const screenY = VIEWPORT.height / 2 + y + node.y * scale;
      return (
        screenX >= -48 &&
        screenY >= -48 &&
        screenX <= VIEWPORT.width + 48 &&
        screenY <= VIEWPORT.height + 48
      );
    }).length;
  }

  test("each zoom band labels its own share of the visible nodes", () => {
    const dense = createFixtureGraph(500);
    const densePositions = runForceLayout(dense, undefined, 60, 9);
    const at = (scale: number, graph = data, layout = positions) =>
      buildRenderFrame({
        camera: { scale, x: 0, y: 0 },
        data: graph,
        palette: PALETTE,
        positions: layout,
        viewport: VIEWPORT,
      });

    const near = at(3);
    const mid = at(1.1);
    const far = at(0.3);

    expect([near.lod, mid.lod, far.lod]).toEqual(["near", "mid", "far"]);
    // Near: every visible node is labelled.
    expect(near.labels).toHaveLength(onScreenCount(near));
    // Mid: the grid can only ever remove labels, never add them.
    expect(mid.labels.length).toBeLessThanOrEqual(onScreenCount(mid));
    // Far: hub labels only.
    expect(far.labels.length).toBeLessThanOrEqual(6);

    // On a crowded graph the grid visibly declutters.
    const denseMid = at(1.1, dense, densePositions);
    expect(denseMid.lod).toBe("mid");
    expect(denseMid.labels.length).toBeLessThan(onScreenCount(denseMid));
  });

  test("status badges are attached only at Near", () => {
    const near = buildRenderFrame({
      camera: { scale: 3, x: 0, y: 0 },
      data,
      palette: PALETTE,
      positions,
      viewport: VIEWPORT,
    });
    const far = buildRenderFrame({
      camera: { scale: 0.3, x: 0, y: 0 },
      data,
      palette: PALETTE,
      positions,
      viewport: VIEWPORT,
    });

    expect(near.nodes.every((node) => node.badge !== null)).toBe(true);
    expect(far.nodes.every((node) => node.badge === null)).toBe(true);
  });

  test("labels are placed clear of their node", () => {
    const frame = buildRenderFrame({
      camera: { scale: 3, x: 0, y: 0 },
      data,
      palette: PALETTE,
      positions,
      viewport: VIEWPORT,
    });
    const label = frame.labels[0];
    const node = frame.nodes.find((entry) => entry.id === label?.id);

    expect(label).toBeDefined();
    expect(label?.x).toBeGreaterThan((node?.x ?? 0) + (node?.radius ?? 0));
  });
});

describe("community clustering", () => {
  const large = createFixtureGraph(3_500);

  test("graphs at or below the raw limit are never collapsed", () => {
    expect(RAW_RENDER_NODE_LIMIT).toBe(3_000);
    expect(shouldCollapse(3_000, "far")).toBe(false);
    expect(shouldCollapse(3_500, "mid")).toBe(false);
    expect(shouldCollapse(3_500, "near")).toBe(false);
    expect(shouldCollapse(3_500, "far")).toBe(true);
  });

  test("louvain assigns more than one community and is deterministic", () => {
    const first = communityAssignment(large, { seed: 11 });
    const second = communityAssignment(large, { seed: 11 });

    expect(first.size).toBe(large.nodes.length);
    expect(new Set(first.values()).size).toBeGreaterThan(1);
    expect([...second.entries()]).toEqual([...first.entries()]);
  });

  test("the folder fallback groups by module path", () => {
    const node = large.nodes.find((entry) => entry.path.startsWith("modules/"));

    expect(folderCommunity(node!)).toMatch(/^modules\//);
    const edgeless = { edges: [], nodes: large.nodes.slice(0, 40) };
    const fallback = communityAssignment(edgeless);
    expect(new Set(fallback.values()).size).toBeGreaterThan(1);
  });

  test("Far zoom renders supernodes and expansion restores the raw members", () => {
    const assignment = communityAssignment(large, { seed: 3 });
    const positions = new Map(
      large.nodes.map((node, index) => [node.id, { x: index, y: index }]),
    );
    const collapsed = collapseGraph({ assignment, data: large, positions });
    const community = [...new Set(assignment.values())][0] as string;
    const partly = collapseGraph({
      assignment,
      data: large,
      expanded: new Set([community]),
      positions,
    });

    expect(collapsed.data.nodes.length).toBeLessThan(large.nodes.length);
    expect(collapsed.data.nodes.every((node) => isSupernodeId(node.id))).toBe(
      true,
    );
    expect(
      collapsed.data.nodes.reduce(
        (sum, node) => sum + (node.clusterCount ?? 0),
        0,
      ),
    ).toBe(large.nodes.length);
    expect(partly.data.nodes.length).toBeGreaterThan(
      collapsed.data.nodes.length,
    );
    expect(partly.data.nodes.some((node) => !isSupernodeId(node.id))).toBe(
      true,
    );
  });

  test("a supernode sits at the centroid of its members and keeps their worst grade", () => {
    const data: GraphData = {
      edges: [],
      nodes: [
        {
          ...(large.nodes[0] as GraphData["nodes"][number]),
          findingCount: 1,
          grade: "broken",
          id: "a",
          x: 0,
          y: 0,
        },
        {
          ...(large.nodes[0] as GraphData["nodes"][number]),
          findingCount: 2,
          grade: "verified",
          id: "b",
          x: 0,
          y: 0,
        },
      ],
    };
    const assignment = new Map([
      ["a", "team"],
      ["b", "team"],
    ]);
    const collapsed = collapseGraph({
      assignment,
      data,
      positions: new Map([
        ["a", { x: 0, y: 0 }],
        ["b", { x: 100, y: 40 }],
      ]),
    });
    const supernode = collapsed.data.nodes[0];

    expect(collapsed.data.nodes).toHaveLength(1);
    expect(supernode).toMatchObject({
      clusterCount: 2,
      findingCount: 3,
      grade: "broken",
      x: 50,
      y: 20,
    });
    expect(collapsed.positions.get(supernode!.id)).toEqual({ x: 50, y: 20 });
  });

  test("intra-community edges vanish and crossing edges merge at the worst grade", () => {
    const base = createFixtureGraph(15);
    const assignment = new Map(
      base.nodes.map((node) => [
        node.id,
        node.type === "test" ? "tests" : "rest",
      ]),
    );
    const collapsed = collapseGraph({
      assignment,
      data: base,
      positions: new Map(),
    });

    expect(collapsed.data.nodes.map((node) => node.id).sort()).toEqual([
      "community:rest",
      "community:tests",
    ]);
    expect(collapsed.data.edges).toHaveLength(1);
    expect(collapsed.data.edges[0]?.grade).toBe("broken");
  });

  test("the 3,500-node fixture shows supernodes at Far and raw nodes when expanded", () => {
    const assignment = communityAssignment(large, { seed: 3 });
    const positions = runForceLayout(large, undefined, 20, 3);
    const camera = { scale: 0.2, x: 0, y: 0 };
    const far = buildRenderFrame({
      assignment,
      camera,
      data: large,
      palette: PALETTE,
      positions,
      viewport: VIEWPORT,
    });
    const expanded = new Set([assignment.get(large.nodes[0]!.id) as string]);
    const opened = buildRenderFrame({
      assignment,
      camera,
      data: large,
      expanded,
      palette: PALETTE,
      positions,
      viewport: VIEWPORT,
    });
    const near = buildRenderFrame({
      assignment,
      camera: { scale: 3, x: 0, y: 0 },
      data: large,
      palette: PALETTE,
      positions,
      viewport: VIEWPORT,
    });

    expect(far.lod).toBe("far");
    expect(far.nodes.length).toBeLessThan(large.nodes.length);
    expect(far.nodes.every((node) => (node.clusterCount ?? 0) > 0)).toBe(true);
    expect(opened.nodes.length).toBeGreaterThan(far.nodes.length);
    expect(near.nodes).toHaveLength(large.nodes.length);
  });

  test("collapsed supernodes grow with the number of members", () => {
    expect(nodeRadius(2, 400)).toBeGreaterThan(nodeRadius(2, 4));
  });
});

describe("force panel settings", () => {
  test("defaults are the published force defaults plus the fade slider", () => {
    expect(forceConfigOf(DEFAULT_PANEL_SETTINGS)).toEqual(DEFAULT_FORCE_CONFIG);
    expect(DEFAULT_PANEL_SETTINGS.textFadeThreshold).toBeGreaterThanOrEqual(0);
    expect(GRAPH_PANEL_STORAGE_KEY).toBe("arr-graph-panel");
  });

  test("values survive a serialize and reload round trip", () => {
    const settings = clampPanelSettings({
      collapsed: true,
      linkDistance: 180,
      textFadeThreshold: 0.8,
    });

    expect(parsePanelSettings(serializePanelSettings(settings))).toEqual(
      settings,
    );
  });

  test("out-of-range and corrupt payloads degrade to the defaults", () => {
    expect(parsePanelSettings(null)).toEqual(DEFAULT_PANEL_SETTINGS);
    expect(parsePanelSettings("not json")).toEqual(DEFAULT_PANEL_SETTINGS);
    expect(parsePanelSettings("[1,2,3]").linkDistance).toBe(
      DEFAULT_PANEL_SETTINGS.linkDistance,
    );
    expect(
      parsePanelSettings('{"linkDistance":99999,"textFadeThreshold":42}'),
    ).toMatchObject({ linkDistance: 400, textFadeThreshold: 1 });
  });

  test("a partial payload keeps the values it does carry", () => {
    const restored = parsePanelSettings(
      '{"repelStrength":700,"collapsed":true}',
    );

    expect(restored.repelStrength).toBe(700);
    expect(restored.collapsed).toBe(true);
    expect(restored.linkDistance).toBe(DEFAULT_PANEL_SETTINGS.linkDistance);
  });
});
