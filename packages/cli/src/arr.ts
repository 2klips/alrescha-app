#!/usr/bin/env node
/**
 * `arr` — local ingest CLI entry point (Phase 2B todo 3, ADR-013).
 * Command surface: `arr push [directory] --repo <owner/name> --server <url>
 * --token <token>`. Scan runs locally; only metadata leaves the machine.
 */

import { basename, resolve } from "node:path";

import { CLI_MESSAGES } from "./messages";
import { pushLocalProject } from "./push";

interface ParsedArguments {
  readonly directory: string;
  readonly repo: string | null;
  readonly server: string | null;
  readonly token: string | null;
}

function parseArguments(argv: readonly string[]): ParsedArguments | null {
  if (argv[0] !== "push") {
    return null;
  }
  let directory = ".";
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
    } else if (!argument.startsWith("--")) {
      directory = argument;
    }
  }
  return { directory, repo, server, token };
}

export async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArguments(argv);
  if (!parsed) {
    console.error(CLI_MESSAGES.usage);
    return 1;
  }
  const server = parsed.server ?? process.env["ARR_SERVER_URL"] ?? null;
  const token = parsed.token ?? process.env["ARR_TOKEN"] ?? null;
  if (!server) {
    console.error(CLI_MESSAGES.missingServer);
    return 1;
  }
  if (!token) {
    console.error(CLI_MESSAGES.missingToken);
    return 1;
  }
  const rootDir = resolve(parsed.directory);
  const repositoryFullName = parsed.repo ?? `local/${basename(rootDir)}`;

  console.log(CLI_MESSAGES.scanning(rootDir));
  console.log(CLI_MESSAGES.metadataOnly);
  const outcome = await pushLocalProject({
    baseUrl: server,
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
