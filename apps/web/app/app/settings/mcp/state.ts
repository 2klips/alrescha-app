import type { MinimalIndexProposalFile } from "@specproof/core";
import type { SelectedContextPack } from "@specproof/mcp";

export interface IssueMcpTokenState {
  error: string | null;
  secret: string | null;
}

export const INITIAL_ISSUE_MCP_TOKEN_STATE: IssueMcpTokenState = {
  error: null,
  secret: null,
};

export interface ContextPackActionState {
  error: string | null;
  pack: SelectedContextPack | null;
}

export const INITIAL_CONTEXT_PACK_STATE: ContextPackActionState = {
  error: null,
  pack: null,
};

export interface IndexProposalActionState {
  error: string | null;
  files: readonly MinimalIndexProposalFile[];
  missingPermission: "contents:write" | "pull_requests:write" | null;
  repository: string | null;
  status: "permission_required" | "proposed" | "up_to_date" | null;
  url: string | null;
}

export const INITIAL_INDEX_PROPOSAL_STATE: IndexProposalActionState = {
  error: null,
  files: [],
  missingPermission: null,
  repository: null,
  status: null,
  url: null,
};
