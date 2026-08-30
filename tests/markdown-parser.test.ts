import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildDocumentOffsetIndex,
  parseMarkdownStructure,
  type MarkdownSpan,
} from "../packages/core/src/index";
import { describe, expect, it } from "vitest";

const FIXTURE_ROOT = resolve(import.meta.dirname, "../fixtures/drifted-demo");

function sliceSpan(source: string, span: MarkdownSpan): string {
  return Buffer.from(source)
    .subarray(span.startByte, span.endByte)
    .toString("utf8");
}

function expectExactSpan(source: string, span: MarkdownSpan): void {
  const bytes = Buffer.from(source);
  expect(span.startByte).toBeGreaterThanOrEqual(0);
  expect(span.endByte).toBeGreaterThan(span.startByte);
  expect(span.endByte).toBeLessThanOrEqual(bytes.length);

  const startPrefix = bytes.subarray(0, span.startByte).toString("utf8");
  const endPrefix = bytes.subarray(0, span.endByte).toString("utf8");
  const startLines = startPrefix.split("\n");
  const endLines = endPrefix.split("\n");

  expect(span.startLine).toBe(startLines.length);
  expect(span.startColumn).toBe((startLines.at(-1)?.length ?? 0) + 1);
  expect(span.endLine).toBe(endLines.length);
  expect(span.endColumn).toBe((endLines.at(-1)?.length ?? 0) + 1);
}

describe("Markdown structure parser", () => {
  it("extracts fixture headings, tasks, and normative statements with exact spans", async () => {
    const source = await readFile(resolve(FIXTURE_ROOT, "spec.md"), "utf8");
    const parsed = parseMarkdownStructure({ path: "spec.md", source });

    expect(parsed.headings.map(({ depth, text }) => ({ depth, text }))).toEqual(
      [
        { depth: 1, text: "Drifted Demo Specification" },
        { depth: 2, text: "Authentication" },
        { depth: 2, text: "Product claims" },
        { depth: 2, text: "Retired integration" },
      ],
    );
    expect(
      parsed.tasks.map(({ checked, text }) => ({ checked, text })),
    ).toEqual([
      {
        checked: false,
        text: "REQ-AUTH-001: The app MUST implement GitHub OAuth login through loginWithGitHub.",
      },
      {
        checked: true,
        text: "REQ-AUTH-002: The app MUST expire sessions after 30 minutes.",
      },
      {
        checked: true,
        text: "REQ-AUTH-003: The app MUST record an audit event after every successful login.",
      },
    ]);
    expect(parsed.normativeStatements.map(({ keyword }) => keyword)).toEqual([
      "MUST",
      "MUST",
      "MUST",
    ]);
    expect(parsed.diagnostics).toEqual([]);

    for (const element of [
      ...parsed.headings,
      ...parsed.tasks,
      ...parsed.normativeStatements,
    ]) {
      expectExactSpan(source, element.span);
      expect(sliceSpan(source, element.span).trim()).not.toBe("");
    }
    expect(sliceSpan(source, parsed.headings[0]!.span)).toBe(
      "# Drifted Demo Specification",
    );
    expect(sliceSpan(source, parsed.tasks[0]!.span)).toContain("REQ-AUTH-001");
  });

  it("parses frontmatter, nested tasks, and mixed link styles", () => {
    const source = `---
title: 다국어 명세
tags: [auth, github]
owner:
  team: docs
---
# Links

- [ ] Parent task
  - [x] Nested task

See [[ADR-001#Decision|결정]], [guide](../guide.md), [root](/README.md),
[website](https://example.com), and [reference][guide-ref].

[guide-ref]: ./reference.md
`;
    const parsed = parseMarkdownStructure({ path: "docs/spec.md", source });

    expect(parsed.frontmatter?.data).toEqual({
      owner: { team: "docs" },
      tags: ["auth", "github"],
      title: "다국어 명세",
    });
    expect(
      parsed.tasks.map(({ checked, depth, text }) => ({
        checked,
        depth,
        text,
      })),
    ).toEqual([
      { checked: false, depth: 1, text: "Parent task" },
      { checked: true, depth: 2, text: "Nested task" },
    ]);
    expect(
      parsed.links.map(({ kind, label, relative, target }) => ({
        kind,
        label,
        relative,
        target,
      })),
    ).toEqual([
      {
        kind: "wiki",
        label: "결정",
        relative: true,
        target: "ADR-001#Decision",
      },
      {
        kind: "markdown",
        label: "guide",
        relative: true,
        target: "../guide.md",
      },
      { kind: "markdown", label: "root", relative: true, target: "/README.md" },
      {
        kind: "markdown",
        label: "website",
        relative: false,
        target: "https://example.com",
      },
      {
        kind: "reference",
        label: "reference",
        relative: true,
        target: "./reference.md",
      },
    ]);

    const elements = [parsed.frontmatter!, ...parsed.tasks, ...parsed.links];
    for (const element of elements) {
      expectExactSpan(source, element.span);
      expect(sliceSpan(source, element.span)).not.toBe("");
    }
    expect(sliceSpan(source, parsed.frontmatter!.span)).toContain(
      "title: 다국어 명세",
    );
    expect(sliceSpan(source, parsed.links[0]!.span)).toBe(
      "[[ADR-001#Decision|결정]]",
    );
    expect(sliceSpan(source, parsed.links.at(-1)!.span)).toBe(
      "[reference][guide-ref]",
    );
  });

  it("extracts ADR and acceptance sections plus individual MUST/SHOULD sentences", () => {
    const source = `# ADR-007 Session policy

## Status

Accepted

## Context

Sessions can outlive active clients.

## Decision

Runtime MUST expire inactive sessions. It SHOULD emit an audit event.

### Acceptance Criteria

- [ ] Expiry occurs at the configured boundary.
- Audit records MUST name the session.

## Consequences

Clients need to sign in again.
`;
    const parsed = parseMarkdownStructure({
      path: "docs/adr/ADR-007.md",
      source,
    });

    expect(parsed.adrSections.map(({ heading }) => heading)).toEqual([
      "Status",
      "Context",
      "Decision",
      "Consequences",
    ]);
    expect(
      parsed.adrSections.find(({ heading }) => heading === "Decision")?.text,
    ).toContain("Runtime MUST expire inactive sessions.");
    expect(parsed.acceptanceCriteria).toHaveLength(1);
    expect(parsed.acceptanceCriteria[0]?.heading).toBe("Acceptance Criteria");
    expect(parsed.acceptanceCriteria[0]?.text).toContain(
      "Expiry occurs at the configured boundary.",
    );
    expect(
      parsed.normativeStatements.map(({ keyword, text }) => ({
        keyword,
        text,
      })),
    ).toEqual([
      { keyword: "MUST", text: "Runtime MUST expire inactive sessions." },
      { keyword: "SHOULD", text: "It SHOULD emit an audit event." },
      { keyword: "MUST", text: "Audit records MUST name the session." },
    ]);

    for (const element of [
      ...parsed.adrSections,
      ...parsed.acceptanceCriteria,
      ...parsed.normativeStatements,
    ]) {
      expectExactSpan(source, element.span);
    }
    expect(sliceSpan(source, parsed.normativeStatements[0]!.span)).toBe(
      "Runtime MUST expire inactive sessions.",
    );
    expect(sliceSpan(source, parsed.normativeStatements[1]!.span)).toBe(
      "It SHOULD emit an audit event.",
    );
  });

  it("returns recoverable diagnostics for malformed frontmatter", () => {
    const source = `---
title: [unterminated
owner: docs
---
# Still parsed

Body remains available.
`;

    expect(() =>
      parseMarkdownStructure({ path: "broken.md", source }),
    ).not.toThrow();
    const parsed = parseMarkdownStructure({ path: "broken.md", source });

    expect(parsed.headings.map(({ text }) => text)).toEqual(["Still parsed"]);
    expect(parsed.frontmatter).not.toBeNull();
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
    expect(parsed.diagnostics[0]).toMatchObject({ severity: "error" });
    expect(parsed.diagnostics[0]?.message.toLowerCase()).toContain(
      "flow sequence",
    );
    expectExactSpan(source, parsed.diagnostics[0]!.span!);
    expect(sliceSpan(source, parsed.diagnostics[0]!.span!)).toContain(
      "unterminated",
    );
  });

  it("parses a large document without losing element spans", () => {
    const sectionCount = 1_000;
    const source = [
      "# 대형 명세",
      ...Array.from(
        { length: sectionCount },
        (_, index) =>
          `## Requirement ${index}\n\n- [ ] REQ-${index}: Runtime MUST expose feature ${index}.\n\n[관련 문서 ${index}](./docs/${index}.md)`,
      ),
      "",
    ].join("\n\n");
    const parsed = parseMarkdownStructure({ path: "spec/large.md", source });

    expect(parsed.headings).toHaveLength(sectionCount + 1);
    expect(parsed.tasks).toHaveLength(sectionCount);
    expect(parsed.links).toHaveLength(sectionCount);
    expect(parsed.normativeStatements).toHaveLength(sectionCount);
    expect(parsed.diagnostics).toEqual([]);

    for (const element of [
      ...parsed.headings,
      ...parsed.tasks,
      ...parsed.links,
      ...parsed.normativeStatements,
    ]) {
      expectExactSpan(source, element.span);
    }
  });
});

/**
 * QW-14 differential oracle: `buildDocumentOffsetIndex` replaced the old
 * per-node `source.slice(0, offset).split("\n")` + `Buffer.byteLength`
 * arithmetic with a precomputed table. This proves the two agree at every
 * offset (not just the ones the fixtures above happen to touch) on the
 * edges that arithmetic is easiest to get subtly wrong: CRLF line endings,
 * multibyte and astral (surrogate-pair) unicode, and offsets that land
 * mid-surrogate-pair.
 */
function oldLineColumn(
  source: string,
  offset: number,
): { column: number; line: number } {
  const lines = source.slice(0, offset).split("\n");
  return { column: (lines.at(-1)?.length ?? 0) + 1, line: lines.length };
}

function oldByteOffset(source: string, offset: number): number {
  return Buffer.byteLength(source.slice(0, offset));
}

describe("buildDocumentOffsetIndex (differential oracle for QW-14)", () => {
  const fixtures: Record<string, string> = {
    "CRLF line endings": "line one\r\nline two\r\n\r\nline four\r\n",
    "CRLF mixed with bare LF": "a\r\nb\nc\r\n\nd",
    "astral emoji adjacent to newlines": "😀\n😀😀\ntext 😀 more\n",
    "lone high surrogate": "abc\uD83Ddef\nghi",
    "lone low surrogate": "abc\uDE00def\nghi",
    "korean and emoji mixed": "제목\n본문 내용 😀 끝\r\n다음 줄",
    "empty string": "",
    "no trailing newline": "just one line, no newline at end",
    "only newlines": "\n\n\n",
  };

  for (const [name, source] of Object.entries(fixtures)) {
    it(`matches the slice-based algorithm exactly: ${name}`, () => {
      const index = buildDocumentOffsetIndex(source);
      for (let offset = 0; offset <= source.length; offset += 1) {
        expect(index.lineColumnAt(offset)).toEqual(
          oldLineColumn(source, offset),
        );
        expect(index.byteOffsetAt(offset)).toBe(oldByteOffset(source, offset));
      }
    });
  }

  it("lineStartOffset matches the old offsetAtLine scan for every line", () => {
    const source = "one\r\ntwo\nthree\n\nfive";
    const index = buildDocumentOffsetIndex(source);
    function oldOffsetAtLine(line: number): number {
      let offset = 0;
      for (let current = 1; current < line; current += 1) {
        const next = source.indexOf("\n", offset);
        if (next === -1) return source.length;
        offset = next + 1;
      }
      return offset;
    }
    for (let line = 1; line <= 8; line += 1) {
      expect(index.lineStartOffset(line)).toBe(oldOffsetAtLine(line));
    }
  });
});
