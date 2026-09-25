import { describe, expect, it } from "vitest";

import { CAMERA_GLIDE_MS, approachCamera } from "../graph/camera";
import { cameraGlideFor } from "./reduced-motion";

/**
 * The canvas camera and a person's reduced-motion setting (WCAG 2.3.3).
 *
 * The stylesheets already stop their transitions under
 * `prefers-reduced-motion`; the camera glided to every focused node anyway.
 * With the setting on, a camera move is a jump.
 */
describe("the camera under reduced motion", () => {
  const from = { scale: 1, x: 0, y: 0 };
  const to = { scale: 2, x: 400, y: -300 };

  it("arrives in one frame when the person asked for reduced motion", () => {
    expect(cameraGlideFor(true)).toBe(0);
    expect(approachCamera(from, to, 16, cameraGlideFor(true))).toEqual(to);
  });

  it("still glides for everyone else", () => {
    expect(cameraGlideFor(false)).toBe(CAMERA_GLIDE_MS);
    const step = approachCamera(from, to, 16, cameraGlideFor(false));
    expect(step).not.toEqual(to);
    expect(step.x).toBeGreaterThan(0);
    expect(step.x).toBeLessThan(to.x);
  });
});
