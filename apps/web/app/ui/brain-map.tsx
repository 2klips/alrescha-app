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
  worldToScreen,
  zoomAt,
} from "../../lib/graph/camera";
import {
  createGraphEngine,
  wrapWorker,
  type GraphEngine,
} from "../../lib/graph/engine";
import type { Camera, RenderFrame } from "../../lib/graph/render-frame";
import type { ForceConfig } from "../../lib/graph/simulation-protocol";
import { readDesignToken, readRendererPalette } from "../../lib/theme/tokens";

export interface BrainMapProps {
  /** Nodes carrying the residual afterglow tint. */
  afterglow?: ReadonlySet<string>;
  data: GraphData;
  /** Directional focus mode: selection tints edges by direction (todo 2). */
  directionalFocus?: boolean;
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
  /** Fires on every change of "the layout has stopped moving". */
  onSettledChange?: (settled: boolean) => void;
  seed?: number;
  selectedNodeId?: string | null;
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

export function BrainMap({
  afterglow,
  data,
  directionalFocus,
  fitRequest,
  focusNodeId,
  forceConfig,
  glow,
  hitLayer,
  onLodChange,
  onSettledChange,
  seed,
  selectedNodeId,
  textFadeThreshold,
  viewport: viewportRef,
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
    forceConfig,
    seed,
    textFadeThreshold,
  });
  latest.current = {
    data,
    directionalFocus,
    forceConfig,
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
      ...(initial.forceConfig ? { forceConfig: initial.forceConfig } : {}),
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
    // Panning starts on the canvas only: a press that lands on a hit target is
    // the user reaching for a node, not for the background.
    const onPointerDown = (event: PointerEvent) => {
      dragging = event.target === canvas;
    };
    const onPointerUp = () => {
      dragging = false;
    };
    /**
     * A drag is direct, not glided. Easing a wheel step reads as movement;
     * easing a drag reads as lag, because the pointer is already showing the
     * viewer where the map should be. Cancelling the target is what stops an
     * in-flight glide from dragging the view out from under the hand.
     */
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const current = engine?.camera();
      if (!current) return;
      cameraTouchedRef.current = true;
      cameraTargetRef.current = null;
      engine?.setCamera(panBy(current, event.movementX, event.movementY));
    };
    // Listeners live on the host, not the canvas: the hit layer sits on top of
    // the canvas, and zoom must keep working while the pointer is over a node.
    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      disposed = true;
      started.current = false;
      window.cancelAnimationFrame(frameHandle);
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
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

  // The canvas is owned by the effect above, not by React's reconciler.
  return null;
}

export default BrainMap;
