import { isPlatformMcpTool, isRuntimeContextMcpTool, MOLIS_WORK_ACTION_TOOL_PREFIX } from "@molis-ai/molis-work-app-mcp";
import { MCP_TOOLS } from "./mcp-platform-tools.js";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
const errors = defineErrorCodes("mcp", { authority_denied: "forbidden", tool_unknown: "not_found", unexpected_field: "invalid" });

/** Discovery remains usable for repair/connection tools when an installed resident cannot be started. */
export function mcpResidentUnavailable(error: unknown): error is ActionError {
  return error instanceof ActionError && (error.kind === "unavailable"
    || ["actions.service_unavailable", "actions.home_required", "storage.owner.busy"].includes(error.code));
}

/** Reject invalid/management/forged context calls before discovery can have a startup side effect. */
export function assertMcpStartInput(audience: "runtime" | "management", name: string, input: Record<string, unknown>): void {
  if (typeof name !== "string" || !input || typeof input !== "object" || Array.isArray(input)) {
    throw new ActionError("actions.input_invalid", "MCP 工具名或参数形状无效");
  }
  if (audience === "runtime" && isPlatformMcpTool(name) && !isRuntimeContextMcpTool(name)) {
    throw errors.authority_denied("当前 Runtime 不允许调用管理工具");
  }
  const definition = MCP_TOOLS.find(tool => tool.name === name);
  if (!definition && (!name.startsWith(MOLIS_WORK_ACTION_TOOL_PREFIX) || !/^[a-zA-Z0-9_.-]{1,128}$/.test(name))) {
    throw errors.tool_unknown("未知 MCP 工具");
  }
  if (definition && isRuntimeContextMcpTool(name)) {
    const properties = definition.inputSchema.properties;
    const fields = properties && typeof properties === "object" ? Object.keys(properties) : [];
    if (Object.keys(input).some(key => !fields.includes(key))) throw errors.unexpected_field("连接工具包含未许可字段；身份和启动配置由宿主提供");
  }
  if (definition) assertActionInput(definition.inputSchema, input);
}
