#!/usr/bin/env node
/**
 * `alrescha` — local ingest CLI entry point (Phase 2B todo 3, ADR-013).
 *
 * Two commands, both scanning locally:
 *
 * - `alrescha push [directory] --repo <owner/name> --server <url> --token
 *   <token> [--full]` uploads metadata. `--full` re-parses every code file so
 *   a resolver upgrade reaches files that never change; bodies are still read
 *   transiently and never uploaded.
 * - `alrescha serve --local [directory] [--repo <owner/name>]` serves the
 *   graph over stdio MCP and uploads nothing at all (Wave C todo 17,
 *   OQ-030). **stdout is the protocol channel** for this command, so every
 *   human-facing line below it goes to stderr.
 */

import { basename, resolve } from "node:path";

import { resolveCliEnvironment } from "./environment";
import { CLI_MESSAGES } from "./messages";
import { pushLocalProject } from "./push";
import { serveLocalProject } from "./serve";

interface ParsedArguments {
  readonly directory: string;
  readonly full: boolean;
  readonly local: boolean;
  readonly repo: string | null;
  readonly server: string | null;
  readonly token: string | null;
}

type Command = "push" | "serve";

function parseArguments(argv: readonly string[]): ParsedArguments {
  let directory = ".";
  let full = false;
  let local = false;
  let repo: string | null = null;
  let server: string | null = null;
  let token: string | null = null;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--repo") {
      repo = argv[++index] ?? null;
    } else if (argument === "--server") {
      server = argv[++index] ?? null;
    } else if (argument === "--token") {
      token = argv[++index] ?? null;
    } else if (argument === "--full") {
      full = true;
    } else if (argument === "--local") {
      local = true;
    } else if (!argument.startsWith("--")) {
      directory = argument;
    }
  }
  return { directory, full, local, repo, server, token };
}

const repositoryNameFor = (rootDir: string, repo: string | null): string =>
  repo ?? `local/${basename(rootDir)}`;

/**
 * Serve until the connection ends. The handle resolves when the client
 * disconnects or stdin closes, which is what "the session is over" means for
 * a process a client spawned.
 */
async function runServe(parsed: ParsedArguments): Promise<number> {
  if (!parsed.local) {
    console.error(CLI_MESSAGES.servingMissingLocal);
    return 1;
  }
  const rootDir = resolve(parsed.directory);
  console.error(CLI_MESSAGES.serving(rootDir));
  console.error(CLI_MESSAGES.servingLocalOnly);

  const outcome = await serveLocalProject({
    repositoryFullName: repositoryNameFor(rootDir, parsed.repo),
    rootDir,
  });
  console.error(
    CLI_MESSAGES.servingReady({
      artifactCount: outcome.artifactCount,
      edgeCount: outcome.edgeCount,
      skippedCount: outcome.skippedCount,
    }),
  );
  console.error(CLI_MESSAGES.servingReadOnly);
  console.error(CLI_MESSAGES.servingGraphOnly);

  await new Promise<void>((settle) => {
    process.stdin.once("close", () => settle());
    process.once("SIGINT", () => settle());
    process.once("SIGTERM", () => settle());
  });
  await outcome.handle.close();
  return 0;
}

export async function main(argv: readonly string[]): Promise<number> {
  const command = argv[0] as Command | undefined;
  if (command !== "push" && command !== "serve") {
    console.error(CLI_MESSAGES.usage);
    return 1;
  }
  const parsed = parseArguments(argv);
  if (command === "serve") return runServe(parsed);
  const environment = resolveCliEnvironment();
  const server = parsed.server ?? environment.server;
  const token = parsed.token ?? environment.token;
  if (!server) {
    console.error(CLI_MESSAGES.missingServer);
    return 1;
  }
  if (!token) {
    console.error(CLI_MESSAGES.missingToken);
    return 1;
  }
  const rootDir = resolve(parsed.directory);
  const repositoryFullName = repositoryNameFor(rootDir, parsed.repo);

  console.log(CLI_MESSAGES.scanning(rootDir));
  console.log(CLI_MESSAGES.metadataOnly);
  const outcome = await pushLocalProject({
    baseUrl: server,
    full: parsed.full,
    repositoryFullName,
    rootDir,
    token,
  });

  switch (outcome.status) {
    case "uploaded":
      console.log(CLI_MESSAGES.uploaded(outcome));
      console.log(CLI_MESSAGES.graphOnly);
      console.log(CLI_MESSAGES.githubNudge);
      return 0;
    case "unchanged":
      console.log(CLI_MESSAGES.unchanged);
      console.log(CLI_MESSAGES.githubNudge);
      return 0;
    case "auth-failed":
      console.error(CLI_MESSAGES.authFailed);
      return 1;
    case "offline":
      console.error(CLI_MESSAGES.offline(outcome.detail));
      return 1;
    case "server-error":
      console.error(
        CLI_MESSAGES.serverError(outcome.httpStatus, outcome.detail),
      );
      return 1;
    case "invalid-payload":
      console.error(CLI_MESSAGES.invalidPayload(outcome.detail));
      return 1;
  }
}

const executedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url ===
    new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href;

if (executedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
