/**
 * Brain-map browser benchmark (Phase 4 Wave B todo 12).
 *
 * `scripts/bench-graph-frame.ts` measures the frame *plan* in node: degree
 * maps, radii, collapse, label selection. It cannot measure the half that
 * matters most to someone dragging the map, because that half is a GPU.
 *
 * This drives a real Chromium at a real graph and reports the frame interval
 * while the camera is moving. Two things it deliberately does **not** do:
 *
 * - **It does not invent a number.** Every figure is a measured interval
 *   between `requestAnimationFrame` callbacks on the page under test. There
 *   is no model, no extrapolation and no "should be around".
 * - **It does not compare hosts.** Wall-clock frame time on a GPU is a
 *   property of the machine, so the report states the host, the CPU and the
 *   renderer string WebGL reports. A number without those is not a
 *   measurement, it is a rumour.
 *
 * Usage:
 *   node --import tsx scripts/bench-graph-browser.ts \
 *     [--nodes 5000] [--url http://127.0.0.1:3000] [--json out.json]
 *
 * Needs a dev server already running (`pnpm --filter @alrescha/web dev`) and
 * Playwright's Chromium installed. It starts nothing itself: a benchmark that
 * builds its own server measures the build as well.
 */

import { writeFileSync } from "node:fs";
import os from "node:os";

import { chromium, type Page } from "@playwright/test";

interface FrameStats {
  readonly count: number;
  /**
   * Intervals longer than 1.5× the median — the frames a viewer sees as a
   * stutter.
   *
   * This is the number that carries the signal, because a browser presents on
   * the display's schedule: a p50 sitting exactly on the refresh interval
   * means the renderer finished in time, not that it took that long. What
   * distinguishes a map that feels smooth from one that does not is how often
   * it *misses*.
   */
  readonly dropped: number;
  readonly max: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
}

interface CaseResult extends FrameStats {
  readonly name: string;
}

const DEFAULT_NODES = 5_000;
const DEFAULT_URL = "http://127.0.0.1:3000";

/** Long enough for a settle plus a full gesture, short enough to iterate. */
const GESTURE_STEPS = 90;

function readFlag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[rank] as number;
}

function summarise(name: string, samples: readonly number[]): CaseResult {
  const sorted = [...samples].sort((left, right) => left - right);
  const median = percentile(sorted, 0.5);
  return {
    count: sorted.length,
    dropped: sorted.filter((interval) => interval > median * 1.5).length,
    max: sorted.at(-1) ?? 0,
    mean:
      sorted.length === 0
        ? 0
        : sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    name,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

/*
 * The three snippets below run **in the page**, and they are source strings
 * rather than functions on purpose: this file is transpiled by esbuild, which
 * wraps every named function in a `__name` helper that exists in node and not
 * in the browser. A transpiled closure handed to `page.evaluate` therefore
 * fails with `__name is not defined` — quietly, until you run it.
 */

/**
 * Start recording frame intervals. A plain rAF loop, so it measures what the
 * browser actually presented rather than what the app thinks it drew.
 */
const START_RECORDING = `(() => {
  window.__benchFrames = [];
  let last = performance.now();
  let handle = 0;
  const tick = () => {
    const now = performance.now();
    window.__benchFrames.push(now - last);
    last = now;
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);
  window.__benchStop = () => cancelAnimationFrame(handle);
})()`;

/**
 * Stop, and hand back the intervals. The first one spans the gap before
 * recording began, which is not a frame anyone rendered.
 */
const STOP_RECORDING = `(() => {
  if (window.__benchStop) window.__benchStop();
  return (window.__benchFrames || []).slice(1);
})()`;

/** What the page's own WebGL context says it is running on. */
const READ_RENDERER = `(() => {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) return "no webgl context";
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return String(
    info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  );
})()`;

async function startRecording(page: Page): Promise<void> {
  await page.evaluate(START_RECORDING);
}

async function stopRecording(page: Page): Promise<number[]> {
  return (await page.evaluate(STOP_RECORDING)) as number[];
}

async function readRenderer(page: Page): Promise<string> {
  return (await page.evaluate(READ_RENDERER)) as string;
}

async function main(): Promise<void> {
  const nodes = Number.parseInt(readFlag("nodes") ?? String(DEFAULT_NODES), 10);
  const base = readFlag("url") ?? DEFAULT_URL;
  const jsonPath = readFlag("json");

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { height: 900, width: 1440 },
  });
  const results: CaseResult[] = [];
  let renderer: string;

  try {
    await page.goto(`${base}/map?nodes=${nodes}`, { waitUntil: "load" });
    renderer = await readRenderer(page);
    const stage = page.locator("[data-testid='brain-map-stage']");
    // Wait for the layout rather than for a clock: `data-settled` is the
    // signal todo 9 exposed for exactly this.
    await stage.waitFor({ state: "visible", timeout: 60_000 });
    await page
      .waitForFunction(
        () =>
          document
            .querySelector("[data-testid='brain-map-stage']")
            ?.getAttribute("data-settled") === "true",
        undefined,
        { timeout: 120_000 },
      )
      .catch(() => {
        // A graph this size may never settle inside the timeout. Measuring a
        // still-moving layout is a harder case, not a broken one — say so.
        process.stderr.write(
          "layout had not settled when the gesture started; frames include simulation work\n",
        );
      });

    const box = await page.locator(".brain-map-viewport").boundingBox();
    if (!box) throw new Error("the map viewport is not on the page");
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Idle: the floor. A settled graph nobody is touching should cost almost
    // nothing, and if it does not, no gesture number below means much.
    await startRecording(page);
    await page.waitForTimeout(1_500);
    results.push(summarise("idle", await stopRecording(page)));

    // Pan: the camera moves every frame, so the renderer culls and rebuilds.
    await startRecording(page);
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    for (let step = 0; step < GESTURE_STEPS; step += 1) {
      const angle = (step / GESTURE_STEPS) * Math.PI * 2;
      await page.mouse.move(
        centerX + Math.cos(angle) * 260,
        centerY + Math.sin(angle) * 160,
      );
    }
    await page.mouse.up();
    results.push(summarise("pan", await stopRecording(page)));

    // Zoom: the scale changes, so every screen-space size is recomputed and
    // the visible set changes shape rather than just position.
    await startRecording(page);
    for (let step = 0; step < GESTURE_STEPS; step += 1) {
      await page.locator(".brain-map-viewport").dispatchEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        deltaY: step % 30 < 15 ? -120 : 120,
      });
      // Paced, so the gesture spans frames instead of queueing ninety wheel
      // events into one. A sample of a dozen frames is not a measurement.
      await page.waitForTimeout(16);
    }
    results.push(summarise("zoom", await stopRecording(page)));
  } catch (error) {
    await browser.close();
    throw error;
  }
  await browser.close();

  const report = {
    host: {
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? "unknown",
      cpus: os.cpus().length,
      node: process.version,
      platform: `${os.platform()} ${os.release()}`,
      renderer,
    },
    nodes,
    recordedAt: new Date().toISOString(),
    results,
  };

  process.stdout.write(
    `brain map, ${nodes} nodes — frame interval in ms (lower is better)\n` +
      `host: ${report.host.cpu} · ${report.host.platform}\n` +
      `gpu:  ${renderer}\n\n` +
      results
        .map(
          (result) =>
            `  ${result.name.padEnd(6)} p50 ${result.p50.toFixed(1).padStart(6)}` +
            `  p95 ${result.p95.toFixed(1).padStart(6)}` +
            `  max ${result.max.toFixed(1).padStart(6)}` +
            `  dropped ${String(result.dropped).padStart(3)}/${result.count}`,
        )
        .join("\n") +
      "\n",
  );

  if (jsonPath) {
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`\nwrote ${jsonPath}\n`);
  }
}

await main();
