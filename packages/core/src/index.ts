export const CORE_PACKAGE_NAME = "@specproof/core";

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
  persistedKind,
  scanRepository,
} from "./ingest/repository-scanner";
export type {
  ArtifactClassification,
  ExportedSymbolMetadata,
  PersistedArtifactKind,
  PreviousScannedArtifact,
  RepositoryScanPlan,
  RepositorySource,
  RepositoryTree,
  RepositoryTreeEntry,
  ScanSkip,
  ScanSkipReason,
  ScannedArtifact,
} from "./ingest/repository-scanner";

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
  specProofReceiptPredicateSchema,
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
  SPECPROOF_INDEX_BEGIN,
  SPECPROOF_INDEX_END,
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

export { computePilotStats } from "./stats/pilot-stats";
export type {
  PilotPackMeasurement,
  PilotReceiptSnapshot,
  PilotRunMeasurement,
  PilotStatsInput,
  PilotStatsReport,
} from "./stats/pilot-stats";
