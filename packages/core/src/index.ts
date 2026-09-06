export const CORE_PACKAGE_NAME = "@alrescha/core";

export {
  accessEventSchema,
  artifactSchema,
  confidenceSchema,
  creditLedgerEntrySchema,
  edgeSchema,
  evidenceSchema,
  findingSchema,
  githubInstallationSchema,
  graphNodeIdSchema,
  indexEntrySchema,
  jobSchema,
  mcpTokenSchema,
  provenanceSchema,
  receiptSchema,
  repositoryIdSchema,
  repositorySchema,
  requirementSchema,
  runSchema,
  sourceSpanSchema,
  ulidSchema,
  workspaceIdSchema,
} from "./data/schemas";

export type { Edge, Finding, Provenance } from "./data/schemas";

export {
  JudgmentValidationError,
  applyJudgment,
  executeJudgment,
  judgmentOutputSchema,
  judgmentRequestSchema,
} from "./ai/judgment";
export type {
  ExecutedJudgment,
  JudgmentKind,
  JudgmentOutput,
  JudgmentProvider,
  JudgmentRequest,
  JudgmentTargetState,
} from "./ai/judgment";

export {
  PAGERANK_ALPHA,
  PAGERANK_ITERATIONS,
  personalizedPageRank,
} from "./brain/pagerank";
export type { PageRankEdge, PageRankInput } from "./brain/pagerank";

export {
  LINK_SCHEMA_VERSION,
  parsePythonLinks,
  parseTypeScriptLinks,
  resolveCodeLinks,
  resolveModuleSpecifier,
  resolvePythonModule,
  resolveTypeScriptSpecifier,
} from "./ingest/code-links";
export type {
  CodeLink,
  CodeLinkKind,
  CodeLinkMethod,
  CodeLinkTier,
} from "./ingest/code-links";

export {
  MAX_DOC_LINKS_PER_DOCUMENT,
  resolveDocLinks,
} from "./ingest/doc-links";
export { nextRouteFile, parsePythonRoutes } from "./ingest/route-links";
export {
  parseQueryReferences,
  parseSchemaFile,
  resolveSchemaLinks,
} from "./ingest/schema-links";
export type {
  DbObject,
  DbObjectKind,
  ParsedQueryReference,
  ParsedSchemaFile,
  SchemaLink,
  SchemaLinkKind,
} from "./ingest/schema-links";
export {
  bestHome,
  DEFAULT_SECTION_TOKEN_PREFIXES,
  MAX_SECTION_HEADING,
  MAX_SECTION_LINKS_PER_DOCUMENT,
  parseDocumentSections,
  parseSectionReferences,
  resolveSectionLinks,
} from "./ingest/section-links";
export type {
  DocumentSection,
  ParsedSectionReference,
  SectionLink,
} from "./ingest/section-links";
export type {
  NextRouteFile,
  ParsedRouteDeclaration,
  RouteDeclaration,
  RouteMethod,
} from "./ingest/route-links";
export {
  EMPTY_REPOSITORY_CONFIG,
  REPOSITORY_CONFIG_PATH,
  parseRepositoryConfig,
  repositoryIgnoreMatcher,
} from "./ingest/repository-config";
export type { RepositoryScanConfig } from "./ingest/repository-config";
export type {
  DocLink,
  DocLinkKind,
  DocLinkMethod,
  ResolveDocLinksInput,
} from "./ingest/doc-links";

export {
  DEFAULT_IGNORED_PATHS,
  DEFAULT_IGNORED_SEGMENTS,
  isDefaultIgnoredPath,
} from "./ingest/path-conventions";

export {
  EMPTY_MODULE_RESOLUTION,
  aliasCandidates,
  buildModuleResolution,
  isManifestPath,
} from "./ingest/module-resolution";
export type {
  AliasRule,
  AliasSource,
  ModuleResolutionConfig,
} from "./ingest/module-resolution";

export {
  directoryOf,
  isTestPath,
  normalizeRepositoryPath,
} from "./ingest/path-conventions";

export {
  DEFAULT_SCAN_FETCH_CONCURRENCY,
  classifyArtifactPath,
  extractExportedSymbols,
  extractRationales,
  extractSymbols,
  isMarkdownArtifact,
  persistedKind,
  scanRepository,
} from "./ingest/repository-scanner";
export {
  MAX_CONCURRENCY,
  clampConcurrency,
  mapWithConcurrency,
} from "./ingest/concurrency";
export type {
  ArtifactClassification,
  ExportedSymbolMetadata,
  LinkScope,
  PersistedArtifactKind,
  PreviousScannedArtifact,
  RationaleKind,
  RationaleNote,
  RepositoryScanPlan,
  RepositorySource,
  RepositoryTree,
  RepositoryTreeEntry,
  ScanSkip,
  ScanSkipReason,
  ScannedArtifact,
  SymbolExtractionEngine,
} from "./ingest/repository-scanner";

export {
  MAX_LOCAL_INGEST_BODY_BYTES,
  handleLocalIngestPreviousState,
  handleLocalIngestUpload,
  localIngestPayloadSchema,
  repositoryScanPlanSchema,
} from "./ingest/local-ingest";
export type {
  LocalIngestPayload,
  LocalIngestPreviousState,
  LocalIngestPrincipal,
  LocalIngestStore,
} from "./ingest/local-ingest";

export {
  buildDocumentOffsetIndex,
  parseMarkdownStructure,
} from "./parser/markdown";
export type {
  DocumentOffsetIndex,
  MarkdownDiagnostic,
  MarkdownSpan,
  ParseMarkdownInput,
  ParsedCodeReference,
  ParsedHeading,
  ParsedFrontmatter,
  ParsedLink,
  ParsedMarkdownSection,
  ParsedMarkdownStructure,
  ParsedNormativeStatement,
  ParsedParagraph,
  ParsedTask,
} from "./parser/markdown";

export {
  MAX_TODO_TITLE,
  parseTodoDocument,
  todoSourceKey,
} from "./progress/todos";
export type {
  DocumentTodoSource,
  ParsedTodoItem,
  TodoStatus,
} from "./progress/todos";

export { createLibrarySnapshot, filterLibraryItems } from "./library/items";
export type {
  CreateLibrarySnapshotInput,
  LibraryFilter,
  LibraryItem,
  LibraryItemSource,
  LibraryItemType,
  LibrarySnapshot,
} from "./library/items";

export {
  LOCAL_SCAN_SUMMARY,
  NO_STATED_BLOCKER,
  STALE_AFTER_DAYS,
  buildProgressDashboard,
} from "./progress/dashboard";
export type {
  BuildProgressDashboardInput,
  ProgressAttention,
  ProgressAttentionItem,
  ProgressCommitInput,
  ProgressDashboard,
  ProgressDigest,
  ProgressDigestWindow,
  ProgressEventInput,
  ProgressFindingInput,
  ProgressLocalScanInput,
  ProgressMetric,
  ProgressMetricBasis,
  ProgressTodo,
} from "./progress/dashboard";

export { extractRequirements } from "./assurance/requirements";
export type {
  ExtractedRequirement,
  ExtractRequirementsInput,
  RequirementOrigin,
} from "./assurance/requirements";

export {
  AI_ASSIST_STATUS,
  DISABLED_ASSURANCE_AI_ASSIST,
  REQUIREMENT_IMPLEMENTATION_CONFIDENCE,
  analyzeRepositoryAssurance,
  assuranceCoverage,
  assuranceSourceRequired,
  prepareAssuranceContexts,
  requirementImplementationLinks,
} from "./assurance/rules";

export {
  RECEIPT_PREDICATE_TYPE,
  RECEIPT_TOOL,
  alreschaReceiptPredicateSchema,
  digestInTotoStatement,
  inTotoStatementSchema,
  inTotoSubjectSchema,
  verifyInTotoStatement,
} from "./assurance/receipts";
export type {
  InTotoStatement,
  ReceiptVerification,
} from "./assurance/receipts";
export type { AssuranceCoverage } from "./assurance/rules";
export type {
  AnalyzeRepositoryAssuranceInput,
  AssuranceFinding,
  AssuranceFindingType,
  AssuranceGrade,
  AssuranceSeverity,
  AssuranceSourceFile,
  DisabledAssuranceAiAssist,
  DocumentContext,
  FindingEvidenceLink,
  FindingProvenance,
  PreparedAssuranceContexts,
  RequirementImplementationLink,
} from "./assurance/rules";

export {
  ingestCoverageReports,
  resolveReportedPath,
} from "./evidence/coverage-reports";
export type {
  CoverageIngestionResult,
  CoverageReportArtifact,
  CoverageReportDiagnostic,
  CoverageReportFormat,
  MeasuredFile,
} from "./evidence/coverage-reports";

export { ingestCiTestReports } from "./evidence/ci-reports";
export type {
  CiCheckRun,
  CiEvidenceGuidance,
  CiEvidenceSource,
  CiReportArtifact,
  CiReportDiagnostic,
  CiReportFormat,
  CiRequirementEvidence,
  CiTestReportIngestionResult,
  IngestCiTestReportsInput,
} from "./evidence/ci-reports";

export {
  GITHUB_PR_PROPOSAL_PERMISSION,
  GITHUB_READ_ONLY_PERMISSIONS,
  GITHUB_WEBHOOK_EVENTS,
  assertMinimalGitHubPermissions,
  githubInstallationUrl,
} from "./github/app-permissions";
export type {
  GitHubPermissionLevel,
  GitHubPermissions,
} from "./github/app-permissions";

export { parseGitHubRepositoryUrl } from "./github/repository-url";
export type {
  GitHubRepositoryUrlFailure,
  ParsedGitHubRepositoryUrl,
} from "./github/repository-url";

export {
  GITHUB_API_VERSION,
  requestInstallationToken,
} from "./github/installation-token";
export type {
  InstallationToken,
  InstallationTokenRequest,
} from "./github/installation-token";

export {
  CONTEXT_TOKEN_ESTIMATE_ASSUMPTION,
  composeContextPack,
} from "./context/context-pack";
export type {
  ComposeContextPackInput,
  ContextDocument,
  ContextDocumentKind,
  ContextPack,
  ContextPackEntry,
  ContextRelation,
  ContextTargetAgent,
  OmittedContextDocument,
} from "./context/context-pack";

export {
  PROGRESS_LOGGING_INSTRUCTION,
  ALRESCHA_INDEX_BEGIN,
  ALRESCHA_INDEX_END,
  applyManagedIndex,
  buildMinimalIndexProposalFiles,
  renderManagedIndex,
} from "./context/minimal-index";
export type {
  BuildMinimalIndexProposalFilesInput,
  MinimalIndexProposalFile,
  MinimalIndexProposalFiles,
  RenderManagedIndexInput,
} from "./context/minimal-index";

export { proposeMinimalIndexPullRequest } from "./context/index-pr-proposal";
export type {
  IndexPrProposalAuthorization,
  IndexPrProposalGitHub,
  IndexPrProposalResult,
  ProposeMinimalIndexPullRequestInput,
} from "./context/index-pr-proposal";

export {
  prepareGitHubOnboarding,
  selectGitHubRepository,
} from "./github/onboarding";
export type {
  GitHubOnboardingStore,
  GitHubRepositoryChoice,
  VerifiedGitHubInstallation,
} from "./github/onboarding";

export {
  MAX_CO_CHANGE_PATHS,
  MAX_GITHUB_WEBHOOK_BODY_BYTES,
  handleGitHubWebhook,
  normalizeGitHubWebhook,
  verifyGitHubWebhookSignature,
} from "./github/webhook";
export type {
  GitHubWebhookStore,
  NormalizedGitHubWebhookEvent,
  PersistedGitHubWebhookEvent,
  PushCommitFiles,
  SupportedGitHubWebhook,
} from "./github/webhook";

export {
  normalizeRecordedArtifacts,
  normalizeRecordedContent,
  normalizeRecordedTree,
  normalizeRecordedWebhook,
} from "./github/recorded-fixtures";

export type {
  NormalizedGitHubArtifact,
  NormalizedGitHubContent,
  NormalizedGitHubTree,
  NormalizedGitHubWebhook,
  RecordedWebhookKind,
} from "./github/recorded-fixtures";

export { buildCommitAnalysisCards } from "./runs/analysis-cards";
export type {
  AnalysisJobInput,
  AnalysisJobKind,
  AnalysisJobStatus,
  AnalysisReceiptInput,
  AnalysisRunInput,
  AnalysisRunStatus,
  AnalysisTriggerKind,
  BuildCommitAnalysisCardsInput,
  CommitAnalysisCard,
  CommitAnalysisJobStep,
  CommitAnalysisStatus,
  CommitAssuranceScope,
  CommitFindingsDelta,
} from "./runs/analysis-cards";

export { routeQuery } from "./brain/query-router";
export type { QueryRoute, QueryRoutingDecision } from "./brain/query-router";

export { parseNpmAuditReport } from "./inspection/dependency-audit";
export type {
  DependencyAdvisory,
  DependencyAdvisorySeverity,
  DependencyAuditReport,
  DependencyFixAvailability,
} from "./inspection/dependency-audit";

export {
  DOC_PAGE_NODE_SCOPES,
  buildDocPageSkeleton,
  docPageNeedsNode,
  docPageSlug,
  memberDirectories,
  validateDocPageProse,
} from "./docs/doc-page";
export type {
  DocPageCitation,
  DocPageProse,
  DocPageScope,
  DocPageSkeleton,
  DocPageSkeletonInput,
} from "./docs/doc-page";

export {
  CHARS_PER_TOKEN,
  estimateTokens,
  estimateTokensFromBytes,
} from "./stats/token-estimate";
export type {
  TokenEstimateAssumption,
  TokenEstimateBasis,
} from "./stats/token-estimate";
export {
  INSTRUCTION_CLASSIFICATIONS,
  INSTRUCTION_LOADERS,
  buildInstructionCostTable,
} from "./inspection/instruction-cost";
export type {
  InstructionArtifactInput,
  InstructionClassification,
  InstructionCostRow,
  InstructionCostTable,
  InstructionCostTotals,
  InstructionLoadMode,
  InstructionLoadRule,
  InstructionLoader,
  InstructionLoaderTotal,
} from "./inspection/instruction-cost";
export { buildRiskMap } from "./inspection/risk-map";
export type {
  BuildRiskMapInput,
  RiskArtifactInput,
  RiskCoChangeInput,
  RiskEdgeInput,
  RiskEntry,
  RiskFactor,
  RiskFactorKind,
  RiskFindingInput,
  RiskLevel,
  RiskMap,
  UnmeasuredSignal,
} from "./inspection/risk-map";

export { buildInspectionDashboard } from "./inspection/dashboard";
export type {
  BuildInspectionDashboardInput,
  DocumentFreshness,
  InspectionDashboard,
  InspectionDocumentEntry,
  InspectionDocumentInput,
  InspectionFindingDetail,
  InspectionFindingInput,
  InspectionFindingKind,
  InspectionSectionState,
  InspectionSeverity,
  RuledOutAttemptInput,
} from "./inspection/dashboard";

export {
  LOCAL_PROMPT_LOG_GITIGNORE_ENTRY,
  LOCAL_PROMPT_LOG_PATH,
  localPromptRecordSchema,
  parseLocalPromptLog,
  serializeLocalPromptLog,
  toServerPromptSync,
} from "./team/prompt-log";
export type {
  LocalPromptRecord,
  ServerPromptSyncPayload,
} from "./team/prompt-log";

export {
  CoachingValidationError,
  analyzePromptSignals,
  coachPrompt,
  coachingCreditCost,
  coachingSuggestions,
  isNonBillableAiError,
  promptCoachingOutputSchema,
  promptRubricSchema,
  rubricCeilings,
  validateCoachingOutput,
} from "./team/prompt-coach";
export type {
  CoachingProvider,
  CoachingResult,
  PromptCoachingOutput,
  PromptRubric,
  PromptSignals,
} from "./team/prompt-coach";

export {
  VIBE_METRICS,
  buildVibeIndex,
  vibeGateResultsSchema,
  vibeInputSchema,
} from "./team/vibe-index";
export type {
  ContributionRow,
  VibeGateResults,
  VibeIndex,
  VibeInput,
  VibeMetric,
} from "./team/vibe-index";

export { computePilotStats } from "./stats/pilot-stats";
export type {
  PilotPackMeasurement,
  PilotReceiptSnapshot,
  PilotRunMeasurement,
  PilotStatsInput,
  PilotStatsReport,
} from "./stats/pilot-stats";
export {
  BRAIN_AREAS,
  deriveArtifactFacets,
  deriveBrainArea,
} from "./ingest/artifact-facets";
export type {
  ArtifactFacets,
  BrainArea,
  FacetDomain,
  FacetUnit,
} from "./ingest/artifact-facets";

export { buildArtifactCard } from "./brain/artifact-card";
export type {
  ArtifactCard,
  ArtifactCardBasis,
  ArtifactCardRelation,
} from "./brain/artifact-card";
export {
  EnrichValidationError,
  SUMMARY_INPUT_MAX_CHARS,
  clipSummaryInput,
  currentSummaryText,
  selectFilesForSummarization,
  summaryAbsence,
  summaryState,
  validateProseSummary,
} from "./enrich/prose-summary";
export type {
  ClippedSummaryInput,
  SummaryCandidate,
  SummaryAbsence,
  SummaryState,
} from "./enrich/prose-summary";
export {
  CONCEPT_BATCH_MAX_CHARS,
  CONCEPT_KINDS,
  CONCEPT_RELATIONS,
  CONCEPT_SYNTHESIS_JSON_SCHEMA,
  SUMMARY_BATCH_MAX_CHARS,
  batchSummaries,
  conceptSynthesisDigest,
  mergeConceptBatches,
  slugifyConceptName,
  validateConceptSynthesis,
} from "./enrich/concept-graph";
export type {
  ConceptKind,
  ConceptLink,
  ConceptLinkTarget,
  ConceptRelation,
  FileSummaryInput,
  SynthesizedConcept,
} from "./enrich/concept-graph";
export {
  MODULE_MIN_MEMBERS,
  deriveModuleClusters,
  moduleClusterOf,
  moduleNameForMembers,
  moduleMemberDigest,
} from "./brain/modules";
export type { ModuleCluster, ModuleGraphEdge } from "./brain/modules";
