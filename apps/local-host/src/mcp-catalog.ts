import { LEGACY_FUNCTIONS_MCP } from "./mcp-functions-tools.js";
import { actionMcpToolDefinition, LEGACY_GOALS_MCP, type McpToolDefinition } from "@molis-ai/molis-work-app-mcp";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import type { ActionReference, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  MCP_TOOLS,
  RUNTIME_MCP_TOOLS,
  isRuntimeContextMcpTool,
} from "@molis-ai/molis-work-app-mcp";
import {
  mcpPluginSlug,
  mcpPublicToolName,
  type PluginMcpAudience,
  type PluginMcpScope,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { isMcpToolEnabled, type McpToolPreference } from "./mcp-settings-store.js";
import {
  nativeMcpPluginSources,
  type McpPluginExportSource,
} from "./mcp-native-plugins.js";

export type { McpPluginExportSource } from "./mcp-native-plugins.js";

/**
 * Compose platform schemas and plugin `mcp_exports` into one catalog.
 * Enablement, audience, project enablement, and grants are filtered here.
 * Built-in plugin sources come from mcp-native-plugins; do not hardcode plugin tool names.
 */

export interface AssembledMcpTool {
  readonly definition: McpToolDefinition;
  readonly source: "platform" | "plugin" | "action" | "system" | "alias";
  readonly group_id: string;
  readonly group_title: string;
  readonly plugin_id?: string;
  readonly project_plugin_id?: string;
  readonly tool_id?: string;
  readonly effect: "read" | "write";
  readonly audience: PluginMcpAudience | "platform";
  readonly scope: PluginMcpScope | "platform";
  readonly default_enabled: boolean;
  readonly personal: boolean;
}

export interface AssembleMcpCatalogInput {
  readonly audience: "runtime" | "management";
  readonly preference: McpToolPreference;
  /** `null` means the connection has not bound a project. */
  readonly enabled_project_plugins: readonly string[] | null;
  readonly sources?: readonly McpPluginExportSource[];
  /** Already filtered by the common service for this authenticated caller. */
  readonly actions?: readonly ActionView[];
  readonly actionToolName?: (reference: ActionReference) => string;
  /** Exact references already accepted by the authenticated client's grant resolver. */
  readonly authorized_actions?: readonly ActionReference[];
}

export interface AssembledMcpCatalog {
  readonly tools: McpToolDefinition[];
  readonly entries: AssembledMcpTool[];
  readonly home_scoped_names: ReadonlySet<string>;
  readonly known_names: ReadonlySet<string>;
}

export const BUILTIN_PLUGIN_MCP_SOURCES: readonly McpPluginExportSource[] = nativeMcpPluginSources();

export function findAssembledMcpTool(catalog: AssembledMcpCatalog, name: string): AssembledMcpTool | undefined {
  return catalog.entries.find((entry) => entry.definition.name === name);
}

export function platformMcpGroup(name: string): { id: string; title: string } {
  if (name.includes("_context_") || name === "molis_work_v1_project_delete") {
    return { id: "platform-context", title: "连接" };
  }
  if (name.includes("_event_")) return { id: "platform-events", title: "事件" };
  return { id: "platform-goals", title: "Goals" };
}

function audienceAllows(
  declared: PluginMcpAudience | "platform",
  audience: "runtime" | "management",
): boolean {
  if (audience === "management") return true;
  return declared === "runtime" || declared === "all" || declared === "platform";
}

function pluginVisible(
  source: McpPluginExportSource,
  scope: PluginMcpScope,
  enabledProjectPlugins: readonly string[] | null,
): boolean {
  if (scope === "home") return true;
  if (enabledProjectPlugins === null) return false;
  if (source.personal) return true;
  return enabledProjectPlugins.includes(source.project_plugin_id);
}

export function assembleMcpCatalog(input: AssembleMcpCatalogInput): AssembledMcpCatalog {
  const sources = input.sources ?? BUILTIN_PLUGIN_MCP_SOURCES;
  const platformTools = input.audience === "management" ? MCP_TOOLS : RUNTIME_MCP_TOOLS;
  const entries: AssembledMcpTool[] = [];
  const known = new Set<string>([...MCP_TOOLS.map(tool => tool.name), ...LEGACY_FUNCTIONS_MCP.map(tool => tool.name)]);
  entries.push(...legacyFunctionsMcpRows(input.preference).filter(row => {
    const binding = LEGACY_FUNCTIONS_MCP.find(item => item.name === row.definition.name)!;
    return row.enabled && (input.actions ?? []).some(view => view.capability_id === binding.action.capability_id
      && view.version === binding.action.version && view.provider.provider_id === "system.functions" && view.availability.available);
  }));

  for (const definition of platformTools) {
    const group = platformMcpGroup(definition.name);
    const goalAlias = LEGACY_GOALS_MCP.find(item => item.name === definition.name);
    if (goalAlias && !(input.actions ?? []).some(view => view.capability_id === goalAlias.action.capability_id
      && view.version === goalAlias.action.version && view.provider.provider_id === GOALS_PLUGIN_ID && view.availability.available)) continue;
    const assembled: AssembledMcpTool = {
      definition,
      source: goalAlias ? "alias" : "platform",
      group_id: group.id,
      group_title: group.title,
      effect: goalAlias?.action.operation === "command" ? "write" : "read",
      audience: "platform",
      scope: goalAlias ? "project" : "platform",
      default_enabled: true,
      personal: true,
    };
    if (!audienceAllows("platform", input.audience)) continue;
    if (!isMcpToolEnabled(definition.name, true, input.preference.overrides)) continue;
    entries.push(assembled);
  }

  for (const source of sources) {
    for (const exported of source.exports) {
      const name = mcpPublicToolName(source.project_plugin_id || mcpPluginSlug(source.plugin_id), exported.tool_id);
      known.add(name);
      const defaultEnabled = false;
      const audience = exported.audience ?? "runtime";
      const scope = exported.scope ?? "project";
      if (!audienceAllows(audience, input.audience)) continue;
      if (!pluginVisible(source, scope, input.enabled_project_plugins)) continue;
      if (!isMcpToolEnabled(name, defaultEnabled, input.preference.overrides)) continue;
      if (!exported.required_actions?.length || !exported.required_actions.every(reference => (input.actions ?? []).some(view =>
        view.capability_id === reference.capability_id && view.version === reference.version && view.availability.available
        && (reference.provider_id ? view.provider.provider_id === reference.provider_id : view.provider.plugin_id === source.plugin_id)))) continue;
      entries.push({
        definition: {
          name,
          description: exported.description,
          inputSchema: exported.input_schema,
        },
        source: "plugin",
        group_id: source.project_plugin_id,
        group_title: source.name,
        plugin_id: source.plugin_id,
        project_plugin_id: source.project_plugin_id,
        tool_id: exported.tool_id,
        effect: exported.effect,
        audience,
        scope,
        default_enabled: defaultEnabled,
        personal: source.personal,
      });
    }
  }

  for (const action of input.actions ?? []) {
    const definition = actionMcpToolDefinition(action, input.actionToolName?.(action));
    if (known.has(definition.name)) throw new Error(`MCP 名称重复：${definition.name}`);
    known.add(definition.name);
    // Explicitly exported system actions are enabled by default; Plugin export still needs the user's switch.
    const defaultEnabled = action.provider.kind === "system" || (input.authorized_actions ?? []).some(ref =>
      ref.capability_id === action.capability_id && ref.version === action.version && ref.provider_id === action.provider.provider_id);
    if (!action.availability.available || !isMcpToolEnabled(definition.name, defaultEnabled, input.preference.overrides)) continue;
    entries.push({ definition, source: "action", group_id: action.provider.provider_id, group_title: action.provider.title,
      effect: action.operation === "query" ? "read" : "write", audience: "all", scope: action.action.scope,
      default_enabled: defaultEnabled, personal: action.action.scope === "home" });
  }

  const homeScoped = new Set<string>([
    ...entries.filter((entry) => entry.scope === "home" || isRuntimeContextMcpTool(entry.definition.name))
      .map((entry) => entry.definition.name),
  ]);
  for (const name of known) {
    if (isRuntimeContextMcpTool(name)) homeScoped.add(name);
  }

  return {
    tools: entries.map((entry) => entry.definition),
    entries,
    home_scoped_names: homeScoped,
    known_names: known,
  };
}

export interface McpSettingsToolRow extends AssembledMcpTool {
  readonly enabled: boolean;
}

export function listMcpSettingsEntries(
  preference: McpToolPreference,
  sources: readonly McpPluginExportSource[] = BUILTIN_PLUGIN_MCP_SOURCES,
): McpSettingsToolRow[] {
  const rows: McpSettingsToolRow[] = [...legacyFunctionsMcpRows(preference)];
  for (const definition of MCP_TOOLS) {
    const group = platformMcpGroup(definition.name);
    const goalAlias = LEGACY_GOALS_MCP.find(item => item.name === definition.name);
    rows.push({
      definition,
      source: goalAlias ? "alias" : "platform",
      group_id: group.id,
      group_title: group.title,
      effect: goalAlias?.action.operation === "command" ? "write" : "read",
      audience: "platform",
      scope: goalAlias ? "project" : "platform",
      default_enabled: true,
      personal: true,
      enabled: isMcpToolEnabled(definition.name, true, preference.overrides),
    });
  }
  for (const source of sources) {
    for (const exported of source.exports) {
      const name = mcpPublicToolName(source.project_plugin_id || mcpPluginSlug(source.plugin_id), exported.tool_id);
      const defaultEnabled = false;
      rows.push({
        definition: { name, description: exported.description, inputSchema: exported.input_schema },
        source: "plugin",
        group_id: source.project_plugin_id,
        group_title: source.name,
        plugin_id: source.plugin_id,
        project_plugin_id: source.project_plugin_id,
        tool_id: exported.tool_id,
        effect: exported.effect,
        audience: exported.audience ?? "runtime",
        scope: exported.scope ?? "project",
        default_enabled: defaultEnabled,
        personal: source.personal,
        enabled: isMcpToolEnabled(name, defaultEnabled, preference.overrides),
      });
    }
  }
  return rows;
}

/** Compatibility aliases are system entries, never installable plugin registrations. */
function legacyFunctionsMcpRows(preference: McpToolPreference): McpSettingsToolRow[] {
  return LEGACY_FUNCTIONS_MCP.map(({ name, action }) => ({
    definition: { name, description: `${action.action.description} 兼容名称；可用性与对应系统动作一致，开关不替代客户端动作授权。`, inputSchema: action.action.input_schema },
    source: "system", group_id: "functions", group_title: "判断规则", effect: action.operation === "query" ? "read" : "write",
    audience: "runtime", scope: "home", default_enabled: true, personal: true,
    enabled: isMcpToolEnabled(name, true, preference.overrides),
  }));
}
