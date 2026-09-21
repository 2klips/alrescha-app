import type { SupabaseClient } from "@supabase/supabase-js";

import { SYMBOL_LAYER_LIMITS } from "@alrescha/mcp";

/**
 * The map's symbol layer, one request per set of files (Phase 4 Wave F todo
 * 26, R5 §2.4: "near zoom, selected files only, default load 0").
 *
 * The map never carries a symbol in its model; when a file is looked at,
 * this reads that file's exported symbols and their `declares`/`extends`
 * edges through the session client — row security decides what the viewer
 * may see, as it does for the map itself — and the client draws them as a
 * halo around the file and caches them by commit. The caps are the MCP
 * store's, stated once (`SYMBOL_LAYER_LIMITS`): files ≤200, symbols ≤5,000,
 * edges ≤20,000, each reported when hit rather than silently applied.
 */

export interface SymbolLayerSymbol {
  readonly container: string | null;
  readonly endLine: number;
  readonly engine: string | null;
  readonly fileId: string;
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly path: string;
  readonly startLine: number;
}

export interface SymbolLayerEdge {
  readonly id: string;
  readonly relation: "declares" | "extends";
  readonly source: string;
  readonly target: string;
}

export interface SymbolLayerTruncation {
  readonly limit: number;
  readonly table: "files" | "symbol_edges" | "symbols";
}

export interface SymbolLayerPayload {
  readonly edges: readonly SymbolLayerEdge[];
  /** The file ids the read answered for, in the order they were asked. */
  readonly files: readonly string[];
  readonly symbols: readonly SymbolLayerSymbol[];
  readonly truncated: readonly SymbolLayerTruncation[];
}

const ULID_SHAPE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** `files=a,b,c` → the ids, deduplicated, ULID-shaped, capped with a note. */
export function parseSymbolLayerRequest(files: string | null): {
  fileIds: string[];
  truncated: SymbolLayerTruncation[];
} {
  const ids = [
    ...new Set(
      (files ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => ULID_SHAPE.test(id)),
    ),
  ];
  return ids.length > SYMBOL_LAYER_LIMITS.files
    ? {
        fileIds: ids.slice(0, SYMBOL_LAYER_LIMITS.files),
        truncated: [{ limit: SYMBOL_LAYER_LIMITS.files, table: "files" }],
      }
    : { fileIds: ids, truncated: [] };
}

interface SymbolRow {
  readonly artifact_id: string;
  readonly container: string | null;
  readonly end_line: number;
  readonly engine: string | null;
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly path: string;
  readonly start_line: number;
}

interface SymbolEdgeRow {
  readonly id: string;
  readonly relation: string;
  readonly source_node_id: string;
  readonly target_node_id: string;
}

export async function readSymbolLayer(
  client: SupabaseClient,
  fileIds: readonly string[],
  truncated: readonly SymbolLayerTruncation[] = [],
): Promise<SymbolLayerPayload> {
  const notes: SymbolLayerTruncation[] = [...truncated];
  if (fileIds.length === 0) {
    return { edges: [], files: [], symbols: [], truncated: notes };
  }

  const symbolResult = await client
    .from("symbols")
    .select(
      "id,artifact_id,path,container,kind,name,start_line,end_line,engine",
    )
    .in("artifact_id", fileIds)
    .order("path", { ascending: true })
    .order("start_line", { ascending: true })
    .order("name", { ascending: true })
    .limit(SYMBOL_LAYER_LIMITS.symbols + 1);
  if (symbolResult.error) {
    throw new Error(`symbol layer read failed: ${symbolResult.error.message}`);
  }
  const symbolRows = (symbolResult.data ?? []) as SymbolRow[];
  const keptRows =
    symbolRows.length > SYMBOL_LAYER_LIMITS.symbols
      ? symbolRows.slice(0, SYMBOL_LAYER_LIMITS.symbols)
      : symbolRows;
  if (keptRows.length < symbolRows.length) {
    notes.push({ limit: SYMBOL_LAYER_LIMITS.symbols, table: "symbols" });
  }
  const symbolIds = keptRows.map((row) => row.id);
  const known = new Set(symbolIds);

  // The `declares` of every symbol here plus the `extends` that touch one.
  // The far end of an `extends` may be a symbol of a file not asked for;
  // the edge still travels, so the halo can say "extends X" with X's id,
  // and the client asks for X's file when it wants X drawn.
  const edges: SymbolLayerEdge[] = [];
  if (symbolIds.length > 0) {
    const list = symbolIds.join(",");
    const edgeResult = await client
      .from("symbol_edges")
      .select("id,source_node_id,target_node_id,relation")
      .or(`source_node_id.in.(${list}),target_node_id.in.(${list})`)
      .order("id", { ascending: true })
      .limit(SYMBOL_LAYER_LIMITS.edges + 1);
    if (edgeResult.error) {
      throw new Error(`symbol edge read failed: ${edgeResult.error.message}`);
    }
    const edgeRows = (edgeResult.data ?? []) as SymbolEdgeRow[];
    const keptEdges =
      edgeRows.length > SYMBOL_LAYER_LIMITS.edges
        ? edgeRows.slice(0, SYMBOL_LAYER_LIMITS.edges)
        : edgeRows;
    if (keptEdges.length < edgeRows.length) {
      notes.push({ limit: SYMBOL_LAYER_LIMITS.edges, table: "symbol_edges" });
    }
    for (const row of keptEdges) {
      if (row.relation !== "declares" && row.relation !== "extends") continue;
      // A `declares` into a symbol the cap dropped would name a node the
      // payload does not carry.
      if (row.relation === "declares" && !known.has(row.target_node_id)) {
        continue;
      }
      edges.push({
        id: row.id,
        relation: row.relation,
        source: row.source_node_id,
        target: row.target_node_id,
      });
    }
  }

  return {
    edges,
    files: [...fileIds],
    symbols: keptRows.map((row) => ({
      container: row.container,
      endLine: Number(row.end_line),
      engine: row.engine,
      fileId: row.artifact_id,
      id: row.id,
      kind: row.kind,
      name: row.name,
      path: row.path,
      startLine: Number(row.start_line),
    })),
    truncated: notes,
  };
}
