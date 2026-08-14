import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

import {
  getWorkspaceArtifact,
  searchWorkspaceIndex,
  selectWorkspaceContextPack,
} from "../../packages/mcp/src/data-brain";
import type { McpWorkspaceData } from "../../packages/mcp/src/store";
import type { BenchmarkArm } from "./types";

export interface RepositoryCorpusEntry {
  content: string;
  path: string;
}

export interface RepositoryCorpus {
  entries: RepositoryCorpusEntry[];
  root: string;
}

export interface ArmContext {
  arm: BenchmarkArm;
  text: string;
  toolNames: string[];
}

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".json",
  ".md",
  ".mdc",
  ".sql",
  ".ts",
  ".tsx",
  ".xml",
  ".yml",
  ".yaml",
]);
const IGNORED_SEGMENTS = new Set([
  ".git",
  ".next",
  ".omo",
  ".reports",
  "benchmarks",
  "coverage",
  "dist",
  "fixtures",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const MAX_CORPUS_FILE_BYTES = 80_000;
const IGNORED_FILES = new Set([
  "expected-artifacts.json",
  "expected-findings.json",
]);

function portable(path: string): string {
  return path.split(sep).join("/");
}

async function walk(
  root: string,
  directory = root,
): Promise<RepositoryCorpusEntry[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const output: RepositoryCorpusEntry[] = [];
  for (const entry of entries) {
    if (IGNORED_SEGMENTS.has(entry.name)) continue;
    if (IGNORED_FILES.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await walk(root, absolute)));
      continue;
    }
    if (
      !entry.isFile() ||
      !TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())
    )
      continue;
    const content = await readFile(absolute, "utf8");
    if (Buffer.byteLength(content, "utf8") > MAX_CORPUS_FILE_BYTES) continue;
    output.push({ content, path: portable(relative(root, absolute)) });
  }
  return output;
}

export async function loadRepositoryCorpus(
  root: string,
): Promise<RepositoryCorpus> {
  return { entries: await walk(root), root };
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .split(/[^\p{L}\p{N}_-]+/u)
      .filter((term) => term.length > 2),
  );
}

function rankEntries(
  corpus: RepositoryCorpus,
  query: string,
): RepositoryCorpusEntry[] {
  const queryTerms = terms(query);
  return corpus.entries
    .map((entry) => {
      const pathTerms = terms(entry.path);
      const bodyTerms = terms(entry.content);
      let score = 0;
      for (const term of queryTerms) {
        if (pathTerms.has(term)) score += 12;
        if (bodyTerms.has(term)) score += 3;
      }
      if (entry.path === "AGENTS.md") score += 2;
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.path.localeCompare(right.entry.path),
    )
    .map(({ entry }) => entry);
}

function section(entry: RepositoryCorpusEntry): string {
  return `## ${entry.path}\n\n${entry.content.trimEnd()}`;
}

function bounded(
  entries: readonly RepositoryCorpusEntry[],
  maxCharacters: number,
): RepositoryCorpusEntry[] {
  const selected: RepositoryCorpusEntry[] = [];
  let characters = 0;
  for (const entry of entries) {
    if (characters + entry.content.length > maxCharacters) continue;
    selected.push(entry);
    characters += entry.content.length;
  }
  return selected;
}

function artifactKind(path: string): string {
  if (path === "AGENTS.md") return "agents";
  if (path === "CLAUDE.md") return "claude";
  if (/(^|\/)\.agents\/skills\/.*\/SKILL\.md$/i.test(path)) return "skill";
  if (/(^|\/)\.cursor\/rules\/.*\.mdc$/i.test(path)) return "cursor_rule";
  if (/(^|\/)docs\/adr\/.*\.md$/i.test(path)) return "adr";
  if (/(^|\/)(TODO|PROGRESS)\.md$/i.test(path)) return "todo_progress";
  if (/\.(md|mdc)$/i.test(path)) return "spec";
  return "code_metadata";
}

function workspaceFromCorpus(corpus: RepositoryCorpus): McpWorkspaceData {
  const artifacts = corpus.entries.map((entry, index) => ({
    content: entry.content,
    headings: [...entry.content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(
      (match) => match[1] ?? "",
    ),
    id: `artifact-${index.toString().padStart(5, "0")}`,
    kind: artifactKind(entry.path),
    path: entry.path,
    status: "active",
    summary: entry.content.slice(0, 280),
    symbols: [
      ...entry.content.matchAll(
        /\b(?:export\s+)?(?:function|class|interface|const|type)\s+([A-Za-z_$][\w$]*)/g,
      ),
    ]
      .map((match) => match[1] ?? "")
      .slice(0, 50),
    tags: [...new Set([...terms(entry.path), ...terms(entry.content)])].slice(
      0,
      200,
    ),
    title: entry.path.split("/").at(-1) ?? entry.path,
  }));
  return {
    id: "benchmark-workspace",
    ownerUserId: "benchmark-user",
    repositories: [
      {
        artifacts,
        contextPacks: [],
        defaultBranch: "main",
        edges: [],
        evidence: [],
        findings: [],
        fullName: corpus.root,
        id: "benchmark-repository",
        indexEntries: artifacts.map((artifact, index) => ({
          headings: artifact.headings,
          id: `index-${index.toString().padStart(5, "0")}`,
          neighborIds: [],
          nodeId: artifact.id,
          path: artifact.path,
          searchKey: `${artifact.title} ${artifact.path} ${artifact.headings.join(" ")} ${artifact.symbols.join(" ")} ${artifact.tags.join(" ")} ${artifact.content}`,
          symbols: artifact.symbols,
          tags: artifact.tags,
          title: artifact.title,
          type: "artifact",
        })),
        overview: "Benchmark repository corpus",
        receipts: [],
        requirements: [],
      },
    ],
  };
}

export async function buildArmContext(input: {
  arm: BenchmarkArm;
  corpus: RepositoryCorpus;
  retrievalQuery: string;
  taskDescription: string;
}): Promise<ArmContext> {
  if (input.arm === "full-dump") {
    const documents = bounded(
      input.corpus.entries.filter(({ path }) =>
        /(^|\/)(AGENTS|CLAUDE|TODO)\.md$|\.(md|mdc)$/i.test(path),
      ),
      160_000,
    );
    return {
      arm: input.arm,
      text: `# Naive full documentation dump\n\n${documents.map(section).join("\n\n")}`,
      toolNames: [],
    };
  }

  const ranked = rankEntries(
    input.corpus,
    `${input.retrievalQuery} ${input.taskDescription}`,
  );
  if (input.arm === "checkout") {
    const selected = bounded(ranked.slice(0, 8), 50_000);
    return {
      arm: input.arm,
      text: [
        "# Checkout exploration",
        "",
        `Repository files: ${input.corpus.entries.map(({ path }) => path).join(", ")}`,
        "",
        ...selected.map(section),
      ].join("\n"),
      toolNames: ["checkout.search", ...selected.map(() => "checkout.read")],
    };
  }

  const workspace = workspaceFromCorpus(input.corpus);
  const searchQueries = [
    input.retrievalQuery,
    ...[...terms(input.retrievalQuery)],
  ];
  const searchResultMap = new Map<
    string,
    ReturnType<typeof searchWorkspaceIndex>[number]
  >();
  let searchCallCount = 0;
  for (const query of searchQueries) {
    searchCallCount += 1;
    for (const result of searchWorkspaceIndex(workspace, { query })) {
      const existing = searchResultMap.get(result.id);
      if (!existing || result.score > existing.score)
        searchResultMap.set(result.id, result);
    }
  }
  const relevanceTerms = terms(
    `${input.retrievalQuery} ${input.taskDescription}`,
  );
  const implementationTask = /\bimplement\b/i.test(input.taskDescription);
  const relevance = (
    result: ReturnType<typeof searchWorkspaceIndex>[number],
  ): number => {
    const pathAndTitle = `${result.path} ${result.title}`.toLocaleLowerCase(
      "en-US",
    );
    const excerpt = result.excerpt.toLocaleLowerCase("en-US");
    let score = result.score;
    for (const term of relevanceTerms) {
      if (pathAndTitle.includes(term)) score += 80;
      if (excerpt.includes(term)) score += 20;
    }
    if (implementationTask && /\.(?:ts|tsx|js|jsx)$/i.test(result.path))
      score += 120;
    return score;
  };
  const rankedResults = [...searchResultMap.values()].sort(
    (left, right) =>
      relevance(right) - relevance(left) ||
      right.score - left.score ||
      left.path.localeCompare(right.path),
  );
  const searchResults = rankedResults.slice(0, 6);
  const selectedArtifactResults = implementationTask
    ? rankedResults.slice(0, 2)
    : [
        rankedResults[0],
        rankedResults.find(({ path }) => /\.(?:md|mdc)$/i.test(path)),
      ]
        .filter((result): result is NonNullable<typeof result> =>
          Boolean(result),
        )
        .filter(
          (result, index, selected) =>
            selected.findIndex(({ id }) => id === result.id) === index,
        );
  if (selectedArtifactResults.length < 2) {
    const additional = rankedResults.find(
      (result) => !selectedArtifactResults.some(({ id }) => id === result.id),
    );
    if (additional) selectedArtifactResults.push(additional);
  }
  const artifactResults = selectedArtifactResults.flatMap((result) => {
    const selected = getWorkspaceArtifact(workspace, {
      id: result.nodeId,
    }).artifact;
    return selected
      ? [{ content: selected.content.slice(0, 4_000), path: selected.path }]
      : [];
  });
  const pack = selectWorkspaceContextPack(workspace, {
    targetAgent: "generic",
    taskDescription: `${input.retrievalQuery} ${input.taskDescription}`,
    tokenBudget: 800,
  });
  return {
    arm: input.arm,
    text: [
      "# Data Brain scripted MCP results",
      "",
      `## search_index\n\n${searchResults.map(({ excerpt, path, rank }) => `${path} [${rank}]\n${excerpt.slice(0, 160)}`).join("\n\n")}`,
      "",
      `## get_artifact\n\n${artifactResults.map(section).join("\n\n")}`,
      "",
      `## request_context_pack\n\n${pack.text}`,
    ].join("\n"),
    toolNames: [
      ...Array.from({ length: searchCallCount }, () => "search_index"),
      ...artifactResults.map(() => "get_artifact"),
      "request_context_pack",
    ],
  };
}
