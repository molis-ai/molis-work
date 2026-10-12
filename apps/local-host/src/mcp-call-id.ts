import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
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

/**
 * The text of a failed tool call: the message, then its code as a JSON line. `callId` is the operation's number when it left a row (see
 * `recordedCallId`); it joins that line, after the error's own fields, so no error can name another number.
 */
export function formatMcpToolError(error: unknown, callId?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const number = callId ? { call_id: callId } : {};
  if (error instanceof ActionError) return `错误: ${message}\n${JSON.stringify({ code: error.code, ...error.details, ...number })}`;
  if (error instanceof MolisWorkV1Error) return `错误: ${message}\n${JSON.stringify({ code: error.code, ...(error.details ?? {}), ...number })}`;
  return callId ? `错误: ${message}\n${JSON.stringify(number)}` : `错误: ${message}`;
}
