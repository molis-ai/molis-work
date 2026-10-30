import { AsyncLocalStorage } from "node:async_hooks";
import { handleMcpMessage, MCP_SERVER_INFO, type McpToolDefinition, type McpToolCallContext, type McpToolResult } from "@molis-ai/molis-work-app-mcp";
import { newCallId, recordedCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { formatMcpToolError, withCallIdMeta } from "./mcp-call-id.js";
import type { EnsureMcpResidentHost } from "./mcp-resident-start.js";

const requests = new AsyncLocalStorage<{ signal?: AbortSignal; resident?: { key: string; promise: Promise<void> } }>();

/** Cancellation is supplied by the transport, never by JSON arguments or metadata. */
export function mcpRequestSignal(...lifetimes: AbortSignal[]): AbortSignal {
  const request = requests.getStore()?.signal;
  return AbortSignal.any(request ? [...lifetimes, request] : lifetimes);
}

/** Discovery and restore share one startup attempt/budget, including its failure, for this request. */
export function ensureMcpRequestResident(ensure: EnsureMcpResidentHost | undefined, home: string, origin: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!ensure) return Promise.resolve();
  const request = requests.getStore(), key = `${home}\n${origin}`;
  if (request?.resident?.key === key) return request.resident.promise;
  const promise = ensure(home, origin, signal);
  if (request) request.resident = { key, promise };
  return promise;
}

export function mcpResidentManagement(ensure: EnsureMcpResidentHost | undefined, home: string, origin: string, signal: AbortSignal) {
  return { home, origin, signal, ...(ensure ? { ensureResident: () => ensureMcpRequestResident(ensure, home, origin, signal) } : {}) };
}

export function handleLocalMcpRequest(message: Record<string, unknown>, signal: AbortSignal | undefined, ports: {
  tools(): Promise<readonly McpToolDefinition[]>;
  callTool(name: string, input: Record<string, unknown>, context: McpToolCallContext): Promise<string | McpToolResult>;
}): Promise<Record<string, unknown> | null> {
  // The Host creates the operation number; a client's metadata cannot supply it.
  return requests.run({ signal }, () => withCallId(newCallId(), async () => {
    signal?.throwIfAborted();
    // A refused discovery is one JSON-RPC error for this request; the server must stay alive for the rest.
    let tools: readonly McpToolDefinition[] = [];
    if (message.method === "tools/list") {
      try {
        tools = await ports.tools();
      } catch (error) {
        signal?.throwIfAborted();
        return { jsonrpc: "2.0", id: message.id, error: { code: -32603, message: formatMcpToolError(error, recordedCallId()) } };
      }
    }
    signal?.throwIfAborted();
    return handleMcpMessage(message, { serverInfo: MCP_SERVER_INFO, tools,
      callTool: async (name, input, context) => withCallIdMeta(await ports.callTool(name, input, context)),
      formatToolError: error => formatMcpToolError(error, recordedCallId()),
    });
  }));
}
