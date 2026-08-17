/**
 * Pixi.js v8 (WebGL) adapter for the brain map (Phase 2A todo 4).
 *
 * The only module in the engine that touches the GPU. It receives a fully
 * resolved `RenderFrame` and copies numbers into Pixi objects — no colour
 * decisions, no layout, no LOD logic live here, which is why the rest of the
 * engine is testable in node.
 *
 * Layers, back to front: edges → additive glow sprites → node cores → labels.
 * The glow layer is an additive-blend sprite layer rather than a custom
 * fragment shader: the research spec lists it as the cheap Pixi-native option,
 * it needs no shader recompilation when the theme flips, and per-node
 * intensity is a plain tint/alpha write, so a burst never re-uploads geometry.
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
  type GraphPalette,
  type RenderFrame,
} from "./render-frame";

export interface PixiBackendOptions {
  canvas: HTMLCanvasElement;
  fontFamily: string;
  height: number;
  palette: GraphPalette;
  width: number;
}

const GLOW_TEXTURE_SIZE = 128;

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
  if (length === 0) return;
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

export async function createPixiBackend(
  options: PixiBackendOptions,
): Promise<GraphBackend> {
  const application = new Application();
  await application.init({
    antialias: true,
    autoDensity: true,
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
  const nodeLayer = new Graphics();
  const labelLayer = new Container();
  glowLayer.blendMode = "add";
  world.addChild(edgeLayer, glowLayer, nodeLayer, labelLayer);
  application.stage.addChild(world);

  const glowTexture = createGlowTexture();
  const glowSprites: Sprite[] = [];
  const labels: Text[] = [];
  const fontFamily = options.fontFamily;
  let labelColor = resolveColor(options.palette, "text");
  let destroyed = false;

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

  function labelAt(index: number): Text {
    const existing = labels[index];
    if (existing) return existing;
    const text = new Text({
      style: { fill: labelColor, fontFamily, fontSize: 11 },
      text: "",
    });
    text.anchor.set(0, 0.5);
    labels.push(text);
    labelLayer.addChild(text);
    return text;
  }

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      options.canvas.removeEventListener("webglcontextlost", onContextLost);
      glowTexture.destroy(true);
      application.destroy(
        { removeView: false },
        { children: true, texture: true },
      );
    },

    render(frame: RenderFrame) {
      if (destroyed) return;
      world.position.set(
        application.screen.width / 2 + frame.camera.x,
        application.screen.height / 2 + frame.camera.y,
      );
      world.scale.set(frame.camera.scale);

      edgeLayer.clear();
      for (const edge of frame.edges) {
        if (edge.dashed) {
          strokeDashed(
            edgeLayer,
            edge.sourceX,
            edge.sourceY,
            edge.targetX,
            edge.targetY,
            7,
          );
        } else {
          edgeLayer.moveTo(edge.sourceX, edge.sourceY);
          edgeLayer.lineTo(edge.targetX, edge.targetY);
        }
        edgeLayer.stroke({
          alpha: Math.min(1, edge.alpha + edge.flow * 0.5),
          color: edge.color,
          width: edge.width + edge.flow,
        });
      }

      nodeLayer.clear();
      let glowIndex = 0;
      for (const node of frame.nodes) {
        nodeLayer.circle(node.x, node.y, node.radius);
        nodeLayer.fill({ alpha: node.alpha, color: node.color });
        if (node.afterglow) {
          // Residual tint: a node an agent read recently stays warm without
          // holding the full additive pulse.
          nodeLayer.circle(node.x, node.y, node.radius + 2);
          nodeLayer.stroke({ alpha: 0.35, color: node.color, width: 1 });
        }
        if (node.selected || node.ring) {
          nodeLayer.circle(node.x, node.y, node.radius + 4);
          nodeLayer.stroke({
            alpha: node.ring ? 0.95 : 0.6,
            color: node.ring ? frame.driftColor : node.color,
            width: node.ring ? 2 : 1.5,
          });
        }
        if (node.glow > 0.01) {
          const sprite = glowSpriteAt(glowIndex);
          glowIndex += 1;
          sprite.visible = true;
          sprite.tint = node.color;
          sprite.alpha = Math.min(1, node.glow * 0.85);
          sprite.position.set(node.x, node.y);
          const size = node.radius * (6 + node.glow * 4);
          sprite.width = size;
          sprite.height = size;
        }
      }
      for (let index = glowIndex; index < glowSprites.length; index += 1) {
        (glowSprites[index] as Sprite).visible = false;
      }

      let labelIndex = 0;
      for (const label of frame.labels) {
        const text = labelAt(labelIndex);
        labelIndex += 1;
        text.visible = true;
        text.text = label.text;
        text.alpha = label.alpha;
        text.style.fill = labelColor;
        text.position.set(label.x, label.y);
      }
      for (let index = labelIndex; index < labels.length; index += 1) {
        (labels[index] as Text).visible = false;
      }

      application.render();
    },

    resize(width: number, height: number) {
      if (destroyed) return;
      application.renderer.resize(width, height);
    },

    /**
     * Node and edge colours arrive resolved on every frame, so a theme flip
     * only has to refresh the cached label colour — the one style Pixi holds
     * across frames. Flipping `data-theme` does not repaint WebGL by itself,
     * which is why the client component calls this on every theme change.
     */
    setPalette(palette: GraphPalette) {
      labelColor = resolveColor(palette, "text");
      for (const label of labels) label.style.fill = labelColor;
    },
  } satisfies GraphBackend;
}
