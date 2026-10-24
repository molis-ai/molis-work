import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAlchemistNativePluginHttp, type AlchemistHostPorts } from "./alchemist-native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

interface PersonalNativePluginHttpPorts {
  readonly alchemist?: AlchemistHostPorts;
}

export async function handlePersonalNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  ports: PersonalNativePluginHttpPorts = {},
): Promise<boolean> {
  const routed = withRewrittenPluginApi(url);
  return ports.alchemist ? handleAlchemistNativePluginHttp(request, response, routed, ports.alchemist) : false;
}
