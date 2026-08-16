/**
 * Per-route client JS budget measurement (Phase 2A todo 9).
 *
 * ## Why this script exists
 *
 * The plan sets a budget of "< 450KB gz initial JS for the graph route". Next 16
 * builds this app with Turbopack, which prints no per-route size table, and
 * `.next/build-manifest.json` only lists the shared root chunks — there is no
 * static manifest that says which chunks a given App Router route pulls in.
 *
 * So the route's chunk *set* is discovered empirically and the *sizes* are
 * computed deterministically:
 *
 *   1. serve the production build with `next start` (no dev-mode overhead, real
 *      chunk graph);
 *   2. drive a headless Chromium to the route and record every JavaScript URL
 *      the page actually requests, tagged by phase:
 *        - `document` — `<script src>` present in the server-rendered HTML,
 *        - `load`     — everything fetched by the `load` event,
 *        - `idle`     — everything fetched by the time the network goes quiet,
 *          which is where `dynamic(ssr:false)` chunks such as Pixi land;
 *   3. resolve each URL to its file under `apps/web/.next/static` and compress
 *      it with `zlib.gzipSync` at the default level (6 — what a CDN serves),
 *      reporting brotli alongside for reference.
 *
 * Sizes therefore do not depend on the dev server's compression settings, and
 * the chunk set is whatever the browser really asked for.
 *
 * Usage:
 *   pnpm --filter @specproof/web build
 *   node --import tsx scripts/measure-route-bundle.ts [--budget 450] [route ...]
 *
 * Exits non-zero if any measured route exceeds the budget at the `idle` tier.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

import { chromium, type Request } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const WEB = path.join(ROOT, "apps", "web");
const DEFAULT_ROUTES = ["/", "/graph?node=req-auth", "/findings"];
const KB = 1024;

type Phase = "document" | "load" | "idle";

interface Asset {
  brotli: number;
  gzip: number;
  phase: Phase;
  raw: number;
  url: string;
}

interface RouteReport {
  assets: Asset[];
  /** CSS + fonts actually fetched, reported separately from the JS budget. */
  nonJs: {
    cssCount: number;
    cssGzip: number;
    cssRaw: number;
    fontCount: number;
    /** woff2 is already compressed; raw *is* the wire cost. */
    fontRaw: number;
  };
  route: string;
  totals: Record<Phase, { brotli: number; count: number; gzip: number; raw: number }>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`next start exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`server did not become ready: ${url}`);
}

/** `/_next/static/chunks/x.js` → `apps/web/.next/static/chunks/x.js`. */
function assetPath(url: string): string | null {
  const { pathname } = new URL(url);
  const marker = "/_next/";
  if (!pathname.startsWith(marker)) return null;
  return path.join(WEB, ".next", pathname.slice(marker.length));
}

function isJavaScript(request: Request): boolean {
  return (
    request.resourceType() === "script" || new URL(request.url()).pathname.endsWith(".js")
  );
}

async function measureRoute(
  origin: string,
  route: string,
  browser: Awaited<ReturnType<typeof chromium.launch>>,
): Promise<RouteReport> {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Phase 1: what the HTML itself references, before any JS runs.
  const html = await (await fetch(new URL(route, origin))).text();
  const documentScripts = new Set(
    [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) =>
      new URL(match[1] as string, origin).toString(),
    ),
  );

  let phase: Phase = "load";
  const seen = new Map<string, Phase>();
  /** Non-JS `/_next/` payload (CSS + self-hosted font subsets) — OQ-002 input. */
  const others = new Set<string>();
  page.on("request", (request) => {
    const url = request.url();
    if (!isJavaScript(request)) {
      if (url.includes("/_next/")) others.add(url);
      return;
    }
    if (!seen.has(url)) seen.set(url, documentScripts.has(url) ? "document" : phase);
  });

  await page.goto(new URL(route, origin).toString(), { waitUntil: "load" });
  phase = "idle";
  await page.waitForLoadState("networkidle").catch(() => undefined);
  // `dynamic(ssr:false)` chunks are requested from an effect, so give the
  // hydrated page a beat past network idle before sealing the set.
  await page.waitForTimeout(2_500);
  await page.waitForLoadState("networkidle").catch(() => undefined);

  const assets: Asset[] = [];
  for (const [url, assetPhase] of seen) {
    const file = assetPath(url);
    if (!file) continue;
    const bytes = await readFile(file).catch(() => null);
    if (!bytes) continue;
    assets.push({
      brotli: brotliCompressSync(bytes).byteLength,
      gzip: gzipSync(bytes).byteLength,
      phase: assetPhase,
      raw: bytes.byteLength,
      url: new URL(url).pathname,
    });
  }
  await context.close();

  const empty = () => ({ brotli: 0, count: 0, gzip: 0, raw: 0 });
  const totals: Record<Phase, ReturnType<typeof empty>> = {
    document: empty(),
    idle: empty(),
    load: empty(),
  };
  // Tiers are cumulative: `load` includes `document`, `idle` includes both.
  const order: Phase[] = ["document", "load", "idle"];
  for (const asset of assets) {
    const from = order.indexOf(asset.phase);
    for (let index = from; index < order.length; index += 1) {
      const bucket = totals[order[index] as Phase];
      bucket.brotli += asset.brotli;
      bucket.count += 1;
      bucket.gzip += asset.gzip;
      bucket.raw += asset.raw;
    }
  }

  const nonJs = {
    cssCount: 0,
    cssGzip: 0,
    cssRaw: 0,
    fontCount: 0,
    fontRaw: 0,
  };
  for (const url of others) {
    const file = assetPath(url);
    if (!file) continue;
    const bytes = await readFile(file).catch(() => null);
    if (!bytes) continue;
    if (file.endsWith(".css")) {
      nonJs.cssCount += 1;
      nonJs.cssGzip += gzipSync(bytes).byteLength;
      nonJs.cssRaw += bytes.byteLength;
    } else {
      nonJs.fontCount += 1;
      nonJs.fontRaw += bytes.byteLength;
    }
  }

  return { assets, nonJs, route, totals };
}

function kb(bytes: number): string {
  return `${(bytes / KB).toFixed(1)}KB`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const budgetIndex = argv.indexOf("--budget");
  const budgetKb = budgetIndex >= 0 ? Number(argv[budgetIndex + 1]) : 450;
  const routes = argv.filter(
    (value, index) =>
      !value.startsWith("--") && !(budgetIndex >= 0 && index === budgetIndex + 1),
  );
  const targets = routes.length > 0 ? routes : DEFAULT_ROUTES;

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "start", "--port", String(port), "--hostname", "127.0.0.1"],
    { cwd: WEB, shell: process.platform === "win32", stdio: "ignore" },
  );

  let failed = false;
  try {
    await waitForServer(origin, child);
    const browser = await chromium.launch();
    try {
      for (const route of targets) {
        const report = await measureRoute(origin, route, browser);
        console.log(`\n=== ${report.route} ===`);
        for (const phase of ["document", "load", "idle"] as Phase[]) {
          const bucket = report.totals[phase];
          console.log(
            `  ${phase.padEnd(9)} chunks=${String(bucket.count).padStart(3)}` +
              `  raw=${kb(bucket.raw).padStart(9)}` +
              `  gzip=${kb(bucket.gzip).padStart(9)}` +
              `  brotli=${kb(bucket.brotli).padStart(9)}`,
          );
        }
        const heaviest = [...report.assets]
          .sort((left, right) => right.gzip - left.gzip)
          .slice(0, 8);
        console.log("  heaviest chunks (gzip):");
        for (const asset of heaviest) {
          console.log(
            `    ${kb(asset.gzip).padStart(9)}  ${asset.phase.padEnd(9)} ${asset.url}`,
          );
        }
        console.log(
          `  outside the JS budget: css=${report.nonJs.cssCount} files ` +
            `${kb(report.nonJs.cssGzip)} gz (${kb(report.nonJs.cssRaw)} raw), ` +
            `fonts=${report.nonJs.fontCount} woff2 subsets ${kb(report.nonJs.fontRaw)}`,
        );
        const overBudget = report.totals.idle.gzip / KB > budgetKb;
        console.log(
          `  budget ${budgetKb}KB gz (idle tier): ` +
            `${overBudget ? "OVER" : "OK"} — ${kb(report.totals.idle.gzip)}`,
        );
        if (overBudget) failed = true;
      }
    } finally {
      await browser.close();
    }
  } finally {
    child.kill();
  }

  if (failed) process.exitCode = 1;
}

await main();
