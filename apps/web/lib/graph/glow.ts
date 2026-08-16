/**
 * Neuron glow: per-node intensity, coalescing, and the drift overlay rules
 * (Phase 2A todo 6).
 *
 * Research spec §5-①: "layout updates and visual-state updates are completely
 * separate — only a per-node `glowIntensity` attribute is updated, with
 * exponential decay (~1.5s), additive propagation to neighbouring edges, and
 * 100ms event coalescing."
 *
 * The phase machine is *not* redefined here. `lib/realtime/access-events.ts`
 * already owns it (pulse → decay → afterglow → idle) together with the
 * cross-workspace and revoked-token filtering that the realtime tests cover.
 * This module adds only the continuous intensity on top, so there is exactly
 * one truth about when a node is lit.
 */

import {
  pulsePhaseAt,
  type GraphAccessEvent,
  type NodePulse,
  type PulsePhase,
  type RealtimeGraphState,
} from "../realtime/access-events";

/** Access events are batched into 100ms windows before they reach a frame. */
export const GLOW_COALESCE_WINDOW_MS = 100;

/** Rise time of the initial pulse. */
export const GLOW_RISE_MS = 120;

/** Exponential decay constant — ~1.5s to fade a pulse out. */
export const GLOW_DECAY_TAU_MS = 1_500;

/** Residual tint left on a recently-touched node during afterglow. */
export const GLOW_AFTERGLOW_FLOOR = 0.14;

/**
 * Peak intensity for a node. Repeated reads burn brighter but saturate, so a
 * hot node stays readable instead of blowing out the additive layer.
 */
export function glowPeak(eventCount: number): number {
  return Math.min(1, 0.55 + Math.log2(Math.max(1, eventCount) + 1) * 0.22);
}

export function glowPhaseAt(
  pulse: NodePulse | undefined,
  now: number,
): PulsePhase {
  return pulsePhaseAt(pulse, now);
}

/** 0…1 intensity: linear rise, exponential decay, then an afterglow floor. */
export function glowIntensityAt(
  pulse: NodePulse | undefined,
  now: number,
): number {
  const phase = pulsePhaseAt(pulse, now);
  if (!pulse || phase === "idle") return 0;
  const age = now - pulse.lastTouchedAt;
  const peak = glowPeak(pulse.eventCount);
  if (age < GLOW_RISE_MS) return peak * (age / GLOW_RISE_MS);
  const decayed = peak * Math.exp(-(age - GLOW_RISE_MS) / GLOW_DECAY_TAU_MS);
  return phase === "afterglow"
    ? Math.max(GLOW_AFTERGLOW_FLOOR * peak, decayed)
    : decayed;
}

/** Node id → intensity for every node that is not idle. */
export function glowIntensities(
  pulses: Readonly<Record<string, NodePulse>>,
  now: number,
): Map<string, number> {
  const intensities = new Map<string, number>();
  for (const pulse of Object.values(pulses)) {
    const intensity = glowIntensityAt(pulse, now);
    if (intensity > 0) intensities.set(pulse.nodeId, intensity);
  }
  return intensities;
}

/** Nodes still carrying the residual afterglow tint (touched, no longer pulsing). */
export function glowAfterglowNodes(
  pulses: Readonly<Record<string, NodePulse>>,
  now: number,
): Set<string> {
  const nodes = new Set<string>();
  for (const pulse of Object.values(pulses)) {
    if (pulsePhaseAt(pulse, now) === "afterglow") nodes.add(pulse.nodeId);
  }
  return nodes;
}

/**
 * The bridge from the realtime reducer to the renderer. Taking
 * `RealtimeGraphState` rather than raw events means the tenant and
 * revoked-token filtering that the realtime suite already proves applies to the
 * glow layer for free — a cross-workspace read can never light a node.
 */
export function glowFromRealtime(
  state: RealtimeGraphState,
  now: number,
): Map<string, number> {
  return glowIntensities(state.pulses, now);
}

export interface GlowCoalescer {
  /** Batch for the window that closed at `now`, or null if it is still open. */
  drain(now: number): GraphAccessEvent[] | null;
  pending(): number;
  push(event: GraphAccessEvent, now: number): void;
  /** Windows closed so far — one render batch each. */
  windows(): number;
}

/**
 * Fixed-width event coalescing on *absolute* window boundaries
 * (`floor(now / windowMs)`), not on "100ms after the first event". Absolute
 * boundaries make the batching independent of when a burst happens to start,
 * so a scripted stream replays identically every run.
 *
 * Deliberately pull-based (`drain(now)`) rather than timer-based: the browser
 * wiring drains from the rAF loop, and a test can replay a burst without fake
 * timers.
 */
export function createGlowCoalescer(
  windowMs = GLOW_COALESCE_WINDOW_MS,
): GlowCoalescer {
  let queue: GraphAccessEvent[] = [];
  let openedAt: number | null = null;
  let windows = 0;

  return {
    drain(now) {
      if (openedAt === null || queue.length === 0) return null;
      if (Math.floor(now / windowMs) === Math.floor(openedAt / windowMs))
        return null;
      const batch = queue;
      queue = [];
      openedAt = null;
      windows += 1;
      return batch;
    },
    pending: () => queue.length,
    push(event, now) {
      if (openedAt === null) openedAt = now;
      queue.push(event);
    },
    windows: () => windows,
  };
}

export interface DriftOverlay {
  /** Edges whose evidence no longer holds — drawn red and dashed. */
  brokenEdgeIds: string[];
  /** Nodes with open findings — drawn with a red ring. */
  ringedNodeIds: string[];
}

/**
 * The drift overlay is derived, never stored: a node rings because it has open
 * findings and an edge dashes because its evidence is broken. Extracted so the
 * rule is asserted independently of the renderer.
 */
export function driftOverlay(data: {
  edges: readonly { broken: boolean; id: string }[];
  nodes: readonly { findingCount: number; id: string }[];
}): DriftOverlay {
  return {
    brokenEdgeIds: data.edges.filter((edge) => edge.broken).map((edge) => edge.id),
    ringedNodeIds: data.nodes
      .filter((node) => node.findingCount > 0)
      .map((node) => node.id),
  };
}
