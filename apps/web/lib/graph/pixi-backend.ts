/**
 * Pixi.js v8 (WebGL) adapter for the brain map (Phase 2A todo 4; rebuilt for
 * performance in Phase 4 Wave B todo 12).
 *
 * The only module in the engine that touches the GPU. It receives a fully
 * resolved `RenderFrame` and copies numbers into Pixi objects — no colour
 * decisions, no layout, no LOD logic live here, which is why the rest of the
 * engine is testable in node.
 *
 * Layers, back to front: edges → additive glow sprites → node sprites →
 * node overlays → labels. Labels sit **outside** the camera container: a
 * label is chrome over the graph, and chrome does not scale with the zoom.
 *
 * Four things make this affordable at a thousand nodes, and each one replaced
 * something that was per-node or per-edge work every single frame:
 *
 * - **Nodes are sprites, not geometry.** Four textures, tinted. The old loop
 *   built a fresh circle path per node per frame and re-uploaded it.
 * - **Edges are stroked once per style group.** The old loop issued one
 *   `stroke()` per edge, which is one draw call per edge.
 * - **Geometry is rebuilt only when the graph moved.** A camera move changes
 *   the container transform and nothing else, so panning a settled graph
 *   touches no geometry at all.
 * - **Everything off screen is skipped**, by a screen-space box test in world
 *   coordinates.
 */

import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";

import { recordContextLoss, type GraphBackend } from "./engine";
import {
  resolveColor,
  type Camera,
  type GraphPalette,
  type RenderFrame,
  type RenderNode,
  type RiskRingBand,
} from "./render-frame";
import type { GraphNodeShape } from "../dashboard/graph-model";

export interface PixiBackendOptions {
  canvas: HTMLCanvasElement;
  fontFamily: string;
  height: number;
  palette: GraphPalette;
  width: number;
}

const GLOW_TEXTURE_SIZE = 128;

/**
 * Node sprites are drawn from a texture this size and scaled down, so a hub
 * at Near zoom is still smooth. Bigger costs texture memory once; smaller
 * costs sharpness at every zoom.
 */
const SHAPE_TEXTURE_SIZE = 64;

/** Dash length in **screen** pixels — converted through the camera each frame. */
const DASH_SCREEN_LENGTH = 7;

/** Margin outside the viewport kept in the draw set, so nothing pops at the edge. */
const CULL_MARGIN = 64;

/**
 * How many unused label objects to keep for reuse. A `Text` is a rasterised
 * texture, so recreating one per newly-labelled node is the expensive path;
 * keeping every node's label forever is the leak the pool replaced.
 */
const LABEL_POOL_LIMIT = 64;

/** White radial falloff, tinted per node — one texture for the whole layer. */
function createGlowTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = GLOW_TEXTURE_SIZE;
  canvas.height = GLOW_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (context) {
    const center = GLOW_TEXTURE_SIZE / 2;
    const gradient = context.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      center,
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.55)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE);
  }
  return Texture.from(canvas);
}

/**
 * The four-shape grammar as textures (`NODE_SHAPE`). White, so a tint carries
 * the colour: one texture serves every node of that shape in every band.
 */
function createShapeTexture(shape: GraphNodeShape): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = SHAPE_TEXTURE_SIZE;
  canvas.height = SHAPE_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return Texture.WHITE;
  const size = SHAPE_TEXTURE_SIZE;
  const center = size / 2;
  // Inset by the stroke width so a ring's outer edge is not clipped.
  const radius = center - size * 0.12;
  // White, in the same form the glow texture uses: these are masks, not
  // colours — every node tints one at draw time.
  context.fillStyle = "rgba(255, 255, 255, 1)";
  context.strokeStyle = "rgba(255, 255, 255, 1)";
  context.lineWidth = size * 0.16;
  switch (shape) {
    case "circle":
      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.fill();
      break;
    case "ring":
      context.beginPath();
      context.arc(
        center,
        center,
        radius - context.lineWidth / 2,
        0,
        Math.PI * 2,
      );
      context.stroke();
      break;
    case "diamond":
      context.beginPath();
      context.moveTo(center, center - radius);
      context.lineTo(center + radius, center);
      context.lineTo(center, center + radius);
      context.lineTo(center - radius, center);
      context.closePath();
      context.fill();
      break;
    case "square": {
      const side = radius * 1.6;
      context.fillRect(center - side / 2, center - side / 2, side, side);
      break;
    }
  }
  return Texture.from(canvas);
}

/** Dashed segment walk — Pixi v8 has no native dash on a stroke. */
function strokeDashed(
  graphics: Graphics,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  dash: number,
): void {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy);
  if (length === 0 || dash <= 0) return;
  const stepX = (dx / length) * dash;
  const stepY = (dy / length) * dash;
  const steps = Math.floor(length / dash);
  let x = sourceX;
  let y = sourceY;
  for (let step = 0; step < steps; step += 1) {
    if (step % 2 === 0) {
      graphics.moveTo(x, y);
      graphics.lineTo(x + stepX, y + stepY);
    }
    x += stepX;
    y += stepY;
  }
}

/**
 * The world rectangle the viewport currently shows, grown by a margin.
 * Everything outside it is skipped: off-screen work is work for nobody.
 */
function visibleWorldBox(
  camera: Camera,
  width: number,
  height: number,
): { maxX: number; maxY: number; minX: number; minY: number } {
  const halfWidth = (width / 2 + CULL_MARGIN) / camera.scale;
  const halfHeight = (height / 2 + CULL_MARGIN) / camera.scale;
  const centerX = -camera.x / camera.scale;
  const centerY = -camera.y / camera.scale;
  return {
    maxX: centerX + halfWidth,
    maxY: centerY + halfHeight,
    minX: centerX - halfWidth,
    minY: centerY - halfHeight,
  };
}

type Box = ReturnType<typeof visibleWorldBox>;

function nodeVisible(node: RenderNode, box: Box): boolean {
  return (
    node.x + node.radius >= box.minX &&
    node.x - node.radius <= box.maxX &&
    node.y + node.radius >= box.minY &&
    node.y - node.radius <= box.maxY
  );
}

/** Segment-versus-box, by the segment's own bounding box — cheap and sufficient. */
function segmentVisible(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  box: Box,
): boolean {
  return (
    Math.max(sourceX, targetX) >= box.minX &&
    Math.min(sourceX, targetX) <= box.maxX &&
    Math.max(sourceY, targetY) >= box.minY &&
    Math.min(sourceY, targetY) <= box.maxY
  );
}

/**
 * Risk rings, widest band last. Three, because `low` draws nothing: a ring on
 * every node is a texture, not a warning.
 */
const RISK_RING_STYLE: Readonly<
  Record<
    RiskRingBand,
    {
      alpha: number;
      token: "danger" | "inferred" | "border-muted";
      width: number;
    }
  >
> = {
  elevated: { alpha: 0.75, token: "inferred", width: 2 },
  high: { alpha: 0.95, token: "danger", width: 2.5 },
  moderate: { alpha: 0.5, token: "border-muted", width: 1.5 },
};

export async function createPixiBackend(
  options: PixiBackendOptions,
): Promise<GraphBackend> {
  const application = new Application();
  await application.init({
    antialias: true,
    autoDensity: true,
    // All rendering is driven manually by `render()` below, called from the
    // client's own rAF loop — Pixi's shared ticker must not also render the
    // stage every frame, or every frame gets drawn twice.
    autoStart: false,
    backgroundAlpha: 0,
    canvas: options.canvas,
    height: options.height,
    preference: "webgl",
    resolution: globalThis.devicePixelRatio || 1,
    width: options.width,
  });

  const world = new Container();
  const edgeLayer = new Graphics();
  const glowLayer = new Container();
  const nodeLayer = new Container();
  const overlayLayer = new Graphics();
  const labelLayer = new Container();
  glowLayer.blendMode = "add";
  world.addChild(edgeLayer, glowLayer, nodeLayer, overlayLayer);
  application.stage.addChild(world);
  // Outside `world`: labels are screen-space chrome, and the frame plan gives
  // their positions in screen pixels for exactly that reason.
  application.stage.addChild(labelLayer);

  const glowTexture = createGlowTexture();
  const shapeTextures: Record<GraphNodeShape, Texture> = {
    circle: createShapeTexture("circle"),
    diamond: createShapeTexture("diamond"),
    ring: createShapeTexture("ring"),
    square: createShapeTexture("square"),
  };
  const glowSprites: Sprite[] = [];
  const nodeSprites: Sprite[] = [];
  // Keyed by node id, not array index: label order shifts frame to frame as
  // the LOD grid re-selects which nodes get a label, so an index-keyed pool
  // would reassign `.text` on every Text object from the first reordering
  // point onward. Keyed by identity, a node's own Text object keeps its own
  // string across frames and only a truly relabeled node re-rasterizes.
  const labels = new Map<string, Text>();
  /** Text objects whose node lost its label, kept for the next one that gains one. */
  const labelPool: Text[] = [];
  const fontFamily = options.fontFamily;
  let labelColor = resolveColor(options.palette, "text");
  let palette = options.palette;
  let destroyed = false;
  let resolution = globalThis.devicePixelRatio || 1;
  /** The last state the world geometry was written for. */
  let drawnGeometry = -1;
  let drawnCamera: Camera | null = null;

  const onContextLost = (event: Event) => {
    event.preventDefault();
    recordContextLoss();
  };
  options.canvas.addEventListener("webglcontextlost", onContextLost);

  function glowSpriteAt(index: number): Sprite {
    const existing = glowSprites[index];
    if (existing) return existing;
    const sprite = new Sprite(glowTexture);
    sprite.anchor.set(0.5);
    glowSprites.push(sprite);
    glowLayer.addChild(sprite);
    return sprite;
  }

  function nodeSpriteAt(index: number): Sprite {
    const existing = nodeSprites[index];
    if (existing) return existing;
    const sprite = new Sprite(shapeTextures.circle);
    sprite.anchor.set(0.5);
    nodeSprites.push(sprite);
    nodeLayer.addChild(sprite);
    return sprite;
  }

  function labelAt(nodeId: string): Text {
    const existing = labels.get(nodeId);
    if (existing) return existing;
    const reused = labelPool.pop();
    if (reused) {
      labels.set(nodeId, reused);
      return reused;
    }
    const text = new Text({
      style: { fill: labelColor, fontFamily, fontSize: 11 },
      text: "",
    });
    text.anchor.set(0, 0.5);
    labels.set(nodeId, text);
    labelLayer.addChild(text);
    return text;
  }

  /**
   * Retire the labels no node claimed this frame. They go back to the pool
   * rather than being destroyed, up to a cap — a `Text` is a rasterised
   * texture, and churning them is the cost this avoids; keeping one per node
   * that has *ever* been labelled is the leak it replaced.
   */
  function retireLabels(claimed: ReadonlySet<string>): void {
    for (const [nodeId, text] of labels) {
      if (claimed.has(nodeId)) continue;
      labels.delete(nodeId);
      text.visible = false;
      if (labelPool.length < LABEL_POOL_LIMIT) {
        labelPool.push(text);
      } else {
        labelLayer.removeChild(text);
        text.destroy();
      }
    }
  }

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      options.canvas.removeEventListener("webglcontextlost", onContextLost);
      glowTexture.destroy(true);
      for (const texture of Object.values(shapeTextures)) texture.destroy(true);
      application.destroy(
        { removeView: false },
        { children: true, texture: true },
      );
    },

    render(frame: RenderFrame) {
      if (destroyed) return;

      // A monitor change, or a window dragged to a second screen, changes the
      // device pixel ratio under a renderer that was told it once at init.
      // Everything then paints at the wrong sharpness until a resize.
      const currentResolution = globalThis.devicePixelRatio || 1;
      if (currentResolution !== resolution) {
        resolution = currentResolution;
        application.renderer.resolution = resolution;
        application.renderer.resize(
          application.screen.width,
          application.screen.height,
        );
        drawnGeometry = -1;
      }

      world.position.set(
        application.screen.width / 2 + frame.camera.x,
        application.screen.height / 2 + frame.camera.y,
      );
      world.scale.set(frame.camera.scale);

      const box = visibleWorldBox(
        frame.camera,
        application.screen.width,
        application.screen.height,
      );
      const cameraMoved =
        !drawnCamera ||
        drawnCamera.x !== frame.camera.x ||
        drawnCamera.y !== frame.camera.y ||
        drawnCamera.scale !== frame.camera.scale;

      // Panning a settled graph changes the container transform and nothing
      // else — no path is rebuilt, no sprite is repositioned, nothing is
      // re-uploaded. That is the case the map spends most of its time in.
      if (frame.geometryRevision !== drawnGeometry || cameraMoved) {
        drawnGeometry = frame.geometryRevision;
        drawnCamera = { ...frame.camera };

        // Edges, one stroke per style group. Pixi issues a draw call per
        // `stroke()`, so a thousand edges used to be a thousand of them; the
        // groups are usually a handful, because a stroke is decided by the
        // confidence tier and the evidence grade and there are not many
        // combinations of those.
        edgeLayer.clear();
        const dash = DASH_SCREEN_LENGTH / frame.camera.scale;
        const groups = new Map<
          string,
          { alpha: number; color: number; dashed: boolean; width: number }
        >();
        const grouped = new Map<string, typeof frame.edges>();
        for (const edge of frame.edges) {
          if (
            !segmentVisible(
              edge.sourceX,
              edge.sourceY,
              edge.targetX,
              edge.targetY,
              box,
            )
          ) {
            continue;
          }
          const alpha = Math.min(1, edge.alpha + edge.flow * 0.5);
          const width = edge.width + edge.flow;
          const key = `${edge.color}|${width}|${alpha}|${edge.dashed}`;
          if (!groups.has(key)) {
            groups.set(key, {
              alpha,
              color: edge.color,
              dashed: edge.dashed,
              width,
            });
            grouped.set(key, []);
          }
          (grouped.get(key) as typeof frame.edges).push(edge);
        }
        for (const [key, style] of groups) {
          const members = grouped.get(key) as typeof frame.edges;
          for (const edge of members) {
            if (style.dashed) {
              strokeDashed(
                edgeLayer,
                edge.sourceX,
                edge.sourceY,
                edge.targetX,
                edge.targetY,
                dash,
              );
            } else {
              edgeLayer.moveTo(edge.sourceX, edge.sourceY);
              edgeLayer.lineTo(edge.targetX, edge.targetY);
            }
          }
          edgeLayer.stroke({
            alpha: style.alpha,
            color: style.color,
            width: style.width / frame.camera.scale,
          });
        }

        // Nodes: one tinted sprite each, and one overlay path for the few
        // that carry a ring. Overlays are rare — a selection, some findings,
        // the risk band — so they stay geometry rather than a fifth texture.
        overlayLayer.clear();
        let nodeIndex = 0;
        let glowIndex = 0;
        for (const node of frame.nodes) {
          if (!nodeVisible(node, box)) continue;
          const sprite = nodeSpriteAt(nodeIndex);
          nodeIndex += 1;
          sprite.visible = true;
          sprite.texture = shapeTextures[node.shape];
          sprite.tint = node.color;
          sprite.alpha = node.alpha;
          sprite.position.set(node.x, node.y);
          sprite.width = node.radius * 2;
          sprite.height = node.radius * 2;

          if (node.afterglow) {
            overlayLayer.circle(node.x, node.y, node.radius + 2);
            overlayLayer.stroke({
              alpha: 0.35,
              color: node.color,
              width: 1 / frame.camera.scale,
            });
          }
          if (node.riskBand) {
            const style = RISK_RING_STYLE[node.riskBand];
            overlayLayer.circle(node.x, node.y, node.radius + 3);
            overlayLayer.stroke({
              alpha: style.alpha * node.alpha,
              color: resolveColor(palette, style.token),
              width: style.width / frame.camera.scale,
            });
          }
          if (node.selected || node.ring) {
            overlayLayer.circle(node.x, node.y, node.radius + 5);
            overlayLayer.stroke({
              alpha: node.ring ? 0.95 : 0.6,
              color: node.ring ? frame.driftColor : node.color,
              width: (node.ring ? 2 : 1.5) / frame.camera.scale,
            });
          }
          if (node.badge) {
            // A grade badge is a Near-zoom affordance (`showsStatusBadges`):
            // a filled pip beside the node, in the grade's own colour, so a
            // reader can tell a verified node from an inferred one without
            // opening it.
            overlayLayer.circle(
              node.x + node.radius + 3,
              node.y - node.radius - 3,
              2.5 / frame.camera.scale,
            );
            overlayLayer.fill({
              alpha: node.alpha,
              color: resolveColor(
                palette,
                node.badge === "verified"
                  ? "verified"
                  : node.badge === "broken"
                    ? "danger"
                    : "inferred",
              ),
            });
          }
          if (node.glow > 0.01) {
            const glowSprite = glowSpriteAt(glowIndex);
            glowIndex += 1;
            glowSprite.visible = true;
            glowSprite.tint = node.color;
            glowSprite.alpha = Math.min(1, node.glow * 0.85);
            glowSprite.position.set(node.x, node.y);
            const size = node.radius * (6 + node.glow * 4);
            glowSprite.width = size;
            glowSprite.height = size;
          }
        }
        for (let index = nodeIndex; index < nodeSprites.length; index += 1) {
          (nodeSprites[index] as Sprite).visible = false;
        }
        for (let index = glowIndex; index < glowSprites.length; index += 1) {
          (glowSprites[index] as Sprite).visible = false;
        }
      }

      // Labels are screen-space, so they are written every frame — but there
      // are at most a few dozen of them, which is the point of the LOD grid.
      const claimed = new Set<string>();
      for (const label of frame.labels) {
        const text = labelAt(label.id);
        claimed.add(label.id);
        text.visible = true;
        text.text = label.text;
        text.alpha = label.alpha;
        text.style.fill = labelColor;
        text.position.set(label.x, label.y);
      }
      retireLabels(claimed);

      application.render();
    },

    resize(width: number, height: number) {
      if (destroyed) return;
      application.renderer.resize(width, height);
      // The visible box changed, so the culled set has to be recomputed.
      drawnGeometry = -1;
    },

    /**
     * Node and edge colours arrive resolved on every frame, so a theme flip
     * only has to refresh the cached label colour and the palette the
     * overlays read. Flipping `data-theme` does not repaint WebGL by itself,
     * which is why the client component calls this on every theme change.
     */
    setPalette(next: GraphPalette) {
      palette = next;
      labelColor = resolveColor(next, "text");
      for (const label of labels.values()) label.style.fill = labelColor;
      for (const label of labelPool) label.style.fill = labelColor;
      // Overlay colours are read at draw time, so the next frame has to redraw.
      drawnGeometry = -1;
    },
  } satisfies GraphBackend;
}
