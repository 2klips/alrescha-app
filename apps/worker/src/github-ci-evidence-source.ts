import {
  GITHUB_API_VERSION,
  type CiCheckRun,
  type CiReportArtifact,
  type CiReportFormat,
} from "@arr/core";
import { unzipSync } from "fflate";

type JsonRecord = Record<string, unknown>;

interface GitHubArtifactDescriptor {
  readonly expired: boolean;
  readonly headSha: string;
  readonly id: number;
  readonly name: string;
}

export interface CollectedGitHubCiEvidence {
  readonly checkRuns: readonly CiCheckRun[];
  readonly reports: readonly CiReportArtifact[];
}

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function artifactsResponse(
  value: unknown,
): readonly GitHubArtifactDescriptor[] {
  const response = record(value, "GitHub Actions artifacts response");
  if (!Array.isArray(response.artifacts)) {
    throw new Error("GitHub Actions artifacts response is malformed.");
  }
  return response.artifacts.map((value, index) => {
    const artifact = record(value, `GitHub Actions artifact ${index}`);
    const workflowRun = record(
      artifact.workflow_run,
      `GitHub Actions artifact ${index} workflow run`,
    );
    if (
      typeof artifact.id !== "number" ||
      typeof artifact.expired !== "boolean"
    ) {
      throw new Error(`GitHub Actions artifact ${index} is malformed.`);
    }
    return {
      expired: artifact.expired,
      headSha: string(
        workflowRun.head_sha,
        `GitHub Actions artifact ${index} head SHA`,
      ),
      id: artifact.id,
      name: string(artifact.name, `GitHub Actions artifact ${index} name`),
    };
  });
}

function checkRunsResponse(value: unknown): readonly CiCheckRun[] {
  const response = record(value, "GitHub check runs response");
  if (!Array.isArray(response.check_runs)) {
    throw new Error("GitHub check runs response is malformed.");
  }
  return response.check_runs.map((value, index) => {
    const check = record(value, `GitHub check run ${index}`);
    if (typeof check.conclusion !== "string" && check.conclusion !== null) {
      throw new Error(`GitHub check run ${index} conclusion is malformed.`);
    }
    return {
      conclusion: check.conclusion,
      head_sha: string(check.head_sha, `GitHub check run ${index} head SHA`),
      name: string(check.name, `GitHub check run ${index} name`),
      status: string(check.status, `GitHub check run ${index} status`),
    };
  });
}

function reportFormat(fileName: string): CiReportFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xml")) {
    return "junit";
  }
  if (!lower.endsWith(".json")) {
    return null;
  }
  return lower.includes("jest") ? "jest-json" : "vitest-json";
}

function reportsFromArchive(
  descriptor: GitHubArtifactDescriptor,
  bytes: Uint8Array,
): readonly CiReportArtifact[] {
  const maxCompressedBytes = 25 * 1024 * 1024;
  const maxExpandedBytes = 50 * 1024 * 1024;
  const maxEntries = 100;
  if (bytes.byteLength > maxCompressedBytes) {
    throw new Error(
      `GitHub Actions artifact ${descriptor.id} exceeds the compressed size limit.`,
    );
  }

  let entries = 0;
  let expandedBytes = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      entries += 1;
      expandedBytes += file.originalSize;
      if (entries > maxEntries || expandedBytes > maxExpandedBytes) {
        throw new Error(
          `GitHub Actions artifact ${descriptor.id} exceeds extraction limits.`,
        );
      }
      return reportFormat(file.name) !== null;
    },
  });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return Object.entries(files)
    .flatMap(([fileName, content]) => {
      const format = reportFormat(fileName);
      return format
        ? [
            {
              artifactId: descriptor.id,
              artifactName: descriptor.name,
              content: decoder.decode(content),
              format,
              headSha: descriptor.headSha,
            } satisfies CiReportArtifact,
          ]
        : [];
    })
    .sort((left, right) => left.format.localeCompare(right.format));
}

export class GitHubCiEvidenceSource {
  constructor(
    private readonly owner: string,
    private readonly repository: string,
    private readonly installationToken: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  private async request(
    path: string,
    accept = "application/vnd.github+json",
  ): Promise<Response> {
    const response = await this.fetchImplementation(
      `https://api.github.com${path}`,
      {
        headers: {
          accept,
          authorization: `Bearer ${this.installationToken}`,
          "x-github-api-version": GITHUB_API_VERSION,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub CI evidence request failed: ${response.status}`);
    }
    return response;
  }

  private repositoryPath(): string {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repository)}`;
  }

  private async listArtifacts(): Promise<readonly GitHubArtifactDescriptor[]> {
    const response = await this.request(
      `${this.repositoryPath()}/actions/artifacts?per_page=100`,
    );
    return artifactsResponse(await response.json());
  }

  private async listCheckRuns(
    commitSha: string,
  ): Promise<readonly CiCheckRun[]> {
    const response = await this.request(
      `${this.repositoryPath()}/commits/${encodeURIComponent(commitSha)}/check-runs?per_page=100`,
    );
    return checkRunsResponse(await response.json());
  }

  private async downloadReports(
    descriptor: GitHubArtifactDescriptor,
  ): Promise<readonly CiReportArtifact[]> {
    const response = await this.request(
      `${this.repositoryPath()}/actions/artifacts/${descriptor.id}/zip`,
      "application/octet-stream",
    );
    return reportsFromArchive(
      descriptor,
      new Uint8Array(await response.arrayBuffer()),
    );
  }

  async collect(analyzedCommitSha: string): Promise<CollectedGitHubCiEvidence> {
    const [artifacts, checkRuns] = await Promise.all([
      this.listArtifacts(),
      this.listCheckRuns(analyzedCommitSha),
    ]);
    const candidates = artifacts.filter(
      ({ expired, headSha }) => !expired && headSha === analyzedCommitSha,
    );
    if (candidates.length > 20) {
      throw new Error(
        "GitHub CI evidence collection exceeds the 20-artifact safety limit.",
      );
    }
    const reports = (
      await Promise.all(
        candidates.map((artifact) => this.downloadReports(artifact)),
      )
    )
      .flat()
      .sort((left, right) => left.artifactId - right.artifactId);
    return { checkRuns, reports };
  }
}
