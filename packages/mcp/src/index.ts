export const MCP_PACKAGE_NAME = "@alrescha/mcp";

export { createHostedMcpEndpoint } from "./hosted";
export {
  getWorkspaceArtifact,
  getWorkspaceFindings,
  queryWorkspaceBrain,
  searchWorkspaceIndex,
  selectWorkspaceContextPack,
} from "./data-brain";
export {
  REPO_MAP_DEFAULT_BUDGET,
  REPO_MAP_MAX_BUDGET,
  REPO_MAP_MIN_BUDGET,
  buildGraphSchema,
  buildRepoMap,
  estimateTokens,
} from "./repo-map";
export type {
  GraphSchemaResult,
  RepoMapEntry,
  RepoMapResult,
} from "./repo-map";
export {
  InMemoryMcpStore,
  MCP_SCOPES,
  createAccessTokenSecret,
  createUlid,
  hashAccessToken,
} from "./store";
export type { HostedMcpEndpoint } from "./hosted";
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
export {
  AGENT_ASSERTION_RELATIONS,
  MCP_EDGE_FAMILIES,
  MCP_EDGE_RELATIONS,
  MCP_EDGE_TIERS,
  MCP_NODE_TYPES,
  MEMORY_BLOCK_NAMES,
} from "./store";
export type {
  AgentAssertionRelation,
  IssueAccessTokenInput,
  IssuedAccessToken,
  McpAccessEvent,
  McpArtifactData,
  McpAssertLinkResult,
  McpMemoryBlockName,
  McpMemoryEntryData,
  McpWriteMemoryResult,
  McpContextPackData,
  McpDbObjectData,
  McpEdgeData,
  McpEdgeFamily,
  McpEdgeOmission,
  McpEdgeProvenance,
  McpEdgeRelation,
  McpEdgeTier,
  McpEvidenceData,
  McpFindingData,
  McpFindingProvenance,
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
  McpSectionData,
  McpSourceSpan,
  McpStore,
  McpTokenRecord,
  McpTodo,
  McpTodoStatus,
  McpWorkspaceData,
  PublicMcpTokenRecord,
} from "./store";
