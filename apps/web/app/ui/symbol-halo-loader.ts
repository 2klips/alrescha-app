"use client";

import { useEffect, useRef, useState } from "react";

import type { GraphNode } from "../../lib/dashboard/graph-model";
import {
  createIndexedDbLayoutStorage,
  createMemoryLayoutStorage,
  type LayoutStorage,
} from "../../lib/graph/layout-store";
import type { HaloSymbol, SymbolHalo } from "../../lib/graph/symbol-halo";

/**
 * Loading one file's symbol layer for the halo (Phase 4 Wave F todo 26).
 *
 * The map's model carries no symbol. When a file is selected this asks
 * `/api/map/symbols` for that file — one file, one request — and keeps the
 * answer twice: in memory for the session, and in the same IndexedDB the
 * layout warm-start uses, keyed by workspace, commit and file, so the next
 * visit at the same commit draws the halo without a request. A new commit
 * is a new key; nothing is invalidated, it is simply never read again.
 */

export const SYMBOL_CACHE_VERSION = 1;

/** Only artifact-backed nodes have a symbol row to ask for. */
export function haloOwnerKind(type: GraphNode["type"]): boolean {
  return type === "code" || type === "test";
}

export function symbolCacheKey(
  workspaceId: string,
  commitSha: string | null | undefined,
  fileId: string,
): string | null {
  if (!workspaceId || !commitSha || !fileId) return null;
  return `symbols:${workspaceId}:${commitSha}:${fileId}`;
}

interface StoredSymbols {
  readonly key: string;
  readonly savedAt: number;
  readonly symbols: readonly HaloSymbol[];
  readonly version: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function encodeSymbols(
  key: string,
  symbols: readonly HaloSymbol[],
  savedAt: number = Date.now(),
): StoredSymbols {
  return {
    key,
    savedAt,
    symbols: symbols.map(({ id, kind, name }) => ({ id, kind, name })),
    version: SYMBOL_CACHE_VERSION,
  };
}

/** Storage is treated as hostile: anything but this exact shape is nothing. */
export function decodeSymbols(value: unknown): HaloSymbol[] | null {
  if (!isRecord(value) || value.version !== SYMBOL_CACHE_VERSION) return null;
  if (!Array.isArray(value.symbols)) return null;
  const decoded: HaloSymbol[] = [];
  for (const entry of value.symbols) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.kind !== "string" ||
      typeof entry.name !== "string"
    ) {
      return null;
    }
    decoded.push({ id: entry.id, kind: entry.kind, name: entry.name });
  }
  return decoded;
}

interface SymbolLayerResponse {
  readonly symbols?: readonly {
    readonly id?: unknown;
    readonly kind?: unknown;
    readonly name?: unknown;
  }[];
}

export interface SymbolHaloLoaderOptions {
  readonly commitSha: string | null | undefined;
  readonly fetch?: typeof globalThis.fetch;
  readonly storage?: LayoutStorage | null;
  readonly workspaceId: string;
}

/**
 * The loader, apart from React so it can be tested as one: memory first,
 * storage second, the network last, and every answer written back down.
 */
export class SymbolHaloLoader {
  readonly #memory = new Map<string, Promise<HaloSymbol[]>>();
  readonly #options: SymbolHaloLoaderOptions;
  /** How many requests reached the network — the caching's own evidence. */
  fetches = 0;

  constructor(options: SymbolHaloLoaderOptions) {
    this.#options = options;
  }

  load(fileId: string, signal?: AbortSignal): Promise<HaloSymbol[]> {
    const held = this.#memory.get(fileId);
    if (held) return held;
    const pending = this.#read(fileId, signal).catch((error: unknown) => {
      // A failed load is not a cached answer.
      this.#memory.delete(fileId);
      throw error;
    });
    this.#memory.set(fileId, pending);
    return pending;
  }

  async #read(fileId: string, signal?: AbortSignal): Promise<HaloSymbol[]> {
    const key = symbolCacheKey(
      this.#options.workspaceId,
      this.#options.commitSha,
      fileId,
    );
    const storage = this.#options.storage ?? null;
    if (key && storage) {
      const stored = decodeSymbols(await storage.read(key).catch(() => null));
      if (stored) return stored;
    }
    const fetchImpl = this.#options.fetch ?? globalThis.fetch;
    this.fetches += 1;
    const response = await fetchImpl(
      `/api/map/symbols?files=${encodeURIComponent(fileId)}`,
      { credentials: "same-origin", ...(signal ? { signal } : {}) },
    );
    if (!response.ok) throw new Error(`symbol layer ${response.status}`);
    const payload = (await response.json()) as SymbolLayerResponse;
    const symbols: HaloSymbol[] = (payload.symbols ?? []).flatMap((entry) =>
      typeof entry.id === "string" &&
      typeof entry.kind === "string" &&
      typeof entry.name === "string"
        ? [{ id: entry.id, kind: entry.kind, name: entry.name }]
        : [],
    );
    if (key && storage) {
      await storage.write(key, encodeSymbols(key, symbols)).catch(() => {});
    }
    return symbols;
  }
}

let sharedStorage: LayoutStorage | null | undefined;
function defaultStorage(): LayoutStorage | null {
  if (sharedStorage === undefined) {
    sharedStorage =
      typeof window === "undefined"
        ? null
        : (createIndexedDbLayoutStorage() ?? createMemoryLayoutStorage());
  }
  return sharedStorage;
}

/**
 * The halo for the selected node: a file's symbols once they are loaded,
 * null for anything else. A selection that changes before the load lands
 * aborts it; a load that fails leaves the map exactly as it was.
 */
export function useSymbolHalo(input: {
  readonly commitSha: string | null | undefined;
  readonly node: GraphNode | null;
  readonly workspaceId: string;
}): SymbolHalo | null {
  const { commitSha, node, workspaceId } = input;
  const [halo, setHalo] = useState<SymbolHalo | null>(null);
  const loaderRef = useRef<SymbolHaloLoader | null>(null);
  const loaderKey = `${workspaceId}:${commitSha ?? ""}`;
  const loaderKeyRef = useRef(loaderKey);
  if (!loaderRef.current || loaderKeyRef.current !== loaderKey) {
    loaderRef.current = new SymbolHaloLoader({
      commitSha,
      storage: defaultStorage(),
      workspaceId,
    });
    loaderKeyRef.current = loaderKey;
  }

  const ownerId = node && haloOwnerKind(node.type) ? node.id : null;
  useEffect(() => {
    if (!ownerId) {
      setHalo(null);
      return;
    }
    const controller = new AbortController();
    let live = true;
    loaderRef.current
      ?.load(ownerId, controller.signal)
      .then((symbols) => {
        if (live) setHalo({ ownerId, symbols });
      })
      .catch(() => {
        if (live) setHalo(null);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [ownerId]);

  return halo && halo.ownerId === ownerId ? halo : null;
}
