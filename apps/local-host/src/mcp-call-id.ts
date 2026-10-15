
import type { McpToolResult } from "@molis-ai/molis-work-app-mcp";
import { recordedCallId } from "@molis-ai/molis-work-kernel";

/**
 * Where a tool result names the operation that made it. The number is the host's, shown only when the call log holds a row for the
 * operation (a command, a refusal, a failure), so a person who is given it can look it up under 「设置 › 诊断」. A client's own `_meta` is
 * read for its Session and for nothing else, never for this number.
 */
export const MCP_CALL_ID_META_KEY = "molis-work/callId";

/** A successful result as the client sees it: with the number of its operation in `_meta` when the operation left a row, else unchanged. */
export function withCallIdMeta(result: string | McpToolResult): string | McpToolResult {
  const id = recordedCallId();
  if (!id) return result;
  const base: McpToolResult = typeof result === "string" ? { content: [{ type: "text", text: result }], isError: false } : result;
  return { ...base, _meta: { ...base._meta, [MCP_CALL_ID_META_KEY]: id } };
}

// The MCP package renders every tool failure; the Host stamps its own recorded call number.
export { formatMcpToolError } from "@molis-ai/molis-work-app-mcp";
