import type { Position } from "./simulation-protocol";

/**
 * Where a graph's layout is remembered between visits (Phase 4 Wave B todo
 * 13 ⓐ, and the pins of ⓒ).
 *
 * The layout used to start from the seeded spiral on every load: the same
 * repository, the same commit, and the map exploded and re-formed for a
 * couple of seconds before it looked like anything. Where a node settled is
 * a property of the graph at a commit, so it is saved under the commit and
 * handed back to the worker as its starting point — a warm start that only
 * has to absorb what changed.
 *
 * Pins are a person's decision about a node, not the layout's, so they are
 * keyed by workspace rather than by commit: a file pinned to the top-left
 * stays there after the next push.
 *
 * The storage behind this is IndexedDB in the browser, and the interface is
 * small enough that a test can hand in a map. Everything that decides what
 * a record means — the key, the encoding, what counts as a valid saved
 * layout — is pure and lives here, not in the adapter.
 */

export const LAYOUT_STORE_NAME = "alrescha-graph-layout";
export const LAYOUT_STORE_VERSION = 1;

/** Storage is treated as hostile: only a record of this shape is a layout. */
export interface StoredLayout {
  readonly key: string;
  readonly nodeIds: readonly string[];
  /** `[x0, y0, x1, y1, …]` in `nodeIds` order. */
  readonly positions: readonly number[];
  readonly savedAt: number;
  readonly version: number;
}

export interface StoredPins {
  readonly key: string;
  readonly pins: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
  }[];
  readonly savedAt: number;
  readonly version: number;
}

export interface LayoutStorage {
  read(key: string): Promise<unknown>;
  remove(key: string): Promise<void>;
  write(key: string, value: unknown): Promise<void>;
}

/** A layout is the graph at a commit; an unscanned workspace has none. */
export function layoutKey(
  workspaceId: string,
  commitSha: string | null | undefined,
): string | null {
  if (!workspaceId || !commitSha) return null;
  return `layout:${workspaceId}:${commitSha}`;
}

/** Pins outlive commits: a person's decision about a node, per workspace. */
export function pinsKey(workspaceId: string): string | null {
  return workspaceId ? `pins:${workspaceId}` : null;
}

export function encodeLayout(
  key: string,
  positions: ReadonlyMap<string, Position>,
  savedAt: number,
): StoredLayout {
  const nodeIds: string[] = [];
  const flat: number[] = [];
  for (const [id, position] of positions) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) continue;
    nodeIds.push(id);
    flat.push(position.x, position.y);
  }
  return {
    key,
    nodeIds,
    positions: flat,
    savedAt,
    version: LAYOUT_STORE_VERSION,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * A saved layout back into positions, or null for anything that is not one:
 * another version, a truncated buffer, a stray write. A partial record is
 * not repaired — a half-warm start is a layout nobody chose.
 */
export function decodeLayout(value: unknown): Map<string, Position> | null {
  if (!isRecord(value)) return null;
  if (value.version !== LAYOUT_STORE_VERSION) return null;
  const { nodeIds, positions } = value;
  if (!Array.isArray(nodeIds) || !Array.isArray(positions)) return null;
  if (positions.length !== nodeIds.length * 2) return null;
  const decoded = new Map<string, Position>();
  for (let index = 0; index < nodeIds.length; index += 1) {
    const id = nodeIds[index];
    const x = positions[index * 2];
    const y = positions[index * 2 + 1];
    if (
      typeof id !== "string" ||
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return null;
    }
    decoded.set(id, { x, y });
  }
  return decoded;
}

export function encodePins(
  key: string,
  pins: ReadonlyMap<string, Position>,
  savedAt: number,
): StoredPins {
  return {
    key,
    pins: [...pins]
      .filter(
        ([, position]) =>
          Number.isFinite(position.x) && Number.isFinite(position.y),
      )
      .map(([id, position]) => ({ id, x: position.x, y: position.y })),
    savedAt,
    version: LAYOUT_STORE_VERSION,
  };
}

export function decodePins(value: unknown): Map<string, Position> | null {
  if (!isRecord(value)) return null;
  if (value.version !== LAYOUT_STORE_VERSION) return null;
  if (!Array.isArray(value.pins)) return null;
  const decoded = new Map<string, Position>();
  for (const pin of value.pins) {
    if (
      !isRecord(pin) ||
      typeof pin.id !== "string" ||
      typeof pin.x !== "number" ||
      typeof pin.y !== "number" ||
      !Number.isFinite(pin.x) ||
      !Number.isFinite(pin.y)
    ) {
      return null;
    }
    decoded.set(pin.id, { x: pin.x, y: pin.y });
  }
  return decoded;
}

/** An in-memory storage: what the tests hand in, and the fallback when IndexedDB is refused. */
export function createMemoryLayoutStorage(
  seed: ReadonlyMap<string, unknown> = new Map(),
): LayoutStorage & { readonly entries: Map<string, unknown> } {
  const entries = new Map(seed);
  return {
    entries,
    read: async (key) => entries.get(key) ?? null,
    remove: async (key) => {
      entries.delete(key);
    },
    write: async (key, value) => {
      entries.set(key, value);
    },
  };
}

/**
 * The IndexedDB adapter: one database, one object store keyed by `key`.
 * Returns null where IndexedDB does not exist (the server, a locked-down
 * browser) so a caller falls back to memory rather than throwing during a
 * render. Every operation is one short transaction; a rejection is the
 * caller's to catch — the map renders without a warm start, it never fails
 * to render for want of one.
 */
export function createIndexedDbLayoutStorage(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): LayoutStorage | null {
  if (!factory) return null;
  let opening: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    opening ??= new Promise((resolve, reject) => {
      const request = factory.open(LAYOUT_STORE_NAME, LAYOUT_STORE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("layouts")) {
          database.createObjectStore("layouts", { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB"));
      request.onblocked = () => reject(new Error("indexedDB blocked"));
    });
    return opening;
  };
  const run = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const database = await open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("layouts", mode);
      const request = operation(transaction.objectStore("layouts"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB"));
    });
  };
  return {
    read: (key) => run("readonly", (store) => store.get(key)),
    remove: async (key) => {
      await run("readwrite", (store) => store.delete(key));
    },
    write: async (key, value) => {
      await run("readwrite", (store) =>
        store.put({ ...(isRecord(value) ? value : {}), key }),
      );
    },
  };
}
