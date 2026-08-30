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
  createGraphEngine,
  wrapWorker,
  type GraphEngine,
} from "../../lib/graph/engine";
import type { RenderFrame } from "../../lib/graph/render-frame";
import type { ForceConfig } from "../../lib/graph/simulation-protocol";
import { readDesignToken, readRendererPalette } from "../../lib/theme/tokens";

export interface BrainMapProps {
  /** Nodes carrying the residual afterglow tint. */
  afterglow?: ReadonlySet<string>;
  data: GraphData;
  /** Directional focus mode: selection tints edges by direction (todo 2). */
  directionalFocus?: boolean;
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
  seed?: number;
  selectedNodeId?: string | null;
  textFadeThreshold?: number;
  /** The element the canvas is mounted into and gestures are bound to. */
  viewport: RefObject<HTMLDivElement | null>;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;

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
  focusNodeId,
  forceConfig,
  glow,
  hitLayer,
  onLodChange,
  seed,
  selectedNodeId,
  textFadeThreshold,
  viewport: viewportRef,
}: BrainMapProps) {
  const engineRef = useRef<GraphEngine | null>(null);
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
        target.style.left = `${Math.round(viewport.width / 2 + camera.x + node.x * scale)}px`;
        target.style.top = `${Math.round(viewport.height / 2 + camera.y + node.y * scale)}px`;
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
      let syncedAt = 0;
      const paint = () => {
        // Built once per tick and handed to both the backend and the hit-layer
        // sync below — each used to call back into the engine for its own
        // frame, tripling the frame-plan cost (degree map, radii sort,
        // interpolation, label selection) on the throttled tick.
        const frame = created.frame();
        created.paint(frame);
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

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = engine?.camera();
      if (!current) return;
      engine?.setCamera({
        ...current,
        scale: Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, current.scale * (event.deltaY > 0 ? 0.9 : 1.1)),
        ),
      });
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
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const current = engine?.camera();
      if (!current) return;
      engine?.setCamera({
        ...current,
        x: current.x + event.movementX,
        y: current.y + event.movementY,
      });
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
  // simulation running exactly as it was.
  useEffect(() => {
    if (focusNodeId) engineRef.current?.focusNode(focusNodeId);
  }, [focusNodeId]);

  // Glow is an in-place attribute write: no `setData`, no reheat, no relayout.
  useEffect(() => {
    engineRef.current?.setGlow(glow ?? new Map(), afterglow ?? new Set());
  }, [afterglow, glow]);

  // The canvas is owned by the effect above, not by React's reconciler.
  return null;
}

export default BrainMap;
