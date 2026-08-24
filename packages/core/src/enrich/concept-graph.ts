import { createHash } from "node:crypto";

import { EnrichValidationError } from "./prose-summary";

/**
 * The enrich pass, part ② — concept synthesis (Phase 3 Wave C todo 7).
 *
 * Summaries go in batches to a forced-tool-use model call; what comes back is
 * cleaned deterministically: only the closed seven-verb vocabulary survives,
 * only known file paths become members, ambiguous links are discarded rather
 * than guessed (the Graft judgment, adopted verbatim). Concepts converge by
 * deterministic slug so re-running the same input upserts the same rows —
 * batch boundaries cannot fragment a concept because merging is by slug too.
 */

export const CONCEPT_RELATIONS = [
  "part_of",
  "uses",
  "depends_on",
  "produces",
  "configures",
  "validates",
  "implements",
] as const;
export type ConceptRelation = (typeof CONCEPT_RELATIONS)[number];

export const CONCEPT_KINDS = ["system", "api", "concept"] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];

export interface FileSummaryInput {
  readonly blobSha: string;
  readonly path: string;
  readonly summary: string;
}

/** Batch cap (Graft's ≤48k-character batches). */
export const SUMMARY_BATCH_MAX_CHARS = 48_000;

/**
 * Synthesis batches run smaller than the raw cap: the pilot's full-size
 * batch pushed the concept payload past the output budget and the truncated
 * tool call failed structural validation. Smaller input, complete output —
 * the slug merge stitches the batches back together.
 */
export const CONCEPT_BATCH_MAX_CHARS = 24_000;

export function batchSummaries(
  summaries: readonly FileSummaryInput[],
  maxChars: number = SUMMARY_BATCH_MAX_CHARS,
): FileSummaryInput[][] {
  const batches: FileSummaryInput[][] = [];
  let current: FileSummaryInput[] = [];
  let size = 0;
  for (const summary of summaries) {
    const cost = summary.path.length + summary.summary.length + 8;
    if (current.length > 0 && size + cost > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(summary);
    size += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Deterministic slug — same name, same row, every run (convergence). */
export function slugifyConceptName(name: string): string {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export type ConceptLinkTarget =
  { readonly slug: string } | { readonly path: string };

export interface ConceptLink {
  readonly relation: ConceptRelation;
  readonly target: ConceptLinkTarget;
}

export interface SynthesizedConcept {
  readonly kind: ConceptKind;
  readonly links: readonly ConceptLink[];
  readonly memberPaths: readonly string[];
  readonly name: string;
  readonly slug: string;
  readonly summary: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/**
 * The clean pass. Structural failure (not even `{concepts: []}`) throws the
 * never-billed marker; anything merely dubious inside — an open-vocabulary
 * verb, an unknown member path, an unresolvable link target, a concept with
 * nothing left — is silently discarded, never guessed at.
 */
export function validateConceptSynthesis(input: {
  readonly knownPaths: ReadonlySet<string>;
  readonly raw: unknown;
}): SynthesizedConcept[] {
  if (!isRecord(input.raw) || !Array.isArray(input.raw.concepts)) {
    throw new EnrichValidationError(
      "Concept synthesis output did not match the {concepts: []} schema.",
    );
  }

  const drafts: {
    kind: ConceptKind;
    memberPaths: string[];
    name: string;
    rawLinks: unknown[];
    slug: string;
    summary: string;
  }[] = [];
  for (const entry of input.raw.concepts) {
    if (!isRecord(entry)) continue;
    const name = cleanString(entry.name, 80);
    const summary = cleanString(entry.summary, 600);
    const kind = CONCEPT_KINDS.find((value) => value === entry.kind) ?? null;
    if (!name || !summary || !kind) continue;
    if (summary.includes("```") || summary.includes("\n")) continue;
    const slug = slugifyConceptName(name);
    if (!slug) continue;
    const memberPaths = Array.isArray(entry.member_paths)
      ? [
          ...new Set(
            entry.member_paths.filter(
              (path): path is string =>
                typeof path === "string" && input.knownPaths.has(path),
            ),
          ),
        ]
      : [];
    drafts.push({
      kind,
      memberPaths,
      name,
      rawLinks: Array.isArray(entry.links) ? entry.links : [],
      slug,
      summary,
    });
  }

  const slugs = new Set(drafts.map((draft) => draft.slug));
  const nameToSlug = new Map(drafts.map((draft) => [draft.name, draft.slug]));

  const concepts: SynthesizedConcept[] = [];
  for (const draft of drafts) {
    const links: ConceptLink[] = [];
    for (const rawLink of draft.rawLinks) {
      if (!isRecord(rawLink)) continue;
      const relation = CONCEPT_RELATIONS.find(
        (value) => value === rawLink.relation,
      );
      if (!relation) continue; // outside the closed vocabulary → discard

      let target: ConceptLinkTarget | null = null;
      const targetPath = cleanString(rawLink.target_path, 512);
      const targetConcept = cleanString(rawLink.target_concept, 80);
      if (targetPath && input.knownPaths.has(targetPath)) {
        target = { path: targetPath };
      } else if (targetConcept) {
        const slug =
          nameToSlug.get(targetConcept) ?? slugifyConceptName(targetConcept);
        if (slugs.has(slug) && slug !== draft.slug) target = { slug };
      }
      if (target) links.push({ relation, target });
    }
    // A concept anchored to nothing explains nothing — discard.
    if (draft.memberPaths.length === 0 && links.length === 0) continue;
    concepts.push({
      kind: draft.kind,
      links,
      memberPaths: draft.memberPaths,
      name: draft.name,
      slug: draft.slug,
      summary: draft.summary,
    });
  }
  return concepts;
}

/** Slug-keyed merge across batch boundaries — no fragmentation. */
export function mergeConceptBatches(
  batches: readonly (readonly SynthesizedConcept[])[],
): SynthesizedConcept[] {
  const merged = new Map<string, SynthesizedConcept>();
  for (const batch of batches) {
    for (const concept of batch) {
      const existing = merged.get(concept.slug);
      if (!existing) {
        merged.set(concept.slug, concept);
        continue;
      }
      const links = [...existing.links];
      const seen = new Set(
        links.map((link) => `${link.relation}:${JSON.stringify(link.target)}`),
      );
      for (const link of concept.links) {
        const key = `${link.relation}:${JSON.stringify(link.target)}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push(link);
        }
      }
      merged.set(concept.slug, {
        ...existing,
        links,
        memberPaths: [
          ...new Set([...existing.memberPaths, ...concept.memberPaths]),
        ],
        // The longer summary wins — it saw more of the concept.
        summary:
          concept.summary.length > existing.summary.length
            ? concept.summary
            : existing.summary,
      });
    }
  }
  return [...merged.values()];
}

/**
 * Freshness key for the whole synthesis: the sorted member blob shas. A
 * rescan that changes any summarized file changes the digest, which is what
 * invalidates the concept layer (LazyGraphRAG-style cache).
 *
 * The formula is mirrored in SQL by `enqueue_enrich_job`
 * (`md5(string_agg(path || ':' || sha, '\n' order by path))`) — the two must
 * agree byte for byte or staleness detection silently breaks. md5 because
 * PGlite ships it and this is a cache key, not a security boundary.
 */
export function conceptSynthesisDigest(
  summaries: readonly FileSummaryInput[],
): string {
  const joined = [...summaries]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((entry) => `${entry.path}:${entry.blobSha}`)
    .join("\n");
  return createHash("md5").update(joined).digest("hex");
}

/** JSON schema for the forced tool-use call — strict on both providers. */
export const CONCEPT_SYNTHESIS_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    concepts: {
      items: {
        additionalProperties: false,
        properties: {
          kind: { enum: [...CONCEPT_KINDS], type: "string" },
          links: {
            items: {
              additionalProperties: false,
              properties: {
                relation: { enum: [...CONCEPT_RELATIONS], type: "string" },
                target_concept: { type: ["string", "null"] },
                target_path: { type: ["string", "null"] },
              },
              required: ["relation", "target_concept", "target_path"],
              type: "object",
            },
            type: "array",
          },
          member_paths: { items: { type: "string" }, type: "array" },
          name: { type: "string" },
          summary: { type: "string" },
        },
        required: ["kind", "links", "member_paths", "name", "summary"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["concepts"],
  type: "object",
} as const;
