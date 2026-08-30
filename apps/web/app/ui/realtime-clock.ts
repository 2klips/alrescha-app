import { useEffect, useState } from "react";

/**
 * QW-6: the 180ms/12.5s animation clock behind glow intensity and the
 * activity feed's relative timestamps, scoped to whichever leaf component
 * calls it.
 *
 * Ticking this clock in a screen-level component re-renders that whole
 * component on every tick — filter rail, inspector, hub buttons and all —
 * just to animate a handful of nodes or refresh a few "Ns ago" labels. Each
 * caller of this hook owns its own tick, so a re-render stays inside the
 * small subtree that actually needs the fresh timestamp.
 *
 * `renderBatches` is the reducer's batch counter (`reduceAccessEventBatch`):
 * it increments on every accepted realtime batch, including the first, so it
 * alone would re-arm the window each batch. `feedLength` is kept alongside
 * it only to preserve the exact re-arm condition the screens used before
 * this was extracted (skip entirely while the feed is empty).
 */
export function useRealtimeClock(
  feedLength: number,
  renderBatches: number,
): number {
  const [clock, setClock] = useState(0);

  useEffect(() => {
    if (feedLength === 0) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 180);
    const stop = window.setTimeout(() => window.clearInterval(timer), 12_500);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [feedLength, renderBatches]);

  return clock;
}
