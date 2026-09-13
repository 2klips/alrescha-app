"use client";

import { useEffect, useState } from "react";

import {
  dispatchBrowserAccessEvent,
  type AccessPolicy,
} from "../../lib/realtime/access-events";
import {
  connectWorkspaceRealtimeBridge,
  type WorkspaceRealtimeBridgeStatus,
} from "../../lib/realtime/supabase-bridge";
import { createClient } from "../../lib/supabase/client";

/**
 * Subscribe the page to its workspace's access-event channel and re-emit
 * every admitted frame onto the `window` bus (Phase 4 Wave B todo 15).
 *
 * The channel is **private**: the join is authorised by the
 * `access_events_channel_member_read` policy on `realtime.messages`, which
 * asks `is_workspace_member` for the workspace named in the topic. The
 * browser client sends the signed-in session's JWT with the join, so a
 * signed-in user who is not a member is refused at the server, before any
 * frame exists to filter. The bridge's own tenant and revoked-token checks
 * sit behind that as a second gate.
 *
 * The returned status is what the screen shows beside "Live", and what the
 * browser spec waits on before it makes the tool call it expects to see —
 * asserting a glow against a channel that has not joined yet would be a
 * race dressed as a test.
 */
export function useWorkspaceRealtimeBridge(
  policy: AccessPolicy,
  pathOf: (nodeId: string) => string | undefined,
): WorkspaceRealtimeBridgeStatus {
  const [status, setStatus] =
    useState<WorkspaceRealtimeBridgeStatus>("connecting");

  useEffect(() => {
    const client = createClient();
    const stop = connectWorkspaceRealtimeBridge({
      dispatch: (event) => dispatchBrowserAccessEvent(window, event),
      onStatus: setStatus,
      openChannel: (topic) =>
        client.channel(topic, { config: { private: true } }),
      pathOf,
      policy,
    });
    return () => {
      stop();
      void client.removeAllChannels();
    };
  }, [pathOf, policy]);

  return status;
}
