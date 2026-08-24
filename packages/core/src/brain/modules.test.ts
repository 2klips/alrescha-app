import { describe, expect, it } from "vitest";

import {
  deriveModuleClusters,
  moduleClusterOf,
  moduleMemberDigest,
} from "../index";

const EDGES = [
  { source: "src/auth/login.ts", target: "src/auth/session.ts" },
  { source: "src/auth/session.ts", target: "src/auth/token.ts" },
  { source: "src/billing/invoice.ts", target: "src/billing/ledger.ts" },
];
const PATHS = [
  "src/auth/login.ts",
  "src/auth/session.ts",
  "src/auth/token.ts",
  "src/billing/invoice.ts",
  "src/billing/ledger.ts",
  "docs/readme.md", // isolated — no module
];

describe("deriveModuleClusters — deterministic data-layer communities", () => {
  it("groups connected structure and names clusters by shared directory", () => {
    const clusters = deriveModuleClusters({ edges: EDGES, paths: PATHS });
    expect(clusters).toHaveLength(2);
    const auth = moduleClusterOf(clusters, "src/auth/session.ts");
    expect(auth?.members).toEqual([
      "src/auth/login.ts",
      "src/auth/session.ts",
      "src/auth/token.ts",
    ]);
    expect(auth?.name).toBe("src/auth");
    expect(auth?.key).toBe("module:src/auth/login.ts");
    // The isolated file belongs to no module.
    expect(moduleClusterOf(clusters, "docs/readme.md")).toBeNull();
  });

  it("is deterministic under input reordering — a cache key can trust it", () => {
    const forward = deriveModuleClusters({ edges: EDGES, paths: PATHS });
    const reversed = deriveModuleClusters({
      edges: [...EDGES].reverse(),
      paths: [...PATHS].reverse(),
    });
    expect(reversed).toEqual(forward);
  });

  it("digest is order-independent but blob-sensitive, like the concept digest", () => {
    const a = { blobSha: "1", path: "a.ts" };
    const b = { blobSha: "2", path: "b.ts" };
    expect(moduleMemberDigest([a, b])).toBe(moduleMemberDigest([b, a]));
    expect(moduleMemberDigest([a, b])).not.toBe(
      moduleMemberDigest([{ ...a, blobSha: "9" }, b]),
    );
  });
});
