import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

import { routeQuery } from "../../packages/core/src/index";
import {
  getWorkspaceArtifact,
  searchWorkspaceIndex,
  selectWorkspaceContextPack,
} from "../../packages/mcp/src/data-brain";
import {
  collectNeighbors,
  getNodeContent,
  searchWorkspaceNodes,
} from "../../packages/mcp/src/graph-tools";
import type { McpWorkspaceData } from "../../packages/mcp/src/store";
import type { BenchmarkArm, TechniqueFlags } from "./types";

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
  /** Byte-stable prefix length when the static-prefix technique is on. */
  staticPrefixChars?: number;
  text: string;
  toolNames: string[];
}

/** Fixed instruction preamble — byte-identical across every task. */
export const STATIC_PREFIX = [
  "# Arr Data Brain 사용 규약",
  "",
  "- 색인·그래프에서 찾은 노드 id로 필요한 내용만 요청한다.",
  "- 응답 근거는 노드 경로를 인용한다.",
  "- 저장되지 않은 사실을 지어내지 않는다.",
  "",
].join("\n");

/** The full hosted tool catalog, one line each (lazy loading trims this). */
export const TOOL_CATALOG: Readonly<Record<string, string>> = {
  get_artifact: "아티팩트 내용/발췌 + 이웃",
  get_findings: "발견 목록",
  get_neighbors: "노드 이웃(ID-first)",
  get_node_content: "노드 본문(명시 2단계)",
  impact_of: "영향 리포트",
  log_progress: "작업 기록",
  query_brain: "구조화 질의",
  record_note: "노트",
  request_context_pack: "컨텍스트 팩",
  route_query: "질의 라우팅",
  search_index: "색인 검색(발췌 포함)",
  search_nodes: "ID-first 검색",
  trace_path: "증거 경로 추적",
};

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
  /** Measurement mode (todo 6). Omitted → the historical context, byte-identical. */
  techniques?: TechniqueFlags;
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

  // Routing-experiment arms (schema 3, Phase 2B todo 5).
  const grepOnlyContext = (): ArmContext => {
    const selected = bounded(ranked.slice(0, 8), 50_000);
    return {
      arm: input.arm,
      text: ["# grep-only retrieval", "", ...selected.map(section)].join("\n"),
      toolNames: ["grep.search", ...selected.map(() => "grep.read")],
    };
  };
  const graphOnlyContext = (): ArmContext => {
    const graphWorkspace = workspaceFromCorpus(input.corpus);
    const seeds = searchWorkspaceNodes(
      graphWorkspace,
      input.retrievalQuery,
    ).slice(0, 4);
    const neighborhoods = seeds.map((seed) =>
      collectNeighbors(graphWorkspace, seed.nodeId, 1),
    );
    const contents = seeds
      .map((seed) => getNodeContent(graphWorkspace, seed.nodeId))
      .filter((node): node is NonNullable<typeof node> => node !== null)
      .map(
        (node) =>
          `## ${node.path ?? node.id}\n\n${node.content.slice(0, 6_000)}`,
      );
    return {
      arm: input.arm,
      text: [
        "# graph-only traversal",
        "",
        "## search_nodes",
        JSON.stringify(seeds),
        "## get_neighbors",
        JSON.stringify(
          neighborhoods.map((neighborhood) => neighborhood?.edges ?? []),
        ),
        "## get_node_content",
        ...contents,
      ].join("\n"),
      toolNames: [
        "search_nodes",
        ...seeds.map(() => "get_neighbors"),
        ...contents.map(() => "get_node_content"),
      ],
    };
  };
  if (input.arm === "grep-only") {
    return grepOnlyContext();
  }
  if (input.arm === "graph-only") {
    return graphOnlyContext();
  }
  if (input.arm === "routed") {
    const decision = routeQuery(input.taskDescription);
    let delegate =
      decision.route === "graph" ? graphOnlyContext() : grepOnlyContext();
    let fallbackNote = "";
    if (decision.route === "graph" && delegate.toolNames.length <= 1) {
      // The misroute escape hatch the router promises: an empty graph result
      // falls back to text retrieval.
      delegate = grepOnlyContext();
      fallbackNote = `\n(폴백: ${decision.fallback.reason})`;
    }
    return {
      arm: input.arm,
      text: [
        "# routed retrieval",
        "",
        `route_query → ${decision.route} — ${decision.reason}${fallbackNote}`,
        "",
        delegate.text,
      ].join("\n"),
      toolNames: ["route_query", ...delegate.toolNames],
    };
  }

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
    ? rankedResults.slice(0, 3)
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
  if (implementationTask) {
    // Include one test exemplar so implementation conventions (e.g. how
    // invalid input is rejected) are visible to the model, mirroring what a
    // checkout exploration would surface.
    const testExemplar = rankedResults.find(
      (result) =>
        /\.test\.(?:ts|tsx|js|jsx)$/i.test(result.path) &&
        !selectedArtifactResults.some(({ id }) => id === result.id),
    );
    if (testExemplar) selectedArtifactResults.push(testExemplar);
  }
  const artifactResults = selectedArtifactResults.flatMap((result) => {
    const selected = getWorkspaceArtifact(workspace, {
      id: result.nodeId,
    }).artifact;
    return selected
      ? [{ content: selected.content.slice(0, 6_000), path: selected.path }]
      : [];
  });
  const pack = selectWorkspaceContextPack(workspace, {
    targetAgent: "generic",
    taskDescription: `${input.retrievalQuery} ${input.taskDescription}`,
    tokenBudget: 800,
  });
  if (input.techniques === undefined) {
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

  // ---- Measurement mode (todo 6): technique flags reshape the context. ----
  const techniques = input.techniques;
  const idFirst = techniques["id-first-loading"];

  const idFirstArtifacts = selectedArtifactResults
    .slice(0, 2)
    .flatMap((result) => {
      const selected = getWorkspaceArtifact(workspace, {
        id: result.nodeId,
      }).artifact;
      return selected
        ? [{ content: selected.content.slice(0, 4_000), path: selected.path }]
        : [];
    });
  const searchSection = idFirst
    ? `## search_nodes\n\n${searchResults.map(({ id, path, rank }) => `${id} ${path} [${rank}]`).join("\n")}`
    : `## search_index\n\n${searchResults.map(({ excerpt, path, rank }) => `${path} [${rank}]\n${excerpt.slice(0, 160)}`).join("\n\n")}`;
  const contentSection = idFirst
    ? `## get_node_content\n\n${idFirstArtifacts.map(section).join("\n\n")}`
    : `## get_artifact\n\n${artifactResults.map(section).join("\n\n")}`;
  const packSection = `## request_context_pack\n\n${pack.text}`;

  const contentToolNames = idFirst
    ? [
        ...Array.from({ length: searchCallCount }, () => "search_nodes"),
        ...idFirstArtifacts.map(() => "get_node_content"),
        "request_context_pack",
      ]
    : [
        ...Array.from({ length: searchCallCount }, () => "search_index"),
        ...artifactResults.map(() => "get_artifact"),
        "request_context_pack",
      ];
  const catalogNames = techniques["lazy-tool-definitions"]
    ? [...new Set(contentToolNames)].sort()
    : Object.keys(TOOL_CATALOG);
  const catalogSection = `## tool_definitions\n\n${catalogNames
    .map((name) => `- ${name}: ${TOOL_CATALOG[name] ?? ""}`)
    .join("\n")}`;

  const parts: string[] = [];
  if (techniques["static-prefix"]) {
    parts.push(STATIC_PREFIX);
  }
  parts.push("# Data Brain scripted MCP results", "", catalogSection, "");
  if (techniques["compaction-safe-session"]) {
    // Compaction keeps the tail: metadata first, content last, then a tiny
    // anchor index from which everything can be re-derived by node id.
    const anchors = searchResults
      .map(({ nodeId, path }) => `- ${nodeId} ${path}`)
      .join("\n");
    parts.push(
      searchSection,
      "",
      packSection,
      "",
      contentSection,
      "",
      `## 세션 앵커(재파생)\n\n${anchors}`,
    );
  } else {
    parts.push(searchSection, "", contentSection, "", packSection);
  }

  return {
    arm: input.arm,
    staticPrefixChars: techniques["static-prefix"] ? STATIC_PREFIX.length : 0,
    text: parts.join("\n"),
    toolNames: contentToolNames,
  };
}
