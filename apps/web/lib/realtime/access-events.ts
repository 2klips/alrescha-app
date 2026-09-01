export interface GraphAccessEvent {
  id: string;
  occurredAt: number;
  targetNodeIds: readonly string[];
  targetPath: string;
  tokenId: string;
  tool: string;
  workspaceId: string;
}

export type PulsePhase = "afterglow" | "decay" | "idle" | "pulse";

export interface NodePulse {
  eventCount: number;
  lastTouchedAt: number;
  nodeId: string;
}

export interface RealtimeGraphState {
  feed: readonly GraphAccessEvent[];
  layoutRevision: number;
  pulses: Readonly<Record<string, NodePulse>>;
  renderBatches: number;
  workspaceId: string;
}

export interface AccessPolicy {
  revokedTokenIds: ReadonlySet<string>;
  workspaceId: string;
}

export function createRealtimeGraphState(
  workspaceId: string,
): RealtimeGraphState {
  return {
    feed: [],
    layoutRevision: 0,
    pulses: {},
    renderBatches: 0,
    workspaceId,
  };
}

export function pulsePhaseAt(
  pulse: NodePulse | undefined,
  now: number,
): PulsePhase {
  if (!pulse) return "idle";
  const age = now - pulse.lastTouchedAt;
  if (age < 0 || age >= 12_000) return "idle";
  if (age < 750) return "pulse";
  if (age < 2_600) return "decay";
  return "afterglow";
}

export function reduceAccessEventBatch(
  state: RealtimeGraphState,
  events: readonly GraphAccessEvent[],
  policy: AccessPolicy,
): RealtimeGraphState {
  const accepted = events.filter(
    (event) =>
      event.workspaceId === policy.workspaceId &&
      event.workspaceId === state.workspaceId &&
      !policy.revokedTokenIds.has(event.tokenId),
  );
  if (accepted.length === 0) return state;

  const pulses: Record<string, NodePulse> = { ...state.pulses };
  for (const event of accepted) {
    for (const nodeId of event.targetNodeIds) {
      const previous = pulses[nodeId];
      pulses[nodeId] = {
        eventCount: (previous?.eventCount ?? 0) + 1,
        lastTouchedAt: Math.max(previous?.lastTouchedAt ?? 0, event.occurredAt),
        nodeId,
      };
    }
  }

  const byId = new Map<string, GraphAccessEvent>();
  for (const event of [...state.feed, ...accepted]) byId.set(event.id, event);
  const feed = [...byId.values()]
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, 20);

  return {
    ...state,
    feed,
    pulses,
    renderBatches: state.renderBatches + 1,
  };
}

export interface WorkspaceRealtimeSource {
  subscribe: (
    channel: string,
    listener: (event: GraphAccessEvent) => void,
  ) => () => void;
}

function workspaceChannel(workspaceId: string): string {
  return `workspace:${workspaceId}:access-events`;
}

export function createBrowserWorkspaceRealtimeSource(
  target: EventTarget,
): WorkspaceRealtimeSource {
  return {
    subscribe(channel, listener) {
      const handler = (event: Event) => {
        if (event instanceof CustomEvent)
          listener(event.detail as GraphAccessEvent);
      };
      target.addEventListener(channel, handler);
      return () => target.removeEventListener(channel, handler);
    },
  };
}

export function dispatchBrowserAccessEvent(
  target: EventTarget,
  event: GraphAccessEvent,
): void {
  target.dispatchEvent(
    new CustomEvent(workspaceChannel(event.workspaceId), { detail: event }),
  );
}

export function subscribeWorkspaceRealtime(
  source: WorkspaceRealtimeSource,
  policy: AccessPolicy,
  onBatch: (events: readonly GraphAccessEvent[]) => void,
  schedule: (flush: () => void) => void = (flush) => queueMicrotask(flush),
): () => void {
  let queue: GraphAccessEvent[] = [];
  let scheduled = false;
  const unsubscribe = source.subscribe(
    workspaceChannel(policy.workspaceId),
    (event) => {
      if (
        event.workspaceId !== policy.workspaceId ||
        policy.revokedTokenIds.has(event.tokenId)
      )
        return;
      queue.push(event);
      if (scheduled) return;
      scheduled = true;
      schedule(() => {
        scheduled = false;
        const batch = queue;
        queue = [];
        if (batch.length > 0) onBatch(batch);
      });
    },
  );
  return () => {
    queue = [];
    unsubscribe();
  };
}

export function logAccessEventFireAndForget(
  event: GraphAccessEvent,
  publish: (event: GraphAccessEvent) => Promise<void>,
): void {
  queueMicrotask(() => {
    void publish(event).catch(() => undefined);
  });
}

export const DEMO_WORKSPACE_ID = "workspace-alrescha-demo";
export const DEMO_REVOKED_TOKEN_ID = "token-revoked";

export function createDemoAccessEvents(startedAt: number): GraphAccessEvent[] {
  return [
    {
      id: "access-search",
      occurredAt: startedAt,
      targetNodeIds: ["req-auth", "doc-guide"],
      targetPath: "spec/WORK_SPEC.md",
      tokenId: "token-codex",
      tool: "search_index",
      workspaceId: DEMO_WORKSPACE_ID,
    },
    {
      id: "access-artifact",
      occurredAt: startedAt + 180,
      targetNodeIds: ["req-auth", "code-auth"],
      targetPath: "repository-access.ts",
      tokenId: "token-codex",
      tool: "get_artifact",
      workspaceId: DEMO_WORKSPACE_ID,
    },
    {
      id: "access-findings",
      occurredAt: startedAt + 360,
      targetNodeIds: ["req-ci", "code-evidence", "test-ci"],
      targetPath: "REQ-CI-04",
      tokenId: "token-claude",
      tool: "get_findings",
      workspaceId: DEMO_WORKSPACE_ID,
    },
    {
      id: "access-pack",
      occurredAt: startedAt + 540,
      targetNodeIds: ["req-context", "doc-agents"],
      targetPath: "context pack",
      tokenId: "token-cursor",
      tool: "request_context_pack",
      workspaceId: DEMO_WORKSPACE_ID,
    },
    {
      id: "access-note",
      occurredAt: startedAt + 720,
      targetNodeIds: ["req-webhook", "code-webhook"],
      targetPath: "webhook.ts",
      tokenId: "token-codex",
      tool: "get_artifact",
      workspaceId: DEMO_WORKSPACE_ID,
    },
    {
      id: "access-cross-tenant",
      occurredAt: startedAt + 900,
      targetNodeIds: ["code-pack"],
      targetPath: "private-other-repo.ts",
      tokenId: "token-other",
      tool: "get_artifact",
      workspaceId: "workspace-other",
    },
    {
      id: "access-revoked",
      occurredAt: startedAt + 1_080,
      targetNodeIds: ["test-pack"],
      targetPath: "revoked-secret.md",
      tokenId: DEMO_REVOKED_TOKEN_ID,
      tool: "get_artifact",
      workspaceId: DEMO_WORKSPACE_ID,
    },
  ];
}

export function relativeEventTime(occurredAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - occurredAt) / 1_000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}
