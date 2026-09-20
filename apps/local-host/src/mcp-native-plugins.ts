import type { MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  mcpPublicToolName,
  type PluginMcpExportDeclaration,
  type PluginMcpHandleRequest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import {
  FUNCTIONS_PROJECT_PLUGIN_ID,
  functionsManifest,
} from "@molis-ai/molis-work-plugin-functions";
import {
  FORM_PROJECT_PLUGIN_ID,
  formManifest,
} from "@molis-ai/molis-work-plugin-form";
import {
  DATASET_PROJECT_PLUGIN_ID,
  datasetManifest,
} from "@molis-ai/molis-work-plugin-dataset";
import {
  PPT_PROJECT_PLUGIN_ID,
  pptManifest,
} from "@molis-ai/molis-work-plugin-ppt";
import { createFunctionsMcpAdapter } from "./mcp-functions-tools.js";
import {
  createDatasetMcpAdapter,
  createFormMcpAdapter,
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

export const NATIVE_MCP_PLUGIN_REGISTRATIONS: readonly NativeMcpPluginRegistration[] = [
  {
    source: {
      plugin_id: functionsManifest.plugin_id,
      project_plugin_id: FUNCTIONS_PROJECT_PLUGIN_ID,
      name: functionsManifest.name,
      personal: true,
      exports: functionsManifest.mcp_exports ?? [],
    },
    default_enabled: true,
    createAdapter: createFunctionsMcpAdapter,
  },
  {
    source: {
      plugin_id: formManifest.plugin_id,
      project_plugin_id: FORM_PROJECT_PLUGIN_ID,
      name: formManifest.name,
      personal: true,
      exports: formManifest.mcp_exports ?? [],
    },
    default_enabled: false,
    createAdapter: createFormMcpAdapter,
  },
  {
    source: {
      plugin_id: datasetManifest.plugin_id,
      project_plugin_id: DATASET_PROJECT_PLUGIN_ID,
      name: datasetManifest.name,
      personal: true,
      exports: datasetManifest.mcp_exports ?? [],
    },
    default_enabled: false,
    createAdapter: createDatasetMcpAdapter,
  },
  {
    source: {
      plugin_id: pptManifest.plugin_id,
      project_plugin_id: PPT_PROJECT_PLUGIN_ID,
      name: pptManifest.name,
      personal: true,
      exports: pptManifest.mcp_exports ?? [],
    },
    default_enabled: false,
    createAdapter: createPptMcpAdapter,
  },
];

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
