import type { BrainQueryFilter } from "./data-brain";

/**
 * The questions worth asking first, written down (Phase 4 Wave D todo 21).
 *
 * `query_brain` can express all of these already; what it could not do was
 * *suggest* them. An agent opening a repository does not know which filter
 * combination is the useful one, and neither does a person looking at
 * `/app/inspection` — so the four are named here, once, and both surfaces
 * read the same list rather than each hard-coding its own three.
 *
 * Each one is a filter, not a stored result. Nothing is cached and nothing
 * is charged: running a saved query is the same read as running it by hand.
 */

export const SAVED_QUERY_IDS = [
  "risk-top-10",
  "untested-code",
  "undocumented-code",
  "unimplemented-requirements",
] as const;

export type SavedQueryId = (typeof SAVED_QUERY_IDS)[number];

export interface SavedQuery {
  /** What the answer means, in the words the screen shows. */
  readonly description: string;
  readonly filter: BrainQueryFilter;
  readonly id: SavedQueryId;
  /**
   * Whether an incomplete read makes this query's answer unreliable. True
   * for the three negative ones: "no `tests` edge" from a truncated edge
   * read is `unknown`, not "none" (보완 R-01). `query_brain` already says so
   * in `coverage.unanswered`; this flag is how a screen knows to look.
   */
  readonly negative: boolean;
  readonly title: string;
}

export const SAVED_QUERIES: readonly SavedQuery[] = [
  {
    description:
      "Ranked by the same builder the inspection screen uses. A file with no risk factor at all is absent rather than scored zero.",
    filter: { limit: 10, sortBy: "risk", units: ["code"] },
    id: "risk-top-10",
    negative: false,
    title: "위험 상위 10",
  },
  {
    description:
      "Code files no test file points at. A missing `tests` edge is a missing edge, not proof the file is untested.",
    filter: { units: ["code"], withoutRelations: ["tests"] },
    id: "untested-code",
    negative: true,
    title: "테스트 없는 코드",
  },
  {
    description:
      "Code files no document references and that carry no current description of their own.",
    filter: {
      hasSummary: false,
      units: ["code"],
      withoutRelations: ["references"],
    },
    id: "undocumented-code",
    negative: true,
    title: "문서 없는 코드",
  },
  {
    description:
      "Requirements with no `implements` edge. On a repository whose statements do not name symbols this is nearly all of them — see OQ-064 before reading it as a coverage number.",
    filter: { types: ["requirement"], withoutRelations: ["implements"] },
    id: "unimplemented-requirements",
    negative: true,
    title: "요구사항 미구현",
  },
];

export function savedQuery(id: SavedQueryId): SavedQuery {
  const found = SAVED_QUERIES.find((query) => query.id === id);
  if (!found) throw new Error(`Unknown saved query: ${id}`);
  return found;
}
