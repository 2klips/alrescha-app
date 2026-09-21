"use client";

/**
 * Client mount for the Pixi brain map (Phase 2A todo 4, extended by todo 5).
 *
 * Loaded through `dynamic(..., { ssr: false })` from `brain-map-stage.tsx`, so
 * neither Pixi nor the Worker is ever evaluated on the server. Everything this
 * component owns is torn down on unmount: the rAF loop, the observers, the
 * Worker and the WebGL context.
 *
 * The engine is created exactly once. Prop changes are applied *into* the live
 * engine — recreating it on every slider drag would restart the simulation and
 * throw the layout away.
 */

import { useEffect, useRef, type RefObject } from "react";

import type { GraphData } from "../../lib/dashboard/graph-model";
import {
  approachCamera,
  cameraEquals,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "../../lib/graph/camera";
import {
  createGraphEngine,
  wrapWorker,
  type GraphEngine,
} from "../../lib/graph/engine";
import type {
  Camera,
  GraphDisplaySettings,
  GraphLayer,
  RenderFrame,
} from "../../lib/graph/render-frame";
import type { SymbolHalo } from "../../lib/graph/symbol-halo";
import type {
  ForceConfig,
  Position,
} from "../../lib/graph/simulation-protocol";
import { readDesignToken, readRendererPalette } from "../../lib/theme/tokens";

export interface BrainMapProps {
  /** Nodes carrying the residual afterglow tint. */
  afterglow?: ReadonlySet<string>;
  data: GraphData;
  /** Directional focus mode: selection tints edges by direction (todo 2). */
  directionalFocus?: boolean;
  /** Orphans, arrows, node size, link thickness, groups (todo 13 ⓒ). */
  display?: GraphDisplaySettings;
  /**
   * Increment to ask the camera to frame the whole graph. A number rather
   * than a callback because the request travels *into* this component: the
   * button lives in the surrounding markup and the camera lives here, and a
   * changing token says "again" where a boolean could not.
   */
  fitRequest?: number;
  /** Camera target — the activity feed's "fly to this node" gesture. */
  focusNodeId?: string | null;
  forceConfig?: Partial<ForceConfig>;
  /** Node id → 0…1 neuron-glow intensity, updated in place every batch. */
  glow?: ReadonlyMap<string, number>;
  /**
   * The DOM hit layer owned by `BrainMapStage`. WebGL has no accessibility
   * tree and no click targets, so the stage renders one button per node and
   * this component keeps them parked over their painted node.
   */
  hitLayer?: RefObject<HTMLDivElement | null>;
  onLodChange?: (lod: string, labelCount: number) => void;
  /** Fires when the canvas hit test changes what is under the pointer. */
  onHoverChange?: (nodeId: string | null) => void;
  /** Double-click on a node the canvas hit test found. */
  onNodeActivate?: (nodeId: string) => void;
  /** Click on a node the canvas hit test found. */
  onNodeSelect?: (nodeId: string) => void;
  /** Fires on every change of "the layout has stopped moving". */
  onSettledChange?: (settled: boolean) => void;
  /**
   * Which nodes to draw, or absent for all of them (todo 13). Filtering goes
   * through here rather than through `data`, so it never restarts the layout.
   */
  visibleNodeIds?: ReadonlySet<string> | undefined;
  /** Layers the viewer switched off (todo 13). */
  hiddenLayers?: ReadonlySet<GraphLayer> | undefined;
  /** A saved layout to start warm from; read at mount only (todo 13 ⓐ). */
  initialPositions?: ReadonlyMap<string, Position> | null | undefined;
  /** Fires once each time the layout converges, with where everything sits. */
  onLayoutSettled?: (positions: ReadonlyMap<string, Position>) => void;
  /** Persistent pins; null = "where it is now" (todo 13 ⓒ). */
  pins?: ReadonlyMap<string, Position | null> | undefined;
  /** The engine's resolved pins, after a pin request or a drag of a pinned node. */
  onPinsChange?: (pins: ReadonlyMap<string, Position>) => void;
  seed?: number;
  selectedNodeId?: string | null;
  /** The selected file's symbol layer (todo 26); drawn as a halo at Near. */
  symbolHalo?: SymbolHalo | null;
  textFadeThreshold?: number;
  /** The element the canvas is mounted into and gestures are bound to. */
  viewport: RefObject<HTMLDivElement | null>;
}

/**
 * One wheel notch. Multiplicative, so a notch out undoes a notch in exactly.
 */
const ZOOM_STEP = 1.15;

/**
 * Screen margin left around the graph when the camera frames it. Enough that
 * the outermost nodes are not clipped by their own radius or their label.
 */
const FIT_PADDING = 64;

/**
 * Hit targets are pointer/keyboard affordances, not pixels — syncing them at
 * 10Hz keeps them under the finger without paying a DOM write per node per
 * frame.
 */
const HIT_LAYER_SYNC_MS = 100;

/** Smallest comfortable click target, whatever the node's painted radius. */
const MIN_HIT_SIZE = 20;

/** The pins that already have a point — what a start message can carry. */
function resolvedPins(
  pins: ReadonlyMap<string, Position | null> | undefined,
): Map<string, Position> {
  const resolved = new Map<string, Position>();
  for (const [nodeId, position] of pins ?? []) {
    if (position) resolved.set(nodeId, position);
  }
  return resolved;
}

function samePoint(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}

export function BrainMap({
  afterglow,
  data,
  directionalFocus,
  display,
  fitRequest,
  focusNodeId,
  forceConfig,
  glow,
  hitLayer,
  initialPositions,
  onHoverChange,
  onLayoutSettled,
  onLodChange,
  onNodeActivate,
  onNodeSelect,
  onPinsChange,
  onSettledChange,
  pins,
  seed,
  selectedNodeId,
  symbolHalo,
  textFadeThreshold,
  hiddenLayers,
  viewport: viewportRef,
  visibleNodeIds,
}: BrainMapProps) {
  const engineRef = useRef<GraphEngine | null>(null);
  /**
   * Where the camera is heading, or null when it is not heading anywhere.
   *
   * This component owns the camera while the map is mounted: a gesture moves
   * the target and the animation loop eases the engine toward it. The loop
   * stops writing the moment it arrives, so `engine.setCamera` from anywhere
   * else still takes effect — it is adopted rather than fought.
   */
  const cameraTargetRef = useRef<Camera | null>(null);
  /**
   * Whether a person has moved the camera. The first automatic fit is a
   * courtesy for someone who has not touched anything yet; doing it to
   * someone who has just panned somewhere would be the map taking the wheel.
   */
  const cameraTouchedRef = useRef(false);
  const latest = useRef({
    data,
    directionalFocus,
    display,
    forceConfig,
    initialPositions,
    pins,
    seed,
    textFadeThreshold,
  });
  latest.current = {
    data,
    directionalFocus,
    display,
    forceConfig,
    initialPositions,
    pins,
    seed,
    textFadeThreshold,
  };
  const started = useRef(false);
  const hitLayerRef = useRef(hitLayer);
  hitLayerRef.current = hitLayer;
  /*
   * Callbacks are read through a ref, never through the effect's dependency
   * list. `onLodChange` fires whenever the label set changes, which re-renders
   * the parent and hands us a fresh closure — as a dependency that would tear
   * the engine down and rebuild it on nearly every frame.
   */
  const onLodChangeRef = useRef(onLodChange);
  onLodChangeRef.current = onLodChange;
  const onSettledChangeRef = useRef(onSettledChange);
  onSettledChangeRef.current = onSettledChange;
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;
  const onNodeActivateRef = useRef(onNodeActivate);
  onNodeActivateRef.current = onNodeActivate;
  const onHoverChangeRef = useRef(onHoverChange);
  onHoverChangeRef.current = onHoverChange;
  const onLayoutSettledRef = useRef(onLayoutSettled);
  onLayoutSettledRef.current = onLayoutSettled;
  const onPinsChangeRef = useRef(onPinsChange);
  onPinsChangeRef.current = onPinsChange;

  useEffect(() => {
    const host = viewportRef.current;
    if (!host) return;
    /*
     * A canvas is created per mount and removed on dispose, rather than being
     * a JSX element React keeps across mounts. Two `Application.init()` calls
     * on one canvas — which is exactly what a remount (React StrictMode, HMR,
     * route return) produces — race for the same WebGL context and leave Pixi
     * rendering into a lost one.
     */
    const canvas = document.createElement("canvas");
    canvas.className = "brain-map-canvas";
    host.prepend(canvas);
    const initial = latest.current;
    let disposed = false;
    let engine: GraphEngine | null = null;
    let frameHandle = 0;

    const bounds = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    let viewport = { height, width };

    /**
     * Park each hit target over the node it stands for, using exactly the
     * screen transform the renderer uses, so the DOM affordance and the painted
     * node can never drift apart.
     */
    function syncHitLayer(created: GraphEngine, frame: RenderFrame) {
      const layer = hitLayerRef.current?.current;
      if (!layer) return;
      const painted = new Map(frame.nodes.map((node) => [node.id, node]));
      const scale = created.camera().scale;
      const camera = created.camera();
      for (const target of layer.querySelectorAll<HTMLElement>(
        "[data-node-id]",
      )) {
        const node = painted.get(target.dataset.nodeId ?? "");
        if (!node) {
          target.hidden = true;
          continue;
        }
        target.hidden = false;
        // Rounded to whole pixels: once the simulation has cooled its residual
        // motion is sub-pixel, and an unrounded write would keep nudging the
        // element forever — a target that never stops moving is a target a
        // pointer (and Playwright's stability check) can never settle on.
        const size = Math.round(
          Math.max(MIN_HIT_SIZE, node.radius * 2 * scale),
        );
        const screen = worldToScreen(camera, viewport, node);
        target.style.left = `${Math.round(screen.x)}px`;
        target.style.top = `${Math.round(screen.y)}px`;
        target.style.width = `${size}px`;
        target.style.height = `${size}px`;
      }
    }

    void createGraphEngine({
      createBackend: async () => {
        const { createPixiBackend } =
          await import("../../lib/graph/pixi-backend");
        return createPixiBackend({
          canvas,
          fontFamily: readDesignToken("font-sans"),
          height,
          palette: readRendererPalette(),
          width,
        });
      },
      createWorker: () =>
        wrapWorker(
          new Worker(
            new URL("../../lib/graph/simulation.worker.ts", import.meta.url),
            { type: "module" },
          ),
        ),
      data: initial.data,
      ...(initial.display ? { display: initial.display } : {}),
      ...(initial.forceConfig ? { forceConfig: initial.forceConfig } : {}),
      // A warm start and the saved pins travel with the first start message
      // (todo 13 ⓐ·ⓒ); handing them over later would mean a restart.
      ...(initial.initialPositions
        ? { initialPositions: initial.initialPositions }
        : {}),
      pins: resolvedPins(initial.pins),
      palette: readRendererPalette(),
      ...(initial.seed === undefined ? {} : { seed: initial.seed }),
      textFadeThreshold: initial.textFadeThreshold ?? 0,
      viewport: { height, width },
    }).then((created) => {
      if (disposed) {
        created.dispose();
        return;
      }
      engine = created;
      engineRef.current = created;
      started.current = true;
      created.setDirectionalFocus(latest.current.directionalFocus ?? false);
      let reportedLod = "";
      let reportedLabels = -1;
      let reportedSettled: boolean | null = null;
      let syncedAt = 0;
      let steppedAt = performance.now();
      let lastFrame: RenderFrame | null = null;
      const paint = () => {
        const elapsed = performance.now() - steppedAt;
        steppedAt += elapsed;

        // The layout stopping is a fact worth acting on exactly once: frame
        // the graph for someone who has not moved the camera themselves.
        // Without this the first thing a new workspace shows is whatever
        // fraction of its nodes happened to land inside the viewport.
        const isSettled = created.settled();
        if (isSettled !== reportedSettled) {
          if (isSettled && !cameraTouchedRef.current) {
            cameraTargetRef.current = created.cameraForFit(FIT_PADDING);
          }
          reportedSettled = isSettled;
          onSettledChangeRef.current?.(isSettled);
          // Where everything sits, once it has stopped — the layout the next
          // visit starts from (todo 13 ⓐ).
          if (isSettled) onLayoutSettledRef.current?.(created.positions());
        }

        const target = cameraTargetRef.current;
        if (target) {
          const current = created.camera();
          const next = approachCamera(current, target, elapsed);
          if (cameraEquals(next, target)) cameraTargetRef.current = null;
          if (!cameraEquals(next, current)) created.setCamera(next);
        }

        // Built once per tick and handed to both the backend and the hit-layer
        // sync below — each used to call back into the engine for its own
        // frame, tripling the frame-plan cost (degree map, radii sort,
        // interpolation, label selection) on the throttled tick.
        //
        // `paintIfChanged` returns null on a tick where nothing moved: no
        // engine mutation and no new interpolated positions, which is the
        // steady state of a settled graph nobody is touching (MT-4). The
        // hit-layer sync keeps running on its own throttle against the last
        // frame, so a target mounted while the graph was idle still gets
        // parked over its node.
        const painted = created.paintIfChanged();
        if (painted) lastFrame = painted;
        const frame = lastFrame;
        if (!frame) {
          frameHandle = window.requestAnimationFrame(paint);
          return;
        }
        // Both the hit layer and the LOD report are React-visible work, so they
        // run on one throttled tick rather than once per painted frame: the
        // label set churns while the simulation settles.
        const stamp = performance.now();
        if (stamp - syncedAt >= HIT_LAYER_SYNC_MS) {
          syncedAt = stamp;
          syncHitLayer(created, frame);
          if (
            frame.lod !== reportedLod ||
            frame.labels.length !== reportedLabels
          ) {
            reportedLod = frame.lod;
            reportedLabels = frame.labels.length;
            onLodChangeRef.current?.(frame.lod, frame.labels.length);
          }
        }
        frameHandle = window.requestAnimationFrame(paint);
      };
      frameHandle = window.requestAnimationFrame(paint);
    });

    // Flipping `data-theme` restyles the DOM but never repaints WebGL — the
    // renderer has to re-read the palette itself.
    const themeObserver = new MutationObserver(() => {
      engine?.setPalette(readRendererPalette());
    });
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
      attributes: true,
    });

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      viewport = {
        height: Math.max(1, Math.round(entry.contentRect.height)),
        width: Math.max(1, Math.round(entry.contentRect.width)),
      };
      engine?.resize(viewport.width, viewport.height);
    });
    resizeObserver.observe(host);

    /**
     * Zoom about the pointer, not the origin. The wheel used to scale the
     * camera and leave `x`/`y` where they were, which pulls the graph toward
     * the centre of the screen: you aimed at a node, zoomed, and watched it
     * leave. The glide target is the base when one exists, so a fast flick of
     * three notches compounds into one movement instead of three that fight.
     */
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const base = cameraTargetRef.current ?? engine?.camera();
      if (!base) return;
      const bounds = host.getBoundingClientRect();
      cameraTouchedRef.current = true;
      cameraTargetRef.current = zoomAt(
        base,
        viewport,
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP,
      );
    };
    let dragging = false;
    /** The node a press picked up, or null when the press was on background. */
    let draggingNode: string | null = null;
    /** Whether that press has moved far enough to be a drag rather than a click. */
    let dragMoved = false;
    const worldAt = (event: PointerEvent | MouseEvent) => {
      const bounds = host.getBoundingClientRect();
      const current = engine?.camera();
      if (!current) return null;
      return screenToWorld(current, viewport, {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
    };
    /**
     * A press on a node picks that node up; a press on background pans the
     * camera (todo 11). Both are the same gesture to a hand, and which one it
     * is has to be decided at press time, from what is under the pointer.
     */
    /**
     * A drag captures the pointer — on the first *movement*, not on the press.
     *
     * Capture is needed because a gesture otherwise stops the moment the
     * pointer leaves the map: the events stop bubbling here and the node
     * freezes mid-drag while the hand keeps going. Dragging a node toward the
     * edge is exactly when someone overshoots.
     *
     * Waiting for movement matters just as much. Capturing on `pointerdown`
     * redirects the following `click` to this element, so the accessibility
     * layer's own button never sees it — a plain click stopped selecting and
     * a double-click stopped opening the node, because both had quietly
     * become drags of zero distance.
     */
    let captured = false;
    const capture = (event: PointerEvent) => {
      if (captured) return;
      captured = true;
      try {
        host.setPointerCapture(event.pointerId);
      } catch {
        // Some pointer types refuse capture; the drag still works inside the
        // viewport, which is where it started.
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      dragMoved = false;
      // A press that lands on an accessibility target is a press on the node
      // that target stands for. The layer sits over the canvas, so without
      // this the top 200 nodes would be the only ones that could not be
      // dragged — the exact inconsistency todo 10 removed for clicking.
      const target = event.target as HTMLElement | null;
      const labelled = target?.closest?.<HTMLElement>("[data-node-id]");
      if (labelled?.dataset.nodeId) {
        draggingNode = labelled.dataset.nodeId;
        dragging = false;
        return;
      }
      if (event.target !== canvas) return;
      const bounds = host.getBoundingClientRect();
      const hit =
        engine?.nodeAt(
          event.clientX - bounds.left,
          event.clientY - bounds.top,
        ) ?? null;
      if (hit) {
        draggingNode = hit;
        dragging = false;
        return;
      }
      dragging = true;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (draggingNode) {
        const wasPinned = engine?.pinnedNodes().has(draggingNode) ?? false;
        engine?.releaseNode(draggingNode);
        // A dragged pinned node is re-pinned where it was dropped; the screen
        // that persists pins needs the new point.
        if (wasPinned && engine)
          onPinsChangeRef.current?.(engine.pinnedNodes());
      }
      draggingNode = null;
      dragging = false;
      if (captured && host.hasPointerCapture?.(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
      captured = false;
    };
    /**
     * A drag is direct, not glided. Easing a wheel step reads as movement;
     * easing a drag reads as lag, because the pointer is already showing the
     * viewer where the map should be. Cancelling the target is what stops an
     * in-flight glide from dragging the view out from under the hand.
     */
    const onPointerMove = (event: PointerEvent) => {
      if (draggingNode) {
        const world = worldAt(event);
        if (!world) return;
        dragMoved = true;
        capture(event);
        engine?.pinNode(draggingNode, world.x, world.y);
        return;
      }
      if (dragging) {
        capture(event);
        const current = engine?.camera();
        if (!current) return;
        cameraTouchedRef.current = true;
        cameraTargetRef.current = null;
        engine?.setCamera(panBy(current, event.movementX, event.movementY));
        return;
      }
      // Hover, from the canvas rather than the DOM layer (todo 10). The DOM
      // layer is capped and a real scan exceeds the cap, so a pointer that
      // could only find buttons could not reach most of the graph.
      const bounds = host.getBoundingClientRect();
      const hit =
        engine?.nodeAt(
          event.clientX - bounds.left,
          event.clientY - bounds.top,
        ) ?? null;
      setHover(hit);
    };
    const onPointerLeave = () => setHover(null);
    const setHover = (hit: string | null) => {
      if (engine?.hoveredNode() === hit) return;
      engine?.setHoveredNode(hit);
      host.style.cursor = hit ? "pointer" : "";
      onHoverChangeRef.current?.(hit);
    };
    /**
     * Selection from the canvas. A press that landed on a DOM hit target is
     * already handled by that button, so this only answers for the canvas —
     * which is every node past the accessibility layer's cap, and the whole
     * graph once a repository is larger than a demo fixture.
     */
    const nodeUnder = (event: MouseEvent): string | null => {
      if (event.target !== canvas) return null;
      const bounds = host.getBoundingClientRect();
      return (
        engine?.nodeAt(
          event.clientX - bounds.left,
          event.clientY - bounds.top,
        ) ?? null
      );
    };
    /**
     * Capture phase, so a drag that ended on an accessibility target can stop
     * the click before that button's own handler sees it. A drag is not a
     * click: without this, every node you moved was also selected the moment
     * you let go.
     */
    const onClick = (event: MouseEvent) => {
      if (dragMoved) {
        dragMoved = false;
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      const hit = nodeUnder(event);
      if (hit) onNodeSelectRef.current?.(hit);
    };
    const onDoubleClick = (event: MouseEvent) => {
      const hit = nodeUnder(event);
      if (hit) onNodeActivateRef.current?.(hit);
    };
    // Listeners live on the host, not the canvas: the hit layer sits on top of
    // the canvas, and zoom must keep working while the pointer is over a node.
    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);
    host.addEventListener("click", onClick, { capture: true });
    host.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      disposed = true;
      started.current = false;
      window.cancelAnimationFrame(frameHandle);
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      host.removeEventListener("click", onClick, { capture: true });
      host.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("pointerup", onPointerUp);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      engine?.dispose();
      engineRef.current = null;
      canvas.remove();
    };
    // Mount once. Every prop change is applied *into* the live engine below;
    // rebuilding it would restart the simulation and throw the layout away.
  }, []);

  useEffect(() => {
    if (started.current) engineRef.current?.setData(data);
  }, [data]);

  useEffect(() => {
    if (forceConfig) engineRef.current?.setForceConfig(forceConfig);
  }, [forceConfig]);

  useEffect(() => {
    engineRef.current?.setTextFadeThreshold(textFadeThreshold ?? 0);
  }, [textFadeThreshold]);

  useEffect(() => {
    engineRef.current?.setSelectedNode(selectedNodeId ?? null);
  }, [selectedNodeId]);

  useEffect(() => {
    engineRef.current?.setSymbolHalo(symbolHalo ?? null);
  }, [symbolHalo]);

  useEffect(() => {
    engineRef.current?.setDirectionalFocus(directionalFocus ?? false);
  }, [directionalFocus]);

  // Camera moves are not layout moves: focusing re-aims the view and leaves the
  // simulation running exactly as it was. It glides rather than cutting —
  // arriving somewhere is what tells a viewer the map moved rather than
  // changed, which matters when the gesture came from a list on the far side
  // of the screen.
  useEffect(() => {
    if (!focusNodeId) return;
    const next = engineRef.current?.cameraForNode(focusNodeId);
    if (next) {
      cameraTouchedRef.current = true;
      cameraTargetRef.current = next;
    }
  }, [focusNodeId]);

  // Framing the graph is always deliberate, so it never checks whether the
  // camera was touched — that guard belongs to the automatic first fit.
  useEffect(() => {
    if (fitRequest === undefined) return;
    const next = engineRef.current?.cameraForFit(FIT_PADDING);
    if (next) {
      cameraTouchedRef.current = true;
      cameraTargetRef.current = next;
    }
  }, [fitRequest]);

  // Glow is an in-place attribute write: no `setData`, no reheat, no relayout.
  useEffect(() => {
    engineRef.current?.setGlow(glow ?? new Map(), afterglow ?? new Set());
  }, [afterglow, glow]);

  // …and so is visibility. A filter changes what is drawn, never where
  // anything sits (todo 13).
  useEffect(() => {
    engineRef.current?.setVisibility(visibleNodeIds ?? null);
  }, [visibleNodeIds]);

  useEffect(() => {
    engineRef.current?.setHiddenLayers(hiddenLayers ?? null);
  }, [hiddenLayers]);

  // Display options are visual too: applied in the frame, never a restart.
  useEffect(() => {
    if (display) engineRef.current?.setDisplay(display);
  }, [display]);

  /**
   * Persistent pins (todo 13 ⓒ): the prop is the intent, the engine holds
   * the truth. A pin with no point is pinned where the node is now, and the
   * resolved point goes back up so the screen can persist it; a node no
   * longer in the prop is released.
   */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !pins) return;
    const held = engine.pinnedNodes();
    let changed = false;
    for (const [nodeId, position] of pins) {
      const current = held.get(nodeId);
      if (current && (position === null || samePoint(current, position))) {
        continue;
      }
      if (engine.pinNodeAt(nodeId, position ?? undefined)) changed = true;
    }
    for (const nodeId of held.keys()) {
      if (!pins.has(nodeId)) {
        engine.unpinNode(nodeId);
        changed = true;
      }
    }
    if (changed) onPinsChangeRef.current?.(engine.pinnedNodes());
  }, [pins]);

  // The canvas is owned by the effect above, not by React's reconciler.
  return null;
}

export default BrainMap;
