export const CORE_PACKAGE_NAME = "@arr/core";

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
  classifyArtifactPath,
  extractExportedSymbols,
  extractRationales,
  extractSymbols,
  persistedKind,
  scanRepository,
} from "./ingest/repository-scanner";
export type {
  ArtifactClassification,
  ExportedSymbolMetadata,
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

export { parseMarkdownStructure } from "./parser/markdown";
export type {
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

export { parseTodoDocument } from "./progress/todos";
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

export { buildProgressDashboard } from "./progress/dashboard";
export type {
  BuildProgressDashboardInput,
  ProgressCommitInput,
  ProgressDashboard,
  ProgressEventInput,
  ProgressFindingInput,
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
  analyzeRepositoryAssurance,
} from "./assurance/rules";

export {
  digestInTotoStatement,
  inTotoStatementSchema,
  inTotoSubjectSchema,
  arrReceiptPredicateSchema,
  verifyInTotoStatement,
} from "./assurance/receipts";
export type {
  InTotoStatement,
  ReceiptVerification,
} from "./assurance/receipts";
export type {
  AnalyzeRepositoryAssuranceInput,
  AssuranceFinding,
  AssuranceFindingType,
  AssuranceGrade,
  AssuranceSeverity,
  AssuranceSourceFile,
  DisabledAssuranceAiAssist,
  FindingEvidenceLink,
  FindingProvenance,
} from "./assurance/rules";

export { probeRepositoryEvidence } from "./evidence/probes";
export type {
  EvidenceProbeKind,
  ProbeArtifactMetadata,
  ProbeRepositoryEvidenceInput,
  RepositoryEvidenceProbe,
  RepositoryEvidenceProbeResult,
  SymbolExtractionMethod,
} from "./evidence/probes";

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
  ARR_INDEX_BEGIN,
  ARR_INDEX_END,
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
  MAX_GITHUB_WEBHOOK_BODY_BYTES,
  handleGitHubWebhook,
  normalizeGitHubWebhook,
  verifyGitHubWebhookSignature,
} from "./github/webhook";
export type {
  GitHubWebhookStore,
  NormalizedGitHubWebhookEvent,
  PersistedGitHubWebhookEvent,
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

export { buildInspectionDashboard } from "./inspection/dashboard";
export type {
  BuildInspectionDashboardInput,
  DocumentFreshness,
  InspectionDashboard,
  InspectionDocumentEntry,
  InspectionDocumentInput,
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
