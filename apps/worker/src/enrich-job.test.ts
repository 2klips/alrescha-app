import { describe, expect, it, vi } from "vitest";

import { isNonBillableAiError } from "@alrescha/core";

import type { EnrichProvider } from "./ai-providers";
import {
  createEnrichJobHandler,
  type EnrichJobStore,
  type EnrichPendingFile,
} from "./enrich-job";

/**
 * Phase 3 Wave C todo 6 — the enrich handler.
 *
 * The handler owns three obligations the billing loop cannot see: the source
 * stays transient, only validated prose persists, and provider failures gate
 * per file while schema failures reject the whole job through the
 * `schema_invalid` marker (which the worker loop turns into a refund).
 */

const PROSE =
  "This module owns the login flow: it exchanges the OAuth code for a token " +
  "and opens a session through the session module. It exports one function.";

const FILES: EnrichPendingFile[] = [
  {
    lastSeenCommitSha: "a".repeat(40),
    path: "src/login.ts",
    sourceBlobSha: "blob-login-2",
    summaryBlobSha: "blob-login-1",
  },
  {
    lastSeenCommitSha: "a".repeat(40),
    path: "src/session.ts",
    sourceBlobSha: "blob-session-1",
    summaryBlobSha: null,
  },
];

function job(overrides: Record<string, unknown> = {}) {
  return {
    attemptCount: 1,
    creditCost: 1,
    id: "job-enrich-1",
    kind: "enrich" as const,
    maxAttempts: 3,
    payload: { billingMode: "credits", provider: "anthropic" },
    repositoryId: "repo-1",
    runId: "run-1",
    workspaceId: "workspace-1",
    ...overrides,
  };
}

function provider(
  summarize: EnrichProvider["summarize"] = vi
    .fn()
    .mockResolvedValue({ summary: PROSE }),
  synthesizeConcepts: EnrichProvider["synthesizeConcepts"] = vi
    .fn()
    .mockResolvedValue({ concepts: [] }),
): EnrichProvider {
  return {
    model: "claude-sonnet-5",
    name: "anthropic",
    summarize,
    summarizeModule: vi.fn().mockResolvedValue({ summary: PROSE }),
    synthesizeConcepts,
  };
}

function store(
  model: EnrichProvider,
  pending: readonly EnrichPendingFile[] = FILES,
  summarized: readonly {
    blobSha: string;
    path: string;
    summary: string;
  }[] = [],
) {
  return {
    listPendingFiles: vi.fn().mockResolvedValue(pending),
    listSummarizedFiles: vi.fn().mockResolvedValue(summarized),
    loadConceptDigest: vi.fn().mockResolvedValue(null),
    loadProvider: vi.fn().mockResolvedValue(model),
    saveConceptGraph: vi.fn().mockResolvedValue(undefined),
    saveModuleSummary: vi.fn().mockResolvedValue(undefined),
    saveResults: vi.fn().mockResolvedValue(undefined),
  } satisfies EnrichJobStore;
}

const readSource = vi.fn().mockResolvedValue("export const session = 1;\n");
const context = { heartbeat: vi.fn().mockResolvedValue(true) };

describe("enrich job handler", () => {
  it("summarizes every pending file and persists prose keyed by blob sha", async () => {
    const model = provider();
    const enrichStore = store(model);
    await createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    expect(enrichStore.saveResults).toHaveBeenCalledTimes(1);
    const saved = enrichStore.saveResults.mock.calls[0]?.[0] as {
      items: { kind: string; path: string; summaryBlobSha?: string }[];
    };
    expect(saved.items).toHaveLength(2);
    expect(saved.items[0]).toMatchObject({
      kind: "summary",
      path: "src/login.ts",
      summaryBlobSha: "blob-login-2",
    });
  });

  it("skips files already covered by the blob-hash cache", async () => {
    const model = provider();
    const cached = [
      { ...FILES[0]!, summaryBlobSha: FILES[0]!.sourceBlobSha },
      FILES[1]!,
    ];
    const enrichStore = store(model, cached);
    await createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    expect(model.summarize).toHaveBeenCalledTimes(1);
    const saved = enrichStore.saveResults.mock.calls[0]?.[0] as {
      items: { path: string }[];
    };
    expect(saved.items.map(({ path }) => path)).toEqual(["src/session.ts"]);
  });

  it("does nothing — and never loads a provider — when everything is cached", async () => {
    const model = provider();
    const cached = FILES.map((file) => ({
      ...file,
      summaryBlobSha: file.sourceBlobSha,
    }));
    const enrichStore = store(model, cached);
    await createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    expect(enrichStore.loadProvider).not.toHaveBeenCalled();
    expect(enrichStore.saveResults).not.toHaveBeenCalled();
  });

  it("gates a schema-invalid output per file — discarded, never persisted", async () => {
    const summarize = vi
      .fn()
      .mockResolvedValueOnce({ summary: "short" })
      .mockResolvedValueOnce({ summary: PROSE });
    const enrichStore = store(provider(summarize));
    await createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    const saved = enrichStore.saveResults.mock.calls[0]?.[0] as {
      items: { kind: string; path: string; reason?: string }[];
    };
    expect(saved.items[0]).toMatchObject({
      kind: "skip",
      path: "src/login.ts",
    });
    expect(saved.items[0]?.reason).toMatch(/schema-invalid/);
    expect(saved.items[1]).toMatchObject({ kind: "summary" });
  });

  it("rejects through schema_invalid when invalid outputs leave nothing at all", async () => {
    const model = provider(vi.fn().mockResolvedValue({ summary: "short" }));
    const enrichStore = store(model);
    const run = createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    await expect(run).rejects.toSatisfy(isNonBillableAiError);
  });

  it("gates a provider failure per file and keeps going", async () => {
    const summarize = vi
      .fn()
      .mockRejectedValueOnce(new Error("Anthropic enrich request failed"))
      .mockResolvedValueOnce({ summary: PROSE });
    const enrichStore = store(provider(summarize));
    await createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    const saved = enrichStore.saveResults.mock.calls[0]?.[0] as {
      items: { kind: string; path: string }[];
    };
    expect(saved.items).toEqual([
      expect.objectContaining({ kind: "skip", path: "src/login.ts" }),
      expect.objectContaining({ kind: "summary", path: "src/session.ts" }),
    ]);
  });

  it("fails the attempt when every file was skipped — no settled no-op", async () => {
    const summarize = vi.fn().mockRejectedValue(new Error("provider down"));
    const enrichStore = store(provider(summarize));
    const run = createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    await expect(run).rejects.toThrow(/no summaries/);
    // The skip markers persist (the gate stays visible) even though the
    // attempt fails — only summaries count as delivered work.
    const saved = enrichStore.saveResults.mock.calls[0]?.[0] as {
      items: { kind: string }[];
    };
    expect(saved.items.every((item) => item.kind === "skip")).toBe(true);
  });

  it("holds the BYOK invariant: a keyed call must not also reserve credits", async () => {
    const enrichStore = store(provider());
    const run = createEnrichJobHandler({ readSource, store: enrichStore })(
      job({ payload: { billingMode: "byok", provider: "anthropic" } }) as never,
      context,
    );

    await expect(run).rejects.toThrow(/bypass credits/);
  });
});

describe("enrich job chunked persistence", () => {
  it("persists every 10 summaries so an interrupted batch keeps its work", async () => {
    const many: EnrichPendingFile[] = Array.from(
      { length: 12 },
      (_, index) => ({
        lastSeenCommitSha: "a".repeat(40),
        path: `src/file-${String(index).padStart(2, "0")}.ts`,
        sourceBlobSha: `blob-${index}`,
        summaryBlobSha: null,
      }),
    );
    const enrichStore = store(provider(), many);
    await createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    expect(enrichStore.saveResults).toHaveBeenCalledTimes(2);
    const first = enrichStore.saveResults.mock.calls[0]?.[0] as {
      items: unknown[];
    };
    const second = enrichStore.saveResults.mock.calls[1]?.[0] as {
      items: unknown[];
    };
    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(2);
  });
});

describe("enrich job concept pass (todo 7)", () => {
  const SUMMARIZED = [
    { blobSha: "b1", path: "src/login.ts", summary: "Login prose." },
    { blobSha: "b2", path: "src/session.ts", summary: "Session prose." },
  ];
  const RAW = {
    concepts: [
      {
        kind: "concept",
        links: [
          {
            relation: "uses",
            target_concept: null,
            target_path: "src/session.ts",
          },
        ],
        member_paths: ["src/login.ts"],
        name: "Auth Flow",
        summary: "The login-to-session thread.",
      },
    ],
  };

  it("synthesizes and persists the concept layer when the digest moved", async () => {
    const synthesize = vi.fn().mockResolvedValue(RAW);
    const enrichStore = store(provider(undefined, synthesize), [], SUMMARIZED);
    await createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    expect(synthesize).toHaveBeenCalledTimes(1);
    const saved = enrichStore.saveConceptGraph.mock.calls[0]?.[0] as {
      concepts: { slug: string; links: unknown[] }[];
      digest: string;
    };
    expect(saved.concepts).toHaveLength(1);
    expect(saved.concepts[0]).toMatchObject({ slug: "auth-flow" });
    expect(saved.digest).toMatch(/^[0-9a-f]{32}$/);
  });

  it("skips synthesis entirely — no model call — when the digest matches", async () => {
    const synthesize = vi.fn();
    const enrichStore = store(provider(undefined, synthesize), [], SUMMARIZED);
    // Answer the same digest the handler will compute.
    const { conceptSynthesisDigest } = await import("@alrescha/core");
    enrichStore.loadConceptDigest.mockResolvedValue(
      conceptSynthesisDigest(SUMMARIZED),
    );

    await createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );
    expect(synthesize).not.toHaveBeenCalled();
    expect(enrichStore.saveConceptGraph).not.toHaveBeenCalled();
  });

  it("rejects structurally invalid synthesis output through schema_invalid", async () => {
    const synthesize = vi.fn().mockResolvedValue({ nope: true });
    const enrichStore = store(provider(undefined, synthesize), [], SUMMARIZED);
    const run = createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    await expect(run).rejects.toSatisfy(isNonBillableAiError);
    expect(enrichStore.saveConceptGraph).not.toHaveBeenCalled();
  });
});

describe("enrich job module mode (todo 8)", () => {
  it("summarizes one cluster from member prose and keys the cache by digest", async () => {
    const summarized = [
      { blobSha: "b1", path: "src/auth/login.ts", summary: "Login prose." },
      { blobSha: "b2", path: "src/auth/session.ts", summary: "Session prose." },
      { blobSha: "b9", path: "src/other.ts", summary: "Unrelated prose." },
    ];
    const enrichStore = store(provider(), [], summarized);
    await createEnrichJobHandler({ readSource, store: enrichStore })(
      job({
        payload: {
          billingMode: "credits",
          memberDigest: "stale-digest",
          memberPaths: ["src/auth/login.ts", "src/auth/session.ts"],
          moduleKey: "module:src/auth/login.ts",
          provider: "anthropic",
        },
      }) as never,
      context,
    );

    const saved = enrichStore.saveModuleSummary.mock.calls[0]?.[0] as {
      memberDigest: string;
      memberPaths: string[];
      moduleKey: string;
      name: string;
    };
    expect(saved.moduleKey).toBe("module:src/auth/login.ts");
    expect(saved.name).toBe("src/auth");
    expect(saved.memberPaths).toEqual([
      "src/auth/login.ts",
      "src/auth/session.ts",
    ]);
    // Keyed to the members as they are now, not the enqueue-time digest.
    expect(saved.memberDigest).toMatch(/^[0-9a-f]{32}$/);
    // A module job never runs the repository-wide passes.
    expect(enrichStore.saveConceptGraph).not.toHaveBeenCalled();
  });
});

describe("enrich job stubborn-file resilience (pilot round 4)", () => {
  it("still synthesizes concepts when the only pending files keep failing", async () => {
    const summarize = vi.fn().mockResolvedValue({ summary: "short" });
    const synthesize = vi.fn().mockResolvedValue({
      concepts: [
        {
          kind: "concept",
          links: [],
          member_paths: ["src/done.ts"],
          name: "Done Area",
          summary: "Prose about the finished area.",
        },
      ],
    });
    const enrichStore = store(
      provider(summarize, synthesize),
      [FILES[0]!],
      [{ blobSha: "b9", path: "src/done.ts", summary: "Done prose." }],
    );
    await createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    // The stubborn file skipped, but the concept layer advanced — the job
    // delivered work, so it settles instead of rejecting.
    expect(enrichStore.saveConceptGraph).toHaveBeenCalledTimes(1);
    const saved = enrichStore.saveResults.mock.calls[0]?.[0] as {
      items: { kind: string; reason?: string }[];
    };
    expect(saved.items[0]?.kind).toBe("skip");
  });
});

describe("enrich concept batch gate (pilot round 5)", () => {
  it("retries a structurally invalid batch once, then gates it and continues", async () => {
    const good = {
      concepts: [
        {
          kind: "concept",
          links: [],
          member_paths: ["src/done.ts"],
          name: "Good Batch",
          summary: "Prose from the batch that behaved.",
        },
      ],
    };
    // Two batches (tiny cap): batch 1 fails twice, batch 2 succeeds.
    const synthesize = vi
      .fn()
      .mockResolvedValueOnce({ broken: true })
      .mockResolvedValueOnce({ broken: true })
      .mockResolvedValueOnce(good);
    const summarized = [
      { blobSha: "b1", path: "src/done.ts", summary: "x".repeat(30_000) },
      { blobSha: "b2", path: "src/other.ts", summary: "y".repeat(1_000) },
    ];
    const enrichStore = store(provider(undefined, synthesize), [], summarized);
    await createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    expect(synthesize).toHaveBeenCalledTimes(3);
    const saved = enrichStore.saveConceptGraph.mock.calls[0]?.[0] as {
      concepts: { slug: string }[];
    };
    expect(saved.concepts.map(({ slug }) => slug)).toEqual(["good-batch"]);
  });

  it("rejects through schema_invalid only when every batch fails", async () => {
    const synthesize = vi.fn().mockResolvedValue({ broken: true });
    const summarized = [
      { blobSha: "b1", path: "src/done.ts", summary: "Prose." },
    ];
    const enrichStore = store(provider(undefined, synthesize), [], summarized);
    const run = createEnrichJobHandler({ readSource, store: enrichStore })(
      job() as never,
      context,
    );

    await expect(run).rejects.toSatisfy(isNonBillableAiError);
    expect(enrichStore.saveConceptGraph).not.toHaveBeenCalled();
  });
});
