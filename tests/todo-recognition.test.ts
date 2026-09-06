import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import {
  classifyArtifactPath,
  parseBeadsExport,
  parseRepositoryConfig,
  repositoryTodoMatcher,
  scanRepository,
} from "../packages/core/src/index";

/**
 * Phase 4 Wave D todo 21 — which files a scan reads a todo list out of.
 *
 * The pilot measurement was blunt: of the eight conventions teams actually
 * keep their tasks in, the scan recognised three, and the ones it missed are
 * the ones the tools people use write — spec-kit's `tasks.md`, a numbered
 * handoff note, a beads export. The plan's bar is seven of eight.
 */

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function repositoryWith(
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "alrescha-todo-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, contents, "utf8");
  }
  return root;
}

/**
 * The eight, each with the shape the tool that writes it produces. Named
 * rather than counted: a regression should say *which* convention went dark.
 */
const TODO_CONVENTIONS: readonly { kind: string; path: string }[] = [
  { kind: "TODO.md", path: "TODO.md" },
  { kind: "progress ledger", path: "docs/progress.md" },
  { kind: "handoff note", path: "HANDOFF.md" },
  { kind: "numbered handoff", path: "docs/2026-09-06-handoff.md" },
  { kind: "spec-kit tasks", path: "specs/001-auth/tasks.md" },
  { kind: "PLAN.md", path: "PLAN.md" },
  { kind: "BACKLOG.md", path: "BACKLOG.md" },
  { kind: "beads export", path: ".beads/issues.jsonl" },
];

describe("todo document recognition", () => {
  it("recognises all eight conventions a task list is kept in", () => {
    const missed = TODO_CONVENTIONS.filter(
      ({ path }) => classifyArtifactPath(path) !== "todo_progress",
    ).map(({ kind }) => kind);

    expect(missed).toEqual([]);
    // The plan asks for seven. This says eight, and says it in a way that
    // stays true if a ninth convention is added later.
    expect(TODO_CONVENTIONS.length - missed.length).toBeGreaterThanOrEqual(7);
  });

  it("keeps the widened names from swallowing prose and specs", () => {
    // `plan` and `tasks` are anchored at the start of the filename, so this
    // repository's own plan is still a spec — a rule that matched the word
    // anywhere would have relabelled half of `spec/`.
    expect(classifyArtifactPath("spec/BUILD_PLAN.md")).toBe("spec");
    expect(classifyArtifactPath("specs/001-auth/spec.md")).toBe("spec");
    expect(classifyArtifactPath("docs/planning-guide.md")).toBe("doc");
    expect(classifyArtifactPath("docs/3-tier-architecture.md")).toBe("doc");
    // A number in front of a handoff is a date or a sequence, not a licence
    // to call any numbered document a todo list.
    expect(classifyArtifactPath("docs/001-architecture.md")).toBe("doc");
    // `.beads` is recognised by its export, not by its directory: the
    // README a team leaves in there is a README.
    expect(classifyArtifactPath(".beads/README.md")).toBe("doc");
  });

  it("takes the repository's word over the filename", () => {
    const declared = repositoryTodoMatcher(
      parseRepositoryConfig(
        JSON.stringify({
          progressDocs: ["docs/journal/*.md"],
          todoFiles: ["spec/BUILD_PLAN*.md", "planning/"],
        }),
      ),
    );

    expect(classifyArtifactPath("spec/BUILD_PLAN_PHASE4.md")).toBe("spec");
    expect(classifyArtifactPath("spec/BUILD_PLAN_PHASE4.md", declared)).toBe(
      "todo_progress",
    );
    // A trailing slash means the tree under it, the same way `ignore` reads.
    expect(classifyArtifactPath("planning/wave-d/notes.md", declared)).toBe(
      "todo_progress",
    );
    expect(classifyArtifactPath("docs/journal/2026-09-06.md", declared)).toBe(
      "todo_progress",
    );
    // A glob, not a prefix.
    expect(classifyArtifactPath("spec/WORK_SPEC.md", declared)).toBe("spec");
  });

  it("will not let a repository relabel its own instruction files", () => {
    const everything = repositoryTodoMatcher(
      parseRepositoryConfig(JSON.stringify({ todoFiles: ["**"] })),
    );

    // The instruction-cost table is built from these four. A repository that
    // could call its `AGENTS.md` a todo list would take its own
    // always-loaded bytes out of its own bill.
    expect(classifyArtifactPath("AGENTS.md", everything)).toBe("agents");
    expect(classifyArtifactPath("CLAUDE.md", everything)).toBe("claude");
    expect(classifyArtifactPath("skills/review/SKILL.md", everything)).toBe(
      "skill",
    );
    expect(classifyArtifactPath(".cursor/rules/testing.mdc", everything)).toBe(
      "cursor_rule",
    );
    // Everything below those four is inference, and the statement wins.
    expect(classifyArtifactPath("README.md", everything)).toBe("todo_progress");
    expect(classifyArtifactPath("docs/adr/ADR-001.md", everything)).toBe(
      "todo_progress",
    );
    // …but a file the scan never reads is still never read.
    expect(
      classifyArtifactPath("node_modules/pkg/todo.md", everything),
    ).toBeNull();
    expect(
      classifyArtifactPath("fixtures/demo/TODO.md", everything),
    ).toBeNull();
  });
});

describe("beads export", () => {
  const EXPORT = [
    '{"id":"bd-1","title":"Wire the CI evidence source","status":"open"}',
    '{"id":"bd-2","title":"Ship the risk widget","status":"in_progress"}',
    '{"id":"bd-3","title":"Close the loop","status":"closed"}',
    '{"id":"bd-4","title":"Waiting on credentials","status":"blocked"}',
    '{"id":"bd-5","title":"State we have never seen","status":"triaged"}',
    "",
    "not json at all",
    '["an array is not an issue"]',
    '{"title":"No id, so no identity"}',
    '{"id":"bd-6"}',
    '{"id":"bd-1","title":"A second line claiming the same id"}',
  ].join("\n");

  it("reads issues, their states, and where each one is", () => {
    const items = parseBeadsExport({
      path: ".beads/issues.jsonl",
      source: EXPORT,
    });

    expect(items.map(({ status, title }) => [title, status])).toEqual([
      ["Wire the CI evidence source", "open"],
      ["Ship the risk widget", "in-progress"],
      ["Close the loop", "done"],
      ["Waiting on credentials", "blocked"],
      // A state this build does not know reads as `open`. `TodoStatus` has
      // no "unknown", and `open` is the only value that claims nothing
      // beyond "not finished" — reading it as `done` would report work
      // complete on the strength of a word we failed to parse.
      ["State we have never seen", "open"],
    ]);
    // Identity is the id beads assigned, never the line it landed on: an
    // issue that moves up the file is the same issue.
    expect(items.map(({ sourceKey }) => sourceKey)).toEqual([
      "beads:.beads/issues.jsonl:bd-1",
      "beads:.beads/issues.jsonl:bd-2",
      "beads:.beads/issues.jsonl:bd-3",
      "beads:.beads/issues.jsonl:bd-4",
      "beads:.beads/issues.jsonl:bd-5",
    ]);
    // …and the line is still recorded, because a reader wants to open it.
    expect(items.map(({ source }) => source.span.startLine)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(items[0]?.source.span.startByte).toBe(0);
    // Beads' dependencies are edges, not nesting.
    expect(items.every(({ parentKey }) => parentKey === null)).toBe(true);
  });

  it("skips what it cannot read instead of losing the file", () => {
    // Five issues out of eleven lines: a blank, a line of prose, an array, an
    // issue with no id, an issue with no title, and a repeated id. One line
    // another tool wrote in a shape we do not know is not a reason to lose a
    // repository's issue list.
    expect(parseBeadsExport({ path: "p", source: EXPORT })).toHaveLength(5);
    expect(parseBeadsExport({ path: "p", source: "" })).toEqual([]);
  });

  it("moves an issue's identity with it when the file is rewritten", () => {
    const before = parseBeadsExport({
      path: ".beads/issues.jsonl",
      source: EXPORT,
    });
    const after = parseBeadsExport({
      path: ".beads/issues.jsonl",
      // Reordered, retitled, and one closed — the three edits that renamed
      // every checkbox below them under the markdown reader.
      source: [
        '{"id":"bd-3","title":"Close the loop","status":"closed"}',
        '{"id":"bd-1","title":"Wire the CI evidence source, at last","status":"closed"}',
      ].join("\n"),
    });

    const wired = after.find(({ sourceKey }) => sourceKey.endsWith("bd-1"));
    expect(wired?.sourceKey).toBe(before[0]?.sourceKey);
    expect(wired?.title).toBe("Wire the CI evidence source, at last");
    expect(wired?.status).toBe("done");
  });
});

describe("a scan of a repository that keeps todos in three places", () => {
  it("reads each with the reader that fits, and none with the wrong one", async () => {
    const root = await repositoryWith({
      ".alrescha.json": JSON.stringify({ todoFiles: ["spec/BUILD_PLAN.md"] }),
      ".beads/issues.jsonl": [
        '{"id":"bd-7","title":"Publish the coverage artifact","status":"open"}',
        '{"id":"bd-8","title":"Measure the map","status":"closed"}',
      ].join("\n"),
      "specs/001-auth/tasks.md":
        "- [ ] Wire the callback\n- [x] Store the token\n",
      "spec/BUILD_PLAN.md": "- [ ] Land the risk widget\n",
    });
    const { commitSha, source } = await createLocalRepositorySource(root);
    const plan = await scanRepository({ commitSha, source });
    const byPath = new Map(plan.artifacts.map((a) => [a.path, a]));

    // The repository's own statement, spec-kit's convention, and beads: three
    // files that share nothing but what they mean.
    for (const path of [
      ".beads/issues.jsonl",
      "spec/BUILD_PLAN.md",
      "specs/001-auth/tasks.md",
    ]) {
      expect(byPath.get(path)?.kind, path).toBe("todo");
    }

    expect(
      byPath.get("specs/001-auth/tasks.md")?.todoItems.map((t) => t.status),
    ).toEqual(["open", "done"]);
    expect(
      byPath.get("spec/BUILD_PLAN.md")?.todoItems.map((t) => t.title),
    ).toEqual(["Land the risk widget"]);
    // Two issues, keyed by beads' ids — not one todo for the whole file,
    // which is what a markdown parser would have made of JSON lines.
    expect(
      byPath.get(".beads/issues.jsonl")?.todoItems.map((t) => t.sourceKey),
    ).toEqual([
      "beads:.beads/issues.jsonl:bd-7",
      "beads:.beads/issues.jsonl:bd-8",
    ]);
    // …and nothing tried to read it as prose: an export has no headings and
    // no links, so a section or a `references` edge out of it would be an
    // artefact of the wrong parser.
    expect(
      plan.sections.filter((s) => s.path === ".beads/issues.jsonl"),
    ).toEqual([]);
    expect(
      plan.docLinks.filter((l) => l.sourcePath === ".beads/issues.jsonl"),
    ).toEqual([]);
  });
});
