export const MCP_PACKAGE_NAME = "@alrescha/mcp";

export { createHostedMcpEndpoint } from "./hosted";
export { prepareChange } from "./prepare-change";
export type { ChangeBrief } from "./prepare-change";
export {
  BRAIN_TABLE_COLUMNS,
  BRAIN_TABLE_ROWS,
  getWorkspaceArtifact,
  getWorkspaceFindings,
  queryWorkspaceBrain,
  searchWorkspaceIndex,
  selectWorkspaceContextPack,
} from "./data-brain";
export {
  AGENT_FLOW_SENTENCE,
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
  bandUnsupportedReason,
  edgeOmissionReason,
  hashAccessToken,
} from "./store";
export {
  LOCAL_USER_ID,
  LOCAL_WORKSPACE_ID,
  buildLocalWorkspace,
  localRepositoryId,
} from "./local-workspace";
export type { LocalWorkspaceInput } from "./local-workspace";
export { LOCAL_SERVE_SCOPES, serveLocalWorkspace } from "./local-serve";
export type { LocalServeHandle, LocalServeOptions } from "./local-serve";
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
  MCP_DEFAULT_READ_BANDS,
  MCP_EDGE_RELATIONS,
  MCP_READ_BANDS,
  MCP_EDGE_TIERS,
  MCP_NODE_TYPES,
  MCP_ARTIFACT_MATCH_LIMIT,
  MCP_EDGE_MAX_PAGES,
  MCP_EDGE_PAGE_BYTES,
  MCP_EDGE_PAGE_ROWS,
  MCP_WORKSPACE_READ_LIMIT,
  MEMORY_BLOCK_NAMES,
} from "./store";
export type {
  AgentAssertionRelation,
  IssueAccessTokenInput,
  IssuedAccessToken,
  McpAccessEvent,
  McpArtifactData,
  McpArtifactMatch,
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
  McpReadBasis,
  McpReadCoverage,
  McpReadTruncation,
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
  McpRescanResult,
  McpScope,
  McpBandRead,
  McpReadBand,
  McpSectionData,
  McpSessionUsageInput,
  McpSessionUsageResult,
  McpSourceSpan,
  McpStore,
  McpTokenRecord,
  McpTodo,
  McpTodoStatus,
  McpWorkspaceData,
  PublicMcpTokenRecord,
} from "./store";
