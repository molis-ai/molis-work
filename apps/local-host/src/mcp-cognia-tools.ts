import { cogniaManifest, openCogniaStore, runCogniaMcpTool } from "@molis-ai/molis-work-plugin-cognia";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import type { NativeMcpAdapterPorts, NativeMcpPluginAdapter } from "./mcp-native-plugins.js";
export function createCogniaMcpAdapter(ports: NativeMcpAdapterPorts): NativeMcpPluginAdapter {
  return { plugin_id: cogniaManifest.plugin_id, async handle(request, context) { const home = ports.requireHost(context).homeDirectory; if (!home) throw new MolisWorkV1Error("mcp.context_host_missing", "MCP 宿主没有提供本机目录"); const store = openCogniaStore(home); try { return runCogniaMcpTool(store, request); } finally { store.close(); } } };
}
