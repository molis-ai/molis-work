import { createHash } from "node:crypto";
import { ActionError, type ActionCallContext, type ActionClient, type ActionReference,
  type ActionSchema, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { McpProtocolPorts, McpToolDefinition } from "./protocol.js";
import { formatMcpToolError } from "./tool-error.js";

/** Stable public names; neither install identity nor catalog order changes them. */
export function actionMcpToolName(reference: ActionReference): string {
  const raw = `${reference.capability_id}__v${reference.version}`;
  if (/^[a-zA-Z0-9_.-]{1,128}$/u.test(raw)) return raw;
  const suffix = createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return `${raw.replace(/[^a-zA-Z0-9_.-]/gu, "_").slice(0, 110)}_${suffix}`;
}

/** Every action tool carries this prefix; the platform's own tools (`molis_work_v1_context_*`, `molis_work_v1_project_delete`) do not. */
export const MOLIS_WORK_ACTION_TOOL_PREFIX = "molis_work_v1_action_";

/** The tool name an MCP client sees for an action: `molis_work_v1_action_<capability_id>__v<version>` (docs/mcp.md). */
export function molisWorkActionToolName(reference: ActionReference): string {
  return actionMcpToolName({ ...reference, capability_id: `${MOLIS_WORK_ACTION_TOOL_PREFIX}${reference.capability_id}` });
}

function objectSchema(schema: ActionSchema | undefined): boolean { return schema?.type === "object"; }

/** Nested resource identity preserves local $refs when a scalar/array needs an MCP object envelope. */
function envelope(schema: ActionSchema, field: string, action: ActionReference): Record<string, unknown> {
  return { ...(schema.$schema ? { $schema: schema.$schema } : {}), type: "object", properties: {
    [field]: { $id: `urn:molis:action:${encodeURIComponent(action.capability_id)}:${action.version}:${field}`, ...structuredClone(schema) },
  }, required: [field], additionalProperties: false };
}

export function actionMcpToolDefinition(view: ActionView, name = actionMcpToolName(view)): McpToolDefinition {
  const metadata = view.action;
  return { name, description: metadata.description,
    inputSchema: objectSchema(metadata.input_schema) ? structuredClone(metadata.input_schema) : envelope(metadata.input_schema, "input", view),
    ...(metadata.output_schema ? { outputSchema: objectSchema(metadata.output_schema)
      ? structuredClone(metadata.output_schema) : envelope(metadata.output_schema, "result", view) } : {}),
  };
}

/** Context is bound by the authenticated transport. Model arguments and _meta confer no authority. */
export function createActionMcpPorts(options: {
  service: ActionClient;
  context(): ActionCallContext;
  serverInfo: McpProtocolPorts["serverInfo"];
  toolName?(action: ActionReference): string;
}): McpProtocolPorts {
  const context = (): ActionCallContext => ({ ...options.context(), audience: "mcp" });
  const catalog = async (caller: ActionCallContext) => {
    const entries = new Map<string, ActionView>();
    for (const view of await options.service.discover(caller)) {
      const name = (options.toolName ?? actionMcpToolName)(view);
      if (entries.has(name)) throw new ActionError("actions.mcp_name_conflict", `MCP 名称重复：${name}`);
      entries.set(name, view);
    }
    return entries;
  };
  return {
    serverInfo: options.serverInfo,
    get tools() { return catalog(context()).then(entries => [...entries].filter(([, view]) => view.availability.available).map(([name, view]) => actionMcpToolDefinition(view, name))); },
    async callTool(name, arguments_) {
      const caller = context();
      const view = (await catalog(caller)).get(name);
      if (!view || !view.availability.available) throw new ActionError("actions.mcp_unavailable", "能力未授权、已停用或当前不可用，请刷新能力列表");
      const wrapped = !objectSchema(view.action.input_schema);
      if (wrapped && (!Object.hasOwn(arguments_, "input") || Object.keys(arguments_).some(key => key !== "input"))) {
        throw new ActionError("actions.input_invalid", "此能力的参数必须放在 input 字段中");
      }
      const result = await options.service.invoke(caller, view, wrapped ? arguments_.input : arguments_);
      const structuredContent = objectSchema(view.action.output_schema)
        ? result as Record<string, unknown> : { result: result ?? null };
      return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent, isError: false };
    },
    formatToolError: formatMcpToolError,
  };
}
