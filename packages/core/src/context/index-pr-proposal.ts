import type { MinimalIndexProposalFile } from "./minimal-index";

export type IndexPrProposalAuthorization =
  "proposal_write" | "missing_pull_requests" | "missing_contents";

export interface IndexPrProposalGitHub {
  createProposalBranch(input: {
    branch: string;
    fromSha: string;
  }): Promise<void>;
  openProposalPullRequest(input: {
    base: string;
    body: string;
    head: string;
    title: string;
  }): Promise<{ number: number; url: string }>;
  writeProposalFile(input: {
    branch: string;
    content: string;
    path: MinimalIndexProposalFile["path"];
  }): Promise<void>;
}

export interface ProposeMinimalIndexPullRequestInput {
  readonly authorization: IndexPrProposalAuthorization;
  readonly baseBranch: string;
  readonly baseSha: string;
  readonly files: readonly MinimalIndexProposalFile[];
  readonly github: IndexPrProposalGitHub;
}

export type IndexPrProposalResult =
  | {
      readonly branch: string;
      readonly files: readonly MinimalIndexProposalFile[];
      readonly number: number;
      readonly status: "proposed";
      readonly url: string;
    }
  | {
      readonly files: readonly MinimalIndexProposalFile[];
      readonly missingPermission: "contents:write" | "pull_requests:write";
      readonly status: "permission_required";
    }
  | {
      readonly files: readonly MinimalIndexProposalFile[];
      readonly status: "up_to_date";
    };

const PROPOSAL_TITLE = "docs(agent): add Alrescha minimal context index";
const PROPOSAL_BODY = [
  "Alrescha generated this advisory-only proposal.",
  "",
  "It adds or refreshes only the bounded managed index and optional CLAUDE.md wrapper.",
  "Review and merge this pull request through the normal repository workflow.",
].join("\n");

function validateInput(input: ProposeMinimalIndexPullRequestInput): void {
  if (!/^[0-9a-f]{40}$/.test(input.baseSha)) {
    throw new TypeError("baseSha must be a 40-character lowercase Git SHA.");
  }

  if (input.baseBranch.trim().length === 0) {
    throw new TypeError("baseBranch must not be empty.");
  }

  if (
    input.files.some(({ path }) => path !== "AGENTS.md" && path !== "CLAUDE.md")
  ) {
    throw new TypeError(
      "Minimal-index proposals may write only AGENTS.md and CLAUDE.md.",
    );
  }
}

export async function proposeMinimalIndexPullRequest(
  input: ProposeMinimalIndexPullRequestInput,
): Promise<IndexPrProposalResult> {
  validateInput(input);

  if (input.files.length === 0) {
    return { files: input.files, status: "up_to_date" };
  }

  if (input.authorization !== "proposal_write") {
    return {
      files: input.files,
      missingPermission:
        input.authorization === "missing_pull_requests"
          ? "pull_requests:write"
          : "contents:write",
      status: "permission_required",
    };
  }

  const branch = `arr/minimal-index-${input.baseSha.slice(0, 12)}`;
  await input.github.createProposalBranch({ branch, fromSha: input.baseSha });

  for (const file of input.files) {
    await input.github.writeProposalFile({
      branch,
      content: file.after,
      path: file.path,
    });
  }

  const pullRequest = await input.github.openProposalPullRequest({
    base: input.baseBranch,
    body: PROPOSAL_BODY,
    head: branch,
    title: PROPOSAL_TITLE,
  });

  return {
    branch,
    files: input.files,
    number: pullRequest.number,
    status: "proposed",
    url: pullRequest.url,
  };
}
