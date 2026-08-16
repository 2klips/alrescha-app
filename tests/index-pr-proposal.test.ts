import {
  proposeMinimalIndexPullRequest,
  type IndexPrProposalGitHub,
  type MinimalIndexProposalFile,
} from "../packages/core/src/index";
import { describe, expect, it, vi } from "vitest";

describe("advisory minimal-index pull request", () => {
  it("writes only a proposal branch and opens the expected pull request", async () => {
    const files: readonly MinimalIndexProposalFile[] = [
      {
        after:
          "<!-- ARR:BEGIN (managed — do not edit inside) -->\nindex\n<!-- ARR:END -->\n",
        before: null,
        path: "AGENTS.md",
      },
      { after: "@AGENTS.md\n", before: null, path: "CLAUDE.md" },
    ];
    const github: IndexPrProposalGitHub = {
      createProposalBranch: vi.fn(async () => undefined),
      openProposalPullRequest: vi.fn(async () => ({
        number: 42,
        url: "https://github.test/2klips/demo/pull/42",
      })),
      writeProposalFile: vi.fn(async () => undefined),
    };

    const result = await proposeMinimalIndexPullRequest({
      authorization: "proposal_write",
      baseBranch: "main",
      baseSha: "1".repeat(40),
      files,
      github,
    });

    expect(result).toEqual({
      branch: "arr/minimal-index-111111111111",
      files,
      number: 42,
      status: "proposed",
      url: "https://github.test/2klips/demo/pull/42",
    });
    expect(github.createProposalBranch).toHaveBeenCalledWith({
      branch: "arr/minimal-index-111111111111",
      fromSha: "1".repeat(40),
    });
    expect(github.writeProposalFile).toHaveBeenNthCalledWith(1, {
      branch: "arr/minimal-index-111111111111",
      content: files[0]?.after,
      path: "AGENTS.md",
    });
    expect(github.writeProposalFile).toHaveBeenNthCalledWith(2, {
      branch: "arr/minimal-index-111111111111",
      content: files[1]?.after,
      path: "CLAUDE.md",
    });
    expect(github.openProposalPullRequest).toHaveBeenCalledWith({
      base: "main",
      body: expect.stringContaining("advisory-only"),
      head: "arr/minimal-index-111111111111",
      title: "docs(agent): add Arr minimal context index",
    });
  });

  it("returns a copyable diff without touching GitHub when permission is missing", async () => {
    const files: readonly MinimalIndexProposalFile[] = [
      { after: "managed index\n", before: null, path: "AGENTS.md" },
    ];
    const github: IndexPrProposalGitHub = {
      createProposalBranch: vi.fn(async () => undefined),
      openProposalPullRequest: vi.fn(async () => ({
        number: 1,
        url: "https://github.test/pr/1",
      })),
      writeProposalFile: vi.fn(async () => undefined),
    };

    await expect(
      proposeMinimalIndexPullRequest({
        authorization: "missing_pull_requests",
        baseBranch: "main",
        baseSha: "2".repeat(40),
        files,
        github,
      }),
    ).resolves.toEqual({
      files,
      missingPermission: "pull_requests:write",
      status: "permission_required",
    });
    expect(github.createProposalBranch).not.toHaveBeenCalled();
    expect(github.writeProposalFile).not.toHaveBeenCalled();
    expect(github.openProposalPullRequest).not.toHaveBeenCalled();
  });
});
