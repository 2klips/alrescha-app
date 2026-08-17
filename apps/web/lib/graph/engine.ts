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
import { communityAssignment } from "./clustering";
import type { LodLevel } from "./lod";
import {
  buildRenderFrame,
  type Camera,
  type GraphPalette,
  type RenderFrame,
  type Viewport,
  DEFAULT_CAMERA,
  DEFAULT_VIEWPORT,
} from "./render-frame";
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
  /** Build and hand the current frame to the backend. */
  paint(): void;
  positions(): ReadonlyMap<string, Position>;
  ready(): boolean;
  resize(width: number, height: number): void;
  setCamera(camera: Camera): void;
  setData(data: GraphData): void;
  setForceConfig(partial: Partial<ForceConfig>): void;
  /** In-place visual update — never touches the simulation. */
  setGlow(
    intensities: ReadonlyMap<string, number>,
    afterglow?: ReadonlySet<string>,
  ): void;
  setPalette(palette: GraphPalette): void;
  setSelectedNode(nodeId: string | null): void;
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
  let viewport: Viewport = options.viewport ?? DEFAULT_VIEWPORT;
  let textFadeThreshold = options.textFadeThreshold ?? 0;
  let ready = false;
  let disposed = false;
  let layoutRestarts = 0;
  let glow: ReadonlyMap<string, number> = new Map();
  let afterglow: ReadonlySet<string> = new Set();
  const buffer: PositionBuffer = createPositionBuffer();

  // Community detection runs once per graph, not per frame: collapsing is a
  // display decision, the assignment is a property of the structure.
  let assignment = communityAssignment(data, { seed: options.seed ?? 1 });
  const expanded = new Set<string>();

  worker.setMessageHandler((raw) => {
    if (disposed) return;
    const message = parseWorkerMessage(raw);
    if (!message) return;
    if (message.type === "ready") {
      ready = true;
      return;
    }
    if (message.type === "positions") {
      buffer.push(nodeIds, message.positions, now());
    }
  });

  worker.postMessage(createStartMessage(data, config, options.seed ?? 1));
  layoutRestarts += 1;
  backend.setPalette(palette);

  function frame(): RenderFrame {
    return buildRenderFrame({
      afterglow,
      assignment,
      camera,
      data,
      expanded,
      glow,
      palette,
      positions: buffer.at(now()),
      selectedNodeId,
      textFadeThreshold,
      viewport,
    });
  }

  return {
    camera: () => ({ ...camera }),
    expanded: () => new Set(expanded),
    lod: () => frame().lod,
    toggleCommunity(community) {
      if (expanded.has(community)) expanded.delete(community);
      else expanded.add(community);
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
    focusNode(nodeId) {
      const simulated = buffer.at(now()).get(nodeId);
      const fallback = data.nodes.find((node) => node.id === nodeId);
      const position =
        simulated ?? (fallback ? { x: fallback.x, y: fallback.y } : null);
      if (!position) return false;
      camera = {
        scale: camera.scale,
        x: -position.x * camera.scale,
        y: -position.y * camera.scale,
      };
      return true;
    },
    forceConfig: () => ({ ...config }),
    frame,
    framesReceived: () => buffer.frames(),
    glow: () => new Map(glow),
    layoutRestarts: () => layoutRestarts,
    paint() {
      if (disposed) return;
      backend.render(frame());
    },
    positions: () => buffer.at(now()),
    ready: () => ready,
    resize(width, height) {
      viewport = { height, width };
      if (!disposed) backend.resize(width, height);
    },
    setCamera(next) {
      camera = { ...next };
    },
    setData(next) {
      data = next;
      nodeIds = next.nodes.map((node) => node.id);
      assignment = communityAssignment(next, { seed: options.seed ?? 1 });
      expanded.clear();
      buffer.reset();
      if (disposed) return;
      worker.postMessage(createStartMessage(next, config, options.seed ?? 1));
      layoutRestarts += 1;
    },
    setForceConfig(partial) {
      config = clampForceConfig({ ...config, ...partial });
      if (!disposed) worker.postMessage({ config, type: "config" });
    },
    setGlow(intensities, nextAfterglow) {
      glow = intensities;
      afterglow = nextAfterglow ?? new Set();
    },
    setPalette(next) {
      palette = next;
      if (!disposed) backend.setPalette(next);
    },
    setSelectedNode(nodeId) {
      selectedNodeId = nodeId;
    },
    setTextFadeThreshold(value) {
      textFadeThreshold = Math.min(1, Math.max(0, value));
    },
    setViewport(next) {
      viewport = next;
    },
  };
}
