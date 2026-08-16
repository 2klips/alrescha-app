export const MCP_PACKAGE_NAME = "@arr/mcp";

export { createHostedMcpEndpoint } from "./hosted";
export {
  getWorkspaceArtifact,
  getWorkspaceFindings,
  queryWorkspaceBrain,
  searchWorkspaceIndex,
  selectWorkspaceContextPack,
} from "./data-brain";
export {
  InMemoryMcpStore,
  MCP_SCOPES,
  createAccessTokenSecret,
  createUlid,
  hashAccessToken,
} from "./store";
export type {
  HostedMcpEndpoint,
} from "./hosted";
export type {
  ArtifactNeighbor,
  ArtifactWithNeighbors,
  BrainNode,
  BrainQueryFilter,
  FindingQueryFilter,
  SearchIndexResult,
  SearchRank,
  SelectedContextPack,
  WorkspaceFinding,
} from "./data-brain";
export type {
  IssueAccessTokenInput,
  IssuedAccessToken,
  McpAccessEvent,
  McpArtifactData,
  McpContextPackData,
  McpEdgeData,
  McpEdgeRelation,
  McpEvidenceData,
  McpFindingData,
  McpIndexEntryData,
  McpNodeType,
  McpNote,
  McpPackMeasurement,
  McpPrincipal,
  McpProgressEvent,
  McpProgressStatus,
  McpReceiptData,
  McpRepositoryData,
  McpRequirementData,
  McpScope,
  McpSourceSpan,
  McpStore,
  McpTokenRecord,
  McpTodo,
  McpTodoStatus,
  McpWorkspaceData,
  PublicMcpTokenRecord,
} from "./store";
