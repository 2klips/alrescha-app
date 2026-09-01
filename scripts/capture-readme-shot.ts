/**
 * Capture the README's dashboard screenshot (Phase 2A todo 10).
 *
 * A committed PNG that nobody can regenerate goes stale silently, so the
 * capture is a script rather than a one-off. It drives the *production* build so
 * the image shows what a user sees, not a dev overlay, and it waits for the Pixi
 * canvas and one simulation settle before shooting — otherwise the graph is
 * caught mid-layout and the picture is a pile of dots at the origin.
 *
 * Usage:
 *   pnpm --filter @alrescha/web build
 *   node --import tsx scripts/capture-readme-shot.ts
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const WEB = path.join(ROOT, "apps", "web");
const OUTPUT = path.join(ROOT, "docs", "images");
const VIEWPORT = { height: 900, width: 1600 };
/** Long enough for d3-force to settle into the constellation. */
const SETTLE_MS = 6_000;

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

async function main(): Promise<void> {
  await mkdir(OUTPUT, { recursive: true });
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "start", "--port", String(port), "--hostname", "127.0.0.1"],
    { cwd: WEB, shell: process.platform === "win32", stdio: "ignore" },
  );

  try {
    await waitForServer(origin, child);
    const browser = await chromium.launch();
    try {
      for (const theme of ["dark", "light"] as const) {
        const context = await browser.newContext({
          colorScheme: theme,
          deviceScaleFactor: 2,
          viewport: VIEWPORT,
        });
        const page = await context.newPage();
        await page.addInitScript(
          (value: string) =>
            window.localStorage.setItem("alrescha-theme", value),
          theme,
        );
        await page.goto(origin, { waitUntil: "load" });
        await page
          .locator("[data-testid='brain-map-stage'] canvas")
          .waitFor({ state: "visible" });
        await page.waitForTimeout(SETTLE_MS);
        const file = path.join(OUTPUT, `dashboard-${theme}.png`);
        await page.screenshot({ path: file });
        console.log(`wrote ${path.relative(ROOT, file)}`);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    child.kill();
  }
}

await main();
