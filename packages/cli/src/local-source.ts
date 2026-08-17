/**
 * A `RepositorySource` over the local filesystem (Phase 2B todo 3, ADR-013).
 *
 * The scan itself is `scanRepository` from @arr/core — the same deterministic
 * pipeline the GitHub webhook path runs. This module only supplies the
 * transport: a git-shaped tree (blob sha1s, modes, sizes) and transient
 * content reads. Nothing here uploads or stores anything.
 */

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type {
  RepositorySource,
  RepositoryTree,
  RepositoryTreeEntry,
} from "@arr/core";

/** Build outputs and VCS internals that a git tree would not contain. */
const IGNORED_SEGMENTS = new Set([
  ".git",
  ".next",
  ".omo",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

/**
 * Files larger than this get a synthetic (still deterministic) blob sha
 * instead of a content hash. The scanner skips anything over its 1 MiB
 * `maxFileBytes` as `oversized` before fetching, so their bytes never matter.
 */
const MAX_HASHED_FILE_BYTES = 2 * 1024 * 1024;

function sha1(parts: readonly (string | Uint8Array)[]): string {
  const hash = createHash("sha1");
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest("hex");
}

/** Git's blob object id: sha1("blob <size>\0<bytes>"). */
export function gitBlobSha(bytes: Uint8Array): string {
  return sha1([`blob ${bytes.byteLength}\0`, bytes]);
}

export interface LocalRepositorySnapshot {
  /** Deterministic virtual commit id — same tree, same commit. */
  readonly commitSha: string;
  readonly source: RepositorySource;
  readonly treeSha: string;
}

export async function createLocalRepositorySource(
  rootDir: string,
): Promise<LocalRepositorySnapshot> {
  const entries: RepositoryTreeEntry[] = [];
  const cachedBytes = new Map<string, Uint8Array>();

  async function walk(directory: string, prefix: string): Promise<void> {
    const dirents = await readdir(directory, { withFileTypes: true });
    for (const dirent of dirents) {
      if (IGNORED_SEGMENTS.has(dirent.name)) {
        continue;
      }
      const absolute = join(directory, dirent.name);
      const path = prefix ? `${prefix}/${dirent.name}` : dirent.name;
      if (dirent.isSymbolicLink()) {
        // Present the symlink the way a git tree does (mode 120000) so the
        // scanner records the same `symlink` skip as the GitHub path.
        entries.push({
          mode: "120000",
          path,
          sha: sha1([`symlink:${path}`]),
          size: 0,
          type: "blob",
        });
        continue;
      }
      if (dirent.isDirectory()) {
        await walk(absolute, path);
        continue;
      }
      if (!dirent.isFile()) {
        continue;
      }
      const fileStat = await stat(absolute);
      if (fileStat.size > MAX_HASHED_FILE_BYTES) {
        entries.push({
          mode: "100644",
          path,
          sha: sha1([`oversized:${path}:${fileStat.size}`]),
          size: fileStat.size,
          type: "blob",
        });
        continue;
      }
      const bytes = new Uint8Array(await readFile(absolute));
      cachedBytes.set(path, bytes);
      entries.push({
        mode: "100644",
        path,
        sha: gitBlobSha(bytes),
        size: bytes.byteLength,
        type: "blob",
      });
    }
  }

  await walk(rootDir, "");
  entries.sort((left, right) => left.path.localeCompare(right.path));

  const manifest = entries
    .map(({ mode, path, sha }) => `${mode} ${sha}\t${path}\n`)
    .join("");
  const treeSha = sha1([`tree\0${manifest}`]);
  const commitSha = sha1([`commit\0${treeSha}`]);
  const tree: RepositoryTree = { entries, treeSha, truncated: false };

  return {
    commitSha,
    source: {
      async fetchContent(path: string): Promise<Uint8Array> {
        const cached = cachedBytes.get(path);
        if (cached) {
          return cached;
        }
        return new Uint8Array(await readFile(join(rootDir, ...path.split("/"))));
      },
      async listTree(): Promise<RepositoryTree> {
        return tree;
      },
    },
    treeSha,
  };
}
