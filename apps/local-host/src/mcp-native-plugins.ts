import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginMcpExportDeclaration, PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import { BUILTIN_PLUGIN_CATALOG, type BuiltinPluginEntry } from "@molis-ai/molis-work-app-workbench";

/** Historical spellings only. New plugins register actions, without joining this table. */
export interface McpPluginExportSource {
  readonly plugin_id: string;
  readonly project_plugin_id: string;
  readonly name: string;
  readonly personal: boolean;
  readonly exports: readonly PluginMcpExportDeclaration[];
}
export interface NativeMcpPluginAdapter {
  readonly plugin_id: string;
  handle(request: PluginMcpHandleRequest, context: McpToolCallContext): Promise<string>;
}
export interface NativeMcpDispatchEntry {
  readonly source: "platform" | "plugin" | "action" | "system" | "alias";
  readonly plugin_id?: string;
  readonly tool_id?: string;
  readonly scope?: string;
  readonly definition: { readonly name: string };
}
type LegacyHandler = (actions: BoundActionClient, request: PluginMcpHandleRequest) => Promise<string>;
export function nativeMcpPluginRegistrations(catalog: readonly BuiltinPluginEntry[] = BUILTIN_PLUGIN_CATALOG): Array<{ source: McpPluginExportSource; handle: LegacyHandler }> {
  return catalog.flatMap(entry => {
    const handle = entry.legacyMcp, exports = entry.manifest.mcp_exports;
    if (!handle && !exports?.length) return [];
    if (!handle || !exports?.length) throw new Error(`内置插件 ${entry.manifest.plugin_id} 的历史 MCP 声明与适配器不一致`);
    const source: McpPluginExportSource = { plugin_id: entry.manifest.plugin_id,
      project_plugin_id: entry.project_plugin_id, name: entry.manifest.name, personal: entry.personal === true, exports };
    return [{ source, handle }];
  });
}
export const NATIVE_MCP_PLUGIN_REGISTRATIONS: readonly { source: McpPluginExportSource; handle: LegacyHandler }[] = nativeMcpPluginRegistrations();
export function nativeMcpPluginSources(): readonly McpPluginExportSource[] {
  return NATIVE_MCP_PLUGIN_REGISTRATIONS.map(item => item.source);
}
export function createNativeMcpPluginAdapters(actions: BoundActionClient, registrations: typeof NATIVE_MCP_PLUGIN_REGISTRATIONS = NATIVE_MCP_PLUGIN_REGISTRATIONS): ReadonlyMap<string, NativeMcpPluginAdapter> {
  return new Map(registrations.map(item => [item.source.plugin_id, {
    plugin_id: item.source.plugin_id, handle: (request: PluginMcpHandleRequest) => item.handle(actions, request),
  }]));
}
export async function dispatchNativeMcpPluginTool(adapters: ReadonlyMap<string, NativeMcpPluginAdapter>,
  entry: NativeMcpDispatchEntry, arguments_: Record<string, unknown>, context: McpToolCallContext): Promise<string> {
  if (entry.source !== "plugin" || !entry.plugin_id || !entry.tool_id)
    throw new MolisWorkV1Error("mcp.tool_unknown", `MCP 目录条目不是插件工具：${entry.definition.name}`);
  const adapter = adapters.get(entry.plugin_id);
  if (!adapter) throw new MolisWorkV1Error("mcp.tool_unknown", `Host 没有这个插件的兼容 MCP 适配：${entry.plugin_id}`);
  return adapter.handle({ tool_id: entry.tool_id, arguments: arguments_ ?? {} }, context);
}
