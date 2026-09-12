import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { scanRepository, type RepositoryTree } from "@alrescha/core";
import { zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";

import { GitHubRepositorySource } from "./github-repository-source";

/**
 * The same plan from one archive as from one read per file (PR #9
 * follow-up, 2026-09-12). The recorded drifted-demo tree is scanned twice
 * against a scripted GitHub: once the way every scan read until now, once
 * with the archive fetched first. The plans must be identical to the byte
 * — the archive changes how many requests a scan costs, not what it sees.
 */

const ROOT = resolve(import.meta.dirname, "../../..");
const FIXTURE_ROOT = resolve(ROOT, "fixtures/drifted-demo");
const COMMIT_SHA = "1".repeat(40);

interface Recording {
  sha: string;
  tree: RepositoryTree["entries"];
  truncated: boolean;
}

describe("a full scan over the archive", () => {
  let recording: Recording;
  let zip: Uint8Array;

  beforeAll(async () => {
    recording = JSON.parse(
      await readFile(
        resolve(FIXTURE_ROOT, "recordings/github/tree.json"),
        "utf8",
      ),
    ) as Recording;
    const blobs = recording.tree.filter((entry) => entry.type === "blob");
    zip = zipSync(
      Object.fromEntries(
        await Promise.all(
          blobs.map(async (entry) => [
            `alrescha-drifted-demo-1111111/${entry.path}`,
            new Uint8Array(await readFile(resolve(FIXTURE_ROOT, entry.path))),
          ]),
        ),
      ),
    );
  });

  function github() {
    const requests: string[] = [];
    const fetchImplementation = (async (input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("/git/trees/")) return Response.json(recording);
      if (url.includes("/zipball/")) return new Response(zip, { status: 200 });
      const match = /\/contents\/([^?]+)\?/.exec(url);
      if (match?.[1]) {
        return new Response(
          await readFile(resolve(FIXTURE_ROOT, decodeURIComponent(match[1]))),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    return {
      requests,
      source: new GitHubRepositorySource(
        "alrescha",
        "drifted-demo",
        "installation-token",
        fetchImplementation,
      ),
    };
  }

  const countOf = (requests: readonly string[], part: string) =>
    requests.filter((url) => url.includes(part)).length;

  it("produces the plan the per-file reads produce, in two requests instead of one per file", async () => {
    const perFile = github();
    const perFilePlan = await scanRepository({
      commitSha: COMMIT_SHA,
      mode: "full",
      source: perFile.source,
    });

    const archived = github();
    const prefetch = await archived.source.prefetchArchive(COMMIT_SHA);
    const archivedPlan = await scanRepository({
      commitSha: COMMIT_SHA,
      mode: "full",
      source: archived.source,
    });
    prefetch.release();

    expect(archivedPlan).toEqual(perFilePlan);
    expect(perFilePlan.artifacts.length).toBeGreaterThan(0);

    expect(countOf(perFile.requests, "/git/trees/")).toBe(1);
    expect(countOf(perFile.requests, "/contents/")).toBeGreaterThanOrEqual(
      perFilePlan.artifacts.length,
    );
    expect(countOf(perFile.requests, "/zipball/")).toBe(0);

    expect(prefetch).toMatchObject({
      archived: true,
      files: recording.tree.filter((entry) => entry.type === "blob").length,
    });
    expect(archived.requests).toHaveLength(2);
    expect(countOf(archived.requests, "/git/trees/")).toBe(1);
    expect(countOf(archived.requests, "/zipball/")).toBe(1);
    expect(countOf(archived.requests, "/contents/")).toBe(0);
  });
});
