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

function mcpLanguage(locale: string | undefined): "zh" | "en" | "ja" {
  const base = locale?.trim().toLowerCase().split("-")[0];
  if (!base || base === "zh") return "zh";
  if (base === "ja") return "ja";
  return "en";
}

function mcpConflictError(locale: string | undefined, name: string): ActionError {
  const lang = mcpLanguage(locale);
  const message = lang === "zh" ? `MCP 名称重复：${name}` : lang === "ja" ? `MCP ツール名が重複しています：${name}` : `Duplicate MCP tool name: ${name}`;
  return new ActionError("actions.mcp_name_conflict", message, { kind: "conflict" });
}

function mcpUnavailableError(locale: string | undefined): ActionError {
  const lang = mcpLanguage(locale);
  const message = lang === "zh"
    ? "这项能力未授权、已停用或当前不可用，请刷新能力列表。"
    : lang === "ja"
      ? "この機能は未許可、無効、または現在利用できません。ツール一覧を更新してからもう一度お試しください。"
      : "This capability isn’t authorized, enabled, or available right now. Refresh the tool list and try again.";
  return new ActionError("actions.mcp_unavailable", message, { kind: "unavailable" });
}

function mcpInputFieldError(locale: string | undefined): ActionError {
  const lang = mcpLanguage(locale);
  const message = lang === "zh"
    ? "这项能力的参数需要放在 input 字段中。"
    : lang === "ja"
      ? "この機能の引数は input フィールド内に指定してください。"
      : "Arguments for this capability must be passed inside the input field.";
  return new ActionError("actions.input_invalid", message, { kind: "invalid" });
}

/** Context is bound by the authenticated transport. Model arguments and _meta confer no authority. */
export function createActionMcpPorts(options: {
  service: ActionClient;
  context(): ActionCallContext;
  serverInfo: McpProtocolPorts["serverInfo"];
  toolName?(action: ActionReference): string;
  /**
   * The action a name stood for in the catalog the server listed for this connection: a call looks up that one action
   * instead of the whole directory when the tool-naming rule is injective (`actionMcpToolName` or `molisWorkActionToolName`).
   * The lookup judges live visibility for this call's caller and converts provider ambiguity into `actions.mcp_name_conflict`;
   * an unknown name, custom naming function, or replaced provider falls back to the whole directory.
   */
  known?(name: string): ActionReference | undefined;
}): McpProtocolPorts {
  const context = (): ActionCallContext => ({ ...options.context(), audience: "mcp" });
  const toolName = options.toolName ?? actionMcpToolName;
  const injectiveToolName = toolName === actionMcpToolName || toolName === molisWorkActionToolName;
  const catalog = async (caller: ActionCallContext) => {
    const entries = new Map<string, ActionView>();
    for (const view of await options.service.discover(caller)) {
      const name = toolName(view);
      if (entries.has(name)) throw mcpConflictError(caller.locale, name);
      entries.set(name, view);
    }
    return entries;
  };
  const one = async (caller: ActionCallContext, name: string) => {
    const reference = options.known?.(name);
    if (reference && injectiveToolName && toolName(reference) === name && options.service.discoverOne) {
      let view: ActionView | undefined;
      try {
        view = await options.service.discoverOne(caller, { capability_id: reference.capability_id, version: reference.version });
      } catch (error) {
        if (error instanceof ActionError && error.code === "actions.provider_ambiguous") {
          throw mcpConflictError(caller.locale, name);
        }
        throw error;
      }
      if (view && toolName(view) === name && (!reference.provider_id || view.provider.provider_id === reference.provider_id)) {
        return view;
      }
      if (!view) return undefined;
    }
    return (await catalog(caller)).get(name);
  };
  return {
    serverInfo: options.serverInfo,
    get tools() { return catalog(context()).then(entries => [...entries].filter(([, view]) => view.availability.available).map(([name, view]) => actionMcpToolDefinition(view, name))); },
    async callTool(name, arguments_) {
      const caller = context();
      const view = await one(caller, name);
      if (!view) throw mcpUnavailableError(caller.locale);
      const wrapped = !objectSchema(view.action.input_schema);
      if (wrapped && (!Object.hasOwn(arguments_, "input") || Object.keys(arguments_).some(key => key !== "input"))) {
        throw mcpInputFieldError(caller.locale);
      }
      const result = await options.service.invoke(caller, view, wrapped ? arguments_.input : arguments_);
      const structuredContent = objectSchema(view.action.output_schema)
        ? result as Record<string, unknown> : { result: result ?? null };
      return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent, isError: false };
    },
    formatToolError: formatMcpToolError,
  };
}
