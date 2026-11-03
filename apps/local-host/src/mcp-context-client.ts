import type { McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import type { MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorFromResponse } from "@molis-ai/molis-work-plugin-sdk";
import { currentCallId, markCallRecorded, newCallId } from "@molis-ai/molis-work-kernel";
import { actionGatewayHomeId } from "./action-gateway.js";
import { closedRecord, MCP_CONTEXT_PATH, runtimeHostMetadata, type ContextCacheUpdate } from "./mcp-context-envelope.js";
import { postToResidentHost, residentHostOrigin } from "./resident-host-request.js";

/** One explicitly pinned request. An unavailable or ambiguous resident never causes a local catalog fallback. */
export async function forwardMcpContext(options: {
  url: string; host: MolisWorkRuntimeContextHost; context: McpToolCallContext; signal: AbortSignal;
  operation: "tool" | "restore" | "alias"; tool?: { name: string; arguments: Record<string, unknown> };
  checkCurrent(): void; updateCache(update: ContextCacheUpdate): void;
}): Promise<string | null> {
  const home = options.host.homeDirectory;
  if (!home) throw new ActionError("actions.home_required", "上下文转发需要明确的 Runtime Home");
  const origin = residentHostOrigin(options.url), homeId = actionGatewayHomeId(home);
  const metadata = runtimeHostMetadata(options.host), protocol = structuredClone(options.context);
  const tool = options.tool ? structuredClone(options.tool) : undefined;
  const callId = currentCallId() ?? newCallId();
  const request = async (body: Record<string, unknown>) => {
    options.checkCurrent(); options.signal.throwIfAborted();
    const answer = await postToResidentHost({ origin, homeDirectory: home, path: MCP_CONTEXT_PATH,
      signal: options.signal, retryHint: "请重新解析当前连接并核对原请求结果，不会自动重发",
      body: { ...body, home_id: homeId } });
    options.checkCurrent(); options.signal.throwIfAborted();
    if (!answer) throw new ActionError("actions.service_unavailable", "对应 Home 的常驻服务尚未连接");
    return answer;
  };
  const description = await request({ operation: "describe" });
  if (!description.ok) throw actionErrorFromResponse(description.status, description.body);
  const instance = description.body.instance_id;
  if (typeof instance !== "string" || !instance) throw new ActionError("actions.transport_invalid", "常驻上下文服务响应无效");
  const answer = await request({ operation: options.operation, instance_id: instance, metadata, protocol,
    call_id: callId, ...(tool ? { tool } : {}) });
  if (answer.body.instance_id !== instance) {
    if (!answer.ok && answer.body.instance_id === undefined) throw actionErrorFromResponse(answer.status, answer.body);
    throw new ActionError("actions.host_replaced", "常驻服务已更换；请重新解析，不会重发原请求");
  }
  if (answer.body.call_id === callId && currentCallId() === callId) markCallRecorded();
  if (answer.body.cache !== undefined) options.updateCache(readCache(answer.body.cache));
  if (!answer.ok) throw actionErrorFromResponse(answer.status, answer.body);
  const result = answer.body.result;
  if (!(typeof result === "string" || result === null)) throw new ActionError("actions.transport_invalid", "常驻上下文结果无效");
  return result;
}

function readCache(value: unknown): ContextCacheUpdate {
  const cache = closedRecord(value, ["kind", "connection", "clearRefresh"]);
  if (cache.kind === "none") return { kind: "none" };
  if (cache.kind === "clear" && typeof cache.clearRefresh === "boolean") return { kind: "clear", clearRefresh: cache.clearRefresh };
  if (cache.kind === "accept") {
    if (cache.connection === null) return { kind: "accept", connection: null };
    const connection = closedRecord(cache.connection, ["projectId", "databasePath", "webBaseUrl"]);
    if (typeof connection.projectId === "string" && typeof connection.databasePath === "string" && typeof connection.webBaseUrl === "string") {
      return { kind: "accept", connection: { projectId: connection.projectId, databasePath: connection.databasePath, webBaseUrl: connection.webBaseUrl } };
    }
  }
  throw new ActionError("actions.transport_invalid", "常驻上下文连接状态无效");
}
