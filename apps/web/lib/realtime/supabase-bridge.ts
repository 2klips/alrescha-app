import {
  ACCESS_EVENT_BROADCAST,
  parseBroadcastAccessEvent,
  workspaceAccessChannel,
  type AccessPolicy,
  type GraphAccessEvent,
} from "./access-events";

/**
 * The missing wire of D10 (Phase 4 Wave B todo 15): a Supabase Realtime
 * subscription that re-emits the server's `access_event` frames onto the
 * page's `window` bus, where `map-screen.tsx` has listened since Phase 2A.
 *
 * Written against a channel *shape* rather than `@supabase/realtime-js` so
 * the parts that decide what reaches the page — the tenant check, the
 * revoked-token filter, the field whitelist, and the reconnect loop — run in
 * vitest with a scripted channel. The real client is handed in by the hook
 * in `app/ui/workspace-realtime-bridge.ts`.
 *
 * Reconnection is this module's, not the socket's. The Realtime client
 * reconnects a dropped socket on its own, but a channel that ends in
 * `CHANNEL_ERROR` or `TIMED_OUT` stays ended, and a session token that
 * expired between two joins is exactly such an error. So every non-final
 * end of the channel is answered by opening a fresh one after an
 * exponential delay — 1s, 2s, 4s… capped at 30s — and the attempt counter
 * resets on the next successful join. `stop()` ends it all; a `CLOSED`
 * that follows the stop is ours and is not retried.
 */

export type WorkspaceRealtimeBridgeStatus =
  "closed" | "connecting" | "live" | "retrying";

/** The subset of a Realtime channel the bridge touches. */
export interface RealtimeChannelLike {
  on(
    type: "broadcast",
    filter: { event: string },
    callback: (message: { payload?: unknown }) => void,
  ): unknown;
  subscribe(callback: (status: string, error?: Error) => void): unknown;
  unsubscribe(): Promise<unknown> | unknown;
}

export interface WorkspaceRealtimeBridgeOptions {
  /** Opens a fresh private channel on the topic — never a cached one. */
  readonly openChannel: (topic: string) => RealtimeChannelLike;
  readonly policy: AccessPolicy;
  /** Node id → path, for the feed's row label. */
  readonly pathOf: (nodeId: string) => string | undefined;
  /** Where an admitted event goes — the `window` bus in the browser. */
  readonly dispatch: (event: GraphAccessEvent) => void;
  readonly onStatus?: (
    status: WorkspaceRealtimeBridgeStatus,
    attempt: number,
  ) => void;
  /** Delay before the next join after a failed one; default exponential. */
  readonly retryDelayMs?: (attempt: number) => number;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export const RETRY_BASE_MS = 1_000;
export const RETRY_CAP_MS = 30_000;

/** 1s, 2s, 4s, … capped — the delay before join `attempt` (1-based). */
export function retryDelayFor(attempt: number): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 30));
  return Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** exponent);
}

/** Channel end states that are worth another join. */
const RETRIABLE = new Set(["CHANNEL_ERROR", "CLOSED", "TIMED_OUT"]);

export function connectWorkspaceRealtimeBridge(
  options: WorkspaceRealtimeBridgeOptions,
): () => void {
  const {
    clearTimer = (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
    dispatch,
    onStatus = () => undefined,
    openChannel,
    pathOf,
    policy,
    retryDelayMs = retryDelayFor,
    setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
  } = options;
  const topic = workspaceAccessChannel(policy.workspaceId);

  let stopped = false;
  let attempt = 0;
  let current: RealtimeChannelLike | null = null;
  let timer: unknown = null;

  const admit = (message: { payload?: unknown }) => {
    if (stopped) return;
    const event = parseBroadcastAccessEvent(message.payload, pathOf);
    if (!event) return;
    // The channel is scoped to one workspace by name and by policy; a frame
    // that names another workspace anyway is dropped here too, and so is a
    // token this page was told is revoked (the reducer repeats both checks —
    // there is no path to a lit node that skips them).
    if (event.workspaceId !== policy.workspaceId) return;
    if (policy.revokedTokenIds.has(event.tokenId)) return;
    dispatch(event);
  };

  const open = () => {
    if (stopped) return;
    timer = null;
    const channel = openChannel(topic);
    current = channel;
    onStatus(attempt === 0 ? "connecting" : "retrying", attempt);
    channel.on("broadcast", { event: ACCESS_EVENT_BROADCAST }, admit);
    channel.subscribe((status) => {
      if (stopped || current !== channel) return;
      if (status === "SUBSCRIBED") {
        attempt = 0;
        onStatus("live", 0);
        return;
      }
      if (!RETRIABLE.has(status)) return;
      current = null;
      void channel.unsubscribe();
      attempt += 1;
      onStatus("retrying", attempt);
      timer = setTimer(open, retryDelayMs(attempt));
    });
  };

  open();

  return () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    const channel = current;
    current = null;
    if (channel) void channel.unsubscribe();
    onStatus("closed", attempt);
  };
}
