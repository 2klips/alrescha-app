import { describe, expect, it } from "vitest";

import {
  CAMERA_GLIDE_MS,
  MAX_SCALE,
  MIN_SCALE,
  approachCamera,
  clampScale,
  fitToView,
  hasArrived,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "../apps/web/lib/graph/camera";
import type { Camera, Viewport } from "../apps/web/lib/graph/render-frame";

/**
 * Phase 4 Wave B todo 9 — the camera.
 *
 * The map had a camera and no camera model. The wheel handler multiplied
 * `scale` and left the offset alone, so zooming pulled the graph toward the
 * origin: you aimed at a node, zoomed in, and watched it slide off the edge.
 * These are the properties that make the gesture right, asserted as
 * invariants rather than as the numbers one implementation happens to
 * produce.
 */

const VIEWPORT: Viewport = { height: 600, width: 800 };
const CAMERA: Camera = { scale: 1.4, x: -30, y: 55 };

describe("the projection", () => {
  it("round-trips, so the hit layer and the renderer cannot drift apart", () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 123.5, y: -400 },
      { x: -1e4, y: 1e4 },
    ]) {
      const screen = worldToScreen(CAMERA, VIEWPORT, point);
      const back = screenToWorld(CAMERA, VIEWPORT, screen);
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.y).toBeCloseTo(point.y, 9);
    }
  });

  it("puts the world origin at the viewport centre when the camera is home", () => {
    expect(
      worldToScreen({ scale: 1, x: 0, y: 0 }, VIEWPORT, { x: 0, y: 0 }),
    ).toEqual({ x: 400, y: 300 });
  });
});

describe("cursor-anchored zoom", () => {
  /** The invariant: whatever is under the pointer stays under the pointer. */
  const anchorHolds = (
    camera: Camera,
    screen: { x: number; y: number },
    factor: number,
  ) => {
    const before = screenToWorld(camera, VIEWPORT, screen);
    const after = zoomAt(camera, VIEWPORT, screen, factor);
    const moved = worldToScreen(after, VIEWPORT, before);
    expect(moved.x).toBeCloseTo(screen.x, 6);
    expect(moved.y).toBeCloseTo(screen.y, 6);
    return after;
  };

  it("keeps the point under the pointer fixed, anywhere on screen", () => {
    for (const screen of [
      { x: 400, y: 300 },
      { x: 12, y: 7 },
      { x: 799, y: 599 },
    ]) {
      for (const factor of [1.15, 1 / 1.15, 2, 0.5]) {
        anchorHolds(CAMERA, screen, factor);
      }
    }
  });

  it("undoes itself: a notch in then a notch out returns the camera", () => {
    const screen = { x: 260, y: 480 };
    const inward = zoomAt(CAMERA, VIEWPORT, screen, 1.15);
    const back = zoomAt(inward, VIEWPORT, screen, 1 / 1.15);
    expect(back.scale).toBeCloseTo(CAMERA.scale, 9);
    expect(back.x).toBeCloseTo(CAMERA.x, 6);
    expect(back.y).toBeCloseTo(CAMERA.y, 6);
  });

  it("does not pan as a consolation when it cannot zoom any further", () => {
    // A wheel that has hit the stop must do nothing at all. Absorbing the
    // scale but keeping the offset shift would slide the graph sideways for
    // as long as the viewer kept scrolling.
    const zoomedOut = { scale: MIN_SCALE, x: 40, y: -12 };
    expect(zoomAt(zoomedOut, VIEWPORT, { x: 100, y: 100 }, 0.5)).toBe(
      zoomedOut,
    );
    const zoomedIn = { scale: MAX_SCALE, x: 40, y: -12 };
    expect(zoomAt(zoomedIn, VIEWPORT, { x: 100, y: 100 }, 2)).toBe(zoomedIn);
    // …but a step that only *partly* fits still takes the part that fits.
    expect(
      zoomAt(
        { scale: MAX_SCALE / 1.2, x: 0, y: 0 },
        VIEWPORT,
        { x: 1, y: 1 },
        4,
      ).scale,
    ).toBe(MAX_SCALE);
  });

  it("clamps to the bounds the renderer can draw", () => {
    expect(clampScale(1000)).toBe(MAX_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
    expect(clampScale(1)).toBe(1);
  });
});

describe("pan", () => {
  it("moves in screen pixels and leaves the scale alone", () => {
    expect(panBy(CAMERA, 10, -4)).toEqual({
      scale: CAMERA.scale,
      x: CAMERA.x + 10,
      y: CAMERA.y - 4,
    });
  });
});

describe("fit to view", () => {
  const corners = [
    { x: -200, y: -100 },
    { x: 200, y: 100 },
  ];

  it("frames every point inside the viewport, with the margin it was given", () => {
    const padding = 64;
    const camera = fitToView(corners, VIEWPORT, { padding });
    expect(camera).not.toBeNull();
    for (const point of corners) {
      const screen = worldToScreen(camera as Camera, VIEWPORT, point);
      expect(screen.x).toBeGreaterThanOrEqual(padding - 0.5);
      expect(screen.x).toBeLessThanOrEqual(VIEWPORT.width - padding + 0.5);
      expect(screen.y).toBeGreaterThanOrEqual(padding - 0.5);
      expect(screen.y).toBeLessThanOrEqual(VIEWPORT.height - padding + 0.5);
    }
  });

  it("centres the bounding box rather than the points", () => {
    // Nine points bunched in one corner and one far away: the frame is about
    // the extent, not about where the crowd is.
    const lopsided = [
      ...Array.from({ length: 9 }, () => ({ x: -200, y: -100 })),
      { x: 200, y: 100 },
    ];
    const camera = fitToView(lopsided, VIEWPORT, { padding: 0 }) as Camera;
    const middle = worldToScreen(camera, VIEWPORT, { x: 0, y: 0 });
    expect(middle.x).toBeCloseTo(VIEWPORT.width / 2, 6);
    expect(middle.y).toBeCloseTo(VIEWPORT.height / 2, 6);
  });

  it("answers null for nothing, rather than pointing a camera at nothing", () => {
    expect(fitToView([], VIEWPORT)).toBeNull();
    // A non-finite coordinate is not a point. All of them non-finite is the
    // empty case, not a camera at NaN.
    expect(fitToView([{ x: Number.NaN, y: 0 }], VIEWPORT)).toBeNull();
  });

  it("keeps the scale it was given when there is no extent to fit", () => {
    // One node, or ten in the same place, has no width. Inventing a zoom
    // level for it would be a number with no source.
    const camera = fitToView([{ x: 40, y: -20 }], VIEWPORT, {
      scale: 2,
    }) as Camera;
    expect(camera.scale).toBe(2);
    const screen = worldToScreen(camera, VIEWPORT, { x: 40, y: -20 });
    expect(screen.x).toBeCloseTo(VIEWPORT.width / 2, 6);
    expect(screen.y).toBeCloseTo(VIEWPORT.height / 2, 6);
  });

  it("never asks for a scale the renderer will not draw", () => {
    // Two nodes a pixel apart would want a scale of hundreds.
    const tight = fitToView(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      VIEWPORT,
    ) as Camera;
    expect(tight.scale).toBe(MAX_SCALE);
    const sprawling = fitToView(
      [
        { x: -1e6, y: 0 },
        { x: 1e6, y: 0 },
      ],
      VIEWPORT,
    ) as Camera;
    expect(sprawling.scale).toBe(MIN_SCALE);
  });
});

describe("the glide", () => {
  const from: Camera = { scale: 1, x: 0, y: 0 };
  const to: Camera = { scale: 2, x: 200, y: -120 };

  it("takes the same wall-clock time whatever the frame rate", () => {
    // A per-frame fraction makes the same gesture twice as slow on half the
    // frame rate — which is how a map ends up "feeling sluggish on my
    // laptop" with nothing measurable wrong.
    //
    // Each run covers the same 300ms, in a different number of steps, and
    // the tolerance is tight on purpose: an exponential composes exactly, so
    // "close enough for a viewer" is not the bar — arithmetic is.
    const run = (stepMs: number, steps: number) => {
      let camera = from;
      for (let index = 0; index < steps; index += 1) {
        camera = approachCamera(camera, to, stepMs);
      }
      return camera;
    };
    const fine = run(5, 60);
    const coarse = run(30, 10);
    const coarser = run(150, 2);
    for (const other of [coarse, coarser]) {
      expect(fine.x).toBeCloseTo(other.x, 9);
      expect(fine.y).toBeCloseTo(other.y, 9);
      expect(fine.scale).toBeCloseTo(other.scale, 9);
    }
    // …and 300ms of a 120ms time constant is most of the way there, so the
    // agreement above is not three runs that all did nothing.
    expect(fine.x / to.x).toBeCloseTo(1 - Math.exp(-300 / CAMERA_GLIDE_MS), 9);
  });

  it("covers 1 - 1/e of the distance in one time constant", () => {
    const step = approachCamera(from, to, CAMERA_GLIDE_MS, CAMERA_GLIDE_MS);
    expect(step.x / to.x).toBeCloseTo(1 - 1 / Math.E, 6);
  });

  it("eases the scale geometrically, so halfway between 0.5x and 2x is 1x", () => {
    const half = approachCamera(
      { scale: 0.5, x: 0, y: 0 },
      { scale: 2, x: 0, y: 0 },
      Math.LN2 * 100,
      100,
    );
    // A linear ease would put this at 1.25 — and make the second half of
    // every zoom-out crawl.
    expect(half.scale).toBeCloseTo(1, 6);
  });

  it("arrives exactly, instead of approaching forever", () => {
    let camera = from;
    let steps = 0;
    while (!Object.is(camera, to) && steps < 1000) {
      camera = approachCamera(camera, to, 16);
      steps += 1;
    }
    // Identity, not closeness: the loop stops writing when the target is
    // reached, and an asymptote would repaint the map every frame forever.
    expect(camera).toBe(to);
    expect(steps).toBeLessThan(200);
  });

  it("snaps rather than stepping when there is no time or no easing", () => {
    expect(approachCamera(from, to, 0)).toBe(to);
    expect(approachCamera(from, to, 16, 0)).toBe(to);
    expect(approachCamera(to, to, 16)).toBe(to);
  });

  it("calls a sub-pixel gap arrived", () => {
    expect(
      hasArrived({ scale: 1, x: 0.4, y: 0 }, { scale: 1, x: 0, y: 0 }),
    ).toBe(true);
    expect(hasArrived({ scale: 1, x: 2, y: 0 }, { scale: 1, x: 0, y: 0 })).toBe(
      false,
    );
    expect(
      hasArrived({ scale: 1.5, x: 0, y: 0 }, { scale: 1, x: 0, y: 0 }),
    ).toBe(false);
  });
});
