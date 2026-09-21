import type { McpToolDefinition } from "@molis-ai/molis-work-app-mcp";
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
  isGrandfatheredPluginMcpTool,
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
  readonly source: "platform" | "plugin";
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
}

export interface AssembledMcpCatalog {
  readonly tools: McpToolDefinition[];
  readonly entries: AssembledMcpTool[];
  readonly home_scoped_names: ReadonlySet<string>;
  readonly known_names: ReadonlySet<string>;
}

export const BUILTIN_PLUGIN_MCP_SOURCES: readonly McpPluginExportSource[] = nativeMcpPluginSources();

export function pluginToolDefaultEnabled(name: string): boolean {
  return isGrandfatheredPluginMcpTool(name);
}

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

function grantAllows(source: McpPluginExportSource): boolean {
  const required = source.required_permissions ?? [];
  if (required.length === 0) return true;
  const grants = new Set(source.grants ?? []);
  return required.every((permission) => grants.has(permission));
}

export function assembleMcpCatalog(input: AssembleMcpCatalogInput): AssembledMcpCatalog {
  const sources = input.sources ?? BUILTIN_PLUGIN_MCP_SOURCES;
  const platformTools = input.audience === "management" ? MCP_TOOLS : RUNTIME_MCP_TOOLS;
  const entries: AssembledMcpTool[] = [];
  const known = new Set<string>(MCP_TOOLS.map((tool) => tool.name));

  for (const definition of platformTools) {
    const group = platformMcpGroup(definition.name);
    const assembled: AssembledMcpTool = {
      definition,
      source: "platform",
      group_id: group.id,
      group_title: group.title,
      effect: "read",
      audience: "platform",
      scope: "platform",
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
      const defaultEnabled = pluginToolDefaultEnabled(name);
      const audience = exported.audience ?? "runtime";
      const scope = exported.scope ?? "project";
      if (!audienceAllows(audience, input.audience)) continue;
      if (!pluginVisible(source, scope, input.enabled_project_plugins)) continue;
      if (!isMcpToolEnabled(name, defaultEnabled, input.preference.overrides)) continue;
      if (!grantAllows(source)) continue;
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
  const rows: McpSettingsToolRow[] = [];
  for (const definition of MCP_TOOLS) {
    const group = platformMcpGroup(definition.name);
    rows.push({
      definition,
      source: "platform",
      group_id: group.id,
      group_title: group.title,
      effect: "read",
      audience: "platform",
      scope: "platform",
      default_enabled: true,
      personal: true,
      enabled: isMcpToolEnabled(definition.name, true, preference.overrides),
    });
  }
  for (const source of sources) {
    for (const exported of source.exports) {
      const name = mcpPublicToolName(source.project_plugin_id || mcpPluginSlug(source.plugin_id), exported.tool_id);
      const defaultEnabled = pluginToolDefaultEnabled(name);
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
