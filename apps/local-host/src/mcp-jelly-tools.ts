import { openJellyStore, runJellyMcpTool, jellyManifest } from "@molis-ai/molis-work-plugin-jelly";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import type { NativeMcpAdapterPorts, NativeMcpPluginAdapter } from "./mcp-native-plugins.js";
export function createJellyMcpAdapter(ports: NativeMcpAdapterPorts): NativeMcpPluginAdapter {
  return { plugin_id: jellyManifest.plugin_id, async handle(request, context) {
    const home = ports.requireHost(context).homeDirectory;
    if (!home) throw new MolisWorkV1Error("mcp.context_host_missing", "MCP 宿主没有提供本机目录");
    const store = openJellyStore(home);
    try { return runJellyMcpTool(store, request); } finally { store.close(); }
  } };
}
