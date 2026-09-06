/**
 * A local repository, served over stdio (Phase 4 Wave C todo 17, OQ-030 ⑴).
 *
 * `alrescha push` gives a local repository a graph on the server but no
 * analysis: the worker's source factory needs a GitHub installation, so
 * analyze and enrich never run for it (OQ-030). Sending bodies to the server
 * to fix that would break hard rule ③ outright, so the analysis moves to
 * where the bodies already are — this process — and nothing leaves the
 * machine at all.
 *
 * The tool surface is the hosted one, imported rather than rebuilt: a tool
 * that behaved differently over stdio would make "which transport" a thing
 * an agent has to know.
 *
 * **Read scopes only.** The write tools record workspace memory — progress,
 * notes, assertions, ruled-out attempts — and this store dies with the
 * process. Granting `mcp:write` would let an agent believe it had recorded
 * something durable; without the scope the tools answer with the scope they
 * need, which is a refusal an agent can act on.
 */

import {
  serveStdio,
  type StdioServerHandle,
} from "@modelcontextprotocol/server/stdio";
import type { Transport } from "@modelcontextprotocol/server";

import { createMcpServerFor } from "./hosted";
import {
  InMemoryMcpStore,
  type McpPrincipal,
  type McpScope,
  type McpWorkspaceData,
} from "./store";
import { LOCAL_USER_ID, LOCAL_WORKSPACE_ID } from "./local-workspace";

/** What a local session may do: read the graph, and change nothing. */
export const LOCAL_SERVE_SCOPES: readonly McpScope[] = ["mcp:read"];

const LOCAL_TOKEN_ID = "local-session";

export interface LocalServeOptions {
  /**
   * A transport to serve on instead of this process's stdio. The tests pass
   * a stream pair; a caller could pass a socket. Omitted, the connection is
   * stdin and stdout, which is what a client that spawned this process
   * expects.
   */
  readonly transport?: Transport;
  readonly workspace: McpWorkspaceData;
}

export interface LocalServeHandle {
  readonly close: () => Promise<void>;
  readonly principal: McpPrincipal;
  readonly store: InMemoryMcpStore;
}

export function localPrincipal(): McpPrincipal {
  return {
    scopes: [...LOCAL_SERVE_SCOPES],
    tokenId: LOCAL_TOKEN_ID,
    userId: LOCAL_USER_ID,
    workspaceId: LOCAL_WORKSPACE_ID,
  };
}

export function serveLocalWorkspace(
  options: LocalServeOptions,
): LocalServeHandle {
  const store = new InMemoryMcpStore({ workspaces: [options.workspace] });
  const principal = localPrincipal();
  const handle: StdioServerHandle = serveStdio(
    () => createMcpServerFor({ principal, store }),
    {
      /**
       * The hosted endpoint answers a 2025-era opening with the
       * supported-revision error (`legacy: "reject"`), and this does not —
       * measured, not assumed. Over HTTP the modern opening rides headers
       * the streamable transport sends by default; over stdio it needs a
       * sibling-process probe, and the SDK's own `StdioClientTransport`
       * opens with the 2025 `initialize` handshake instead. Rejecting here
       * would refuse the reference client, so the connection is served and
       * the divergence is recorded as OQ-058 rather than hidden. Nothing
       * about the surface changes: the same factory serves both eras, and
       * no session, sampling or logging capability exists to leak into one.
       */
      legacy: "serve",
      // stdout is the wire. A transport error written there would be read as
      // a malformed message, so it goes to stderr, where a client that pipes
      // it can still see it.
      onerror: (error) => {
        process.stderr.write(`alrescha serve: ${error.message}\n`);
      },
      ...(options.transport === undefined
        ? {}
        : { transport: options.transport }),
    },
  );
  return { close: () => handle.close(), principal, store };
}
