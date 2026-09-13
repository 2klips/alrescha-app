"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createIndexedDbLayoutStorage,
  createMemoryLayoutStorage,
  decodeLayout,
  decodePins,
  encodeLayout,
  encodePins,
  layoutKey,
  pinsKey,
  type LayoutStorage,
} from "../../lib/graph/layout-store";
import type { Position } from "../../lib/graph/simulation-protocol";

/**
 * The saved layout and pins for a workspace at a commit (Phase 4 Wave B todo
 * 13 ⓐ·ⓒ), read before the stage mounts so the worker can start warm.
 *
 * `ready` gates the mount: a stage that started cold and then received the
 * saved positions would restart the layout, which is the explosion the
 * warm start exists to avoid. Storage answers in milliseconds; if it does
 * not answer within the deadline the map starts cold, which is what it did
 * before and never worse.
 */
export interface LayoutWarmup {
  readonly initialPositions: ReadonlyMap<string, Position> | null;
  readonly pins: ReadonlyMap<string, Position>;
  readonly ready: boolean;
  saveLayout(positions: ReadonlyMap<string, Position>): void;
  savePins(pins: ReadonlyMap<string, Position>): void;
}

/** How long the mount waits for storage before starting cold. */
export const WARMUP_DEADLINE_MS = 1_500;

/** One fallback for the whole tab when IndexedDB is refused. */
let memoryFallback: LayoutStorage | null = null;

function storage(): LayoutStorage {
  try {
    const indexed = createIndexedDbLayoutStorage();
    if (indexed) return indexed;
  } catch {
    // A locked-down browser: fall through to memory.
  }
  memoryFallback ??= createMemoryLayoutStorage();
  return memoryFallback;
}

const NO_PINS: ReadonlyMap<string, Position> = new Map();

export function useLayoutWarmup(
  workspaceId: string,
  commitSha: string | null,
): LayoutWarmup {
  const layoutId = useMemo(
    () => layoutKey(workspaceId, commitSha),
    [commitSha, workspaceId],
  );
  const pinsId = useMemo(() => pinsKey(workspaceId), [workspaceId]);
  const [state, setState] = useState<{
    initialPositions: ReadonlyMap<string, Position> | null;
    pins: ReadonlyMap<string, Position>;
    ready: boolean;
  }>({ initialPositions: null, pins: NO_PINS, ready: false });
  const storeRef = useRef<LayoutStorage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const store = storage();
    storeRef.current = store;
    const deadline = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), WARMUP_DEADLINE_MS),
    );
    const read = async () => {
      const [layout, pins] = await Promise.all([
        layoutId ? store.read(layoutId).catch(() => null) : null,
        pinsId ? store.read(pinsId).catch(() => null) : null,
      ]);
      return {
        initialPositions: decodeLayout(layout),
        pins: decodePins(pins) ?? NO_PINS,
      };
    };
    void Promise.race([read(), deadline]).then((result) => {
      if (cancelled) return;
      setState({
        initialPositions: result?.initialPositions ?? null,
        pins: result?.pins ?? NO_PINS,
        ready: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [layoutId, pinsId]);

  const saveLayout = useCallback(
    (positions: ReadonlyMap<string, Position>) => {
      if (!layoutId) return;
      void storeRef.current
        ?.write(layoutId, encodeLayout(layoutId, positions, Date.now()))
        .catch(() => undefined);
    },
    [layoutId],
  );

  const savePins = useCallback(
    (pins: ReadonlyMap<string, Position>) => {
      if (!pinsId) return;
      void storeRef.current
        ?.write(pinsId, encodePins(pinsId, pins, Date.now()))
        .catch(() => undefined);
    },
    [pinsId],
  );

  return {
    initialPositions: state.initialPositions,
    pins: state.pins,
    ready: state.ready,
    saveLayout,
    savePins,
  };
}
