/**
 * Brain-map engine lifecycle (Phase 2A todo 4).
 *
 * Owns exactly two disposable resources — the simulation Worker and the
 * renderer backend — and counts both, because the acceptance criterion for
 * this todo is "mount/unmount ×10 leaves no detached worker and no lost GPU
 * context". Both are injected, so the whole lifecycle is testable in node with
 * no Worker and no WebGL.
 */

import type { GraphData } from "../dashboard/graph-model";
import { hierarchyAssignment, hierarchyTemplates } from "./clustering";
import type { LodLevel } from "./lod";
import {
  buildRenderFrame,
  type Camera,
  type GraphPalette,
  type GraphLayer,
  type RenderFrame,
  type Viewport,
  DEFAULT_CAMERA,
  DEFAULT_VIEWPORT,
} from "./render-frame";
import { fitToView } from "./camera";
import { buildHitIndex, type HitIndex } from "./hit-test";
import { createPositionBuffer, type PositionBuffer } from "./position-buffer";
import {
  clampForceConfig,
  createStartMessage,
  parseWorkerMessage,
  type ForceConfig,
  type Position,
} from "./simulation-protocol";

/** Minimal Worker surface — a real `Worker` is adapted by `wrapWorker`. */
export interface SimulationWorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  setMessageHandler(handler: (data: unknown) => void): void;
  terminate(): void;
}

export function wrapWorker(worker: Worker): SimulationWorkerLike {
  return {
    postMessage: (message, transfer) =>
      transfer && transfer.length > 0
        ? worker.postMessage(message, transfer)
        : worker.postMessage(message),
    setMessageHandler: (handler) => {
      worker.onmessage = (event: MessageEvent) => handler(event.data);
    },
    terminate: () => worker.terminate(),
  };
}

/** What the Pixi adapter must implement. */
export interface GraphBackend {
  destroy(): void;
  render(frame: RenderFrame): void;
  resize(width: number, height: number): void;
  setPalette(palette: GraphPalette): void;
}

export interface EngineCounters {
  backendsCreated: number;
  backendsDestroyed: number;
  /** Incremented from the backend's `webglcontextlost` handler. */
  contextLosses: number;
  workersCreated: number;
  workersTerminated: number;
}

const counters: EngineCounters = {
  backendsCreated: 0,
  backendsDestroyed: 0,
  contextLosses: 0,
  workersCreated: 0,
  workersTerminated: 0,
};

/** Test hook: live resource counters for the leak assertions. */
export function readEngineCounters(): EngineCounters {
  return { ...counters };
}

export function resetEngineCounters(): void {
  counters.backendsCreated = 0;
  counters.backendsDestroyed = 0;
  counters.contextLosses = 0;
  counters.workersCreated = 0;
  counters.workersTerminated = 0;
}

/** Called by the renderer backend when the GPU drops the context. */
export function recordContextLoss(): void {
  counters.contextLosses += 1;
}

export interface GraphEngineOptions {
  createBackend: () => GraphBackend | Promise<GraphBackend>;
  createWorker: () => SimulationWorkerLike;
  data: GraphData;
  forceConfig?: Partial<ForceConfig>;
  /** Injected for tests; defaults to `Date.now`. */
  now?: () => number;
  palette: GraphPalette;
  seed?: number;
  textFadeThreshold?: number;
  viewport?: Viewport;
}

export interface GraphEngine {
  camera(): Camera;
  /** Community keys the user has clicked open. */
  expanded(): ReadonlySet<string>;
  /** Toggle a community between supernode and raw members. */
  toggleCommunity(community: string): void;
  lod(): LodLevel;
  disposed(): boolean;
  dispose(): void;
  /**
   * Centre the camera on a node without disturbing the layout — the feed's
   * "click an event, fly to the node" gesture. Returns false for an unknown id.
   */
  focusNode(nodeId: string): boolean;
  /**
   * Where the camera would have to be to frame every simulated node, or
   * `null` when there is nothing to frame. Computed, never applied: the
   * mounted map glides to it, and a caller that wants it now passes it
   * straight to `setCamera`.
   */
  cameraForFit(padding?: number): Camera | null;
  /** Where the camera would have to be to centre one node. */
  cameraForNode(nodeId: string): Camera | null;
  /**
   * The node painted under this point on screen, or null (todo 10).
   *
   * Asked of the frame the backend last painted, so the answer is about what
   * is on the screen rather than about where the simulation has since moved
   * things. The index is rebuilt only when that frame changes, so panning and
   * zooming cost nothing.
   */
  nodeAt(screenX: number, screenY: number): string | null;
  forceConfig(): ForceConfig;
  /** The render plan for the current instant, without painting it. */
  frame(): RenderFrame;
  framesReceived(): number;
  /** Node id → 0…1 neuron-glow intensity currently applied. */
  glow(): ReadonlyMap<string, number>;
  /**
   * Test hook: how many times the layout has been (re)started. Applying glow
   * must never increment it — visual state and layout are separate systems.
   */
  layoutRestarts(): number;
  /**
   * Build and hand the current frame to the backend. Pass an already-built
   * `RenderFrame` (e.g. one the caller also needs for its own bookkeeping
   * this tick) to skip building a second one; omit it to build fresh, as
   * every existing caller does. Always paints — see `paintIfChanged` for the
   * animation-loop form.
   */
  paint(frame?: RenderFrame): void;
  /**
   * Paint only if something moved since the last painted frame: any engine
   * mutation, or a new set of interpolated positions. Returns the frame it
   * painted, or `null` when the tick was skipped (perf research MT-4).
   *
   * A settled simulation stops streaming positions and the buffer then hands
   * back the same map object every tick, so an untouched, settled graph costs
   * one comparison per animation frame instead of a full frame plan and a GPU
   * pass.
   */
  paintIfChanged(): RenderFrame | null;
  positions(): ReadonlyMap<string, Position>;
  ready(): boolean;
  /**
   * True once the worker has reported that the layout converged, false again
   * the moment anything restarts it. A browser test can wait on this instead
   * of sleeping, and the map uses the first transition to frame the graph.
   */
  settled(): boolean;
  resize(width: number, height: number): void;
  setCamera(camera: Camera): void;
  setData(data: GraphData): void;
  setForceConfig(partial: Partial<ForceConfig>): void;
  /** In-place visual update — never touches the simulation. */
  setGlow(
    intensities: ReadonlyMap<string, number>,
    afterglow?: ReadonlySet<string>,
  ): void;
  setDirectionalFocus(enabled: boolean): void;
  setPalette(palette: GraphPalette): void;
  setSelectedNode(nodeId: string | null): void;
  /**
   * Which nodes to draw, or null for all of them (Phase 4 Wave B todo 13).
   *
   * **This never restarts the layout.** Filtering used to build a new
   * `GraphData` and call `setData`, which re-ran the simulation from the
   * seeded spiral: every keystroke in the search box threw the layout away,
   * so the graph exploded and re-formed while someone was typing a filename.
   * Where a node sits is a property of the repository, not of what a viewer
   * is looking at.
   */
  setVisibility(nodeIds: ReadonlySet<string> | null): void;
  visibleNodes(): ReadonlySet<string> | null;
  /** Layers the viewer switched off. Also a visual change, also no restart. */
  setHiddenLayers(layers: ReadonlySet<GraphLayer> | null): void;
  /** The node under the pointer: its neighbourhood stays lit, the rest fades. */
  setHoveredNode(nodeId: string | null): void;
  hoveredNode(): string | null;
  /**
   * Hold a node at a world point while a pointer drags it (todo 11), and
   * show it there immediately rather than waiting for the worker to answer.
   * The rest of the graph keeps simulating around it: dragging a hub pulls
   * its neighbourhood after it, which is the feedback that makes a graph feel
   * like a thing rather than a picture.
   */
  pinNode(nodeId: string, x: number, y: number): void;
  /** Let go, and let the layout reclaim the node. */
  releaseNode(nodeId: string): void;
  /** The node a pointer is currently holding, or null. */
  pinnedNode(): string | null;
  setTextFadeThreshold(value: number): void;
  setViewport(viewport: Viewport): void;
}

export async function createGraphEngine(
  options: GraphEngineOptions,
): Promise<GraphEngine> {
  const now = options.now ?? (() => Date.now());
  const backend = await options.createBackend();
  counters.backendsCreated += 1;

  const worker = options.createWorker();
  counters.workersCreated += 1;

  let data = options.data;
  let nodeIds = data.nodes.map((node) => node.id);
  let config = clampForceConfig(options.forceConfig);
  let camera: Camera = { ...DEFAULT_CAMERA };
  let palette = options.palette;
  let selectedNodeId: string | null = null;
  let hoveredNodeId: string | null = null;
  let pinnedNodeId: string | null = null;
  let visibleNodeIds: ReadonlySet<string> | null = null;
  let hiddenLayers: ReadonlySet<GraphLayer> | null = null;
  let directionalFocus = false;
  let viewport: Viewport = options.viewport ?? DEFAULT_VIEWPORT;
  let textFadeThreshold = options.textFadeThreshold ?? 0;
  let ready = false;
  let disposed = false;
  /** Set by the worker when alpha falls under its floor; cleared by anything that restarts the layout. */
  let settled = false;
  let layoutRestarts = 0;
  let glow: ReadonlyMap<string, number> = new Map();
  let afterglow: ReadonlySet<string> = new Set();
  const buffer: PositionBuffer = createPositionBuffer();

  // Community detection runs once per graph, not per frame: collapsing is a
  // display decision, the assignment is a property of the structure.
  // Far is the only level that collapses, so that is the level the
  // assignment is built for (todo 13). It is the directory tree where there
  // is one and Louvain where there is not.
  let assignment = hierarchyAssignment(data, "far", {
    seed: options.seed ?? 1,
  });
  let templates = hierarchyTemplates(data);
  const expanded = new Set<string>();

  /**
   * Bumped by every mutation that a frame can see (MT-4). Positions are not
   * counted here — they are compared by the identity of the buffer's output,
   * which is stable exactly when the interpolation has nothing left to do.
   */
  let revision = 0;
  /**
   * Bumped by everything a camera move is not (Phase 4 Wave B todo 12).
   *
   * The renderer keeps its world geometry across frames and rebuilds it only
   * when this changes: panning and zooming move the container, and nothing
   * about the graph itself is different. Separating the two counters is what
   * lets a settled graph be panned for free.
   */
  let geometryRevision = 0;
  let paintedRevision = -1;
  let paintedPositions: ReadonlyMap<string, Position> | null = null;
  const touch = () => {
    revision += 1;
    geometryRevision += 1;
  };
  /** A camera move: the frame changes, the world geometry does not. */
  const touchCamera = () => {
    revision += 1;
  };

  worker.setMessageHandler((raw) => {
    if (disposed) return;
    const message = parseWorkerMessage(raw);
    if (!message) return;
    if (message.type === "ready") {
      ready = true;
      return;
    }
    if (message.type === "positions") {
      settled = false;
      geometryRevision += 1;
      buffer.push(nodeIds, message.positions, now());
      return;
    }
    // The worker says when the layout has converged; until todo 9 nobody
    // listened, so "the graph has stopped moving" was a fact the engine
    // received every run and threw away. It is the moment a first fit is
    // worth doing and the signal a browser test can wait on instead of
    // sleeping for a second and hoping.
    if (message.type === "settled") {
      settled = true;
      touch();
    }
  });

  worker.postMessage(createStartMessage(data, config, options.seed ?? 1));
  layoutRestarts += 1;
  backend.setPalette(palette);

  /**
   * Where the camera would have to be to centre this node, without moving
   * it. Separating the arithmetic from the move is what lets the mounted map
   * *glide* to a node while `focusNode` keeps its jump-there semantics for
   * everyone else.
   */
  function cameraForNode(nodeId: string): Camera | null {
    const simulated = buffer.at(now()).get(nodeId);
    const fallback = data.nodes.find((node) => node.id === nodeId);
    const position =
      simulated ?? (fallback ? { x: fallback.x, y: fallback.y } : null);
    if (!position) return null;
    return {
      scale: camera.scale,
      x: -position.x * camera.scale,
      y: -position.y * camera.scale,
    };
  }

  /**
   * The index for the frame most recently built, rebuilt only when that
   * frame changes. It is keyed on frame identity rather than on a revision
   * counter because that is exactly the question it needs answered: is the
   * picture I indexed still the picture on screen?
   */
  let indexedFrame: RenderFrame | null = null;
  let hitIndex: HitIndex | null = null;

  function indexFor(built: RenderFrame): HitIndex {
    if (indexedFrame !== built || !hitIndex) {
      indexedFrame = built;
      hitIndex = buildHitIndex(built, viewport);
    }
    return hitIndex;
  }

  function frameAt(positions: ReadonlyMap<string, Position>): RenderFrame {
    return buildRenderFrame({
      afterglow,
      assignment,
      camera,
      data,
      directionalFocus,
      expanded,
      geometryRevision,
      glow,
      templates,
      hoveredNodeId,
      ...(visibleNodeIds ? { visible: visibleNodeIds } : {}),
      ...(hiddenLayers ? { hiddenLayers } : {}),
      palette,
      positions,
      selectedNodeId,
      textFadeThreshold,
      viewport,
    });
  }

  function frame(): RenderFrame {
    return frameAt(buffer.at(now()));
  }

  /** The last frame handed to the backend, so a hit test asks about what is on screen. */
  let lastBuilt: RenderFrame | null = null;

  return {
    camera: () => ({ ...camera }),
    expanded: () => new Set(expanded),
    lod: () => frame().lod,
    toggleCommunity(community) {
      if (expanded.has(community)) expanded.delete(community);
      else expanded.add(community);
      touch();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      worker.postMessage({ type: "stop" });
      worker.terminate();
      counters.workersTerminated += 1;
      backend.destroy();
      counters.backendsDestroyed += 1;
      buffer.reset();
    },
    disposed: () => disposed,
    cameraForFit: (padding) =>
      fitToView(
        buffer.at(now()).values(),
        viewport,
        padding === undefined
          ? { scale: camera.scale }
          : { padding, scale: camera.scale },
      ),
    cameraForNode,
    focusNode(nodeId) {
      const next = cameraForNode(nodeId);
      if (!next) return false;
      camera = next;
      touch();
      return true;
    },
    forceConfig: () => ({ ...config }),
    frame,
    framesReceived: () => buffer.frames(),
    glow: () => new Map(glow),
    layoutRestarts: () => layoutRestarts,
    paint(prebuilt) {
      if (disposed) return;
      const built = prebuilt ?? frame();
      lastBuilt = built;
      backend.render(built);
    },
    paintIfChanged() {
      if (disposed) return null;
      const positions = buffer.at(now());
      if (revision === paintedRevision && positions === paintedPositions) {
        return null;
      }
      const built = frameAt(positions);
      lastBuilt = built;
      backend.render(built);
      paintedRevision = revision;
      paintedPositions = positions;
      return built;
    },
    positions: () => buffer.at(now()),
    ready: () => ready,
    settled: () => settled,
    resize(width, height) {
      viewport = { height, width };
      touch();
      if (!disposed) backend.resize(width, height);
    },
    setCamera(next) {
      camera = { ...next };
      touchCamera();
    },
    setData(next) {
      data = next;
      nodeIds = next.nodes.map((node) => node.id);
      assignment = hierarchyAssignment(next, "far", {
        seed: options.seed ?? 1,
      });
      templates = hierarchyTemplates(next);
      expanded.clear();
      buffer.reset();
      settled = false;
      touch();
      if (disposed) return;
      worker.postMessage(createStartMessage(next, config, options.seed ?? 1));
      layoutRestarts += 1;
    },
    setForceConfig(partial) {
      config = clampForceConfig({ ...config, ...partial });
      // New forces mean the layout is moving again, whatever it was doing.
      settled = false;
      if (!disposed) worker.postMessage({ config, type: "config" });
    },
    setGlow(intensities, nextAfterglow) {
      glow = intensities;
      afterglow = nextAfterglow ?? new Set();
      touch();
    },
    setDirectionalFocus(enabled) {
      directionalFocus = enabled;
      touch();
    },
    setPalette(next) {
      palette = next;
      touch();
      if (!disposed) backend.setPalette(next);
    },
    setSelectedNode(nodeId) {
      selectedNodeId = nodeId;
      touch();
    },
    visibleNodes: () => visibleNodeIds,
    setHiddenLayers(layers) {
      hiddenLayers = layers;
      touch();
    },
    setVisibility(nodeIds) {
      visibleNodeIds = nodeIds;
      // A visual change, not a layout one: no `createStartMessage`, no
      // `layoutRestarts`, no reheat. The test asserts exactly that.
      touch();
    },
    hoveredNode: () => hoveredNodeId,
    pinnedNode: () => pinnedNodeId,
    pinNode(nodeId, x, y) {
      const slot = nodeIds.indexOf(nodeId);
      if (slot === -1) return;
      pinnedNodeId = nodeId;
      // Held in the buffer as well as sent to the worker. A drag that waited
      // for the round trip would lag the pointer by a frame at 30Hz, and the
      // node would trail the finger it is supposed to be under.
      buffer.hold(nodeId, { x, y });
      touch();
      if (!disposed) worker.postMessage({ slot, type: "pin", x, y });
    },
    releaseNode(nodeId) {
      const slot = nodeIds.indexOf(nodeId);
      pinnedNodeId = null;
      buffer.release(nodeId);
      touch();
      if (slot !== -1 && !disposed) {
        worker.postMessage({ slot, type: "unpin" });
      }
    },
    setHoveredNode(nodeId) {
      if (hoveredNodeId === nodeId) return;
      hoveredNodeId = nodeId;
      touch();
    },
    nodeAt(screenX, screenY) {
      const built = lastBuilt ?? frame();
      return indexFor(built).at(screenX, screenY)?.id ?? null;
    },
    setTextFadeThreshold(value) {
      textFadeThreshold = Math.min(1, Math.max(0, value));
      touch();
    },
    setViewport(next) {
      viewport = next;
      touch();
    },
  };
}
