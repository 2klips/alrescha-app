import picomatch from "picomatch";

export type SymbolExtractionMethod = "regex" | "typescript-compiler";
export type EvidenceProbeKind = "glob" | "path" | "symbol";

export interface ProbeArtifactMetadata {
  readonly exportedSymbols: readonly string[];
  readonly path: string;
  readonly symbolExtraction: SymbolExtractionMethod;
}

export interface RepositoryEvidenceProbe {
  readonly id: string;
  readonly kind: EvidenceProbeKind;
  readonly pattern: string;
}

export interface RepositoryEvidenceProbeResult {
  readonly confidence: number;
  readonly grade: "inferred";
  readonly id: string;
  readonly kind: EvidenceProbeKind;
  readonly matches: readonly string[];
  readonly reason: string;
}

export interface ProbeRepositoryEvidenceInput {
  readonly artifacts: readonly ProbeArtifactMetadata[];
  readonly probes: readonly RepositoryEvidenceProbe[];
}

function pathResult(
  probe: RepositoryEvidenceProbe,
  artifacts: readonly ProbeArtifactMetadata[],
): RepositoryEvidenceProbeResult {
  const matches = artifacts
    .filter(({ path }) => path === probe.pattern)
    .map(({ path }) => path)
    .sort();
  return {
    confidence: 1,
    grade: "inferred",
    id: probe.id,
    kind: probe.kind,
    matches,
    reason:
      matches.length > 0
        ? "Exact path matched scanned metadata."
        : "Exact path was not found in scanned metadata.",
  };
}

function globResult(
  probe: RepositoryEvidenceProbe,
  artifacts: readonly ProbeArtifactMetadata[],
): RepositoryEvidenceProbeResult {
  const matchesPath = picomatch(probe.pattern, { dot: true });
  const matches = artifacts
    .filter(({ path }) => matchesPath(path))
    .map(({ path }) => path)
    .sort();
  return {
    confidence: 1,
    grade: "inferred",
    id: probe.id,
    kind: probe.kind,
    matches,
    reason:
      matches.length > 0
        ? "Glob matched scanned metadata."
        : "Glob did not match scanned metadata.",
  };
}

function symbolResult(
  probe: RepositoryEvidenceProbe,
  artifacts: readonly ProbeArtifactMetadata[],
): RepositoryEvidenceProbeResult {
  const matchedArtifacts = artifacts.filter(({ exportedSymbols }) =>
    exportedSymbols.includes(probe.pattern),
  );
  const matches = matchedArtifacts
    .map(({ path }) => `${path}#${probe.pattern}`)
    .sort();
  const compilerMatch = matchedArtifacts.some(
    ({ symbolExtraction }) => symbolExtraction === "typescript-compiler",
  );
  const confidence = matches.length === 0 || compilerMatch ? 1 : 0.65;
  const reason =
    matches.length === 0
      ? "Symbol was not found in scanned metadata."
      : compilerMatch
        ? "Symbol matched TypeScript compiler metadata."
        : "Symbol matched regex-derived metadata; confidence downgraded.";
  return {
    confidence,
    grade: "inferred",
    id: probe.id,
    kind: probe.kind,
    matches,
    reason,
  };
}

export function probeRepositoryEvidence({
  artifacts,
  probes,
}: ProbeRepositoryEvidenceInput): readonly RepositoryEvidenceProbeResult[] {
  return probes.map((probe) => {
    switch (probe.kind) {
      case "path":
        return pathResult(probe, artifacts);
      case "glob":
        return globResult(probe, artifacts);
      case "symbol":
        return symbolResult(probe, artifacts);
    }
  });
}
