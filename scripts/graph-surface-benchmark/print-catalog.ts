/**
 * Prints the product `tools/list` catalogue digest and names — the values a
 * v3 pre-registration pins (todo 25). Read-only; no model, no network.
 */
import { resolve } from "node:path";

import {
  buildProductionWorkspace,
  openProductSurface,
} from "./product-surface";

const root = resolve(import.meta.dirname, "../..");
const built = await buildProductionWorkspace({
  excludedSegments: [".omo", "benchmarks", "fixtures"],
  repositoryFullName: "local/drifted-demo",
  rootDir: resolve(root, "fixtures/drifted-demo"),
});
const surface = await openProductSurface({
  scopes: ["mcp:read", "mcp:write"],
  toolResultChars: 6000,
  workspace: built.workspace,
});
process.stdout.write(
  `${JSON.stringify(
    {
      artifactCount: built.artifactCount,
      edgeCount: built.edgeCount,
      names: surface.catalog.tools.map(({ name }) => name),
      sha256: surface.catalog.sha256,
      sample: await surface.callTool("search_index", {
        query: "session timeout",
      }),
    },
    null,
    2,
  )}\n`,
);
await surface.close();
