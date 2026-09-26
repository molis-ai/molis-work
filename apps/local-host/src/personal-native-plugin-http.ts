import { handleExperimentsNativePluginHttp } from "./experiments-native-plugin-http.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleShelfNativePluginHttp } from "./shelf-native-plugin-http.js";
import { handleAlchemistNativePluginHttp, type AlchemistHostPorts } from "./alchemist-native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

export interface PersonalNativePluginHttpPorts {
  readonly alchemist?: AlchemistHostPorts;
  readonly projectId?: string;
  readonly projectMaterials?: Parameters<typeof handleShelfNativePluginHttp>[4];
}

export async function handlePersonalNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  ports: PersonalNativePluginHttpPorts = {},
): Promise<boolean> {
  const routed = withRewrittenPluginApi(url);
  for (const handle of [
    () => handleExperimentsNativePluginHttp(request, response, routed, homeDirectory),
    () => handleShelfNativePluginHttp(request, response, routed, homeDirectory, ports.projectMaterials),
    () => ports.alchemist ? handleAlchemistNativePluginHttp(request, response, routed, ports.alchemist) : false,
  ]) {
    if (await handle()) return true;
  }
  return false;
}
