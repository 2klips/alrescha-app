/**
 * Camera arithmetic for the brain map (Phase 4 Wave B todo 9).
 *
 * The map had a camera and no camera model: the wheel handler multiplied
 * `scale` and left `x`/`y` alone, so zooming pulled the graph toward the
 * origin instead of toward the pointer — you aimed at a node, zoomed, and it
 * slid off the screen. Every step also landed instantly, which reads as a
 * jump rather than a movement.
 *
 * Everything here is pure and frame-rate independent, so the feel of the
 * gesture is testable in node without a canvas, a GPU or a clock.
 *
 * The projection is the renderer's, stated once:
 *
 *     screen = viewport / 2 + camera.xy + world * camera.scale
 *
 * It lived in three places — `render-frame`, the hit-layer sync and the
 * gesture handlers — and the only reason they agreed is that nobody had
 * changed one of them yet.
 */

import type { Camera, Viewport } from "./render-frame";

/**
 * Zoom bounds. Below the minimum a 1,000-node graph is a smudge; above the
 * maximum the labels are the whole screen and there is nothing to navigate.
 */
export const MIN_SCALE = 0.15;
export const MAX_SCALE = 4;

/**
 * How fast a glide closes on its target: the time to cover 1 - 1/e of the
 * remaining distance. Short enough that a wheel step feels like a response
 * rather than an animation, long enough to read as movement.
 */
export const CAMERA_GLIDE_MS = 120;

/**
 * Distances under these are indistinguishable on screen, so a glide that is
 * this close has arrived. Without a snap the exponential approaches forever
 * and the map repaints every frame for the rest of the session.
 */
const ARRIVED_PIXELS = 0.5;
const ARRIVED_SCALE = 0.001;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function worldToScreen(
  camera: Camera,
  viewport: Viewport,
  world: Point,
): Point {
  return {
    x: viewport.width / 2 + camera.x + world.x * camera.scale,
    y: viewport.height / 2 + camera.y + world.y * camera.scale,
  };
}

export function screenToWorld(
  camera: Camera,
  viewport: Viewport,
  screen: Point,
): Point {
  return {
    x: (screen.x - viewport.width / 2 - camera.x) / camera.scale,
    y: (screen.y - viewport.height / 2 - camera.y) / camera.scale,
  };
}

export function cameraEquals(left: Camera, right: Camera): boolean {
  return left.x === right.x && left.y === right.y && left.scale === right.scale;
}

/**
 * Zoom by `factor` about a point on screen, keeping whatever is under that
 * point exactly where it is. That invariant is the whole feature, and it is
 * what the test asserts — not the resulting numbers, which are an
 * implementation detail of the projection.
 *
 * At a scale bound the factor is absorbed and the camera does not move: a
 * wheel that cannot zoom any further must not pan as a consolation.
 */
export function zoomAt(
  camera: Camera,
  viewport: Viewport,
  screen: Point,
  factor: number,
): Camera {
  const scale = clampScale(camera.scale * factor);
  if (scale === camera.scale) return camera;
  const world = screenToWorld(camera, viewport, screen);
  return {
    scale,
    x: screen.x - viewport.width / 2 - world.x * scale,
    y: screen.y - viewport.height / 2 - world.y * scale,
  };
}

export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { scale: camera.scale, x: camera.x + dx, y: camera.y + dy };
}

/**
 * Frame every point, centred, with `padding` screen pixels of margin.
 *
 * Returns `null` for an empty set rather than a camera looking at nothing —
 * "there is nothing to frame" and "here is where nothing is" are different
 * answers, and only the caller knows which one its UI should give.
 *
 * A single point, or several at one spot, has no extent to fit: the camera
 * centres on it and keeps the scale it had, because inventing a zoom level
 * for a graph with no width would be a number with no source.
 */
export function fitToView(
  points: Iterable<Point>,
  viewport: Viewport,
  options: { readonly padding?: number; readonly scale?: number } = {},
): Camera | null {
  const padding = options.padding ?? 48;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    count += 1;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (count === 0) return null;

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const usableWidth = Math.max(1, viewport.width - padding * 2);
  const usableHeight = Math.max(1, viewport.height - padding * 2);
  const scale =
    spanX <= 0 && spanY <= 0
      ? clampScale(options.scale ?? 1)
      : clampScale(
          Math.min(
            spanX > 0 ? usableWidth / spanX : Number.POSITIVE_INFINITY,
            spanY > 0 ? usableHeight / spanY : Number.POSITIVE_INFINITY,
          ),
        );

  // Centre the bounding box: the camera offset is what puts the box's middle
  // at the viewport's middle, which the projection makes a subtraction.
  return {
    scale,
    x: -((minX + maxX) / 2) * scale,
    y: -((minY + maxY) / 2) * scale,
  };
}

/**
 * One step of an exponential approach toward `target`.
 *
 * `1 - exp(-dt/tau)` rather than a fixed fraction per frame, so the glide
 * takes the same wall-clock time at 30fps as at 144fps — a per-frame lerp
 * makes the same gesture twice as slow on half the frame rate, which is the
 * kind of thing that reads as "the map feels sluggish on my laptop".
 *
 * Scale is approached geometrically. Zoom is multiplicative — halfway between
 * 0.5× and 2× is 1×, not 1.25× — and easing it linearly makes the second half
 * of every zoom-out crawl.
 */
export function approachCamera(
  current: Camera,
  target: Camera,
  elapsedMs: number,
  timeConstantMs: number = CAMERA_GLIDE_MS,
): Camera {
  if (cameraEquals(current, target)) return target;
  if (!(elapsedMs > 0) || !(timeConstantMs > 0)) return target;
  const k = 1 - Math.exp(-elapsedMs / timeConstantMs);
  const next: Camera = {
    scale: current.scale * (target.scale / current.scale) ** k,
    x: current.x + (target.x - current.x) * k,
    y: current.y + (target.y - current.y) * k,
  };
  return hasArrived(next, target) ? target : next;
}

/** Close enough that another step would move nothing a viewer could see. */
export function hasArrived(current: Camera, target: Camera): boolean {
  return (
    Math.abs(current.x - target.x) < ARRIVED_PIXELS &&
    Math.abs(current.y - target.y) < ARRIVED_PIXELS &&
    Math.abs(current.scale - target.scale) < ARRIVED_SCALE
  );
}
