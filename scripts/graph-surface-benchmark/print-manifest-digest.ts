/**
 * Prints the loader digest and file SHA-256 of frozen question manifests —
 * the two values a graph-surface pre-registration pins and an evidence
 * file records (todo 25, OQ-070 ⑴). Read-only.
 *
 *   node --import tsx scripts/graph-surface-benchmark/print-manifest-digest.ts [paths…]
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  benchmarkManifestDigest,
  loadBenchmarkManifest,
} from "../databrain-benchmark/manifest";

const root = resolve(import.meta.dirname, "../..");
const files =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : [
        "benchmarks/databrain/tasks.v3.json",
        "benchmarks/databrain/tasks.v4.json",
      ];
for (const file of files) {
  const path = resolve(root, file);
  const manifest = await loadBenchmarkManifest(path);
  const fileSha = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  process.stdout.write(
    `${file}\n  schema ${manifest.schemaVersion} · tasks ${manifest.tasks.length}\n  loader digest ${benchmarkManifestDigest(manifest)}\n  file sha256   ${fileSha}\n`,
  );
}
