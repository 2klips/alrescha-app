import { useEffect, useState } from "react";

import { CAMERA_GLIDE_MS } from "../graph/camera";

/** The media query a person's "reduce motion" setting answers. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * The camera's glide time constant for this preference.
 *
 * The stylesheets already drop their transitions under `prefers-reduced-
 * motion`, but the canvas camera glided to every focused node regardless: a
 * zoom that slides across the screen on each click is exactly the motion the
 * setting asks to stop (WCAG 2.3.3). `approachCamera` treats a zero time
 * constant as "arrive now", so reduced motion is a jump, not a slower glide.
 */
export function cameraGlideFor(reducedMotion: boolean): number {
  return reducedMotion ? 0 : CAMERA_GLIDE_MS;
}

/**
 * Whether the person has asked for reduced motion, following changes to the
 * setting while the page is open. False on the server and before the first
 * effect, which is the setting's own default.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query =
      typeof window.matchMedia === "function"
        ? window.matchMedia(REDUCED_MOTION_QUERY)
        : null;
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
