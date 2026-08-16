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

import { useEffect, useRef } from "react";

import type { GraphData } from "../../lib/dashboard/graph-model";
import {
  createGraphEngine,
  wrapWorker,
  type GraphEngine,
} from "../../lib/graph/engine";
import type { ForceConfig } from "../../lib/graph/simulation-protocol";
import { readDesignToken, readRendererPalette } from "../../lib/theme/tokens";

export interface BrainMapProps {
  data: GraphData;
  forceConfig?: Partial<ForceConfig>;
  onLodChange?: (lod: string, labelCount: number) => void;
  seed?: number;
  selectedNodeId?: string | null;
  textFadeThreshold?: number;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;

export function BrainMap({
  data,
  forceConfig,
  onLodChange,
  seed,
  selectedNodeId,
  textFadeThreshold,
}: BrainMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GraphEngine | null>(null);
  const latest = useRef({ data, forceConfig, seed, textFadeThreshold });
  latest.current = { data, forceConfig, seed, textFadeThreshold };
  const started = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement ?? canvas;
    const initial = latest.current;
    let disposed = false;
    let engine: GraphEngine | null = null;
    let frameHandle = 0;

    const bounds = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));

    void createGraphEngine({
      createBackend: async () => {
        const { createPixiBackend } = await import(
          "../../lib/graph/pixi-backend"
        );
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
      let reportedLod = "";
      const paint = () => {
        const frame = created.frame();
        created.paint();
        if (frame.lod !== reportedLod) {
          reportedLod = frame.lod;
          onLodChange?.(frame.lod, frame.labels.length);
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
      engine?.resize(
        Math.max(1, Math.round(entry.contentRect.width)),
        Math.max(1, Math.round(entry.contentRect.height)),
      );
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
    const onPointerDown = () => {
      dragging = true;
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
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      disposed = true;
      started.current = false;
      window.cancelAnimationFrame(frameHandle);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      engine?.dispose();
      engineRef.current = null;
    };
  }, [onLodChange]);

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

  return <canvas className="brain-map-canvas" ref={canvasRef} />;
}

export default BrainMap;
