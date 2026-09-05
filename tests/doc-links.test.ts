import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MAX_DOC_LINKS_PER_DOCUMENT,
  parseMarkdownStructure,
  resolveDocLinks,
  scanRepository,
  type DocLink,
  type ParsedMarkdownStructure,
} from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";

/**
 * Document links (Phase 4 Wave A todo 2, design ①).
 *
 * A repository's prose points at its code in two ways — inline paths and
 * markdown links — and neither reached the graph. These cases state what
 * resolves, at which tier, and what stays silent: an ambiguous name and a
 * path that does not exist produce no edge at all, because a wrong edge in a
 * graph people navigate costs more than a missing one.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DRIFTED_DEMO = resolve(repoRoot, "fixtures/drifted-demo");

function documents(
  sources: Record<string, string>,
): Map<string, ParsedMarkdownStructure> {
  return new Map(
    Object.entries(sources).map(([path, source]) => [
      path,
      parseMarkdownStructure({ path, source }),
    ]),
  );
}

function linksOf(input: {
  readonly knownPaths: readonly string[];
  readonly sources: Record<string, string>;
}): DocLink[] {
  return resolveDocLinks({
    documents: documents(input.sources),
    knownPaths: new Set(input.knownPaths),
  });
}

function pairs(links: readonly DocLink[]): string[] {
  return links.map(
    ({ sourcePath, targetPath, tier }) =>
      `${sourcePath} -> ${targetPath} (${tier})`,
  );
}

describe("document link resolution", () => {
  it("resolves an inline path that exists, exactly or relative to the document", () => {
    const links = linksOf({
      knownPaths: [
        "spec/WORK_SPEC.md",
        "src/session.ts",
        "spec/notes/detail.md",
      ],
      sources: {
        "spec/WORK_SPEC.md":
          "# Spec\n\nSessions expire in `src/session.ts`, detailed in `notes/detail.md`.\n",
      },
    });

    expect(pairs(links)).toEqual([
      "spec/WORK_SPEC.md -> spec/notes/detail.md (resolved)",
      "spec/WORK_SPEC.md -> src/session.ts (resolved)",
    ]);
    expect(links.every(({ method }) => method === "path-exists")).toBe(true);
  });

  it("drops the symbol suffix and links to the file", () => {
    const links = linksOf({
      knownPaths: ["src/session.ts"],
      sources: {
        "docs/adr/ADR-001.md":
          "# ADR-001\n\nImplemented by `src/session.ts#isSessionExpired`.\n",
      },
    });

    // The edge is file-level; which symbol inside it is the code resolver's
    // business, and repeating the name here would be a second source of
    // truth for it.
    expect(pairs(links)).toEqual([
      "docs/adr/ADR-001.md -> src/session.ts (resolved)",
    ]);
  });

  it("falls back to a unique basename, at the reference tier", () => {
    const links = linksOf({
      knownPaths: ["packages/core/src/session.ts"],
      sources: {
        "README.md": "# Readme\n\nSee `session.ts` for the timeout rule.\n",
      },
    });

    expect(pairs(links)).toEqual([
      "README.md -> packages/core/src/session.ts (reference)",
    ]);
    expect(links[0]?.method).toBe("basename-owner");
  });

  it("says nothing when two files answer to the same name", () => {
    const links = linksOf({
      knownPaths: ["apps/web/index.ts", "packages/core/index.ts"],
      sources: {
        "README.md": "# Readme\n\nStart at `index.ts`.\n",
      },
    });

    expect(links).toEqual([]);
  });

  it("ignores prose, symbols, commands and addresses", () => {
    const links = linksOf({
      knownPaths: ["src/session.ts", "README.md"],
      sources: {
        "README.md": [
          "# Readme",
          "",
          "Call `isSessionExpired` after `npm run dev`.",
          "Read <https://example.test/session.ts> or mail `ops@example.test`.",
          "The token is `session.ts` in prose but `src/session.ts` in code.",
          "",
          "[external](https://example.test/docs.md) and [anchor](#top).",
        ].join("\n"),
      },
    });

    // Only the one path-shaped token that resolves survives; a bare
    // `session.ts` is a unique basename and resolves too.
    expect(pairs(links)).toEqual(["README.md -> src/session.ts (reference)"]);
  });

  it("links documents to documents through markdown and wiki links", () => {
    const links = linksOf({
      knownPaths: ["spec/WORK_SPEC.md", "spec/BUILD_PLAN.md", "docs/guide.md"],
      sources: {
        "spec/WORK_SPEC.md": [
          "# Spec",
          "",
          "Order of work: [plan](BUILD_PLAN.md#waves).",
          "Background lives in [[guide]].",
        ].join("\n"),
      },
    });

    expect(pairs(links)).toEqual([
      "spec/WORK_SPEC.md -> docs/guide.md (reference)",
      "spec/WORK_SPEC.md -> spec/BUILD_PLAN.md (resolved)",
    ]);
    expect(links.map(({ method }) => method).sort()).toEqual([
      "basename-owner",
      "doc-link",
    ]);
  });

  it("emits one edge per pair, carrying the first mention's span", () => {
    const links = linksOf({
      knownPaths: ["src/session.ts"],
      sources: {
        "spec/a.md": [
          "# A",
          "",
          "`src/session.ts` is the implementation.",
          "",
          "Again: `src/session.ts`.",
        ].join("\n"),
      },
    });

    // A document that names a file ten times has one relationship with it;
    // the count is not evidence of anything.
    expect(links).toHaveLength(1);
    expect(links[0]?.span).toEqual({ endLine: 3, startLine: 3 });
  });

  it("never links a document to itself", () => {
    const links = linksOf({
      knownPaths: ["docs/guide.md"],
      sources: {
        "docs/guide.md": "# Guide\n\nThis file is `docs/guide.md`.\n",
      },
    });

    expect(links).toEqual([]);
  });

  it("bounds a single document's fan-out", () => {
    const targets = Array.from(
      { length: MAX_DOC_LINKS_PER_DOCUMENT + 50 },
      (_, index) => `src/module-${index}.ts`,
    );
    const links = linksOf({
      knownPaths: targets,
      sources: {
        "docs/index.md": `# Index\n\n${targets
          .map((path) => `- \`${path}\``)
          .join("\n")}\n`,
      },
    });

    // A generated index that names every file is a hub, not a hairball
    // input: past the cap its remaining mentions are dropped.
    expect(links).toHaveLength(MAX_DOC_LINKS_PER_DOCUMENT);
  });

  it("carries no document text at all", () => {
    const links = linksOf({
      knownPaths: ["src/session.ts"],
      sources: {
        "spec/a.md":
          "# A\n\nThe secret sentinel: `src/session.ts` implements expiry.\n",
      },
    });

    // WORK_SPEC §3-3: paths and spans travel, prose does not. Everything a
    // link carries has to be reconstructable from the tree.
    expect(JSON.stringify(links)).not.toContain("sentinel");
    expect(Object.keys(links[0] ?? {}).sort()).toEqual([
      "kind",
      "method",
      "sourcePath",
      "span",
      "targetPath",
      "tier",
    ]);
  });
});

describe("document links over the demo fixture", () => {
  it("resolves the fixture's real prose-to-code wiring", async () => {
    const { commitSha, source } =
      await createLocalRepositorySource(DRIFTED_DEMO);
    const plan = await scanRepository({ commitSha, source });

    expect(pairs(plan.docLinks)).toEqual([
      ".agents/skills/review-auth/SKILL.md -> spec.md (resolved)",
      "docs/adr/ADR-001-session-timeout.md -> src/session.ts (resolved)",
    ]);
    // What the fixture says but does not get an edge for, and why:
    // `loginWithGitHub` is a symbol, `src/` names a directory, and
    // `src/legacy-billing.ts#legacyCharge` is the planted stale reference —
    // the path is absent, so the `stale-doc` finding reports it and the
    // graph stays quiet (WORK_SPEC §9).
    const targets = plan.docLinks.map(({ targetPath }) => targetPath);
    expect(targets).not.toContain("src/legacy-billing.ts");
    expect(targets.some((path) => path.includes("legacy"))).toBe(false);
    expect(JSON.stringify(plan.docLinks)).not.toContain("loginWithGitHub");
  });

  it("re-reads documents in full mode so their links are not frozen", async () => {
    const { commitSha, source } =
      await createLocalRepositorySource(DRIFTED_DEMO);
    const plan = await scanRepository({ commitSha, source });
    const previousArtifacts = plan.artifacts.map((artifact) => ({
      classification: artifact.classification,
      digest: artifact.digest,
      exportedSymbols: artifact.exportedSymbols,
      kind: artifact.kind,
      path: artifact.path,
      sizeBytes: artifact.sizeBytes,
      sourceBlobSha: artifact.sourceBlobSha,
      sourceCommitSha: artifact.sourceCommitSha,
    }));

    const incremental = await scanRepository({
      commitSha,
      previousArtifacts,
      previousCommitSha: null,
      source,
    });
    const relinked = await scanRepository({
      commitSha,
      mode: "full",
      previousArtifacts,
      previousCommitSha: commitSha,
      source,
    });

    // Nothing changed, so an incremental pass speaks for nothing…
    expect(incremental.docLinks).toEqual([]);
    // …while a full relink restates every document link (R5 §2.2 D2).
    expect(pairs(relinked.docLinks)).toEqual(pairs(plan.docLinks));
    expect(relinked.artifacts).toEqual([]);
  });

  it("keeps the fixture scan inside its time budget", async () => {
    const { commitSha, source } =
      await createLocalRepositorySource(DRIFTED_DEMO);
    const startedAt = performance.now();
    await scanRepository({ commitSha, mode: "full", source });

    // Parsing every document as markdown is new work in the scan; the guard
    // is the same alarm line the code-link pass carries.
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });
});
