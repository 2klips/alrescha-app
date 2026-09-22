import { createHash } from "node:crypto";

/**
 * A symbol's identity across scans (Phase 4 Wave F todo 26).
 *
 * The node id is an address the database mints; this key is what says two
 * rows are the same symbol. It is a function of where the symbol is declared
 * and what it is called — `path | container | kind | name` — so a rescan
 * that finds the same declaration keeps the same row, and a symbol that
 * moves to another file or changes kind is a new one whose old row is
 * removed rather than silently re-pointed.
 *
 * The plan says sha1; this is md5 for the same reason `doc_page_slug` is:
 * the SQL side computes the same key from `artifacts.exported_symbols` with
 * a function every PostgreSQL has, and pgcrypto is not one of them. The key
 * is an identifier, not a checksum of anything a collision could forge.
 *
 * `container` is reserved for members (`Class.method`) and is empty for
 * every symbol the scanner records today, which are top-level exports.
 */
export function symbolStableKey(input: {
  readonly container: string | null;
  readonly kind: string;
  readonly name: string;
  readonly path: string;
}): string {
  return createHash("md5")
    .update(
      [input.path, input.container ?? "", input.kind, input.name].join("|"),
    )
    .digest("hex");
}
