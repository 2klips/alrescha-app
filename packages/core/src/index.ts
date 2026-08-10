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
export type { GitHubPermissionLevel, GitHubPermissions } from "./github/app-permissions";

export { GITHUB_API_VERSION, requestInstallationToken } from "./github/installation-token";
export type { InstallationToken, InstallationTokenRequest } from "./github/installation-token";

export { prepareGitHubOnboarding, selectGitHubRepository } from "./github/onboarding";
export type {
  GitHubOnboardingStore,
  GitHubRepositoryChoice,
  VerifiedGitHubInstallation,
} from "./github/onboarding";

export {
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
