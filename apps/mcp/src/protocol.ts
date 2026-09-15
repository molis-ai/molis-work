export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallContext {
  /** Host per-call identity; never derived from model-supplied tool arguments. */
  readonly runtimeSessionId: string | null;
  readonly runtimeSessionIdSource: "threadId" | "sessionId" | "molis-work/sessionId" | "goalboard/sessionId" | null;
}

export interface McpProtocolPorts {
  readonly serverInfo: { readonly name: string; readonly version: string };
  readonly tools: readonly McpToolDefinition[];
  callTool(name: string, arguments_: Record<string, unknown>, context: McpToolCallContext): Promise<string>;
  formatToolError(error: unknown): string;
}

function toolCallContextFromParams(params: Record<string, unknown>): McpToolCallContext {
  const empty = { runtimeSessionId: null, runtimeSessionIdSource: null };
  const meta = params._meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return empty;
  const metadata = meta as Record<string, unknown>;
  for (const key of ["molis-work/sessionId", "goalboard/sessionId", "threadId", "sessionId"] as const) {
    const value = metadata[key];
    if (typeof value !== "string") continue;
    const runtimeSessionId = value.trim();
    if (runtimeSessionId) return { runtimeSessionId, runtimeSessionIdSource: key };
  }
  return empty;
}

/** Wire protocol only. The caller provides audience-filtered tools and the authorized application. */
export async function handleMcpMessage(
  message: Record<string, unknown>, ports: McpProtocolPorts,
): Promise<Record<string, unknown> | null> {
  const method = message.method as string;
  const msgId = message.id;
  if (method === "initialize") {
    const params = (message.params as Record<string, unknown>) || {};
    return {
      jsonrpc: "2.0", id: msgId,
      result: {
        protocolVersion: params.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {}, resources: { subscribe: false, listChanged: false } },
        serverInfo: ports.serverInfo,
      },
    };
  }
  if (method === "notifications/initialized") return null;
  if (method === "ping") return { jsonrpc: "2.0", id: msgId, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id: msgId, result: { tools: ports.tools } };
  if (method === "tools/call") {
    try {
      const params = message.params as { name: string; arguments?: Record<string, unknown>; _meta?: Record<string, unknown> };
      const text = await ports.callTool(params.name, params.arguments || {}, toolCallContextFromParams(params));
      return { jsonrpc: "2.0", id: msgId, result: { content: [{ type: "text", text }], isError: false } };
    } catch (error) {
      return { jsonrpc: "2.0", id: msgId, result: { content: [{ type: "text", text: ports.formatToolError(error) }], isError: true } };
    }
  }
  if (method === "resources/list") return { jsonrpc: "2.0", id: msgId, result: { resources: [] } };
  if (method === "resources/templates/list") return { jsonrpc: "2.0", id: msgId, result: { resourceTemplates: [] } };
  return { jsonrpc: "2.0", id: msgId, error: { code: -32601, message: `Method not found: ${method}` } };
}
