export const MCP_PACKAGE_NAME = "@alrescha/mcp";

export { createHostedMcpEndpoint } from "./hosted";
export { CHANGE_BRIEF_CONSUMER_CAP, prepareChange } from "./prepare-change";
export type {
  ChangeBrief,
  ChangeBriefBasis,
  ChangeBriefBudget,
  ChangeBriefConsumers,
  ChangeBriefTarget,
} from "./prepare-change";
export {
  BRAIN_TABLE_COLUMNS,
  BRAIN_TABLE_ROWS,
  SEARCH_INDEX_DEFAULT_LIMIT,
  getWorkspaceArtifact,
  getWorkspaceFindings,
  queryWorkspaceBrain,
  searchWorkspaceIndex,
  searchWorkspaceIndexPage,
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
  selectSymbolNeighborhood,
  withSymbolNeighborhood,
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
  SearchIndexCoverage,
  SearchIndexInput,
  SearchIndexPage,
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
  SYMBOL_EDGE_RELATIONS,
  SYMBOL_LAYER_LIMITS,
  SYMBOL_NODE_TYPE,
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
  McpSymbolData,
  McpSymbolNeighborhood,
  McpStore,
  McpTokenRecord,
  McpTodo,
  McpTodoMatch,
  McpTodoStatus,
  McpWorkspaceData,
  PublicMcpTokenRecord,
} from "./store";

export { SAVED_QUERIES, SAVED_QUERY_IDS, savedQuery } from "./saved-queries";
export type { SavedQuery, SavedQueryId } from "./saved-queries";
