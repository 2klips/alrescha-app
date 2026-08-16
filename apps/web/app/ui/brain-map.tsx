"use client";

/**
 * Client mount for the Pixi brain map (Phase 2A todo 4).
 *
 * Loaded through `dynamic(..., { ssr: false })` from `brain-map-stage.tsx`, so
 * neither Pixi nor the Worker is ever evaluated on the server. Everything this
 * component owns is torn down on unmount: the rAF loop, the ResizeObserver,
 * the theme observer, the Worker and the WebGL context.
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
  seed?: number;
  selectedNodeId?: string | null;
}

export function BrainMap({
  data,
  forceConfig,
  seed,
  selectedNodeId,
}: BrainMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GraphEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement ?? canvas;
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
      data,
      ...(forceConfig ? { forceConfig } : {}),
      palette: readRendererPalette(),
      ...(seed === undefined ? {} : { seed }),
    }).then((created) => {
      if (disposed) {
        created.dispose();
        return;
      }
      engine = created;
      engineRef.current = created;
      created.setSelectedNode(selectedNodeId ?? null);
      const paint = () => {
        created.paint();
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

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameHandle);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      engine?.dispose();
      engineRef.current = null;
    };
  }, [data, forceConfig, seed, selectedNodeId]);

  useEffect(() => {
    engineRef.current?.setSelectedNode(selectedNodeId ?? null);
  }, [selectedNodeId]);

  return <canvas className="brain-map-canvas" ref={canvasRef} />;
}

export default BrainMap;
