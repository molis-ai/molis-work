import { jellyManifest } from "@molis-ai/molis-work-plugin-jelly";
import { createJellyMcpAdapter } from "./mcp-jelly-tools.js";
import type { MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  mcpPublicToolName,
  type PluginMcpExportDeclaration,
  type PluginMcpHandleRequest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import { FUNCTIONS_PROJECT_PLUGIN_ID, functionsManifest } from "@molis-ai/molis-work-plugin-functions";
import { datasetManifest, type DatasetPublishArtifactPort } from "@molis-ai/molis-work-plugin-dataset";
import { formManifest, type FormPublishArtifactPort } from "@molis-ai/molis-work-plugin-form";
import { pagesManifest, type PagesPublishArtifactPort } from "@molis-ai/molis-work-plugin-pages";
import { pptManifest, type PptPublishArtifactPort } from "@molis-ai/molis-work-plugin-ppt";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { createFunctionsMcpAdapter } from "./mcp-functions-tools.js";
import {
  createDatasetMcpAdapter,
  createFormMcpAdapter,
  createPagesMcpAdapter,
  createPptMcpAdapter,
} from "./mcp-store-plugin-adapter.js";

/**
 * Native-plugin MCP adapters live in this table. A build-time plugin that
 * wants outbound tools adds one row: Manifest `mcp_exports` plus createAdapter.
 * Runtime-hosted app plugins redeem `contribution.mcp` instead of joining here.
 */
export interface McpPluginExportSource {
  readonly plugin_id: string;
  readonly project_plugin_id: string;
  readonly name: string;
  readonly personal: boolean;
  readonly exports: readonly PluginMcpExportDeclaration[];
  /** Permissions this contribution needs; empty means the switch and enablement are enough. */
  readonly required_permissions?: readonly string[];
  readonly grants?: readonly string[];
}

export interface NativeMcpAdapterPorts {
  requireHost(context: McpToolCallContext): MolisWorkRuntimeContextHost;
  /** Bound project for personal stores partitioned by project_id. Omitted means unbound. */
  boundProjectId?(context: McpToolCallContext): string | null;
  publishPagesArtifact?: PagesPublishArtifactPort;
  publishFormArtifact?: FormPublishArtifactPort;
  publishDatasetArtifact?: DatasetPublishArtifactPort;
  publishPptArtifact?: PptPublishArtifactPort;
}

export interface NativeMcpPluginAdapter {
  readonly plugin_id: string;
  handle(request: PluginMcpHandleRequest, context: McpToolCallContext): Promise<string>;
}

export interface NativeMcpPluginRegistration {
  readonly source: McpPluginExportSource;
  /** Host policy, not a Manifest field. New plugins stay false. */
  readonly default_enabled: boolean;
  createAdapter(ports: NativeMcpAdapterPorts): NativeMcpPluginAdapter;
}

export interface NativeMcpDispatchEntry {
  readonly source: "platform" | "plugin";
  readonly plugin_id?: string;
  readonly tool_id?: string;
  readonly definition: { readonly name: string };
}

const NATIVE_MCP_ADAPTERS: Readonly<Record<string, NativeMcpPluginRegistration["createAdapter"]>> = {
  [functionsManifest.plugin_id]: createFunctionsMcpAdapter,
  [jellyManifest.plugin_id]: createJellyMcpAdapter,
  [pagesManifest.plugin_id]: createPagesMcpAdapter,
  [formManifest.plugin_id]: createFormMcpAdapter,
  [datasetManifest.plugin_id]: createDatasetMcpAdapter,
  [pptManifest.plugin_id]: createPptMcpAdapter,
};

export const NATIVE_MCP_PLUGIN_REGISTRATIONS: readonly NativeMcpPluginRegistration[] = BUILTIN_PLUGIN_CATALOG.flatMap((entry) => {
  const exports = entry.manifest.mcp_exports ?? [];
  if (exports.length === 0) return [];
  const createAdapter = NATIVE_MCP_ADAPTERS[entry.manifest.plugin_id];
  if (!createAdapter) {
    throw new Error(`Plugin ${entry.manifest.plugin_id} 声明了 MCP 导出，Host 没有适配器`);
  }
  return [{
    source: {
      plugin_id: entry.manifest.plugin_id,
      project_plugin_id: entry.project_plugin_id,
      name: entry.manifest.name,
      personal: entry.personal === true,
      exports,
    },
    default_enabled: entry.project_plugin_id === FUNCTIONS_PROJECT_PLUGIN_ID,
    createAdapter,
  }];
});

export function nativeMcpPluginSources(): readonly McpPluginExportSource[] {
  return NATIVE_MCP_PLUGIN_REGISTRATIONS.map((item) => item.source);
}

export function isGrandfatheredPluginMcpTool(name: string): boolean {
  for (const item of NATIVE_MCP_PLUGIN_REGISTRATIONS) {
    if (!item.default_enabled) continue;
    for (const exported of item.source.exports) {
      if (mcpPublicToolName(item.source.project_plugin_id, exported.tool_id) === name) return true;
    }
  }
  return false;
}

export function createNativeMcpPluginAdapters(
  ports: NativeMcpAdapterPorts,
): ReadonlyMap<string, NativeMcpPluginAdapter> {
  const adapters = new Map<string, NativeMcpPluginAdapter>();
  for (const item of NATIVE_MCP_PLUGIN_REGISTRATIONS) {
    const adapter = item.createAdapter(ports);
    if (adapter.plugin_id !== item.source.plugin_id) {
      throw new Error(`MCP adapter plugin_id 与登记不一致：${adapter.plugin_id}`);
    }
    adapters.set(adapter.plugin_id, adapter);
  }
  return adapters;
}

export async function dispatchNativeMcpPluginTool(
  adapters: ReadonlyMap<string, NativeMcpPluginAdapter>,
  entry: NativeMcpDispatchEntry,
  arguments_: Record<string, unknown>,
  context: McpToolCallContext,
): Promise<string> {
  if (entry.source !== "plugin" || !entry.plugin_id || !entry.tool_id) {
    throw new MolisWorkV1Error("mcp.tool_unknown", `MCP 目录条目不是插件工具：${entry.definition.name}`);
  }
  const adapter = adapters.get(entry.plugin_id);
  if (!adapter) {
    throw new MolisWorkV1Error("mcp.tool_unknown", `Host 没有这个插件的 MCP 适配：${entry.plugin_id}`);
  }
  return adapter.handle({ tool_id: entry.tool_id, arguments: arguments_ ?? {} }, context);
}
