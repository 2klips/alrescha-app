import {
  deriveArtifactUnit,
  deriveBrainArea,
  type ArtifactUnit,
  type BrainArea,
  type LayoutConventions,
} from "../ingest/artifact-facets";
import type { ArtifactClassification } from "../ingest/repository-scanner";
import { summaryAbsence, type SummaryState } from "../enrich/prose-summary";

/**
 * One file, described from what is stored (Codex remedy P0-A §6.1, step S5).
 *
 * The screen and the agent were building this separately. The map inspector
 * read `metadata.summary`, `get_artifact` read `metadata.summary`, the search
 * excerpt read `content` — each with its own idea of what a file "is" and,
 * until S1, its own idea of whether the prose still applied. Three answers to
 * one question is three chances to be differently wrong.
 *
 * Two rules make this card honest:
 *
 * - **Source metadata and model prose are separate fields.** They used to be
 *   one `content` string, so a caller could not tell a path from a paragraph
 *   somebody generated. `summary` is a `SummaryState`, which carries whether
 *   the prose still describes this blob at all.
 * - **A card with no prose is still a card.** Path, kind, domain, unit,
 *   exported symbol *names*, the relations the graph holds and the test and
 *   todo links are all deterministic facts. A repository that has never paid
 *   for enrich still gets a useful answer, and `missing` says what is absent
 *   rather than leaving a caller to infer it from an empty string.
 *
 * Names only, never bodies: an exported symbol's name is identifier metadata,
 * its signature and docstring are source (WORK_SPEC §3-3).
 */

export interface ArtifactCardRelation {
  readonly direction: "incoming" | "outgoing";
  readonly relation: string;
}

export interface ArtifactCardBasis {
  readonly classification: ArtifactClassification;
  /** Names as stored. A string list and a symbol list both read the same. */
  readonly exportedSymbols?:
    readonly string[] | readonly { readonly name: string }[] | undefined;
  readonly layout?: LayoutConventions | undefined;
  readonly path: string;
  readonly relations?: readonly ArtifactCardRelation[] | undefined;
  /**
   * Already decided by `summaryState`, never re-derived here. The caller
   * holds the row, so the caller applies the one freshness rule (S1) and
   * this card carries the answer rather than a second opinion.
   */
  readonly summary: SummaryState;
  /** Open todo items the scan read out of this file, if any. */
  readonly openTodoCount?: number | undefined;
}

export interface ArtifactCard {
  readonly domain: BrainArea;
  /** Exported symbol names, sorted. Never a signature. */
  readonly exports: readonly string[];
  readonly kind: ArtifactClassification;
  /**
   * What this card could not state, and why. An empty list is a claim that
   * everything a card carries was available — not that the file is simple.
   */
  readonly missing: readonly string[];
  readonly openTodoCount: number;
  readonly path: string;
  /** Relation name to how many edges carry it, both directions counted. */
  readonly relations: Readonly<Record<string, number>>;
  readonly summary: SummaryState;
  /** True when some edge marks this file as tested. */
  readonly tested: boolean;
  readonly unit: ArtifactUnit;
}

function symbolNames(
  value: ArtifactCardBasis["exportedSymbols"],
): readonly string[] {
  if (!value) return [];
  const names = value.map((entry) =>
    typeof entry === "string" ? entry : entry.name,
  );
  return [...new Set(names.filter((name) => name.length > 0))].sort();
}

/**
 * The card, from stored facts alone. Pure: no database, no fetch, no clock —
 * the same basis always produces the same card, which is what lets the screen
 * and the agent be checked against each other.
 */
export function buildArtifactCard(basis: ArtifactCardBasis): ArtifactCard {
  const exports = symbolNames(basis.exportedSymbols);
  const relations: Record<string, number> = {};
  for (const { relation } of basis.relations ?? []) {
    relations[relation] = (relations[relation] ?? 0) + 1;
  }
  const summary = basis.summary;
  const tested = (basis.relations ?? []).some(
    ({ direction, relation }) =>
      relation === "tests" && direction === "incoming",
  );

  const missing: string[] = [];
  // The prose absence comes from `summaryAbsence`, not from a sentence of
  // this file's own (todo 19 보완 R-02). Three surfaces report it — this
  // card, `get_node_content` and the search excerpt — and three sentences
  // for one state is how a reader learns that the answer depends on which
  // door they came through.
  const absence = summaryAbsence(summary);
  if (absence) missing.push(absence.reason);
  if (exports.length === 0 && basis.classification === "code_metadata") {
    missing.push("no exported symbols were recorded");
  }
  if (!tested) missing.push("no test edge points at this file");
  if ((basis.relations ?? []).length === 0) {
    missing.push("no relation to another node was recorded");
  }

  return {
    domain: deriveBrainArea(basis.path, basis.classification, basis.layout),
    exports,
    kind: basis.classification,
    missing,
    openTodoCount: basis.openTodoCount ?? 0,
    path: basis.path,
    relations,
    summary,
    tested,
    unit: deriveArtifactUnit({
      classification: basis.classification,
      exportedSymbols: exports.map((name) => ({ name })),
      path: basis.path,
    }),
  };
}
