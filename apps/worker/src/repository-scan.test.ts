import { LINK_SCHEMA_VERSION, type RepositoryTree } from "@alrescha/core";
import { describe, expect, it, vi } from "vitest";

import type { ArchivePrefetch } from "./github-repository-source";
import { runRepositoryScan, type ScanSource } from "./repository-scan";
import type { RepositoryScanStore } from "./repository-scan-store";

/**
 * When a scan takes the archive (PR #9 follow-up, 2026-09-12).
 *
 * A full pass reads nearly every body and used to cost one request per file
 * against the installation's 5,000-per-hour budget; it now asks the source
 * for the archive first. An incremental pass reads what a push changed and
 * is left alone. Either way the bodies are released with the pass.
 */

const COMMIT = "c".repeat(40);
const PREVIOUS = "b".repeat(40);
const TREE = "d".repeat(40);

const FILES: Record<string, string> = {
  "docs/spec.md": "# Spec\n\n- REQ-1: The scanner MUST resolve imports.\n",
  "src/a.ts": 'import { b } from "./b";\n\nexport const a = () => b();\n',
  "src/b.ts": "export function b(): number {\n  return 1;\n}\n",
};

const tree: RepositoryTree = {
  entries: Object.keys(FILES).map((path, index) => ({
    mode: "100644",
    path,
    sha: (index + 1).toString(16).padStart(40, "0"),
    size: FILES[path]!.length,
    type: "blob",
  })),
  treeSha: TREE,
  truncated: false,
};

interface Harness {
  readonly events: string[];
  readonly source: ScanSource;
  readonly store: RepositoryScanStore;
}

function harness(input: {
  readonly archive?: ArchivePrefetch | Error;
  readonly failRead?: boolean;
  readonly previous?: { commitSha: string; linkSchemaVersion: number };
  readonly withPrefetch?: boolean;
}): Harness {
  const events: string[] = [];
  const source: ScanSource = {
    fetchContent: async (path) => {
      events.push(`read ${path}`);
      if (input.failRead) throw new Error("read failed");
      return new TextEncoder().encode(FILES[path] ?? "");
    },
    listTree: async () => tree,
  };
  if (input.withPrefetch !== false) {
    const archive: ArchivePrefetch = {
      archived: true,
      bytes: 512,
      files: 3,
      release: () => {
        events.push("release");
      },
    };
    source.prefetchArchive = vi.fn(async (): Promise<ArchivePrefetch> => {
      events.push("prefetch");
      if (input.archive instanceof Error) throw input.archive;
      return input.archive ?? archive;
    });
  }
  const store = {
    apply: async () => {
      events.push("apply");
      return 3;
    },
    loadPrevious: async () => ({
      artifacts: [],
      commitSha: input.previous?.commitSha ?? null,
      linkSchemaVersion: input.previous?.linkSchemaVersion ?? 0,
    }),
  } as unknown as RepositoryScanStore;
  return { events, source, store };
}

const scan = (h: Harness, mode?: "full" | "incremental") =>
  runRepositoryScan({
    commitSha: COMMIT,
    ...(mode === undefined ? {} : { mode }),
    repositoryId: "repo-1",
    source: h.source,
    store: h.store,
    workspaceId: "ws-1",
  });

describe("runRepositoryScan and the archive", () => {
  it("a full pass takes the archive before any body is read, and releases it once the plan is stored", async () => {
    const h = harness({
      archive: {
        archived: true,
        bytes: 4096,
        files: 3,
        release: () => {
          h.events.push("release");
        },
      },
    });

    const result = await scan(h, "full");

    expect(result).toEqual({
      archive: { archived: true, bytes: 4096, files: 3 },
      linkScope: "full",
      touchedRows: 3,
    });
    expect(h.events[0]).toBe("prefetch");
    expect(h.events.indexOf("apply")).toBeLessThan(h.events.indexOf("release"));
    expect(h.events.at(-1)).toBe("release");
  });

  it("an incremental pass reads per file and never asks for the archive", async () => {
    const h = harness({
      previous: { commitSha: PREVIOUS, linkSchemaVersion: LINK_SCHEMA_VERSION },
    });

    const result = await scan(h);

    expect(result.archive).toBeNull();
    expect(result.linkScope).toBe("incremental");
    expect(h.events).not.toContain("prefetch");
    expect(h.events.filter((event) => event.startsWith("read "))).toHaveLength(
      3,
    );
  });

  it("a resolver upgrade is a full pass, archive included", async () => {
    const h = harness({
      previous: {
        commitSha: PREVIOUS,
        linkSchemaVersion: LINK_SCHEMA_VERSION - 1,
      },
    });

    const result = await scan(h);

    expect(result.linkScope).toBe("full");
    expect(h.events[0]).toBe("prefetch");
    expect(h.events.at(-1)).toBe("release");
  });

  it("a fallback is reported beside the rows, and the bodies are read per file", async () => {
    const h = harness({
      archive: {
        archived: false,
        reason: "archive exceeds 67108864 compressed bytes",
        release: () => h.events.push("release"),
      },
    });

    const result = await scan(h, "full");

    expect(result.archive).toEqual({
      archived: false,
      reason: "archive exceeds 67108864 compressed bytes",
    });
    expect(h.events.filter((event) => event.startsWith("read "))).toHaveLength(
      3,
    );
    expect(h.events.at(-1)).toBe("release");
  });

  it("the archive is released when the scan fails, so a retry starts clean", async () => {
    const h = harness({ failRead: true });

    await expect(scan(h, "full")).rejects.toThrow("read failed");

    expect(h.events[0]).toBe("prefetch");
    expect(h.events).toContain("release");
    expect(h.events).not.toContain("apply");
  });

  it("a limit on the archive request fails the pass the way a limit on a body read does", async () => {
    const h = harness({ archive: new Error("403 primary-rate-limit") });

    await expect(scan(h, "full")).rejects.toThrow("403 primary-rate-limit");

    expect(h.events).toEqual(["prefetch"]);
  });

  it("a source without an archive — the CLI's — is scanned as before", async () => {
    const h = harness({ withPrefetch: false });

    const result = await scan(h, "full");

    expect(result.archive).toBeNull();
    expect(result.touchedRows).toBe(3);
  });
});
