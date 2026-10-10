import type { IncomingMessage, ServerResponse } from "node:http";
import { handleShelfNativePluginHttp } from "./shelf-native-plugin-http.js";
import { handleAlchemistNativePluginHttp, type AlchemistHostPorts } from "./alchemist-native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

export interface PersonalNativePluginHttpPorts {
  readonly alchemist?: AlchemistHostPorts;
  readonly projectId?: string;
  readonly shelf?: Parameters<typeof handleShelfNativePluginHttp>[3];
}

export async function handlePersonalNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  ports: PersonalNativePluginHttpPorts = {},
): Promise<boolean> {
  const routed = withRewrittenPluginApi(url);
  for (const handle of [
    () => ports.shelf ? handleShelfNativePluginHttp(request, response, routed, ports.shelf) : false,
    () => ports.alchemist ? handleAlchemistNativePluginHttp(request, response, routed, ports.alchemist) : false,
  ]) {
    if (await handle()) return true;
  }
  return false;
}
