import { describe, expect, it } from "vitest";

import { reservedPackHandler } from "./reserved-jobs";

describe("reserved pack kind (OQ-021)", () => {
  it("fails a claimed pack job loudly with the open-question pointer", async () => {
    const handler = reservedPackHandler();
    await expect(
      handler(
        {
          attemptCount: 1,
          creditCost: 0,
          id: "01JRESERVEDPACK0000000000E",
          kind: "pack",
          maxAttempts: 3,
          payload: {},
          repositoryId: "repo",
          runId: "run",
          workspaceId: "workspace",
        },
        { heartbeat: async () => true },
      ),
    ).rejects.toThrow(/OQ-021/);
  });
});
